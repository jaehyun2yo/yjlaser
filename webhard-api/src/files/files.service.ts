import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DriveProvisioningStatus, Prisma, StorageProvider } from '@prisma/client';
import { StorageService } from '../storage/storage.service';
import { StorageRepairService } from '../storage/storage-repair.service';
import { SessionUser } from '../auth/auth.service';
import { EventsGateway } from '../events/events.gateway';
import {
  FileResponseDto,
  FileListResponseDto,
  GetFilesQueryDto,
  SearchFilesQueryDto,
  CreatePresignedUrlDto,
  ConfirmUploadDto,
  BatchConfirmUploadDto,
  RenameFileDto,
  MoveFileDto,
  BatchMoveFilesDto,
  BatchDeleteFilesDto,
  PresignedUrlResponseDto,
} from './dto/file.dto';
import { BatchOperationResult } from '../common/dto/batch-operation.dto';
import { GetBadgeCountsQueryDto, BadgeCountsResponseDto } from './dto/badge-counts.dto';
import { BadgeCountsService } from './badge-counts.service';
import {
  GetNewFilesQueryDto,
  NewFilesListResponseDto,
  NewFileResponseDto,
} from './dto/new-files.dto';
import { MarkDownloadedDto, MarkDownloadedResponseDto } from './dto/mark-downloaded.dto';
import { AutoContactService } from '../integration/orders/auto-contact.service';
import { FoldersService } from '../folders/folders.service';
import { WebhardConfigService } from '../folders/webhard-config.service';
import {
  SyncLogService,
  type CreatePipelineEventInput,
} from '../integration/sync-log/sync-log.service';
import { extractR2Key } from '../common/r2-key.util';
import { lookupCompanyByFolderName } from '../companies/_lib/lookup-company-by-folder-name.util';
import { WorkerContactAccessService } from '../worker-access/worker-contact-access.service';
import { DownloadFileResult, StorageFileMetadata } from '../storage/storage-provider.interface';

/**
 * batchConfirmUpload 의 단일 폴더 fetch 결과 — access 검증, companyId 상속,
 * AutoContact 폴더-기반 lookup 까지 모두 이 객체 하나에서 수행된다.
 * batchTriggerAutoContact 의 prefetched map 엔트리 타입과 동일.
 */
type BatchFolderInfo = {
  id: string;
  name: string;
  path: string | null;
  companyId: number | null;
  parentId: string | null;
  storageProvider: StorageProvider;
  driveFolderId: string | null;
};

type PreparedAutoContactItem = {
  folderId: string;
  originalName: string;
  path: string;
  companyId: number | null;
  folderPath: string;
  companyName: string;
};

type BatchConfirmUploadFileResult = {
  fileName: string;
  success: boolean;
  error?: string;
};

type BatchConfirmUploadResult = {
  success: number;
  failed: number;
  errors: string[];
  results: BatchConfirmUploadFileResult[];
};

type BatchDriveTarget = {
  folderId: string;
  companyId: number | null;
  driveFolderId: string;
};

type UploadPresignBatchContext = {
  folderAccessCache: Map<string, Promise<{ id: string; companyId: number | null }>>;
  routingCache: Map<string, Promise<{ folderId: string; companyId: number } | null>>;
  driveTargetCache: Map<string, Promise<BatchDriveTarget | null>>;
};

type UploadDestination = {
  effectiveFolderId: string | null;
  effectiveCompanyId: number | null;
  redirected: boolean;
  driveTarget: BatchDriveTarget | null;
};

type ConfirmedBatchFile = {
  file: ConfirmUploadDto;
  folderId: string | null;
  companyId: number | null;
  path: string;
  mimeType: string;
  storageProvider: StorageProvider;
  driveFileId: string | null;
  driveMimeType: string | null;
  driveMetadata?: StorageFileMetadata;
};

type BatchPreparedConfirmResult =
  | { confirmedFile: ConfirmedBatchFile }
  | { errorMessage: string; errorResult: BatchConfirmUploadFileResult };

type RoutingChildFolderRepairContext = {
  driveFolderId: string | null;
  expectedDbState: Record<string, unknown>;
  actualDriveState: Record<string, unknown>;
};

const DRIVE_UPLOAD_CONFIRM_CONCURRENCY = 8;
const DRIVE_UPLOAD_SESSION_CONCURRENCY = 20;

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    })
  );

  return results;
}

const DISALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.app',
  '.bat',
  '.cmd',
  '.com',
  '.dll',
  '.exe',
  '.jar',
  '.msi',
  '.ps1',
  '.scr',
  '.sh',
  '.vbs',
]);

const DISALLOWED_UPLOAD_MIME_TYPES = new Set([
  'application/vnd.microsoft.portable-executable',
  'application/x-ms-installer',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-sh',
]);

