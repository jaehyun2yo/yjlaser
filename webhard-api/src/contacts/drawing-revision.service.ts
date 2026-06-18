import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, StorageProvider, WebhardFile } from '@prisma/client';
import { StorageService } from '../storage/storage.service';
import { FoldersService } from '../folders/folders.service';
import { ContactTimelineService } from './contact-timeline.service';
import { ContactsGateway } from './contacts.gateway';
import { EventsGateway } from '../events/events.gateway';
import { CreateDrawingRevisionDto } from './dto/drawing-revision.dto';
import { DrawingRevision } from '@prisma/client';
import { PROCESS_STAGE_ORDER } from './constants/process-stages';
import { buildInquiryFileName } from '../common/inquiry-filename.util';
import { extractR2Key } from '../common/r2-key.util';
import { parseStorageReference, toDriveReference } from '../storage/storage-reference.util';
import { WebhardSyncWarning } from './types/webhard-sync-warning';

type WebhardActorType = 'admin' | 'worker' | 'system' | 'external' | 'company';

interface SyncRevisionFile {
  url: string;
  name: string;
  size?: number;
  mimeType?: string;
}

interface SyncRevisionParams {
  contactId: string;
  revisionId?: string;
  files: SyncRevisionFile[];
  actorName: string | null;
  actorType: WebhardActorType;
  skipInitial?: boolean;
  revisionProcessStage?: string | null;
}

interface SyncRevisionResult {
  webhardFiles: WebhardFile[];
  warning?: WebhardSyncWarning;
}

export interface CreateRevisionResult {
  revision: DrawingRevision;
  webhardFiles: WebhardFile[];
  webhardWarning?: WebhardSyncWarning;
}

export interface DrawingRevisionDownloadResult {
  url: string;
  fileName: string;
  provider?: StorageProvider;
  fileId?: string;
}

export interface DrawingRevisionUploadUrl {
  uploadUrl: string;
  key: string;
  fileName: string;
  provider: StorageProvider;
  driveFileId?: string;
  uploadHeaders?: Record<string, string>;
}

export interface DrawingRevisionAccessInfo {
  id: string;
  contactId: string;
  companyName: string | null;
  isPublic: boolean;
}