function getFilenameExtension(filename: string): string | null {
  const filePart = filename.split(/[?#]/)[0].split(/[\\/]/).pop() ?? filename;
  const dotIndex = filePart.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === filePart.length - 1) return null;
  return filePart.slice(dotIndex).toLowerCase();
}

function getUploadPolicyError(input: {
  filename: string;
  originalName?: string;
  mimeType: string;
}): string | null {
  const filenames = [input.filename, input.originalName].filter((name): name is string =>
    Boolean(name)
  );
  const disallowedName = filenames.find((name) => {
    const extension = getFilenameExtension(name);
    return extension !== null && DISALLOWED_UPLOAD_EXTENSIONS.has(extension);
  });

  const mimeType = input.mimeType.trim().toLowerCase();
  if (disallowedName || DISALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
    return `업로드가 허용되지 않는 파일 형식입니다: ${disallowedName ?? input.filename}`;
  }

  return null;
}

function assertUploadAllowed(input: {
  filename: string;
  originalName?: string;
  mimeType: string;
}): void {
  const policyError = getUploadPolicyError(input);
  if (policyError) {
    throw new BadRequestException(policyError);
  }
}

function getUploadMetadataIdempotencyKey(input: {
  storageProvider: StorageProvider;
  driveFileId: string | null;
  path: string;
}): string {
  if (input.storageProvider === StorageProvider.GOOGLE_DRIVE && input.driveFileId) {
    return `drive:${input.driveFileId}`;
  }
  return `path:${input.path}`;
}

function sanitizeWebhardFilename(filename: string): string {
  const sanitized = filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
  if (!sanitized) {
    throw new BadRequestException('파일명이 비어 있습니다.');
  }
  return sanitized;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly routingChildFolderPromises = new Map<string, Promise<string>>();
  private readonly badgeCountsService: BadgeCountsService;

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    private eventsGateway: EventsGateway,
    private autoContactService: AutoContactService,
    private foldersService: FoldersService,
    private webhardConfigService: WebhardConfigService,
    @Optional() private readonly syncLogService?: SyncLogService,
    @Optional() badgeCountsService?: BadgeCountsService,
    @Optional() private readonly workerContactAccessService?: WorkerContactAccessService,
    @Optional() private readonly storageRepairService?: StorageRepairService
  ) {
    this.badgeCountsService = badgeCountsService ?? new BadgeCountsService(this.prisma);
  }

  private validFileStorageWhere(): Prisma.WebhardFileWhereInput {
    return {
      NOT: {
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFileId: null,
      },
    };
  }

  private async recordPipelineEvent(input: CreatePipelineEventInput): Promise<void> {
    if (!this.syncLogService) return;

    try {
      await this.syncLogService.createPipelineEvent(input);
    } catch (err) {
      this.logger.warn(
        `webhard pipeline trace write failed: stage=${input.stage}, reason=${input.reasonCode}, filename=${input.filename}, error=${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async confirmDriveUploadedFile(input: {
    storageFileId: string;
    expectedParentStorageFolderId: string;
    uploadProof?: string;
  }): Promise<{ metadata: StorageFileMetadata; source: 'proof' | 'drive_api' }> {
    if (input.uploadProof) {
      return {
        metadata: this.storageService.verifyDriveUploadProof({
          proof: input.uploadProof,
          storageFileId: input.storageFileId,
          expectedParentStorageFolderId: input.expectedParentStorageFolderId,
        }),
        source: 'proof',
      };
    }

    return {
      metadata: await this.storageService.confirmDriveUploadedFile({
        storageFileId: input.storageFileId,
        expectedParentStorageFolderId: input.expectedParentStorageFolderId,
      }),
      source: 'drive_api',
    };
  }

  private buildWebhardNotificationLink(folderId: string | null, fileId?: string): string {
    const params = new URLSearchParams();
    if (folderId) params.set('folderId', folderId);
    if (fileId) params.set('fileId', fileId);
    const query = params.toString();
    return query ? `/webhard?${query}` : '/webhard';
  }

  private async assertFolderDriveReady(folderId: string | null): Promise<{
    folderId: string;
    companyId: number | null;
    driveFolderId: string;
  }> {
    if (!folderId) {
      throw new BadRequestException('업로드할 폴더를 선택해주세요.');
    }

    const folder = await this.prisma.webhardFolder.findUnique({
      where: { id: folderId },
      select: {
        id: true,
        companyId: true,
        driveFolderId: true,
        storageProvider: true,
      },
    });

    if (
      !folder ||
      !folder.driveFolderId ||
      folder.storageProvider !== StorageProvider.GOOGLE_DRIVE
    ) {
      throw new BadRequestException('Google Drive 폴더 준비가 완료되지 않았습니다.');
    }

    if (folder.companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: folder.companyId },
        select: { driveProvisioningStatus: true },
      });
      if (company?.driveProvisioningStatus !== DriveProvisioningStatus.READY) {
        throw new BadRequestException('업체 Google Drive 폴더 준비가 완료되지 않았습니다.');
      }
    }

    return {
      folderId: folder.id,
      companyId: folder.companyId,
      driveFolderId: folder.driveFolderId,
    };
  }

  private async getFolderDriveTargetIfReady(folderId: string | null): Promise<{
    folderId: string;
    companyId: number | null;
    driveFolderId: string;
  } | null> {
    if (!folderId) return null;

    const folder = await this.prisma.webhardFolder.findUnique({
      where: { id: folderId },
      select: {
        id: true,
        companyId: true,
        driveFolderId: true,
        storageProvider: true,
      },
    });

    if (!folder || folder.storageProvider !== StorageProvider.GOOGLE_DRIVE) {
      return null;
    }

    if (!folder.driveFolderId) {
      throw new BadRequestException('Google Drive 폴더 준비가 완료되지 않았습니다.');
    }

    if (folder.companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: folder.companyId },
        select: { driveProvisioningStatus: true },
      });
      if (company?.driveProvisioningStatus !== DriveProvisioningStatus.READY) {
        throw new BadRequestException('업체 Google Drive 폴더 준비가 완료되지 않았습니다.');
      }
    }

    return {
      folderId: folder.id,
      companyId: folder.companyId,
      driveFolderId: folder.driveFolderId,
    };
  }

  private async recordStorageRepair(input: {
    operation:
      | 'folder_create'
      | 'file_create'
      | 'file_move'
      | 'file_rename'
      | 'trash'
      | 'restore'
      | 'delete';
    driveFileId?: string | null;
    driveFolderId?: string | null;
    webhardFileId?: string;
    webhardFolderId?: string | null;
    expectedDbState: Record<string, unknown>;
    actualDriveState: Record<string, unknown>;
  }): Promise<void> {
    if (!this.storageRepairService || (!input.driveFileId && !input.driveFolderId)) return;
    await this.storageRepairService.recordDriveDbMismatch({
      operation: input.operation,
      storageProvider: 'google_drive',
      driveFileId: input.driveFileId ?? undefined,
      driveFolderId: input.driveFolderId ?? undefined,
      webhardFileId: input.webhardFileId,
      webhardFolderId: input.webhardFolderId ?? undefined,
      expectedDbState: input.expectedDbState,
      actualDriveState: input.actualDriveState,
    });
  }

  private async createFileUploadedNotification(file: {
    id: string;
    name: string;
    originalName: string | null;
    folderId: string | null;
    companyId: number | null;
    uploadedBy: string | null;
    company?: { companyName: string | null } | null;
  }): Promise<void> {
    const fileName = file.originalName || file.name;
    const companyName = file.company?.companyName ?? null;

    try {
      await this.prisma.notification.create({
        data: {
          userType: 'admin',
          userId: null,
          type: 'file_uploaded',
          title: '웹하드 새 업로드',
          message: companyName
            ? `${companyName}에서 ${fileName} 파일을 업로드했습니다.`
            : `${fileName} 파일이 웹하드에 업로드되었습니다.`,
          metadata: {
            fileId: file.id,
            folderId: file.folderId,
            companyId: file.companyId,
            uploadedBy: file.uploadedBy,
            fileName,
            link: this.buildWebhardNotificationLink(file.folderId, file.id),
          },
        },
      });
    } catch (err) {
      this.logger.warn(
        `file_uploaded notification failed: fileId=${file.id}, error=${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  private async createBatchFileUploadedNotification(input: {
    count: number;
    folderId: string | null;
    companyId: number | null;
    uploadedBy: string;
  }): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userType: 'admin',
          userId: null,
          type: 'file_uploaded',
          title: '웹하드 새 업로드',
          message: `웹하드에 파일 ${input.count}개가 업로드되었습니다.`,
          metadata: {
            count: input.count,
            folderId: input.folderId,
            companyId: input.companyId,
            uploadedBy: input.uploadedBy,
            batch: true,
            link: this.buildWebhardNotificationLink(input.folderId),
          },
        },
      });
    } catch (err) {
      this.logger.warn(
        `batch file_uploaded notification failed: count=${input.count}, error=${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * Get files list with pagination
   */
  async getFiles(query: GetFilesQueryDto, user: SessionUser): Promise<FileListResponseDto> {
    const {
      folderId,
      companyId,
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = query;

    // Build where clause
    const where: Record<string, unknown> = {
      deletedAt: null,
      ...this.validFileStorageWhere(),
    };

    if (user.userType === 'worker') {
      if (!folderId) {
        throw new ForbiddenException('Worker folder access required');
      }
      await this.assertWorkerCanAccessFolder(user, folderId);
    }

    // Folder filter
    if (folderId) {
      where.folderId = folderId;
    } else {
      where.folderId = null; // Root level files
    }

    // Company access control — 자기 회사 파일만 접근 가능
    if (user.userType === 'company') {
      where.companyId = user.companyId;
    } else if (companyId !== undefined) {
      // Admin filtering by company
      where.companyId = companyId;
    }

    // $transaction으로 count + findMany를 단일 트랜잭션에서 실행 (일관성 + 성능)
    const [total, files] = await this.prisma.executeWithRetry(
      () =>
        this.prisma.$transaction([
          this.prisma.webhardFile.count({ where }),
          this.prisma.webhardFile.findMany({
            where,
            include: {
              company: {
                select: {
                  companyName: true,
                  managerName: true,
                },
              },
            },
            orderBy: {
              [this.mapSortField(sortBy)]: sortOrder,
            },
            skip: (page - 1) * limit,
            take: limit,
          }),
        ]),
      { operationName: 'getFiles' }
    );

    return {
      files: files.map(this.mapToDto),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  /**
   * Search files by name
   */
  async searchFiles(query: SearchFilesQueryDto, user: SessionUser): Promise<FileResponseDto[]> {
    const { query: searchQuery, companyId, limit = 50 } = query;

    const where: Record<string, unknown> = {
      deletedAt: null,
      ...this.validFileStorageWhere(),
      OR: [
        { name: { contains: searchQuery, mode: 'insensitive' } },
        { originalName: { contains: searchQuery, mode: 'insensitive' } },
      ],
    };

    // Company access control — 자기 회사 파일만 검색 가능
    if (user.userType === 'company') {
      where.companyId = user.companyId;
    } else if (companyId !== undefined) {
      where.companyId = companyId;
    }

    const files = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFile.findMany({
          where,
          include: {
            company: {
              select: {
                companyName: true,
                managerName: true,
              },
            },
          },
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
      { operationName: 'searchFiles' }
    );

    return files.map(this.mapToDto);
  }

  /**
   * Generate presigned URL for upload
   *
   * Bug 1 (task 25): admin 업로드 시 폴더의 companyId 를 상속하여 회사 격리 필터에서
   * 파일이 누락되지 않도록 함. dto.companyId 가 명시되면 그 값이 우선.
   *
   * task 26 (외부웹하드 routing): 요청 folderId 가 `/외부웹하드/{X}/...` 하위이고 X 가 가입 업체와
   * 매칭되면, 업체 폴더로 routing 하여 R2 PUT 자체가 처음부터 업체 경로로 박히도록 한다.
   * 매칭 실패 또는 routing 예외 → 기존 흐름 (요청 folderId echo, redirected=false) fallback.
   */
  async getUploadPresignedUrl(
    dto: CreatePresignedUrlDto,
    user: SessionUser
  ): Promise<PresignedUrlResponseDto> {
    const destination = await this.prepareUploadDestination(dto, user);
    return this.buildUploadPresignedUrl(dto, destination);
  }

  private createUploadPresignBatchContext(): UploadPresignBatchContext {
    return {
      folderAccessCache: new Map(),
      routingCache: new Map(),
      driveTargetCache: new Map(),
    };
  }

  private verifyFolderAccessForUpload(
    folderId: string,
    user: SessionUser,
    context?: UploadPresignBatchContext
  ): Promise<{ id: string; companyId: number | null }> {
    if (!context) {
      return this.verifyFolderAccess(folderId, user);
    }

    const cached = context.folderAccessCache.get(folderId);
    if (cached) {
      return cached;
    }

    const pending = this.verifyFolderAccess(folderId, user);
    context.folderAccessCache.set(folderId, pending);
    return pending;
  }

  private tryRouteExternalUploadForBatch(
    folderId: string,
    context?: UploadPresignBatchContext
  ): Promise<{ folderId: string; companyId: number } | null> {
    if (!context) {
      return this.tryRouteExternalUpload(folderId);
    }

    const cached = context.routingCache.get(folderId);
    if (cached) {
      return cached;
    }

    const pending = this.tryRouteExternalUpload(folderId);
    context.routingCache.set(folderId, pending);
    return pending;
  }

  private getFolderDriveTargetForUpload(
    folderId: string | null,
    context?: UploadPresignBatchContext
  ): Promise<BatchDriveTarget | null> {
    if (!folderId) {
      return Promise.resolve(null);
    }

    if (!context) {
      return this.getFolderDriveTargetIfReady(folderId);
    }

    const cached = context.driveTargetCache.get(folderId);
    if (cached) {
      return cached;
    }

    const pending = this.getFolderDriveTargetIfReady(folderId);
    context.driveTargetCache.set(folderId, pending);
    return pending;
  }

  private async prepareUploadDestination(
    dto: CreatePresignedUrlDto,
    user: SessionUser,
    context?: UploadPresignBatchContext
  ): Promise<UploadDestination> {
    assertUploadAllowed({ filename: dto.filename, mimeType: dto.contentType });

    // Verify folder ownership before generating presigned URL — 폴더 조회 1회만 수행하고
    // 그 결과를 admin companyId 상속(Bug 1, task 25) 에서도 재활용한다.
    let folder: { id: string; companyId: number | null } | null = null;
    if (dto.folderId) {
      folder = await this.verifyFolderAccessForUpload(dto.folderId, user, context);
    }

    // task 26: 외부웹하드 경로 routing 시도.
    let routedFolderId: string | null = null;
    let routedCompanyId: number | null = null;
    let redirected = false;
    if (dto.folderId) {
      try {
        const routed = await this.tryRouteExternalUploadForBatch(dto.folderId, context);
        if (routed) {
          routedFolderId = routed.folderId;
          routedCompanyId = routed.companyId;
          redirected = true;
        }
      } catch (err) {
        // routing 실패 → 기존 흐름 fallback. 업로드 자체는 막지 않는다.
        this.logger.warn(
          `getUploadPresignedUrl routing failed for folderId=${dto.folderId}: ${err instanceof Error ? err.message : err}`
        );
        await this.recordPipelineEvent({
          filename: dto.filename,
          stage: 'routing',
          status: 'failed',
          reasonCode: 'routing_failed',
          folderId: dto.folderId,
          context: {
            requestedFolderId: dto.folderId,
            source: 'getUploadPresignedUrl',
          },
        });
      }
    }

    const effectiveFolderId = routedFolderId ?? dto.folderId ?? null;

    // companyId 결정 규칙 (Bug 1, task 25 + task 26):
    //   1) company user        → user.companyId
    //   2) admin + routing 발동 → 새 업체 companyId
    //   3) admin + dto.companyId 명시 → 그 값
    //   4) admin + folder 있음 + 명시 없음 → folder.companyId 상속
    //   5) admin + folder 없음 → null
    let effectiveCompanyId: number | null;
    if (user.userType === 'company') {
      effectiveCompanyId = user.companyId;
    } else if (redirected && routedCompanyId !== null) {
      effectiveCompanyId = routedCompanyId;
    } else {
      effectiveCompanyId = dto.companyId ?? folder?.companyId ?? null;
    }

    const driveTarget = await this.getFolderDriveTargetForUpload(effectiveFolderId, context);
    if (driveTarget) {
      effectiveCompanyId = effectiveCompanyId ?? driveTarget.companyId;
    }

    return {
      effectiveFolderId,
      effectiveCompanyId,
      redirected,
      driveTarget,
    };
  }

  private async buildUploadPresignedUrl(
    dto: CreatePresignedUrlDto,
    destination: UploadDestination,
    storageFileId?: string
  ): Promise<PresignedUrlResponseDto> {
    const { effectiveFolderId, effectiveCompanyId, redirected, driveTarget } = destination;

    if (driveTarget) {
      const session = await this.storageService.createDriveUploadSession({
        fileName: dto.filename,
        mimeType: dto.contentType,
        size: dto.size ?? 0,
        parentStorageFolderId: driveTarget.driveFolderId,
        storageFileId,
      });

      this.logger.log(
        `upload presigned issued: filename=${dto.filename}, requestedFolderId=${dto.folderId ?? 'root'}, effectiveFolderId=${effectiveFolderId ?? 'root'}, companyId=${effectiveCompanyId ?? 'none'}, redirected=${redirected}, provider=google_drive`
      );

      return {
        url: session.uploadUrl,
        key: session.storageFileId,
        expiresAt: session.expiresAt.toISOString(),
        folderId: effectiveFolderId,
        redirected,
        provider: 'google_drive',
        uploadUrl: session.uploadUrl,
        uploadHeaders: session.headers,
        driveFileId: session.storageFileId,
        driveFileIdRequired: true,
      };
    }

    const key = this.storageService.generateStoragePath(
      effectiveCompanyId,
      effectiveFolderId,
      dto.filename
    );
    const result = await this.storageService.getUploadPresignedUrl(key, dto.contentType);

    this.logger.log(
      `upload presigned issued: filename=${dto.filename}, requestedFolderId=${dto.folderId ?? 'root'}, effectiveFolderId=${effectiveFolderId ?? 'root'}, companyId=${effectiveCompanyId ?? 'none'}, redirected=${redirected}, provider=r2`
    );

    return {
      url: result.url,
      key: result.key,
      expiresAt: result.expiresAt.toISOString(),
      folderId: effectiveFolderId,
      redirected,
      provider: 'r2',
      uploadUrl: result.url,
      driveFileIdRequired: false,
    };
  }

  /**
   * task 26: 외부웹하드 경로 폴더 → 가입 업체 폴더로 routing 시도.
   *
   * @returns 매칭/routing 성공 시 `{ folderId, companyId }`, 그 외 (외부 경로 아님 / 매칭 실패) null.
   */
  private async tryRouteExternalUpload(
    folderId: string
  ): Promise<{ folderId: string; companyId: number } | null> {
    const folder = await this.prisma.webhardFolder.findUnique({
      where: { id: folderId },
      select: { id: true, name: true, path: true, folderKind: true, companyId: true },
    });
    if (!folder || !folder.path?.startsWith('/외부웹하드/')) return null;

    const segments = folder.path.split('/').filter((s) => s.length > 0);
    if (segments.length < 2) return null;
    const rootSegment = segments[1]; // ['외부웹하드', '{X}', ...] → X

    const matched = await lookupCompanyByFolderName(this.prisma, rootSegment);
    if (!matched) return null;

    const companyRoot = await this.prisma.webhardFolder.findFirst({
      where: { companyId: matched.id, parentId: null, deletedAt: null },
      select: { id: true },
    });
    if (!companyRoot) return null;

    const targetFolderId = await this.ensureRoutingTarget(matched.id, companyRoot.id, folder);
    return { folderId: targetFolderId, companyId: matched.id };
  }

  /**
   * task 26: routing 대상 폴더 결정 (lazy create).
   *
   * - 외부 root 직접 (depth=2) → 업체 root 그대로
   * - path 마지막 segment 가 template 세그먼트 (`칼선의뢰 / 목형의뢰 / 문의 / 완료`) → 업체 루트 동명 template 폴더 (lazy create, folderKind='template')
   * - 그 외 임의 segment → 업체 루트 직하 동명 폴더 mirror (lazy create, folderKind='generic')
   */
  private async ensureRoutingTarget(
    companyId: number,
    companyRootId: string,
    folder: { name: string; path: string | null; folderKind: string }
  ): Promise<string> {
    const segments = (folder.path ?? '').split('/').filter((s) => s.length > 0);
    if (segments.length === 2) {
      // 외부웹하드 root 자체 (depth=2) → 업체 root 그대로
      return companyRootId;
    }

    const lastSegment = segments[segments.length - 1] ?? folder.name;
    const TEMPLATE_SEGMENTS = new Set(['칼선의뢰', '목형의뢰', '문의', '완료']);
    if (TEMPLATE_SEGMENTS.has(lastSegment)) {
      return this.ensureRoutingChildFolder(companyId, companyRootId, lastSegment, 'template');
    }
    return this.ensureRoutingChildFolder(companyId, companyRootId, folder.name, 'generic');
  }

  private async ensureRoutingChildFolder(
    companyId: number,
    parentId: string,
    name: string,
    folderKind: 'template' | 'generic'
  ): Promise<string> {
    const cacheKey = this.getRoutingChildFolderCacheKey(companyId, parentId, name, folderKind);
    const pending = this.routingChildFolderPromises.get(cacheKey);
    if (pending) return pending;

    const promise = this.ensureRoutingChildFolderUncached(
      companyId,
      parentId,
      name,
      folderKind,
      cacheKey
    ).finally(() => {
      this.routingChildFolderPromises.delete(cacheKey);
    });

    this.routingChildFolderPromises.set(cacheKey, promise);
    return promise;
  }

  private getRoutingChildFolderCacheKey(
    companyId: number,
    parentId: string,
    name: string,
    folderKind: 'template' | 'generic'
  ): string {
    return JSON.stringify([companyId, parentId, name, folderKind]);
  }

  private async ensureRoutingChildFolderUncached(
    companyId: number,
    parentId: string,
    name: string,
    folderKind: 'template' | 'generic',
    lockKey: string
  ): Promise<string> {
    const repairContextRef: { current: RoutingChildFolderRepairContext | null } = {
      current: null,
    };

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

          const existing = await tx.webhardFolder.findFirst({
            where: { parentId, name, deletedAt: null },
            select: { id: true },
          });
          if (existing) return existing.id;

          const parent = await tx.webhardFolder.findUnique({
            where: { id: parentId },
            select: { path: true, name: true, storageProvider: true, driveFolderId: true },
          });
          const newPath =
            parent?.path && parent.path !== '/'
              ? `${parent.path}/${name}`
              : `/${parent?.name ?? ''}/${name}`;

          let driveFolderId: string | null = null;
          if (parent?.storageProvider === StorageProvider.GOOGLE_DRIVE) {
            if (!parent.driveFolderId) {
              throw new BadRequestException(
                'Routing parent folder is not provisioned in Google Drive'
              );
            }
            [driveFolderId] = await this.storageService.generateDriveIds(1);
            await this.storageService.createDriveFolder({
              name,
              parentStorageFolderId: parent.driveFolderId,
              storageFolderId: driveFolderId,
            });
          }

          repairContextRef.current = {
            driveFolderId,
            expectedDbState: { name, parentId, companyId, path: newPath, folderKind },
            actualDriveState: { created: Boolean(driveFolderId), dbCreateFailed: true },
          };

          const created = await tx.webhardFolder.create({
            data: {
              name,
              parentId,
              companyId,
              path: newPath,
              folderKind,
              storageProvider: driveFolderId ? StorageProvider.GOOGLE_DRIVE : StorageProvider.R2,
              driveFolderId,
            },
            select: { id: true },
          });

          return created.id;
        },
        { timeout: 30000 }
      );
    } catch (error) {
      if (repairContextRef.current) {
        await this.recordStorageRepair({
          operation: 'folder_create',
          driveFolderId: repairContextRef.current.driveFolderId,
          expectedDbState: repairContextRef.current.expectedDbState,
          actualDriveState: repairContextRef.current.actualDriveState,
        });
      }
      throw error;
    }
  }

  /**
   * Generate batch presigned URLs for upload (동시성 제한)
   */
  async getBatchUploadPresignedUrls(
    files: CreatePresignedUrlDto[],
    user: SessionUser
  ): Promise<PresignedUrlResponseDto[]> {
    const context = this.createUploadPresignBatchContext();
    const prepareStartedAt = Date.now();
    const destinations = await mapWithConcurrency(files, DRIVE_UPLOAD_SESSION_CONCURRENCY, (file) =>
      this.prepareUploadDestination(file, user, context)
    );
    const driveIndexes = destinations
      .map((destination, index) => (destination.driveTarget ? index : -1))
      .filter((index) => index >= 0);
    const driveIds =
      driveIndexes.length > 0
        ? await this.storageService.generateDriveIds(driveIndexes.length)
        : [];
    const driveIdByFileIndex = new Map<number, string>();
    driveIndexes.forEach((fileIndex, driveIndex) => {
      driveIdByFileIndex.set(fileIndex, driveIds[driveIndex]);
    });

    if (files.length > 1) {
      this.logger.log(
        `webhard batch upload sessions prepared: files=${files.length}, driveFiles=${driveIndexes.length}, uniqueFolders=${context.folderAccessCache.size}, uniqueDriveTargets=${context.driveTargetCache.size}, durationMs=${Date.now() - prepareStartedAt}`
      );
    }

    return mapWithConcurrency(files, DRIVE_UPLOAD_SESSION_CONCURRENCY, (file, index) =>
      this.buildUploadPresignedUrl(file, destinations[index], driveIdByFileIndex.get(index))
    );
  }

  /**
   * Confirm file upload and save metadata
   *
   * Bug 1 (task 25): admin 업로드 시 폴더의 companyId 를 상속하여 회사 격리 필터에서
   * 파일이 누락되지 않도록 함. dto.companyId 가 명시되면 그 값이 우선.
   *
   * task 28 (routing consistency): `getUploadPresignedUrl` 가 외부웹하드 husk → 회사 폴더로
   * routing 했더라도 client 가 confirmUpload 호출 시 원본 husk folderId 를 그대로 보낼 수 있다
   * (R2 PUT path 와 DB folder_id 가 split-brain). 따라서 여기서도 동일한 `tryRouteExternalUpload`
   * 를 적용해 routed folderId/companyId 로 DB row 를 박는다. routing 실패는 warn 로그 + dto fallback
   * 으로 흡수 — confirm 자체는 절대 막지 않는다 (R2 orphan 방지).
   */
  async confirmUpload(dto: ConfirmUploadDto, user: SessionUser): Promise<FileResponseDto> {
    assertUploadAllowed({
      filename: dto.name,
      originalName: dto.originalName,
      mimeType: dto.mimeType,
    });

    // Verify folder access — 폴더 조회 1회만 수행하고 결과를 admin companyId 상속(Bug 1, task 25)
    // 에서도 재활용한다.
    let folder: { id: string; companyId: number | null } | null = null;
    if (dto.folderId) {
      folder = await this.verifyFolderAccess(dto.folderId, user);
    }

    // task 28: 외부웹하드 경로 routing 시도 (presigned-url 와 동일 흐름).
    let routedFolderId: string | null = null;
    let routedCompanyId: number | null = null;
    let redirected = false;
    if (dto.folderId) {
      try {
        const routed = await this.tryRouteExternalUpload(dto.folderId);
        if (routed) {
          routedFolderId = routed.folderId;
          routedCompanyId = routed.companyId;
          redirected = true;
        }
      } catch (err) {
        // routing 실패 → dto.folderId fallback. confirm 자체는 막지 않는다 (R2 orphan 방지).
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `confirmUpload routing failed — folderId=${dto.folderId} key=${dto.key} filename=${dto.name} error=${msg}`
        );
        await this.recordPipelineEvent({
          filename: dto.name,
          stage: 'routing',
          status: 'failed',
          reasonCode: 'routing_failed',
          folderId: dto.folderId,
          context: {
            requestedFolderId: dto.folderId,
            source: 'confirmUpload',
          },
        });
      }
    }

    const effectiveFolderId = routedFolderId ?? dto.folderId ?? null;

    // companyId 결정 규칙 (Bug 1, task 25 + task 28):
    //   1) company user        → user.companyId
    //   2) admin + routing 발동 → routedCompanyId
    //   3) admin + dto.companyId 명시 → 그 값
    //   4) admin + folder 있음 + 명시 없음 → folder.companyId 상속
    //   5) admin + folder 없음 → null
    let effectiveCompanyId: number | null;
    if (user.userType === 'company') {
      effectiveCompanyId = user.companyId;
    } else if (redirected && routedCompanyId !== null) {
      effectiveCompanyId = routedCompanyId;
    } else {
      effectiveCompanyId = dto.companyId ?? folder?.companyId ?? null;
    }

    if (redirected) {
      this.logger.log(
        `confirmUpload routed — original=${dto.folderId} → routed=${routedFolderId} companyId=${routedCompanyId} key=${dto.key}`
      );
    }

    const size = Math.floor(Number(dto.size));
    // uploaded_by: admin(세션/API Key 모두) → 'admin', company → userId 문자열
    const uploadedBy = user.userType === 'admin' ? 'admin' : String(user.userId);

    const requestedDriveUpload =
      dto.storageProvider === 'google_drive' || (!dto.storageProvider && Boolean(dto.driveFileId));
    if (requestedDriveUpload) {
      if (!dto.driveFileId) {
        throw new BadRequestException('Google Drive 업로드 확인 정보가 필요합니다.');
      }

      const driveTarget = await this.assertFolderDriveReady(effectiveFolderId);
      effectiveCompanyId = effectiveCompanyId ?? driveTarget.companyId;
      const driveConfirm = await this.confirmDriveUploadedFile({
        storageFileId: dto.driveFileId,
        expectedParentStorageFolderId: driveTarget.driveFolderId,
        uploadProof: dto.driveUploadProof,
      });
      const driveMetadata = driveConfirm.metadata;

      const file = await this.prisma
        .executeWithRetry(
          () =>
            this.prisma.webhardFile.create({
              data: {
                name: dto.name,
                originalName: dto.originalName,
                size,
                mimeType: driveMetadata.mimeType,
                path: `${driveTarget.folderId}/${dto.name}`,
                folderId: driveTarget.folderId,
                companyId: effectiveCompanyId,
                uploadedBy: String(uploadedBy),
                inquiryNumber: dto.inquiryNumber ?? null,
                isDownloaded: false,
                storageProvider: StorageProvider.GOOGLE_DRIVE,
                driveFileId: driveMetadata.storageFileId,
                driveMimeType: driveMetadata.mimeType,
              },
              include: {
                company: {
                  select: {
                    companyName: true,
                    managerName: true,
                  },
                },
              },
            }),
          { operationName: 'confirmUpload.create' }
        )
        .catch(async (error) => {
          await this.recordStorageRepair({
            operation: 'file_create',
            driveFileId: driveMetadata.storageFileId,
            webhardFolderId: driveTarget.folderId,
            expectedDbState: {
              name: dto.name,
              folderId: driveTarget.folderId,
              companyId: effectiveCompanyId,
              driveFileId: driveMetadata.storageFileId,
            },
            actualDriveState: {
              parentStorageFolderIds: driveMetadata.parentStorageFolderIds,
              mimeType: driveMetadata.mimeType,
            },
          });
          throw error;
        });

      this.logger.log(
        `webhard file uploaded: fileId=${file.id}, name=${file.name}, originalName=${file.originalName}, folderId=${driveTarget.folderId}, companyId=${effectiveCompanyId ?? 'none'}, uploadedBy=${uploadedBy}, redirected=${redirected}, provider=google_drive, driveConfirmSource=${driveConfirm.source}`
      );

      void this.createFileUploadedNotification(file).catch((err) =>
        this.logger.warn(
          `file_uploaded notification queue failed: fileId=${file.id}, error=${
            err instanceof Error ? err.message : String(err)
          }`
        )
      );

      this.storageService
        .invalidateStorageCache(effectiveCompanyId)
        .catch((err) => this.logger.warn(`invalidateStorageCache failed: ${err}`));

      this.eventsGateway.emitToFolder(driveTarget.folderId, {
        type: 'file:created',
        folderId: driveTarget.folderId,
        data: { fileId: file.id },
      });

      if (driveTarget.folderId) {
        this.foldersService
          .propagateUpdatedAt(driveTarget.folderId, file.createdAt)
          .catch((err) => this.logger.warn(`propagateUpdatedAt failed: ${err}`));
      }

      if (driveTarget.folderId) {
        this.logger.log(
          `auto contact hook queued: fileId=${file.id}, originalName=${dto.originalName}, folderId=${driveTarget.folderId}, companyId=${effectiveCompanyId ?? 'none'}`
        );
        this.triggerAutoContact({
          folderId: driveTarget.folderId,
          fileName: dto.originalName,
          fileUrl: `storage://google_drive/${driveMetadata.storageFileId}`,
          companyId: effectiveCompanyId ? String(effectiveCompanyId) : null,
        }).catch((err) => this.logger.warn(`AutoContact hook failed: ${err}`));
      }

      return this.mapToDto(file);
    }

    const file = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFile.create({
          data: {
            name: dto.name,
            originalName: dto.originalName,
            size,
            mimeType: dto.mimeType,
            path: dto.key,
            folderId: effectiveFolderId,
            companyId: effectiveCompanyId,
            uploadedBy: String(uploadedBy),
            inquiryNumber: dto.inquiryNumber ?? null,
            isDownloaded: false,
            storageProvider: StorageProvider.R2,
          },
          include: {
            company: {
              select: {
                companyName: true,
                managerName: true,
              },
            },
          },
        }),
      { operationName: 'confirmUpload.create' }
    );

    this.logger.log(
      `webhard file uploaded: fileId=${file.id}, name=${file.name}, originalName=${file.originalName}, folderId=${effectiveFolderId ?? 'root'}, companyId=${effectiveCompanyId ?? 'none'}, uploadedBy=${uploadedBy}, redirected=${redirected}, provider=r2`
    );

    void this.createFileUploadedNotification(file).catch((err) =>
      this.logger.warn(
        `file_uploaded notification queue failed: fileId=${file.id}, error=${
          err instanceof Error ? err.message : String(err)
        }`
      )
    );

    this.storageService
      .invalidateStorageCache(effectiveCompanyId)
      .catch((err) => this.logger.warn(`invalidateStorageCache failed: ${err}`));

    this.eventsGateway.emitToFolder(effectiveFolderId, {
      type: 'file:created',
      folderId: effectiveFolderId,
      data: { fileId: file.id },
    });

    if (effectiveFolderId) {
      this.foldersService
        .propagateUpdatedAt(effectiveFolderId, file.createdAt)
        .catch((err) => this.logger.warn(`propagateUpdatedAt failed: ${err}`));
    }

    if (effectiveFolderId) {
      this.logger.log(
        `auto contact hook queued: fileId=${file.id}, originalName=${dto.originalName}, folderId=${effectiveFolderId}, companyId=${effectiveCompanyId ?? 'none'}`
      );
      this.triggerAutoContact({
        folderId: effectiveFolderId,
        fileName: dto.originalName,
        fileUrl: dto.key,
        companyId: effectiveCompanyId ? String(effectiveCompanyId) : null,
      }).catch((err) => this.logger.warn(`AutoContact hook failed: ${err}`));
    }

    return this.mapToDto(file);
  }

  /**
   * Batch confirm upload — 최대 500개 파일을 단일 createMany로 INSERT
   * 9000파일 = 18 배치 (500개씩) = 18 INSERT 문
   *
   * Bug 1 (task 25): admin 배치 업로드 시 항목별 폴더의 companyId 를 상속하여 회사 격리
   * 필터에서 파일이 누락되지 않도록 함. 폴더 fetch 는 한 번만 (folderAccessMap 재활용).
   * 항목별 dto.companyId 가 명시되면 그 값이 우선.
   */
  async batchConfirmUpload(
    dto: BatchConfirmUploadDto,
    user: SessionUser
  ): Promise<BatchConfirmUploadResult> {
    const effectiveCompanyId = user.userType === 'company' ? user.companyId : null;
    // admin(세션/API Key 모두) → 'admin', company → userId 문자열
    const uploadedBy = user.userType === 'admin' ? 'admin' : String(user.userId);
    const errors: string[] = [];
    const results: BatchConfirmUploadFileResult[] = [];

    // 1. 폴더 접근 권한 + companyId 상속 + AutoContact 용 일괄 조회
    //    (폴더 fetch 1회 — 단일 findMany 결과를 access/inheritance/auto-contact 모두에서 재활용)
    const uniqueFolderIds = [
      ...new Set(dto.files.filter((f) => f.folderId).map((f) => f.folderId!)),
    ];

    const folderInfoMap = new Map<string, BatchFolderInfo>();
    const folderAllowedMap = new Map<string, boolean>();
    if (uniqueFolderIds.length > 0) {
      const folders = await this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFolder.findMany({
            where: { id: { in: uniqueFolderIds }, deletedAt: null },
            select: {
              id: true,
              name: true,
              path: true,
              companyId: true,
              parentId: true,
              storageProvider: true,
              driveFolderId: true,
            },
          }),
        { operationName: 'batchConfirmUpload.findFolders' }
      );

      for (const folder of folders) {
        folderInfoMap.set(folder.id, folder);
        const allowed =
          user.userType === 'admin'
            ? true
            : folder.companyId === null || folder.companyId === user.companyId;
        folderAllowedMap.set(folder.id, allowed);
      }
    }

    // 2. 유효한 파일만 필터링
    const validFiles = dto.files.filter((f) => {
      const policyError = getUploadPolicyError({
        filename: f.name,
        originalName: f.originalName,
        mimeType: f.mimeType,
      });
      if (policyError) {
        errors.push(policyError);
        results.push({ fileName: f.name, success: false, error: policyError });
        return false;
      }

      if (f.folderId && !folderAllowedMap.get(f.folderId)) {
        const error = `폴더 접근 권한 없음: ${f.name} (folderId: ${f.folderId})`;
        errors.push(error);
        results.push({ fileName: f.name, success: false, error });
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) {
      return { success: 0, failed: dto.files.length, errors, results };
    }

    // task 28 Phase B: per-file routing 캐시 — 배치 내 동일 folderId 는 routing 1회만 호출.
    // 키는 원본 folderId, 값은 redirected 결과 또는 null (non-external / 실패).
    // confirmUpload 의 routing 정책을 batch 에도 동일 적용해 R2 PUT path 와 DB folder_id
    // split-brain 방지. routing 실패는 warn 로그 + fallback (해당 file 1건만 영향).
    const routingCache = new Map<string, { folderId: string; companyId: number } | null>();
    for (let idx = 0; idx < validFiles.length; idx++) {
      const f = validFiles[idx];
      if (!f.folderId || routingCache.has(f.folderId)) continue;
      try {
        const routed = await this.tryRouteExternalUpload(f.folderId);
        routingCache.set(f.folderId, routed);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `batchConfirmUpload routing failed [${idx}/${validFiles.length}] folderId=${f.folderId} key=${f.key} filename=${f.name} error=${msg}`
        );
        await this.recordPipelineEvent({
          filename: f.name,
          stage: 'routing',
          status: 'failed',
          reasonCode: 'routing_failed',
          folderId: f.folderId,
          context: {
            requestedFolderId: f.folderId,
            source: 'batchConfirmUpload',
            itemIndex: idx,
          },
        });
        routingCache.set(f.folderId, null); // fallback — 원본 folderId 사용
      }
    }

    // routed folderId 결정 — cache hit + redirected 면 routed, 그 외엔 원본
    const resolveEffectiveFolderId = (f: ConfirmUploadDto): string | null => {
      if (!f.folderId) return null;
      const routed = routingCache.get(f.folderId);
      return routed ? routed.folderId : f.folderId;
    };

    // 항목별 companyId 결정 (Bug 1, task 25 + task 28 Phase B):
    //   1) company user        → effectiveCompanyId
    //   2) admin + redirected  → routed.companyId  (precedence #2 — dto.companyId 보다 우선)
    //   3) admin + dto.companyId 명시 → 그 값
    //   4) admin + folder 있음 → folderInfoMap[folderId].companyId 상속
    //   5) admin + folder 없음 → null
    const resolveItemCompanyId = (f: ConfirmUploadDto): number | null => {
      if (user.userType !== 'admin') return effectiveCompanyId;
      if (f.folderId) {
        const routed = routingCache.get(f.folderId);
        if (routed) return routed.companyId;
      }
      if (f.companyId !== undefined) return f.companyId;
      if (!f.folderId) return null;
      return folderInfoMap.get(f.folderId)?.companyId ?? null;
    };

    const driveTargetCache = new Map<string, Promise<BatchDriveTarget>>();
    const getDriveTarget = (folderId: string | null): Promise<BatchDriveTarget> => {
      if (!folderId) {
        return this.assertFolderDriveReady(folderId);
      }

      const cached = driveTargetCache.get(folderId);
      if (cached) {
        return cached;
      }

      const pending = this.assertFolderDriveReady(folderId);
      driveTargetCache.set(folderId, pending);
      return pending;
    };

    const driveConfirmCount = validFiles.filter(
      (file) =>
        file.storageProvider === 'google_drive' ||
        (!file.storageProvider && Boolean(file.driveFileId))
    ).length;
    const confirmPrepareStartedAt = Date.now();
    if (driveConfirmCount > 0) {
      this.logger.log(
        `webhard batch drive confirm started: files=${driveConfirmCount}, concurrency=${DRIVE_UPLOAD_CONFIRM_CONCURRENCY}`
      );
    }
    let driveProofConfirmCount = 0;
    let driveApiConfirmCount = 0;

    const preparedResults = await mapWithConcurrency(
      validFiles,
      DRIVE_UPLOAD_CONFIRM_CONCURRENCY,
      async (f): Promise<BatchPreparedConfirmResult> => {
        const requestedDriveUpload =
          f.storageProvider === 'google_drive' || (!f.storageProvider && Boolean(f.driveFileId));
        const effectiveFolderIdForFile = resolveEffectiveFolderId(f);

        if (requestedDriveUpload) {
          if (!f.driveFileId) {
            const error = `Google Drive 업로드 확인 정보가 없습니다: ${f.name}`;
            return {
              errorMessage: error,
              errorResult: { fileName: f.name, success: false, error },
            };
          }

          try {
            const driveTarget = await getDriveTarget(effectiveFolderIdForFile);
            const driveConfirm = await this.confirmDriveUploadedFile({
              storageFileId: f.driveFileId,
              expectedParentStorageFolderId: driveTarget.driveFolderId,
              uploadProof: f.driveUploadProof,
            });
            if (driveConfirm.source === 'proof') {
              driveProofConfirmCount += 1;
            } else {
              driveApiConfirmCount += 1;
            }
            const driveMetadata = driveConfirm.metadata;
            return {
              confirmedFile: {
                file: f,
                folderId: driveTarget.folderId,
                companyId: resolveItemCompanyId(f) ?? driveTarget.companyId,
                path: `${driveTarget.folderId}/${f.name}`,
                mimeType: driveMetadata.mimeType,
                storageProvider: StorageProvider.GOOGLE_DRIVE,
                driveFileId: driveMetadata.storageFileId,
                driveMimeType: driveMetadata.mimeType,
                driveMetadata,
              },
            };
          } catch (error) {
            const errorMessage = `${f.name}: ${
              error instanceof Error ? error.message : 'Google Drive 확인 실패'
            }`;
            return {
              errorMessage,
              errorResult: { fileName: f.name, success: false, error: errorMessage },
            };
          }
        }

        return {
          confirmedFile: {
            file: f,
            folderId: effectiveFolderIdForFile,
            companyId: resolveItemCompanyId(f),
            path: f.key,
            mimeType: f.mimeType,
            storageProvider: StorageProvider.R2,
            driveFileId: null,
            driveMimeType: null,
          },
        };
      }
    );

    const confirmedFiles: ConfirmedBatchFile[] = [];
    for (const preparedResult of preparedResults) {
      if ('confirmedFile' in preparedResult) {
        confirmedFiles.push(preparedResult.confirmedFile);
        continue;
      }

      errors.push(preparedResult.errorMessage);
      results.push(preparedResult.errorResult);
    }

    if (driveConfirmCount > 0) {
      this.logger.log(
        `webhard batch drive confirm finished: files=${driveConfirmCount}, confirmed=${confirmedFiles.filter((file) => file.storageProvider === StorageProvider.GOOGLE_DRIVE).length}, failed=${preparedResults.length - confirmedFiles.length}, proofConfirmed=${driveProofConfirmCount}, driveApiConfirmed=${driveApiConfirmCount}, folders=${driveTargetCache.size}, elapsedMs=${Date.now() - confirmPrepareStartedAt}`
      );
    }

    if (confirmedFiles.length === 0) {
      return { success: 0, failed: dto.files.length, errors, results };
    }

    // 3. createMany로 단일 INSERT 문 실행
    const dataWithSources = confirmedFiles.map((item) => ({
      item,
      data: {
        id: crypto.randomUUID(),
        name: item.file.name,
        originalName: item.file.originalName,
        size: Math.floor(Number(item.file.size)),
        mimeType: item.mimeType,
        path: item.path,
        folderId: item.folderId,
        companyId: item.companyId,
        uploadedBy,
        inquiryNumber: item.file.inquiryNumber ?? null,
        isDownloaded: false,
        storageProvider: item.storageProvider,
        driveFileId: item.driveFileId,
        driveMimeType: item.driveMimeType,
      },
    }));
    const data = dataWithSources.map(({ data: item }) => item);

    const driveFileIds = [
      ...new Set(data.map((item) => item.driveFileId).filter((id): id is string => Boolean(id))),
    ];
    const paths = [...new Set(data.map((item) => item.path))];
    const existingMetadataWhere: Array<
      { driveFileId: { in: string[] } } | { path: { in: string[] } }
    > = [];
    if (driveFileIds.length > 0) {
      existingMetadataWhere.push({ driveFileId: { in: driveFileIds } });
    }
    if (paths.length > 0) {
      existingMetadataWhere.push({ path: { in: paths } });
    }

    const existingMetadata =
      existingMetadataWhere.length > 0
        ? await this.prisma.executeWithRetry(
            () =>
              this.prisma.webhardFile.findMany({
                where: { OR: existingMetadataWhere },
                select: { driveFileId: true, path: true },
              }),
            { operationName: 'batchConfirmUpload.findExistingMetadata' }
          )
        : [];
    const existingMetadataKeys = new Set<string>();
    for (const existing of existingMetadata) {
      if (existing.driveFileId) {
        existingMetadataKeys.add(`drive:${existing.driveFileId}`);
      }
      existingMetadataKeys.add(`path:${existing.path}`);
    }

    const pendingDataWithSources = dataWithSources.filter(
      ({ data: item }) => !existingMetadataKeys.has(getUploadMetadataIdempotencyKey(item))
    );
    const pendingData = pendingDataWithSources.map(({ data: item }) => item);
    const idempotentSuccessCount = dataWithSources.length - pendingDataWithSources.length;

    const result =
      pendingData.length > 0
        ? await this.prisma
            .executeWithRetry(() => this.prisma.webhardFile.createMany({ data: pendingData }), {
              operationName: 'batchConfirmUpload.createMany',
            })
            .catch(async (error) => {
              await Promise.all(
                pendingDataWithSources
                  .map(({ item }) => item)
                  .filter((item) => item.storageProvider === StorageProvider.GOOGLE_DRIVE)
                  .map((item) =>
                    this.recordStorageRepair({
                      operation: 'file_create',
                      driveFileId: item.driveFileId,
                      webhardFolderId: item.folderId,
                      expectedDbState: {
                        name: item.file.name,
                        folderId: item.folderId,
                        companyId: item.companyId,
                        driveFileId: item.driveFileId,
                      },
                      actualDriveState: {
                        parentStorageFolderIds: item.driveMetadata?.parentStorageFolderIds ?? [],
                        mimeType: item.driveMetadata?.mimeType,
                      },
                    })
                  )
              );
              throw error;
            })
        : { count: 0 };
    const successCount = result.count + idempotentSuccessCount;
    for (const item of data) {
      results.push({ fileName: item.name, success: true });
    }

    const createdData = pendingData;
    const createdDataWithSources = pendingDataWithSources;

    // 4. 폴더별 WebSocket 배치 이벤트 발행 (폴더 수만큼만)
    const folderGroups = new Map<string | null, number>();
    for (const item of createdData) {
      const key = item.folderId;
      folderGroups.set(key, (folderGroups.get(key) || 0) + 1);
    }

    const routedCount = createdData.filter((item, idx) => {
      const originalFolderId = createdDataWithSources[idx]?.item.file.folderId;
      return originalFolderId && item.folderId !== originalFolderId;
    }).length;
    this.logger.log(
      `webhard batch files uploaded: requested=${dto.files.length}, success=${successCount}, created=${result.count}, idempotent=${idempotentSuccessCount}, failed=${dto.files.length - successCount}, folders=${folderGroups.size}, routed=${routedCount}`
    );

    if (result.count > 0) {
      void this.createBatchFileUploadedNotification({
        count: result.count,
        folderId: folderGroups.size === 1 ? [...folderGroups.keys()][0] : null,
        companyId: createdData.length > 0 ? createdData[0].companyId : null,
        uploadedBy,
      }).catch((err) =>
        this.logger.warn(
          `batch file_uploaded notification queue failed: count=${result.count}, error=${
            err instanceof Error ? err.message : String(err)
          }`
        )
      );
    }

    for (const [folderId, count] of folderGroups) {
      this.eventsGateway.emitToFolderBatched(folderId, {
        type: 'file:created',
        folderId,
        data: { count, batch: true },
      });
    }

    // 상위 폴더 updated_at 갱신 — 폴더별 최신 업로드 시각으로 갱신 (비동기)
    // createMany는 createdAt을 반환하지 않으므로 now()를 기준으로 사용
    const now = new Date();
    const uniqueFolderIdsForUpdate = [...folderGroups.keys()].filter(
      (id): id is string => id !== null
    );
    for (const folderId of uniqueFolderIdsForUpdate) {
      this.foldersService
        .propagateUpdatedAt(folderId, now)
        .catch((err) =>
          this.logger.warn(`propagateUpdatedAt batch failed for ${folderId}: ${err}`)
        );
    }

    const itemsWithFolder = createdData.filter((item) => item.folderId);
    if (itemsWithFolder.length > 0) {
      const autoContactItems = itemsWithFolder.map((item) => ({
        ...item,
        path:
          item.storageProvider === StorageProvider.GOOGLE_DRIVE && item.driveFileId
            ? `storage://google_drive/${item.driveFileId}`
            : item.path,
      }));

      // 자동 문의 생성 훅 — routing 된 folderId 보강 조회는 사용자 응답을 막지 않는다.
      // 기존에는 원본 외부웹하드 folderId 만 folderInfoMap 에 들어 있어 redirected item 이
      // batchTriggerAutoContact 내부에서 조용히 스킵될 수 있었다.
      void (async () => {
        const autoContactFolderMap = new Map(folderInfoMap);
        const routedFolderIds = [
          ...new Set(
            autoContactItems.map((item) => item.folderId).filter((id): id is string => Boolean(id))
          ),
        ].filter((id) => !autoContactFolderMap.has(id));

        if (routedFolderIds.length > 0) {
          const routedFolders = await this.prisma.executeWithRetry(
            () =>
              this.prisma.webhardFolder.findMany({
                where: { id: { in: routedFolderIds }, deletedAt: null },
                select: {
                  id: true,
                  name: true,
                  path: true,
                  companyId: true,
                  parentId: true,
                  storageProvider: true,
                  driveFolderId: true,
                },
              }),
            { operationName: 'batchConfirmUpload.findRoutedFolders' }
          );
          for (const folder of routedFolders) {
            autoContactFolderMap.set(folder.id, folder);
          }
        }

        const autoContactFolderIds = new Set(
          autoContactItems.map((item) => item.folderId).filter((id): id is string => Boolean(id))
        );
        const missingFolderCount = [...autoContactFolderIds].filter(
          (id) => !autoContactFolderMap.has(id)
        ).length;
        this.logger.log(
          `auto contact batch hook queued: files=${autoContactItems.length}, mappedFolders=${autoContactFolderMap.size}, missingFolders=${missingFolderCount}`
        );

        await this.batchTriggerAutoContact(autoContactItems, autoContactFolderMap);
      })().catch((err) => this.logger.warn(`AutoContact batch hook failed: ${err}`));
    }

    return {
      success: successCount,
      failed: dto.files.length - successCount,
      errors,
      results,
    };
  }

  /**
   * Get download URL for a file
   */
  async getDownloadUrl(fileId: string, user: SessionUser): Promise<PresignedUrlResponseDto> {
    const file = await this.prisma.executeWithRetry(
      () => this.prisma.webhardFile.findUnique({ where: { id: fileId } }),
      { operationName: 'getDownloadUrl.findUnique' }
    );

    if (!file || file.deletedAt) {
      throw new NotFoundException('File not found');
    }

    if (user.userType === 'worker') {
      await this.assertWorkerCanAccessFile(user, fileId);
    } else {
      this.verifyFileAccess(file, user);
    }

    // 다운로드 마킹은 프론트엔드에서 배치 완료 후 markDownloaded API로 처리
    // (개별 UPDATE 제거 → 배치 최적화)

    if (file.storageProvider === StorageProvider.GOOGLE_DRIVE) {
      if (!file.driveFileId) {
        throw new NotFoundException('Drive file not found');
      }
      return {
        url: `/api/v1/files/${file.id}/download/stream`,
        key: file.driveFileId,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        fileName: file.name,
        provider: 'google_drive',
      };
    }

    // path가 CDN 풀 URL인 경우 R2 key로 변환 (한글 percent-encoded 포함)
    const r2Key = extractR2Key(file.path);

    const result = await this.storageService.getDownloadPresignedUrl(
      r2Key,
      undefined,
      file.name // Content-Disposition: 원본 파일명으로 다운로드
    );

    return {
      url: result.url,
      key: result.key,
      expiresAt: result.expiresAt.toISOString(),
      fileName: file.name,
      provider: 'r2',
    };
  }

  async getDownloadStream(
    fileId: string,
    user: SessionUser
  ): Promise<DownloadFileResult & { fileName: string }> {
    const file = await this.prisma.executeWithRetry(
      () => this.prisma.webhardFile.findUnique({ where: { id: fileId } }),
      { operationName: 'getDownloadStream.findUnique' }
    );

    if (!file || file.deletedAt) {
      throw new NotFoundException('File not found');
    }

    if (user.userType === 'worker') {
      await this.assertWorkerCanAccessFile(user, fileId);
    } else {
      this.verifyFileAccess(file, user);
    }

    const download = await this.storageService.downloadWebhardFile(file);
    if ('url' in download) {
      throw new BadRequestException('R2 files must be downloaded through presigned URLs');
    }

    return {
      ...download,
      fileName: file.name,
    };
  }

  /**
   * Rename a file
   */
  async renameFile(
    fileId: string,
    dto: RenameFileDto,
    user: SessionUser
  ): Promise<FileResponseDto> {
    const file = await this.prisma.executeWithRetry(
      () => this.prisma.webhardFile.findUnique({ where: { id: fileId } }),
      { operationName: 'renameFile.findUnique' }
    );

    if (!file || file.deletedAt) {
      throw new NotFoundException('File not found');
    }

    this.verifyFileAccess(file, user);
    const sanitizedName = sanitizeWebhardFilename(dto.name);
    const duplicateFile = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFile.findFirst({
          where: {
            id: { not: fileId },
            folderId: file.folderId,
            originalName: sanitizedName,
            deletedAt: null,
          },
          select: { id: true },
        }),
      { operationName: 'renameFile.findDuplicate' }
    );

    if (duplicateFile) {
      throw new BadRequestException('같은 폴더에 이미 존재하는 파일명입니다.');
    }

    if (file.storageProvider === StorageProvider.GOOGLE_DRIVE && file.driveFileId) {
      await this.storageService.renameDriveFile({
        storageFileId: file.driveFileId,
        name: sanitizedName,
      });
    }

    const updated = await this.prisma
      .executeWithRetry(
        () =>
          this.prisma.webhardFile.update({
            where: { id: fileId },
            data: { name: sanitizedName, originalName: sanitizedName },
            include: {
              company: {
                select: {
                  companyName: true,
                  managerName: true,
                },
              },
            },
          }),
        { operationName: 'renameFile.update' }
      )
      .catch(async (error) => {
        await this.recordStorageRepair({
          operation: 'file_rename',
          driveFileId: file.driveFileId,
          webhardFileId: fileId,
          webhardFolderId: file.folderId,
          expectedDbState: { name: sanitizedName, originalName: sanitizedName },
          actualDriveState: { name: sanitizedName },
        });
        throw error;
      });

    // 실시간 이벤트 발행
    this.eventsGateway.emitToFolder(file.folderId, {
      type: 'file:renamed',
      folderId: file.folderId,
      data: { fileId, newName: sanitizedName },
    });

    return this.mapToDto(updated);
  }

  /**
   * Move a file to another folder
   */
  async moveFile(fileId: string, dto: MoveFileDto, user: SessionUser): Promise<FileResponseDto> {
    const file = await this.prisma.executeWithRetry(
      () => this.prisma.webhardFile.findUnique({ where: { id: fileId } }),
      { operationName: 'moveFile.findUnique' }
    );

    if (!file || file.deletedAt) {
      throw new NotFoundException('File not found');
    }

    this.verifyFileAccess(file, user);

    // Verify target folder access if specified
    if (dto.folderId) {
      await this.verifyFolderAccess(dto.folderId, user);
    }

    if (file.storageProvider === StorageProvider.GOOGLE_DRIVE && file.driveFileId) {
      if (!dto.folderId) {
        throw new BadRequestException('Google Drive 파일은 대상 폴더가 필요합니다.');
      }
      const targetFolder = await this.assertFolderDriveReady(dto.folderId);
      const sourceFolder = file.folderId
        ? await this.prisma.webhardFolder.findUnique({
            where: { id: file.folderId },
            select: { driveFolderId: true },
          })
        : null;
      await this.storageService.moveDriveFile({
        storageFileId: file.driveFileId,
        fromParentStorageFolderId: sourceFolder?.driveFolderId ?? null,
        toParentStorageFolderId: targetFolder.driveFolderId,
      });
    }

    const updated = await this.prisma
      .executeWithRetry(
        () =>
          this.prisma.webhardFile.update({
            where: { id: fileId },
            data: { folderId: dto.folderId ?? null },
            include: {
              company: {
                select: {
                  companyName: true,
                  managerName: true,
                },
              },
            },
          }),
        { operationName: 'moveFile.update' }
      )
      .catch(async (error) => {
        await this.recordStorageRepair({
          operation: 'file_move',
          driveFileId: file.driveFileId,
          webhardFileId: fileId,
          webhardFolderId: dto.folderId ?? null,
          expectedDbState: { folderId: dto.folderId ?? null },
          actualDriveState: { moved: true },
        });
        throw error;
      });

    // 실시간 이벤트 발행: 소스/타겟 폴더 모두
    this.eventsGateway.emitToFolder(file.folderId, {
      type: 'file:moved',
      folderId: file.folderId,
      data: { fileId, targetFolderId: dto.folderId ?? null },
    });
    if (dto.folderId !== file.folderId) {
      this.eventsGateway.emitToFolder(dto.folderId ?? null, {
        type: 'file:moved',
        folderId: dto.folderId ?? null,
        data: { fileId, sourceFolderId: file.folderId },
      });
    }

    return this.mapToDto(updated);
  }

  /**
   * Batch move files (N+1 쿼리 최적화 버전)
   * - 모든 파일을 1회 조회 후 권한 검증, 단일 updateMany로 이동
   */
  async batchMoveFiles(dto: BatchMoveFilesDto, user: SessionUser): Promise<BatchOperationResult> {
    const startTime = Date.now();

    // Verify target folder access if specified
    if (dto.targetFolderId) {
      await this.verifyFolderAccess(dto.targetFolderId, user);
    }
    // 1. 모든 파일 1회 조회
    const files = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFile.findMany({
          where: {
            id: { in: dto.fileIds },
            deletedAt: null,
          },
          select: {
            id: true,
            companyId: true,
            folderId: true,
            storageProvider: true,
            driveFileId: true,
          },
        }),
      { operationName: 'batchMoveFiles.findMany' }
    );

    // 찾지 못한 파일 수
    const notFoundCount = dto.fileIds.length - files.length;

    // 2. 권한 검증 (메모리에서 처리)
    const authorizedFiles = files.filter((f) => {
      // 관리자는 모든 파일 접근 가능
      if (user.userType === 'admin') return true;
      // 업체 사용자는 자신의 파일 또는 공유 파일(companyId = null)만 접근 가능
      return f.companyId === null || f.companyId === user.companyId;
    });
    const authorizedIds = authorizedFiles.map((f) => f.id);

    const unauthorizedCount = files.length - authorizedIds.length;

    // 3. 권한 있는 파일만 배치 업데이트 (단일 쿼리)
    let movedCount = 0;
    if (authorizedIds.length > 0) {
      const driveFiles = authorizedFiles.filter(
        (file) => file.storageProvider === StorageProvider.GOOGLE_DRIVE && file.driveFileId
      );
      const targetDriveFolder =
        driveFiles.length > 0 && dto.targetFolderId
          ? await this.assertFolderDriveReady(dto.targetFolderId)
          : null;
      if (driveFiles.length > 0 && !targetDriveFolder) {
        throw new BadRequestException('Google Drive 파일은 대상 폴더가 필요합니다.');
      }

      const driveSourceFolderIds = Array.from(
        new Set(driveFiles.map((file) => file.folderId).filter((id): id is string => Boolean(id)))
      );
      const sourceDriveFolders =
        driveSourceFolderIds.length > 0
          ? await this.prisma.executeWithRetry(
              () =>
                this.prisma.webhardFolder.findMany({
                  where: { id: { in: driveSourceFolderIds }, deletedAt: null },
                  select: { id: true, driveFolderId: true },
                }),
              { operationName: 'batchMoveFiles.findSourceDriveFolders' }
            )
          : [];
      const sourceDriveFolderIdByFolderId = new Map(
        sourceDriveFolders.map((folder) => [folder.id, folder.driveFolderId])
      );

      const driveMoveStartedAt = Date.now();
      const driveMoveResults = await this.storageService.moveDriveFiles(
        driveFiles.map((file) => ({
          storageFileId: file.driveFileId as string,
          fromParentStorageFolderId: file.folderId
            ? (sourceDriveFolderIdByFolderId.get(file.folderId) ?? null)
            : null,
          toParentStorageFolderId: targetDriveFolder!.driveFolderId,
        }))
      );
      this.logger.log(
        `webhard batch Drive move finished: files=${driveFiles.length}, success=${
          driveMoveResults.filter((result) => result.success).length
        }, failed=${driveMoveResults.filter((result) => !result.success).length}, elapsedMs=${
          Date.now() - driveMoveStartedAt
        }`
      );
      const movedDriveFiles = driveFiles.filter((_, index) => driveMoveResults[index]?.success);
      const failedDriveMove = driveMoveResults.find((result) => !result.success);
      if (failedDriveMove) {
        await Promise.all(
          movedDriveFiles.map((file) =>
            this.recordStorageRepair({
              operation: 'file_move',
              driveFileId: file.driveFileId,
              webhardFileId: file.id,
              webhardFolderId: dto.targetFolderId ?? null,
              expectedDbState: { folderId: dto.targetFolderId ?? null },
              actualDriveState: { moved: true, dbUpdateSkipped: true, batchMoveFailed: true },
            })
          )
        );
        throw new BadRequestException(failedDriveMove.error ?? 'Google Drive 파일 이동 실패');
      }

      let result: { count: number };
      try {
        result = await this.prisma.executeWithRetry(
          () =>
            this.prisma.webhardFile.updateMany({
              where: { id: { in: authorizedIds } },
              data: { folderId: dto.targetFolderId ?? null },
            }),
          { operationName: 'batchMoveFiles.updateMany' }
        );
      } catch (error) {
        await Promise.all(
          driveFiles.map((file) =>
            this.recordStorageRepair({
              operation: 'file_move',
              driveFileId: file.driveFileId,
              webhardFileId: file.id,
              webhardFolderId: dto.targetFolderId ?? null,
              expectedDbState: { folderId: dto.targetFolderId ?? null },
              actualDriveState: { moved: true, dbUpdateFailed: true },
            })
          )
        );
        throw error;
      }
      movedCount = result.count;
    }

    // 4. 결과 계산
    const failed = notFoundCount + unauthorizedCount + (authorizedIds.length - movedCount);
    const errors: string[] = [];

    if (notFoundCount > 0) {
      errors.push(`${notFoundCount}개 파일을 찾을 수 없습니다`);
    }
    if (unauthorizedCount > 0) {
      errors.push(`${unauthorizedCount}개 파일에 대한 접근 권한이 없습니다`);
    }

    // 실시간 이벤트 발행
    if (movedCount > 0) {
      const sourceFolderIds = Array.from(
        new Set(authorizedFiles.map((file) => file.folderId ?? null))
      );
      const targetFolderId = dto.targetFolderId ?? null;

      for (const sourceFolderId of sourceFolderIds) {
        this.eventsGateway.emitToFolder(sourceFolderId, {
          type: 'file:moved',
          folderId: sourceFolderId,
          data: {
            count: movedCount,
            targetFolderId,
          },
        });
      }

      if (!sourceFolderIds.includes(targetFolderId)) {
        this.eventsGateway.emitToFolder(targetFolderId, {
          type: 'file:moved',
          folderId: targetFolderId,
          data: {
            count: movedCount,
            sourceFolderIds,
          },
        });
      }
    }

    return {
      success: failed === 0,
      processed: movedCount,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Soft delete a file (move to trash)
   */
  async deleteFile(fileId: string, user: SessionUser): Promise<void> {
    if (user.userType !== 'admin') {
      throw new ForbiddenException('Only admin users can delete files');
    }

    const file = await this.prisma.executeWithRetry(
      () => this.prisma.webhardFile.findUnique({ where: { id: fileId } }),
      { operationName: 'deleteFile.findUnique' }
    );

    if (!file || file.deletedAt) {
      throw new NotFoundException('File not found');
    }

    this.verifyFileAccess(file, user);

    if (file.storageProvider === StorageProvider.GOOGLE_DRIVE && file.driveFileId) {
      await this.storageService.trashDriveFile({ storageFileId: file.driveFileId });
    }

    await this.prisma
      .executeWithRetry(
        () =>
          this.prisma.webhardFile.update({
            where: { id: fileId },
            data: {
              deletedAt: new Date(),
              deletedBy: String(user.userType === 'admin' ? 1 : (user.companyId ?? 0)),
            },
          }),
        { operationName: 'deleteFile.update' }
      )
      .catch(async (error) => {
        await this.recordStorageRepair({
          operation: 'trash',
          driveFileId: file.driveFileId,
          webhardFileId: fileId,
          webhardFolderId: file.folderId,
          expectedDbState: { deletedAt: 'set' },
          actualDriveState: { trashed: true },
        });
        throw error;
      });

    // Invalidate storage cache after file deletion
    this.storageService
      .invalidateStorageCache(file.companyId)
      .catch((err) => this.logger.warn(`invalidateStorageCache failed: ${err}`));

    // 실시간 이벤트 발행
    this.eventsGateway.emitToFolder(file.folderId, {
      type: 'file:deleted',
      folderId: file.folderId,
      data: { fileId },
    });
  }

  /**
   * Batch soft delete files (최적화: updateMany로 단일 쿼리 실행)
   */
  async batchDeleteFiles(
    dto: BatchDeleteFilesDto,
    user: SessionUser
  ): Promise<BatchOperationResult> {
    if (user.userType !== 'admin') {
      throw new ForbiddenException('Only admin users can delete files');
    }

    const startTime = Date.now();

    // 1. 모든 파일 한 번에 조회 (권한 검증용)
    const files = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFile.findMany({
          where: {
            id: { in: dto.fileIds },
            deletedAt: null,
          },
          select: {
            id: true,
            companyId: true,
            folderId: true,
            storageProvider: true,
            driveFileId: true,
          },
        }),
      { operationName: 'batchDeleteFiles.findMany' }
    );

    // 찾지 못한 파일 수
    const notFoundCount = dto.fileIds.length - files.length;

    // 2. 접근 권한 검증 (메모리에서 처리 - 순차 API 호출 제거)
    const authorizedIds = files
      .filter((f) => {
        // 관리자는 모든 파일 접근 가능
        if (user.userType === 'admin') return true;
        // 업체 사용자는 자신의 파일 또는 공유 파일(companyId = null)만 접근 가능
        return f.companyId === null || f.companyId === user.companyId;
      })
      .map((f) => f.id);
    const authorizedIdSet = new Set(authorizedIds);
    const authorizedFiles = files.filter((f) => authorizedIdSet.has(f.id));

    const unauthorizedCount = files.length - authorizedIds.length;

    // 3. 권한 있는 파일만 배치 업데이트 (단일 쿼리로 대폭 성능 개선)
    let deletedCount = 0;
    if (authorizedIds.length > 0) {
      const driveFiles = authorizedFiles.filter(
        (file) => file.storageProvider === StorageProvider.GOOGLE_DRIVE && file.driveFileId
      );

      const driveTrashStartedAt = Date.now();
      const driveTrashResults = await this.storageService.trashDriveFiles(
        driveFiles.map((file) => ({ storageFileId: file.driveFileId as string }))
      );
      this.logger.log(
        `webhard batch Drive trash finished: files=${driveFiles.length}, success=${
          driveTrashResults.filter((result) => result.success).length
        }, failed=${driveTrashResults.filter((result) => !result.success).length}, elapsedMs=${
          Date.now() - driveTrashStartedAt
        }`
      );
      const trashedDriveFiles = driveFiles.filter((_, index) => driveTrashResults[index]?.success);
      const failedDriveTrash = driveTrashResults.find((result) => !result.success);
      if (failedDriveTrash) {
        await Promise.all(
          trashedDriveFiles.map((file) =>
            this.recordStorageRepair({
              operation: 'trash',
              driveFileId: file.driveFileId,
              webhardFileId: file.id,
              webhardFolderId: file.folderId,
              expectedDbState: { deletedAt: 'set' },
              actualDriveState: { trashed: true, dbUpdateSkipped: true, batchDeleteFailed: true },
            })
          )
        );
        throw new BadRequestException(failedDriveTrash.error ?? 'Google Drive 파일 삭제 실패');
      }

      let result: { count: number };
      try {
        result = await this.prisma.executeWithRetry(
          () =>
            this.prisma.webhardFile.updateMany({
              where: { id: { in: authorizedIds } },
              data: {
                deletedAt: new Date(),
                deletedBy: String(user.userType === 'admin' ? 1 : (user.companyId ?? 0)),
              },
            }),
          { operationName: 'batchDeleteFiles.updateMany' }
        );
      } catch (error) {
        await Promise.all(
          driveFiles.map((file) =>
            this.recordStorageRepair({
              operation: 'trash',
              driveFileId: file.driveFileId,
              webhardFileId: file.id,
              webhardFolderId: file.folderId,
              expectedDbState: { deletedAt: 'set' },
              actualDriveState: { trashed: true, dbUpdateFailed: true },
            })
          )
        );
        throw error;
      }
      deletedCount = result.count;
    }

    // 4. 결과 계산
    const failed = notFoundCount + unauthorizedCount + (authorizedIds.length - deletedCount);
    const errors: string[] = [];

    if (notFoundCount > 0) {
      errors.push(`${notFoundCount}개 파일을 찾을 수 없습니다`);
    }
    if (unauthorizedCount > 0) {
      errors.push(`${unauthorizedCount}개 파일에 대한 접근 권한이 없습니다`);
    }

    // 실시간 이벤트 발행
    if (deletedCount > 0) {
      this.eventsGateway.emitGlobal({
        type: 'file:deleted',
        folderId: null,
        data: { count: deletedCount },
      });
    }

    return {
      success: failed === 0,
      processed: deletedCount,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Verify user has access to the file
   */
  private verifyFileAccess(file: { companyId: number | null }, user: SessionUser): void {
    if (user.userType === 'admin') {
      return;
    }

    if (user.userType === 'worker' || user.userType === 'integration') {
      throw new ForbiddenException('Access denied to this file');
    }

    // Company users can only access their own files (companyId must match exactly)
    if (file.companyId !== user.companyId) {
      throw new ForbiddenException('Access denied to this file');
    }
  }

  private async assertWorkerCanAccessFolder(user: SessionUser, folderId: string): Promise<void> {
    if (!this.workerContactAccessService) {
      throw new ForbiddenException('Worker folder access denied');
    }
    await this.workerContactAccessService.assertCanAccessFolder(user, folderId);
  }

  private async assertWorkerCanAccessFile(user: SessionUser, fileId: string): Promise<void> {
    if (!this.workerContactAccessService) {
      throw new ForbiddenException('Worker file access denied');
    }
    await this.workerContactAccessService.assertCanAccessFile(user, fileId);
  }

  /**
   * ZIP 다운로드용 파일 정보 조회 (권한 검증 포함)
   */
  async getFilesForZip(
    fileIds: string[],
    user: SessionUser
  ): Promise<
    Array<{
      path: string;
      originalName: string;
      storageProvider: StorageProvider;
      driveFileId: string | null;
    }>
  > {
    const files = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFile.findMany({
          where: { id: { in: fileIds }, deletedAt: null },
          select: {
            id: true,
            path: true,
            originalName: true,
            companyId: true,
            storageProvider: true,
            driveFileId: true,
          },
        }),
      { operationName: 'getFilesForZip' }
    );

    return files
      .filter((f) => {
        if (user.userType === 'admin') return true;
        return f.companyId === user.companyId;
      })
      .map((f) => ({
        path: f.path,
        originalName: f.originalName,
        storageProvider: f.storageProvider,
        driveFileId: f.driveFileId,
      }));
  }

  /**
   * Verify user has access to the folder.
   *
   * Returns the verified folder so callers can reuse fields (예: companyId 상속) without
   * a second DB roundtrip. Callers that don't need the folder simply discard the return value.
   */
  private async verifyFolderAccess(
    folderId: string,
    user: SessionUser
  ): Promise<{ id: string; companyId: number | null }> {
    const folder = await this.prisma.executeWithRetry(
      () => this.prisma.webhardFolder.findUnique({ where: { id: folderId } }),
      { operationName: 'verifyFolderAccess' }
    );

    if (!folder || folder.deletedAt) {
      throw new NotFoundException('Folder not found');
    }

    if (user.userType !== 'admin') {
      // Company users: 자기 회사 폴더만 접근 가능
      if (folder.companyId !== user.companyId) {
        throw new ForbiddenException('Access denied to this folder');
      }
    }

    return { id: folder.id, companyId: folder.companyId };
  }

  /**
   * Map database model to DTO
   */
  private mapToDto = (file: {
    id: string;
    name: string;
    originalName: string;
    size: bigint;
    mimeType: string;
    path: string;
    folderId: string | null;
    companyId: number | null;
    uploadedBy: string;
    inquiryNumber: string | null;
    isDownloaded: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    deletedBy: string | null;
    storageProvider?: StorageProvider;
    driveFileId?: string | null;
    driveMimeType?: string | null;
    company?: { companyName: string; managerName: string | null } | null;
  }): FileResponseDto => ({
    id: file.id,
    name: file.name,
    original_name: file.originalName,
    size: Number(file.size),
    mime_type: file.mimeType,
    path: file.path,
    folder_id: file.folderId,
    company_id: file.companyId,
    uploaded_by: String(file.uploadedBy),
    inquiry_number: file.inquiryNumber,
    is_downloaded: file.isDownloaded,
    created_at: file.createdAt.toISOString(),
    updated_at: file.updatedAt.toISOString(),
    deleted_at: file.deletedAt?.toISOString() ?? null,
    deleted_by: file.deletedBy ? Number(file.deletedBy) : null,
    storage_provider: file.storageProvider === StorageProvider.GOOGLE_DRIVE ? 'google_drive' : 'r2',
    companies: file.company
      ? {
          company_name: file.company.companyName,
          manager_name: file.company.managerName,
        }
      : null,
  });

  /**
   * Map sort field to database column
   */
  private mapSortField(sortBy: string): string {
    const fieldMap: Record<string, string> = {
      created_at: 'createdAt',
      date: 'createdAt',
      name: 'name',
      size: 'size',
      updated_at: 'updatedAt',
      uploaded_by: 'uploadedBy',
    };
    return fieldMap[sortBy] || 'createdAt';
  }

  /**
   * Get badge counts for undownloaded files
   */
  async getBadgeCounts(
    query: GetBadgeCountsQueryDto,
    user: SessionUser
  ): Promise<BadgeCountsResponseDto> {
    return this.badgeCountsService.getBadgeCounts(query, user);
  }

  /**
   * Get new (undownloaded) files list with pagination
   */
  async getNewFiles(
    query: GetNewFilesQueryDto,
    user: SessionUser
  ): Promise<NewFilesListResponseDto> {
    const { companyId, page = 1, limit = 50, sortBy = 'created_at', sortOrder = 'desc' } = query;

    // 업체 사용자는 자신의 데이터만 조회 가능
    const effectiveCompanyId = user.userType === 'company' ? user.companyId : companyId;

    const where: Record<string, unknown> = {
      deletedAt: null,
      isDownloaded: false,
      ...this.validFileStorageWhere(),
    };

    // Company access control
    if (user.userType === 'company') {
      where.companyId = user.companyId;
    } else if (effectiveCompanyId !== undefined) {
      where.companyId = effectiveCompanyId;
    }

    // $transaction으로 count + findMany를 단일 트랜잭션에서 실행 (일관성 + 성능)
    const [total, files] = await this.prisma.executeWithRetry(
      () =>
        this.prisma.$transaction([
          this.prisma.webhardFile.count({ where }),
          this.prisma.webhardFile.findMany({
            where,
            include: {
              company: {
                select: {
                  companyName: true,
                  managerName: true,
                },
              },
              folder: {
                select: {
                  id: true,
                  name: true,
                  parentId: true,
                },
              },
            },
            orderBy: {
              [this.mapSortField(sortBy)]: sortOrder,
            },
            skip: (page - 1) * limit,
            take: limit,
          }),
        ]),
      { operationName: 'getNewFiles' }
    );

    // 폴더 경로 계산을 위해 전체 폴더 목록 1회 조회 (N+1 방지)
    const folderIds = new Set<string>();
    for (const file of files) {
      if (file.folder) {
        folderIds.add(file.folder.id);
        if (file.folder.parentId) folderIds.add(file.folder.parentId);
      }
    }

    const folderPathMap = await this.buildFolderPathMap(folderIds);

    const mappedFiles: NewFileResponseDto[] = files.map((file) => ({
      ...this.mapToDto(file),
      folder_path: file.folder
        ? this.buildBreadcrumb(
            file.folder.id,
            file.folder.name,
            file.folder.parentId,
            folderPathMap
          )
        : null,
      uploader_display_name: this.resolveUploaderName(file.uploadedBy, file.company ?? null),
    }));

    return {
      files: mappedFiles,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  private async buildFolderPathMap(
    folderIds: Set<string>
  ): Promise<Map<string, { name: string; parentId: string | null }>> {
    if (folderIds.size === 0) {
      return new Map();
    }

    // Use shared cache from FoldersService to avoid duplicate full-table scans
    const allFolders = await this.foldersService.getAllFoldersForPathMap();

    const map = new Map<string, { name: string; parentId: string | null }>();
    for (const folder of allFolders) {
      map.set(folder.id, { name: folder.name, parentId: folder.parentId });
    }
    return map;
  }

  private buildBreadcrumb(
    folderId: string,
    folderName: string,
    parentId: string | null,
    folderMap: Map<string, { name: string; parentId: string | null }>
  ): string {
    const parts: string[] = [folderName];
    let currentParentId = parentId;
    let depth = 0;

    while (currentParentId && depth < 10) {
      const parent = folderMap.get(currentParentId);
      if (!parent) break;
      parts.unshift(parent.name);
      currentParentId = parent.parentId;
      depth++;
    }

    return parts.join(' / ');
  }

  private resolveUploaderName(
    uploadedBy: string,
    company: { companyName: string; managerName: string | null } | null
  ): string {
    // 'admin': 신규 저장값 / '0','1': 레거시 admin/동기화 저장값 — 모두 "관리자" 표시
    if (uploadedBy === 'admin' || uploadedBy === '0' || uploadedBy === '1') return '관리자';
    if (company?.companyName) return company.companyName;
    return uploadedBy;
  }

  /**
   * Mark files as downloaded
   */
  async markDownloaded(
    dto: MarkDownloadedDto,
    user: SessionUser
  ): Promise<MarkDownloadedResponseDto> {
    const { fileIds, folderId, markAll } = dto;

    // 최소한 하나의 조건이 있어야 함
    if (!fileIds?.length && !folderId && !markAll) {
      throw new BadRequestException(
        'At least one of fileIds, folderId, or markAll must be provided'
      );
    }

    if (user.userType === 'integration' && markAll) {
      throw new ForbiddenException('Integration principal cannot mark all files as downloaded');
    }

    // Verify folder ownership before marking downloaded
    if (folderId) {
      await this.verifyFolderAccess(folderId, user);
    }

    const where: Record<string, unknown> = {
      deletedAt: null,
      isDownloaded: false,
    };

    // Company access control
    if (user.userType === 'company') {
      where.companyId = user.companyId;
    }

    // 특정 파일 ID 목록
    if (fileIds?.length) {
      where.id = { in: fileIds };
    }

    // 특정 폴더 내 파일
    if (folderId) {
      where.folderId = folderId;
    }

    // 파일 업데이트
    const result = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFile.updateMany({
          where,
          data: { isDownloaded: true },
        }),
      { operationName: 'markDownloaded' }
    );

    return {
      success: true,
      updatedCount: result.count,
    };
  }

  /**
   * 배치 자동 문의 생성 — 호출자(`batchConfirmUpload`)가 이미 조회한 folderMap 을 그대로 재활용.
   * private + 호출자 1곳이라 자체 fallback 조회 없음 (N+1 방지를 강제).
   */
  private async batchTriggerAutoContact(
    items: Array<{
      folderId: string | null;
      originalName: string;
      path: string;
      companyId: number | null;
    }>,
    folderMap: Map<string, BatchFolderInfo>
  ): Promise<void> {
    const folderIds = items.filter((i) => i.folderId).map((i) => i.folderId as string);
    if (folderIds.length === 0) return;

    // companyId가 있는 항목의 업체명을 배치로 미리 조회 (N+1 방지)
    const uniqueCompanyIds = [
      ...new Set(
        items.map((i) => i.companyId).filter((companyId): companyId is number => companyId !== null)
      ),
    ];
    const companyNameMap = new Map<number, string>();
    if (uniqueCompanyIds.length > 0) {
      const companies = await this.prisma.executeWithRetry(
        () =>
          this.prisma.company.findMany({
            where: { id: { in: uniqueCompanyIds } },
            select: { id: true, companyName: true },
          }),
        { operationName: 'batchTriggerAutoContact.findCompanies' }
      );
      for (const c of companies) {
        companyNameMap.set(c.id, c.companyName);
      }
    }

    const folderPathCache = new Map<string, Promise<string>>();
    const folderCompanyNameCache = new Map<string, Promise<string | null>>();
    const preparedResults: Array<PreparedAutoContactItem | null> = new Array(items.length).fill(
      null
    );

    const resolveFolderPath = (folder: BatchFolderInfo): Promise<string> => {
      if (folder.path && folder.path !== '/') return Promise.resolve(folder.path);
      const cached = folderPathCache.get(folder.id);
      if (cached) return cached;
      const promise = this.buildFolderPath(folder.id);
      folderPathCache.set(folder.id, promise);
      return promise;
    };

    const resolveCompanyName = (
      item: {
        companyId: number | null;
      },
      folder: BatchFolderInfo
    ): Promise<string | null> => {
      if (item.companyId !== null) {
        return Promise.resolve(companyNameMap.get(item.companyId) ?? null);
      }

      const cached = folderCompanyNameCache.get(folder.id);
      if (cached) return cached;
      const promise = this.resolveCompanyFolder(folder.id);
      folderCompanyNameCache.set(folder.id, promise);
      return promise;
    };

    await this.runWithConcurrency(items, 8, async (item, index) => {
      if (!item.folderId) return;
      const folder = folderMap.get(item.folderId);
      if (!folder) {
        this.logger.warn(
          `auto contact batch skipped: folder metadata missing for folderId=${item.folderId}, file=${item.originalName}`
        );
        return;
      }

      try {
        const companyName = await resolveCompanyName(item, folder);
        if (!companyName) {
          await this.notifyCompanyFolderUnresolved(folder.id, item.originalName);
          return;
        }

        const folderPath = await resolveFolderPath(folder);

        preparedResults[index] = {
          folderId: item.folderId,
          originalName: item.originalName,
          path: item.path,
          companyId: item.companyId,
          folderPath,
          companyName,
        };
      } catch (err) {
        this.logger.warn(`AutoContact hook failed for ${item.originalName}: ${err}`);
      }
    });

    const groupedItems = new Map<string, PreparedAutoContactItem[]>();
    for (const item of preparedResults) {
      if (!item) continue;
      const key = `${item.companyName}\u0000${item.originalName}`;
      const group = groupedItems.get(key);
      if (group) {
        group.push(item);
      } else {
        groupedItems.set(key, [item]);
      }
    }

    await this.runWithConcurrency([...groupedItems.values()], 6, async (group) => {
      for (const item of group) {
        try {
          await this.autoContactService.detectAndCreate({
            fileName: item.originalName,
            fileUrl: item.path,
            folderId: item.folderId,
            folderPath: item.folderPath,
            companyName: item.companyName,
            companyId: item.companyId !== null ? String(item.companyId) : null,
          });
          this.logger.log(
            `auto contact batch dispatched: file=${item.originalName}, folderId=${item.folderId}, folderPath=${item.folderPath}, company=${item.companyName}, companyId=${item.companyId ?? 'none'}`
          );
        } catch (err) {
          this.logger.warn(`AutoContact hook failed for ${item.originalName}: ${err}`);
        }
      }
    });
  }

  private async runWithConcurrency<T>(
    items: readonly T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<void>
  ): Promise<void> {
    if (items.length === 0) return;

    const limit = Math.max(1, Math.min(concurrency, items.length));
    let nextIndex = 0;

    await Promise.all(
      Array.from({ length: limit }, async () => {
        while (nextIndex < items.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          await worker(items[currentIndex], currentIndex);
        }
      })
    );
  }

  /**
   * 파일 업로드 후 자동 문의 생성 트리거
   * 폴더의 path 필드와 company name을 조회 후 AutoContactService 호출
   */
  private async triggerAutoContact(params: {
    folderId: string;
    fileName: string;
    fileUrl: string;
    companyId: string | null;
  }): Promise<void> {
    const folder = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findUnique({
          where: { id: params.folderId, deletedAt: null },
          select: { id: true, name: true, path: true, companyId: true, parentId: true },
        }),
      { operationName: 'triggerAutoContact.findFolder' }
    );

    if (!folder) {
      this.logger.warn(
        `auto contact hook skipped: folder not found for folderId=${params.folderId}, file=${params.fileName}`
      );
      return;
    }

    // 업체명 결정: companyId가 있으면 DB에서 직접 조회 (업체 직접 업로드)
    // companyId가 없으면 폴더 계층 탐색 (외부 동기화/관리자 업로드)
    let companyName: string | null = null;
    if (params.companyId) {
      const company = await this.prisma.executeWithRetry(
        () =>
          this.prisma.company.findUnique({
            where: { id: Number(params.companyId) },
            select: { companyName: true },
          }),
        { operationName: 'triggerAutoContact.findCompany' }
      );
      companyName = company?.companyName ?? null;
    } else {
      companyName = await this.resolveCompanyFolder(folder.id);
    }

    if (!companyName) {
      await this.notifyCompanyFolderUnresolved(params.folderId, params.fileName);
      return;
    }

    // folder.path가 null/'/'인 경우 부모 계층을 상향 탐색하여 전체 경로 구축
    const folderPath =
      folder.path && folder.path !== '/' ? folder.path : await this.buildFolderPath(folder.id);

    await this.autoContactService.detectAndCreate({
      fileName: params.fileName,
      fileUrl: params.fileUrl,
      folderId: params.folderId,
      folderPath,
      companyName,
      companyId: params.companyId,
    });
    this.logger.log(
      `auto contact dispatched: file=${params.fileName}, folderId=${params.folderId}, folderPath=${folderPath}, company=${companyName}, companyId=${params.companyId ?? 'none'}`
    );
  }

  /**
   * 폴더 계층을 상향 탐색하여 전체 경로를 구축한다.
   * folder.path 필드가 null인 경우의 폴백으로 사용.
   * 예: 제황(parent→ㄱ 내리기전용→외부웹하드) → "/외부웹하드/ㄱ 내리기전용/제황"
   */
  private async buildFolderPath(folderId: string): Promise<string> {
    const segments: string[] = [];
    let currentId: string | null = folderId;
    let depth = 0;

    while (currentId && depth < 10) {
      const row: { name: string; parentId: string | null } | null =
        await this.prisma.webhardFolder.findUnique({
          where: { id: currentId },
          select: { name: true, parentId: true },
        });
      if (!row) break;
      segments.unshift(row.name);
      currentId = row.parentId;
      depth++;
    }

    return '/' + segments.join('/');
  }

  /**
   * 폴더 계층에서 업체명 추출 — 제외 목록 기반 상향 탐색
   *
   * 파일의 부모 폴더부터 root 방향으로 올라가며,
   * 구조적 폴더(올리기전용, 내리기전용, 목형의뢰, 칼선의뢰, 완료)를 건너뛰고
   * 첫 번째 유효한 폴더 이름을 업체명으로 반환한다.
   *
   * @returns 업체명 문자열 또는 null (유효한 업체 폴더가 없는 경우)
   */
  private async resolveCompanyFolder(folderId: string): Promise<string | null> {
    const excludedFolders = await this.webhardConfigService.getExcludedFolders();

    let current = await this.prisma.webhardFolder.findUnique({
      where: { id: folderId },
      select: { id: true, name: true, parentId: true },
    });

    let depth = 0;
    while (current && depth < 10) {
      // 레거시 업체 루트는 parentId/companyId 가 모두 null 일 수 있다.
      // 등록 업체명 또는 승인 alias 로 확인되는 경우에만 업체 폴더로 인정한다.
      if (!current.parentId) {
        return this.resolveRootCompanyFolder(current.name, excludedFolders);
      }

      // 구조적 폴더 건너뛰기
      if (!excludedFolders.includes(current.name)) {
        return current.name;
      }

      current = await this.prisma.webhardFolder.findUnique({
        where: { id: current.parentId },
        select: { id: true, name: true, parentId: true },
      });
      depth++;
    }

    return null;
  }

  private async resolveRootCompanyFolder(
    folderName: string,
    excludedFolders: string[]
  ): Promise<string | null> {
    const trimmed = folderName.trim();
    if (!trimmed || trimmed === '외부웹하드' || excludedFolders.includes(trimmed)) {
      return null;
    }

    const matched = await lookupCompanyByFolderName(this.prisma, trimmed);
    return matched?.companyName ?? null;
  }

  /**
   * resolveCompanyFolder 가 null 을 반환한 경우의 경보.
   * 파일 업로드는 완료됐으나 상위 업체 폴더를 찾지 못해 AutoContact 흐름이 스킵된 사실을
   * 관리자에게 알린다. Notification 생성 실패해도 호출 흐름은 유지된다.
   */
  private async notifyCompanyFolderUnresolved(folderId: string, fileName: string): Promise<void> {
    await this.recordPipelineEvent({
      filename: fileName,
      stage: 'auto_contact',
      status: 'skipped',
      reasonCode: 'company_folder_unresolved',
      folderId,
      context: {
        source: 'resolveCompanyFolder',
      },
    });

    try {
      await this.prisma.notification.create({
        data: {
          userType: 'admin',
          userId: null,
          type: 'webhard_company_mismatch',
          title: '웹하드 업체 폴더 매칭 실패',
          message: `폴더 ${folderId} 의 상위에서 업체 폴더를 찾지 못해 자동 문의 생성이 스킵되었습니다.`,
          metadata: {
            folderId,
            fileName,
            source: 'resolveCompanyFolder',
          },
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to create webhard_company_mismatch notification (folderId=${folderId}): ${err}`
      );
    }
    this.logger.warn(
      `webhard_company_mismatch: folderId=${folderId}, fileName=${fileName} (resolveCompanyFolder returned null)`
    );
  }
}