@Injectable()
export class DrawingRevisionService {
  private readonly logger = new Logger(DrawingRevisionService.name);

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    private timelineService: ContactTimelineService,
    private contactsGateway: ContactsGateway,
    private eventsGateway: EventsGateway,
    private foldersService: FoldersService,
    private _configService: ConfigService
  ) {}

  /**
   * 도면 수정 등록 — $transaction 으로 version 원자적 계산.
   *
   * DrawingRevision 생성은 트랜잭션 내부에서 원자적으로 수행되며,
   * webhard 동기화는 트랜잭션 **밖**에서 호출된다.
   * webhard 동기화 실패는 revision 자체를 롤백시키지 않고 `webhardWarning` 으로 전달된다.
   */
  async createRevision(
    contactId: string,
    dto: CreateDrawingRevisionDto,
    actor: { actorType: string; actorName?: string }
  ): Promise<CreateRevisionResult> {
    const revision = await this.prisma.$transaction(async (tx) => {
      const result = await tx.$queryRaw<{ next_version: number }[]>`
        SELECT COALESCE(MAX(version), 0) + 1 as next_version
        FROM drawing_revisions
        WHERE contact_id = ${contactId}::uuid
      `;
      const version = Number(result[0].next_version);

      const created = await tx.drawingRevision.create({
        data: {
          contactId,
          version,
          reason: dto.reason,
          reasonDetail: dto.reasonDetail ?? null,
          files: dto.files as unknown as Prisma.InputJsonValue,
          processStage: dto.processStage ?? null,
          note: dto.note ?? null,
          isPublic: dto.isPublic ?? false,
          source: dto.source ?? 'manual',
          actorType: actor.actorType,
          actorName: actor.actorName ?? null,
        },
      });

      // Contact.drawingFileName/Url을 최신 파일로 업데이트 (요약/목록에서 최신 반영)
      const firstFile = dto.files[0];
      if (firstFile) {
        await tx.contact.update({
          where: { id: contactId },
          data: {
            drawingFileName: firstFile.name,
            drawingFileUrl: firstFile.url,
            updatedAt: new Date(),
          },
        });
      }

      return created;
    });

    // WebhardFile 자동 등록 (트랜잭션 밖). 실패는 warning 으로 수렴 — throw 하지 않는다.
    const syncResult = await this.syncRevisionToWebhard({
      contactId,
      revisionId: revision.id,
      files: dto.files,
      actorName: actor.actorName ?? null,
      actorType: this.normalizeActorType(actor.actorType),
      skipInitial: dto.source === 'auto_initial',
      revisionProcessStage: dto.processStage ?? null,
    });

    const webhardFileIds = syncResult.webhardFiles.map((f) => f.id);

    let finalRevision = revision;
    if (webhardFileIds.length > 0) {
      finalRevision = await this.prisma.drawingRevision.update({
        where: { id: revision.id },
        data: { webhardFileIds },
      });
    }

    // 통합 타임라인이 drawing_revisions 테이블을 직접 조회하므로
    // ContactStatusHistory에 중복 기록하지 않는다 (NaN/NaN·중복 표시 원인 제거).

    // WebSocket: fire-and-forget
    this.contactsGateway.emitDrawingRevisionAdded({
      contactId,
      revisionId: finalRevision.id,
      version: finalRevision.version,
    });

    return {
      revision: finalRevision,
      webhardFiles: syncResult.webhardFiles,
      webhardWarning: syncResult.warning,
    };
  }

  /**
   * 도면 수정 이력 조회
   */
  async getRevisions(
    contactId: string,
    options?: { includePrivate?: boolean }
  ): Promise<DrawingRevision[]> {
    const where: Record<string, unknown> = { contactId };
    if (options?.includePrivate === false) {
      where.isPublic = true;
    }

    return this.prisma.drawingRevision.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * 도면 수정 이력의 접근 제어에 필요한 최소 메타데이터 조회.
   * presigned URL 발급 없이 revision 이 속한 문의 업체만 확인하는 용도다.
   */
  async getRevisionAccessInfo(revisionId: string): Promise<DrawingRevisionAccessInfo> {
    const revision = await this.prisma.drawingRevision.findUnique({
      where: { id: revisionId },
      select: {
        id: true,
        contactId: true,
        isPublic: true,
        contact: {
          select: {
            companyName: true,
          },
        },
      },
    });

    if (!revision) {
      throw new NotFoundException('도면 수정 이력을 찾을 수 없습니다.');
    }

    return {
      id: revision.id,
      contactId: revision.contactId,
      companyName: revision.contact?.companyName ?? null,
      isPublic: revision.isPublic,
    };
  }

  /**
   * 도면 파일 다운로드 presigned URL 생성
   */
  async getRevisionDownloadUrl(
    revisionId: string,
    fileIndex: number
  ): Promise<DrawingRevisionDownloadResult> {
    const revision = await this.prisma.drawingRevision.findUnique({
      where: { id: revisionId },
      include: { contact: true },
    });

    if (!revision) {
      throw new NotFoundException('도면 수정 이력을 찾을 수 없습니다.');
    }

    const files = revision.files as unknown as Array<{
      url: string;
      name: string;
      size?: number;
      mimeType?: string;
    }>;

    if (!files[fileIndex]) {
      throw new NotFoundException('해당 인덱스의 파일을 찾을 수 없습니다.');
    }

    const file = files[fileIndex];

    const displayName = buildInquiryFileName({
      contact: {
        inquiryNumber: revision.contact?.inquiryNumber ?? null,
        workNumber: revision.contact?.workNumber ?? null,
        processStage: revision.contact?.processStage ?? null,
        inquiryType: revision.contact?.inquiryType ?? null,
      },
      revision: { processStage: revision.processStage },
      originalName: file.name,
    });

    const parsed = parseStorageReference(file.url);
    if (parsed.provider === StorageProvider.GOOGLE_DRIVE) {
      const webhardFile = await this.prisma.webhardFile.findFirst({
        where: {
          driveFileId: parsed.idOrKey,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!webhardFile) {
        throw new NotFoundException('Drive 도면 파일을 찾을 수 없습니다.');
      }

      return {
        url: '',
        fileName: displayName,
        provider: StorageProvider.GOOGLE_DRIVE,
        fileId: webhardFile.id,
      };
    }

    const key = extractR2Key(parsed.idOrKey);
    const result = await this.storageService.getDownloadPresignedUrl(key, undefined, displayName);

    return { url: result.url, fileName: displayName, provider: StorageProvider.R2 };
  }

  /**
   * 도면 업로드 presigned URL 생성
   */
  async getUploadPresignedUrls(
    contactId: string,
    files: Array<{ name: string; mimeType: string; size?: number }>
  ): Promise<DrawingRevisionUploadUrl[]> {
    const startedAt = Date.now();
    this.logger.log(
      `Drive drawing revision upload session start: contactId=${contactId}, files=${files.length}`
    );

    const inquiryFolder = await this.foldersService.ensureInquiryFolder(contactId);
    if (!inquiryFolder) {
      throw new BadRequestException('문의 폴더를 찾을 수 없습니다.');
    }
    if (
      inquiryFolder.storageProvider !== StorageProvider.GOOGLE_DRIVE ||
      !inquiryFolder.driveFolderId
    ) {
      throw new BadRequestException('Google Drive 문의 폴더가 준비되지 않았습니다.');
    }

    const results: DrawingRevisionUploadUrl[] = [];

    for (const file of files) {
      const result = await this.storageService.createDriveUploadSession({
        fileName: file.name,
        mimeType: file.mimeType,
        size: file.size ?? 0,
        parentStorageFolderId: inquiryFolder.driveFolderId,
      });

      results.push({
        uploadUrl: result.uploadUrl,
        key: toDriveReference(result.storageFileId),
        fileName: file.name,
        provider: StorageProvider.GOOGLE_DRIVE,
        driveFileId: result.storageFileId,
        uploadHeaders: result.headers,
      });
    }

    this.logger.log(
      `Drive drawing revision upload session success: contactId=${contactId}, files=${results.length}, elapsedMs=${Date.now() - startedAt}`
    );

    return results;
  }

  /**
   * 공개 여부 변경
   */
  async updateVisibility(revisionId: string, isPublic: boolean): Promise<DrawingRevision> {
    const revision = await this.prisma.drawingRevision.findUnique({
      where: { id: revisionId },
    });

    if (!revision) {
      throw new NotFoundException('도면 수정 이력을 찾을 수 없습니다.');
    }

    return this.prisma.drawingRevision.update({
      where: { id: revisionId },
      data: { isPublic },
    });
  }

  /**
   * 초기 도면 자동 등록 (문의 생성 시 drawingFileUrl 존재 시 호출).
   *
   * - 실패 시 throw — 호출자가 상위 트랜잭션을 롤백할 수 있다.
   * - `options.tx` 주입 시 해당 트랜잭션 클라이언트 안에서 version 계산 + INSERT 수행.
   *   미제공 시 내부적으로 `this.prisma.$transaction`으로 래핑.
   * - `options.createdAt` 주입 시 DrawingRevision.createdAt 으로 사용 (백필 시 Contact.createdAt 보존).
   * - `options.skipInitial` (default true) — WebhardFile 자동 등록 skip 여부.
   *   true 면 ensureInquiryFolder + relocateContactFiles 로 이관됨 (task 20).
   */
  async createInitialRevision(
    contactId: string,
    drawingFileUrl: string,
    drawingFileName?: string | null,
    options?: {
      tx?: Prisma.TransactionClient;
      createdAt?: Date;
      skipInitial?: boolean;
    }
  ): Promise<DrawingRevision> {
    const { tx, createdAt, skipInitial = true } = options ?? {};

    const insertRevision = async (client: Prisma.TransactionClient): Promise<DrawingRevision> => {
      const result = await client.$queryRaw<{ next_version: number }[]>`
        SELECT COALESCE(MAX(version), 0) + 1 as next_version
        FROM drawing_revisions
        WHERE contact_id = ${contactId}::uuid
      `;
      const version = Number(result[0].next_version);

      return client.drawingRevision.create({
        data: {
          contactId,
          version,
          reason: 'initial',
          files: [
            {
              url: drawingFileUrl,
              name: drawingFileName ?? 'initial-drawing',
            },
          ],
          source: 'auto_initial',
          actorType: 'system',
          isPublic: false,
          ...(createdAt ? { createdAt } : {}),
        },
      });
    };

    const created = tx ? await insertRevision(tx) : await this.prisma.$transaction(insertRevision);

    await this.syncRevisionToWebhard({
      contactId,
      revisionId: created.id,
      files: [
        {
          url: drawingFileUrl,
          name: drawingFileName ?? 'initial-drawing',
        },
      ],
      actorName: null,
      actorType: 'system',
      skipInitial,
    });

    return created;
  }

  /**
   * 특정 공정 단계의 최신 DrawingRevision 반환
   */
  async getLatestForStage(
    contactId: string,
    processStage: string,
    options?: { includePrivate?: boolean }
  ): Promise<DrawingRevision | null> {
    const where: Prisma.DrawingRevisionWhereInput = { contactId };
    if (options?.includePrivate === false) {
      where.isPublic = true;
    }

    switch (processStage) {
      case 'drawing':
        where.reason = { in: ['initial', 'domuson_fit'] };
        break;
      case 'sample':
        where.reason = 'sample_revision';
        break;
      case 'drawing_confirmed':
        where.processStage = 'drawing_confirmed';
        break;
      case 'laser':
      case 'cutting':
      case 'creasing':
        where.reason = { in: ['field_correction', 'laser_processing'] };
        break;
      case 'delivery':
        // 단계 무관 — 가장 최신 revision
        break;
      default:
        break;
    }

    return this.prisma.drawingRevision.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  private getStageRevisionMatchSql(processStage: string): Prisma.Sql {
    switch (processStage) {
      case 'drawing':
        return Prisma.sql`reason IN ('initial', 'domuson_fit')`;
      case 'sample':
        return Prisma.sql`reason = 'sample_revision'`;
      case 'drawing_confirmed':
        return Prisma.sql`process_stage = 'drawing_confirmed'`;
      case 'laser':
      case 'cutting':
      case 'creasing':
        return Prisma.sql`reason IN ('field_correction', 'laser_processing')`;
      case 'delivery':
        return Prisma.sql`TRUE`;
      default:
        return Prisma.sql`FALSE`;
    }
  }

  private async getLatestForRankedStages(
    contactId: string,
    stagesByPriority: string[],
    options?: { includePrivate?: boolean }
  ): Promise<DrawingRevision | null> {
    const priorityCases = stagesByPriority.map((stage, priority) => {
      return Prisma.sql`WHEN ${this.getStageRevisionMatchSql(stage)} THEN ${priority}`;
    });
    const visibilityFilter =
      options?.includePrivate === false ? Prisma.sql`AND is_public = TRUE` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<DrawingRevision[]>`
      SELECT
        id,
        contact_id AS "contactId",
        version,
        process_stage AS "processStage",
        reason,
        reason_detail AS "reasonDetail",
        files,
        webhard_file_ids AS "webhardFileIds",
        actor_type AS "actorType",
        actor_name AS "actorName",
        source,
        is_public AS "isPublic",
        note,
        created_at AS "createdAt"
      FROM (
        SELECT
          id,
          contact_id,
          version,
          process_stage,
          reason,
          reason_detail,
          files,
          webhard_file_ids,
          actor_type,
          actor_name,
          source,
          is_public,
          note,
          created_at,
          CASE ${Prisma.join(priorityCases, ' ')} ELSE NULL END AS stage_priority
        FROM drawing_revisions
        WHERE contact_id = ${contactId}::uuid
        ${visibilityFilter}
      ) ranked_revisions
      WHERE stage_priority IS NOT NULL
      ORDER BY stage_priority ASC, created_at DESC
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  /**
   * Contact의 현재 processStage에 맞는 최신 도면 자동 선택
   *
   * fallback 로직: 해당 단계에 도면이 없으면 이전 단계 순서대로 탐색
   */
  async getLatestForCurrentStage(
    contactId: string,
    options?: { includePrivate?: boolean }
  ): Promise<DrawingRevision | null> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { processStage: true },
    });

    if (!contact) {
      return null;
    }

    const currentStage = contact.processStage;

    // processStage가 null이면 가장 최신 revision 반환
    if (!currentStage) {
      return this.prisma.drawingRevision.findFirst({
        where: {
          contactId,
          ...(options?.includePrivate === false ? { isPublic: true } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    const currentIndex = PROCESS_STAGE_ORDER.indexOf(currentStage);

    // 알 수 없는 단계면 가장 최신 revision 반환
    if (currentIndex === -1) {
      return this.prisma.drawingRevision.findFirst({
        where: {
          contactId,
          ...(options?.includePrivate === false ? { isPublic: true } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    const stagesByPriority = PROCESS_STAGE_ORDER.slice(0, currentIndex + 1).reverse();
    return this.getLatestForRankedStages(contactId, stagesByPriority, options);
  }

  /**
   * 문의에 마지막으로 업로드된 DrawingRevision 반환.
   *
   * Worker 카드 다운로드는 작업자가 방금 올린 도면을 바로 받아야 하므로
   * 현재 공정 단계 필터를 적용하지 않는다.
   */
  async getLatestUploaded(
    contactId: string,
    options?: { includePrivate?: boolean }
  ): Promise<DrawingRevision | null> {
    return this.prisma.drawingRevision.findFirst({
      where: {
        contactId,
        ...(options?.includePrivate === false ? { isPublic: true } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * DrawingRevision 생성 시 WebhardFile 자동 등록.
   *
   * - 트랜잭션 **밖**에서 호출된다. 실패는 throw 하지 않고 `warning` 으로 수렴.
   * - skipInitial=true면 즉시 빈 배열 반환 (ensureInquiryFolder + relocateContactFiles 로 이관됨 — task 20).
   * - contact.companyName이 없으면 빈 배열 반환 (laser-only 등 회사 없는 문의).
   * - `ensureInquiryFolder` 로 번호 전용 문의 폴더 확보.
   *   - null 반환 → 업체 루트 폴더로 fallback + warning `NO_INQUIRY_NUMBER`.
   *   - 예외 → warning `FOLDER_CREATE_FAILED`.
   * - WebhardFile 생성 후 `relocateContactFiles` 로 기존 파일을 같은 폴더에 일괄 이동.
   *   - 실패 시 warning `RELOCATE_FAILED` (생성된 WebhardFile 은 보존).
   */
  private async syncRevisionToWebhard(params: SyncRevisionParams): Promise<SyncRevisionResult> {
    if (params.skipInitial) {
      return { webhardFiles: [] };
    }

    const contact = await this.prisma.contact.findUnique({
      where: { id: params.contactId },
      select: {
        id: true,
        workNumber: true,
        inquiryNumber: true,
        companyName: true,
        processStage: true,
        inquiryType: true,
      },
    });

    if (!contact || !contact.companyName) {
      return { webhardFiles: [] };
    }

    const company = await this.prisma.company.findFirst({
      where: { companyName: contact.companyName },
      select: { id: true, companyName: true },
    });

    if (!company) {
      return { webhardFiles: [] };
    }

    // 1. 번호 전용 문의 폴더 확보. 실패 시 rootFolder fallback + warning 조립.
    let targetFolderId: string | null = null;
    let warning: WebhardSyncWarning | undefined;

    try {
      const inquiryFolder = await this.foldersService.ensureInquiryFolder(contact.id);
      if (inquiryFolder) {
        targetFolderId = inquiryFolder.id;
      } else {
        // 문의번호·작업번호 모두 없거나, 기타 조건 미충족 — 업체 루트 fallback.
        warning = {
          code: 'NO_INQUIRY_NUMBER',
          message: '문의번호 미발급 — 업체 루트에 임시 저장됨',
        };
      }
    } catch (err) {
      warning = {
        code: 'FOLDER_CREATE_FAILED',
        message: err instanceof Error ? err.message : String(err),
      };
    }

    if (!targetFolderId) {
      // fallback: 업체 루트 폴더에 직접 배치.
      let rootFolder = await this.prisma.webhardFolder.findFirst({
        where: { companyId: company.id, parentId: null, deletedAt: null },
        select: { id: true },
      });

      if (!rootFolder) {
        await this.foldersService.initializeCompanyFolders(company.id, company.companyName);
        rootFolder = await this.prisma.webhardFolder.findFirst({
          where: { companyId: company.id, parentId: null, deletedAt: null },
          select: { id: true },
        });
      }

      if (!rootFolder) {
        this.logger.warn(
          `Webhard sync aborted: root folder unavailable for company ${company.companyName}`
        );
        return {
          webhardFiles: [],
          warning: warning ?? {
            code: 'FOLDER_CREATE_FAILED',
            message: `root folder unavailable for ${company.companyName}`,
          },
        };
      }

      targetFolderId = rootFolder.id;
    }

    // 2. 각 파일을 WebhardFile로 생성.
    const uploadedBy = this.resolveUploadedBy(
      params.actorType,
      params.actorName,
      company.companyName
    );
    const targetFolder = await this.prisma.webhardFolder.findUnique({
      where: { id: targetFolderId },
      select: { id: true, storageProvider: true, driveFolderId: true },
    });

    const createdFiles: WebhardFile[] = [];
    for (const file of params.files) {
      const displayName = buildInquiryFileName({
        contact: {
          inquiryNumber: contact.inquiryNumber,
          workNumber: contact.workNumber,
          processStage: contact.processStage,
          inquiryType: contact.inquiryType,
        },
        revision: { processStage: params.revisionProcessStage ?? null },
        originalName: file.name,
      });

      const parsed = parseStorageReference(file.url);
      let size = BigInt(file.size ?? 0);
      let mimeType = file.mimeType ?? this.inferMimeType(file.name);
      let path = parsed.idOrKey;
      let storageProvider: StorageProvider = StorageProvider.R2;
      let driveFileId: string | null = null;
      let driveMimeType: string | null = null;

      if (parsed.provider === StorageProvider.GOOGLE_DRIVE) {
        if (targetFolder?.storageProvider !== StorageProvider.GOOGLE_DRIVE) {
          throw new BadRequestException('Google Drive target folder is required');
        }
        if (!targetFolder.driveFolderId) {
          throw new BadRequestException('Google Drive folder id is missing');
        }

        const driveMetadata = await this.storageService.confirmDriveUploadedFile({
          storageFileId: parsed.idOrKey,
          expectedParentStorageFolderId: targetFolder.driveFolderId,
        });
        await this.storageService.renameDriveFile({
          storageFileId: parsed.idOrKey,
          name: displayName,
        });

        size = BigInt(driveMetadata.size ?? file.size ?? 0);
        mimeType = driveMetadata.mimeType ?? mimeType;
        path = `${targetFolderId}/${displayName}`;
        storageProvider = StorageProvider.GOOGLE_DRIVE;
        driveFileId = parsed.idOrKey;
        driveMimeType = driveMetadata.mimeType ?? null;
      } else {
        const sourceKey = extractR2Key(parsed.idOrKey);
        const driveUpload = await this.copyR2SourceToDriveIfReady({
          key: sourceKey,
          fileName: displayName,
          mimeType,
          targetFolder,
        });
        if (driveUpload) {
          size = BigInt(driveUpload.size ?? file.size ?? 0);
          mimeType = driveUpload.mimeType ?? mimeType;
          path = `${targetFolderId}/${displayName}`;
          storageProvider = StorageProvider.GOOGLE_DRIVE;
          driveFileId = driveUpload.storageFileId;
          driveMimeType = driveUpload.mimeType ?? null;
        } else {
          path = sourceKey;
        }
      }

      const created = await this.prisma.webhardFile.create({
        data: {
          name: displayName,
          originalName: file.name,
          size,
          mimeType,
          path,
          storageProvider,
          driveFileId,
          driveMimeType,
          folderId: targetFolderId,
          companyId: company.id,
          uploadedBy,
          inquiryNumber: contact.inquiryNumber ?? contact.workNumber ?? null,
        },
      });
      createdFiles.push(created);
      this.eventsGateway.emitToFolder(targetFolderId, {
        type: 'file:created',
        folderId: targetFolderId,
        data: { fileId: created.id, contactId: contact.id },
      });
    }

    // 3. 기존 파일 (원본 도면 + 이전 revision) 을 같은 폴더로 일괄 이동.
    //    실패해도 생성된 WebhardFile 은 보존 — warning 만 반환.
    try {
      await this.foldersService.relocateContactFiles(contact.id, targetFolderId);
    } catch (err) {
      this.logger.warn(
        `relocateContactFiles failed for contact ${contact.id}: ${err instanceof Error ? err.message : String(err)}`
      );
      if (!warning) {
        warning = {
          code: 'RELOCATE_FAILED',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }

    const inquiryKey = contact.workNumber ?? contact.inquiryNumber ?? '(none)';
    this.logger.log(
      `Webhard sync: contactId=${contact.id}, company=${company.companyName}, inquiry=${inquiryKey}, files=${createdFiles.length}`
    );

    return { webhardFiles: createdFiles, warning };
  }

  private async copyR2SourceToDriveIfReady(input: {
    key: string;
    fileName: string;
    mimeType: string;
    targetFolder: {
      storageProvider: StorageProvider;
      driveFolderId: string | null;
    } | null;
  }) {
    if (input.targetFolder?.storageProvider !== StorageProvider.GOOGLE_DRIVE) {
      return null;
    }
    if (!input.targetFolder.driveFolderId) {
      throw new BadRequestException('Google Drive folder id is missing');
    }

    const buffer = await this.storageService.getFileBuffer(input.key);
    return this.storageService.uploadDriveBuffer({
      fileName: input.fileName,
      mimeType: input.mimeType,
      buffer,
      parentStorageFolderId: input.targetFolder.driveFolderId,
    });
  }

  private normalizeActorType(actorType: string): WebhardActorType {
    switch (actorType) {
      case 'admin':
      case 'worker':
      case 'company':
      case 'external':
      case 'system':
        return actorType;
      default:
        return 'system';
    }
  }

  private resolveUploadedBy(
    actorType: WebhardActorType,
    actorName: string | null,
    companyName: string
  ): string {
    switch (actorType) {
      case 'admin':
        return actorName ?? '관리자';
      case 'worker':
        return actorName ?? '작업자';
      case 'external':
        return actorName ?? '관리프로그램';
      case 'company':
        return companyName;
      case 'system':
      default:
        return actorName ?? 'system';
    }
  }

  private inferMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const mimeMap: Record<string, string> = {
      dxf: 'application/dxf',
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      dwg: 'application/acad',
      ai: 'application/postscript',
      eps: 'application/postscript',
      zip: 'application/zip',
    };
    return mimeMap[ext] ?? 'application/octet-stream';
  }
}
