import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FoldersService } from '../folders/folders.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { resolveCompanyRoot } from '../folders/_lib/resolve-company-root.util';

export interface ContactFolderSyncContext {
  contactId: string;
  /** $transaction 내에서 호출 시 tx 를 전달. 미지정 시 PrismaService 직접 사용 (하위 호환). */
  client?: Prisma.TransactionClient;
}

export interface OnProcessStageChangedContext extends ContactFolderSyncContext {
  previousStage: string | null;
  nextStage: string;
}

/**
 * Contact 상태 변화에 따른 폴더 생성 / rename / 파일 이동의 단일 진입점.
 * `FoldersService` 를 주입받아 얇게 orchestration 한다 — 내부 로직은 중복 구현 금지.
 *
 * 정책 요약 (`docs/specs/features/contact-webhard-folder.md`):
 * - `onContactCreated`: inquiryType 확정 시 ensureInquiryFolder + relocate. null 이면 no-op.
 * - `onInquiryTypeClassified`: rename → ensure → relocate 3 단계. null 시 warn+skip.
 * - `onProcessStageChanged`: rename → ensure → relocate. `nextStage='drawing_confirmed'` 에서 null 이면 throw.
 */
@Injectable()
export class ContactFolderSyncService {
  private readonly logger = new Logger(ContactFolderSyncService.name);

  constructor(
    @Inject(forwardRef(() => FoldersService))
    private readonly foldersService: FoldersService,
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway
  ) {}

  /**
   * Contact 신규 생성 직후 호출.
   * `inquiryType` 확정이면 ensureInquiryFolder + relocate, 미분류면 no-op.
   * 폴더 생성 실패는 warn+skip — Contact 생성 자체는 성공 유지.
   */
  async onContactCreated(ctx: ContactFolderSyncContext): Promise<void> {
    const { contactId, client } = ctx;

    const contact = await this.loadContactInquiryType(contactId, client);
    if (!contact) {
      this.logger.warn({ contactId, hook: 'onContactCreated' }, 'contact not found');
      return;
    }
    if (!contact.inquiryType) {
      return;
    }

    const folder = await this.foldersService.ensureInquiryFolder(contactId, client);
    if (!folder) {
      this.logger.warn(
        { contactId, hook: 'onContactCreated' },
        'ensureInquiryFolder returned null — skipping relocate'
      );
      return;
    }

    const { movedIds } = await this.foldersService.relocateContactFiles(
      contactId,
      folder.id,
      client
    );
    this.logger.log(
      { contactId, hook: 'onContactCreated', folderId: folder.id, movedCount: movedIds.length },
      'contact folder ensured + files relocated'
    );
  }

  /**
   * 미분류 → 분류 확정 시 호출. rename → ensure → relocate 3 단계.
   * `ensureInquiryFolder` null 반환 시 warn+skip — 분류 자체는 성공 유지 (UX 회귀 방지).
   */
  async onInquiryTypeClassified(ctx: ContactFolderSyncContext): Promise<void> {
    const { contactId, client } = ctx;

    await this.foldersService.renameInquiryFolderForContact(contactId, client);
    const folder = await this.foldersService.ensureInquiryFolder(contactId, client);
    if (!folder) {
      this.logger.warn(
        { contactId, hook: 'onInquiryTypeClassified' },
        'ensureInquiryFolder returned null — skipping relocate'
      );
      return;
    }

    const { movedIds } = await this.foldersService.relocateContactFiles(
      contactId,
      folder.id,
      client
    );
    this.logger.log(
      {
        contactId,
        hook: 'onInquiryTypeClassified',
        folderId: folder.id,
        movedCount: movedIds.length,
      },
      'inquiry classified — folder ensured + files relocated'
    );
  }

  /**
   * processStage 변경 시 호출.
   * `nextStage='drawing_confirmed'` 전환 시 폴더가 확보되지 않으면 throw — silent skip 금지.
   * 그 외 stage 전환은 warn+skip.
   *
   * NOTE: rename → ensure → relocate 순서는 워크넘버 발급 직후 폴더명 갱신을 위함 (`{O}` → `{O}_{F}`).
   */
  async onProcessStageChanged(ctx: OnProcessStageChangedContext): Promise<void> {
    const { contactId, client, nextStage } = ctx;
    const isDrawingConfirmed = nextStage === 'drawing_confirmed';

    // task 23 phase 5: drawing_confirmed 전환 시 inquiryNumber/workNumber 최소 한쪽은
    // 반드시 존재해야 폴더를 식별할 수 있다. 둘 다 없으면 명시적으로 거부한다.
    if (isDrawingConfirmed) {
      const db = (client ?? this.prisma) as Prisma.TransactionClient;
      const contact = await db.contact.findUnique({
        where: { id: contactId },
        select: { inquiryNumber: true, workNumber: true },
      });
      if (!contact) {
        this.logger.error(
          { contactId, hook: 'onProcessStageChanged', nextStage },
          'contact not found'
        );
        throw new UnprocessableEntityException({
          code: 'CONTACT_NOT_FOUND',
          message: '해당 문의를 찾을 수 없습니다.',
          contactId,
        });
      }
      if (!contact.inquiryNumber && !contact.workNumber) {
        this.logger.error(
          { contactId, hook: 'onProcessStageChanged', nextStage },
          'inquiryNumber/workNumber both null at drawing_confirmed — throwing INQUIRY_NUMBER_REQUIRED'
        );
        throw new UnprocessableEntityException({
          code: 'INQUIRY_NUMBER_REQUIRED',
          message: '도면 확정 전에 문의번호(O) 또는 작업번호(F) 가 할당되어야 합니다.',
          contactId,
        });
      }
    }

    await this.foldersService.renameInquiryFolderForContact(contactId, client);
    const folder = await this.foldersService.ensureInquiryFolder(contactId, client);
    if (!folder) {
      if (isDrawingConfirmed) {
        this.logger.error(
          { contactId, hook: 'onProcessStageChanged', nextStage },
          'ensureInquiryFolder returned null at drawing_confirmed — throwing FOLDER_CREATION_FAILED'
        );
        throw new UnprocessableEntityException({
          code: 'FOLDER_CREATION_FAILED',
          message:
            '문의 폴더 생성에 실패하여 도면 확정으로 전환할 수 없습니다. 업체 폴더 매칭 또는 문의번호를 확인해주세요.',
          contactId,
        });
      }
      this.logger.warn(
        { contactId, hook: 'onProcessStageChanged', nextStage },
        'ensureInquiryFolder returned null — skipping relocate'
      );
      return;
    }

    const { movedIds } = await this.foldersService.relocateContactFiles(
      contactId,
      folder.id,
      client
    );
    this.logger.log(
      {
        contactId,
        hook: 'onProcessStageChanged',
        nextStage,
        folderId: folder.id,
        movedCount: movedIds.length,
      },
      'process stage changed — folder ensured + files relocated'
    );
  }

  private async loadContactInquiryType(
    contactId: string,
    client: Prisma.TransactionClient | undefined
  ): Promise<{ inquiryType: string | null } | null> {
    const db = (client ?? this.prisma) as Prisma.TransactionClient;
    return db.contact.findUnique({
      where: { id: contactId },
      select: { inquiryType: true },
    });
  }

  /**
   * Alias 승인 후 미통합 Contact 일괄 백필 (task 24, task 26 보강).
   *
   * 외부웹하드 동기화로 들어와 폴더명 원본으로 누적된 Contact (companyId=null) 들을
   * 매칭된 업체에 강제 통합한다. 단일 진입점 정책 유지를 위해 내부적으로
   * `onContactCreated` 를 재호출 — 외부 호출자에서 직접
   * `ensureInquiryFolder` / `relocateContactFiles` 를 부르지 않는다.
   *
   * task 26 변경:
   * - 미분류 Contact (`inquiryType=null`) 도 강제 통합한다 (companyId/companyName 갱신).
   *   폴더 위치 정착은 후속 `migrateExternalFolderTreeToCompany` 가 외부 폴더 트리 이동 시 처리
   *   ({업체}/{원본 폴더명}/ 으로 정착).
   * - `skipped` 카운트는 "이미 companyId 가 채워진 contact" 만 의미한다 (findMany where 조건으로
   *   자동 제외되므로 이 메서드에서는 사실상 0).
   *
   * 정책:
   * - companyId 가 이미 채워진 Contact 는 자동 제외 (where 조건).
   * - 분류된 Contact: companyId 갱신 + onContactCreated 위임 (ensureInquiryFolder + relocateContactFiles).
   * - 미분류 Contact: companyId 갱신만 — 후속 migrate 가 폴더 트리 이동으로 정착시킨다.
   * - company 미존재 → NotFoundException throw (트랜잭션 롤백).
   */
  async relocateAfterAliasApproved(
    folderName: string,
    companyId: number,
    client?: Prisma.TransactionClient
  ): Promise<{ relocated: number; skipped: number }> {
    const tx = (client ?? this.prisma) as Prisma.TransactionClient;

    const company = await tx.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    const targets = await tx.contact.findMany({
      where: {
        OR: [
          { companyName: folderName },
          { companyName: { equals: folderName, mode: 'insensitive' } },
        ],
        companyId: null,
      },
    });

    let relocated = 0;

    for (const contact of targets) {
      // task 26: 미분류 contact 도 강제 통합 — companyId/companyName 먼저 갱신.
      await tx.contact.update({
        where: { id: contact.id },
        data: { companyName: company.companyName, companyId: company.id },
      });

      if (contact.inquiryType) {
        // 분류된 contact: 단일 진입점 위임 (ensureInquiryFolder + relocateContactFiles).
        await this.onContactCreated({ contactId: contact.id, client: tx });
      }
      // 미분류 contact: 폴더 정착은 migrateExternalFolderTreeToCompany 가 처리.
      relocated++;
    }

    this.logger.log(
      {
        folderName,
        companyId,
        targets: targets.length,
        relocated,
        skipped: 0,
      },
      'relocateAfterAliasApproved completed'
    );

    return { relocated, skipped: 0 };
  }

  /**
   * task 26 + task 27: 외부웹하드 root 폴더 트리를 가입 업체 폴더로 통째 이전.
   *
   * `relocateAfterAliasApproved` 가 Contact 단위 통합을 마친 직후 chained call 로 호출된다.
   * 외부 폴더 트리의 모든 폴더·파일을 가입 업체 폴더로 옮긴다.
   *
   * task 27 정책 변경 (2026-04-30):
   * - 외부 폴더 row 는 **husk 로 유지** (deletedAt=null). cascade soft-delete 제거.
   * - 근거: task 26 Phase 1.5 의 `tryRouteExternalUpload` routing 이 외부 folder 가
   *   살아있을 때만 lookup 가능. cascade delete 가 routing 진입을 막아 Electron sync 회귀 발생.
   * - husk 정리는 admin 명시 액션 (`DELETE /folders/external-husk/:rootId`) 으로 분리.
   *
   * 처리 분기 (직접 자식 폴더 기준): (변동 없음)
   * - template 세그먼트 (`칼선의뢰` / `목형의뢰` / `문의` / `완료`) → 업체 루트 동명 template 폴더로 자식 병합
   * - folderKind='inquiry' → 업체 루트 하위 `문의/`
   * - 그 외 임의 폴더 → 업체 루트 직하 (충돌 시 (1)/(2) rename)
   *
   * 불변 규칙: (변동 없음)
   * - WebhardFile.path (R2 key) 는 변경하지 않음
   * - 폴더 이동 시 path 재계산
   * - `Contact.companyId IS NULL` 필터로 멱등성
   *
   * @param externalRootFolderId `/외부웹하드/{X}/` root 폴더 id (depth=2)
   * @param targetCompanyId 가입 업체 id
   * @param client $transaction 콜백 안에서 호출 시 tx 전달 권장 (alias 1건 1 tx 원칙)
   */
  async migrateExternalFolderTreeToCompany(
    externalRootFolderId: string,
    targetCompanyId: number,
    client?: Prisma.TransactionClient
  ): Promise<{
    movedFolders: number;
    movedFiles: number;
    deletedExternalFolders: number;
    conflicts: Array<{ originalName: string; renamedTo: string }>;
  }> {
    const tx = (client ?? this.prisma) as Prisma.TransactionClient;

    // Step 1: external root 검증
    const externalRoot = await tx.webhardFolder.findUnique({
      where: { id: externalRootFolderId },
    });
    if (!externalRoot || externalRoot.deletedAt) {
      throw new BadRequestException(
        `External root folder ${externalRootFolderId} not found or already deleted`
      );
    }
    if (!externalRoot.path || !externalRoot.path.startsWith('/외부웹하드/')) {
      throw new BadRequestException(
        `Folder ${externalRootFolderId} is not under /외부웹하드/ (path=${externalRoot.path ?? 'null'})`
      );
    }
    // depth=2 검증: '/외부웹하드/{X}' → segments=['외부웹하드', '{X}']
    const segments = externalRoot.path.split('/').filter((s) => s.length > 0);
    if (segments.length !== 2) {
      throw new BadRequestException(
        `External root must be at depth=2 under /외부웹하드/ (path=${externalRoot.path})`
      );
    }

    // Step 2: 가입 업체 root folder 확보 (lazy init fallback)
    const company = await tx.company.findUnique({ where: { id: targetCompanyId } });
    if (!company) {
      throw new NotFoundException(`Company ${targetCompanyId} not found`);
    }
    let resolved = await resolveCompanyRoot(tx, company.companyName);
    if (!resolved.rootFolderId) {
      // initializeCompanyFolders 는 idempotent (findOrCreate). tx 외부에서 실행되지만
      // alias 1건 1 tx 원칙 하에서 동시성 이슈 없음.
      await this.foldersService.initializeCompanyFolders(targetCompanyId, company.companyName);
      resolved = await resolveCompanyRoot(tx, company.companyName);
    }
    if (!resolved.rootFolderId) {
      throw new BadRequestException(
        `Cannot resolve company root folder for company ${targetCompanyId} (${company.companyName})`
      );
    }
    const companyRootId = resolved.rootFolderId;

    // Step 3: BFS — 외부 root 의 모든 하위 (자기 자신 포함) 폴더 id 수집 (mutation 전, Step 6 의 단독 consumer)
    // task 27 에서 Step 7 cascade soft-delete 가 제거되어 externalFolderIds 는 Step 6 만 소비함
    const externalFolderIds: string[] = [];
    const collectQueue: string[] = [externalRootFolderId];
    while (collectQueue.length > 0) {
      const id = collectQueue.shift() as string;
      externalFolderIds.push(id);
      const children = await tx.webhardFolder.findMany({
        where: { parentId: id, deletedAt: null },
        select: { id: true },
      });
      collectQueue.push(...children.map((c) => c.id));
    }

    let movedFolders = 0;
    let movedFiles = 0;
    const conflicts: Array<{ originalName: string; renamedTo: string }> = [];

    // Step 4: 직접 자식 폴더 분기 처리
    const directChildren = await tx.webhardFolder.findMany({
      where: { parentId: externalRootFolderId, deletedAt: null },
    });
    const TEMPLATE_SEGMENTS = new Set(['칼선의뢰', '목형의뢰', '문의', '완료']);

    for (const child of directChildren) {
      if (TEMPLATE_SEGMENTS.has(child.name)) {
        // 4a. template 병합: 업체 루트 동명 template 폴더로 자식 이동
        const targetTemplate = await this.ensureCompanyTemplateFolder(
          tx,
          companyRootId,
          targetCompanyId,
          child.name
        );
        const grandChildren = await tx.webhardFolder.findMany({
          where: { parentId: child.id, deletedAt: null },
        });
        for (const grand of grandChildren) {
          const newName = await this.resolveConflictName(
            tx,
            targetTemplate.id,
            grand.name,
            conflicts
          );
          const moved = await this.moveSubtreeToCompany(
            tx,
            grand,
            targetTemplate.id,
            newName,
            targetCompanyId
          );
          movedFolders += moved.folders;
          movedFiles += moved.files;
        }
        // child 의 직접 파일 → template 폴더
        const directFiles = await tx.webhardFile.findMany({
          where: { folderId: child.id, deletedAt: null },
          select: { id: true },
        });
        if (directFiles.length > 0) {
          const upd = await tx.webhardFile.updateMany({
            where: { id: { in: directFiles.map((f) => f.id) } },
            data: { folderId: targetTemplate.id, companyId: targetCompanyId },
          });
          movedFiles += upd.count;
        }
        // child 자체는 비워져 step 6 의 cascade soft delete 대상
      } else if (child.folderKind === 'inquiry') {
        // 4b. inquiry 폴더 → 업체 루트 하위 `문의/` template 폴더 아래로
        const inquiryRoot = await this.foldersService.ensureInquiryRootFolder(
          companyRootId,
          targetCompanyId,
          tx
        );
        const newName = await this.resolveConflictName(tx, inquiryRoot.id, child.name, conflicts);
        const moved = await this.moveSubtreeToCompany(
          tx,
          child,
          inquiryRoot.id,
          newName,
          targetCompanyId
        );
        movedFolders += moved.folders;
        movedFiles += moved.files;
      } else {
        // 4c. 임의 폴더 → 업체 루트 직하 (충돌 시 (1)/(2) rename)
        const newName = await this.resolveConflictName(tx, companyRootId, child.name, conflicts);
        const moved = await this.moveSubtreeToCompany(
          tx,
          child,
          companyRootId,
          newName,
          targetCompanyId
        );
        movedFolders += moved.folders;
        movedFiles += moved.files;
      }
    }

    // Step 5: external root 직접 파일 → 업체 root
    const externalRootDirectFiles = await tx.webhardFile.findMany({
      where: { folderId: externalRootFolderId, deletedAt: null },
      select: { id: true },
    });
    if (externalRootDirectFiles.length > 0) {
      const upd = await tx.webhardFile.updateMany({
        where: { id: { in: externalRootDirectFiles.map((f) => f.id) } },
        data: { folderId: companyRootId, companyId: targetCompanyId },
      });
      movedFiles += upd.count;
    }

    // Step 6: Contact 갱신 (멱등 — companyId IS NULL 만)
    await tx.contact.updateMany({
      where: {
        webhardFolderId: { in: externalFolderIds },
        companyId: null,
      },
      data: {
        companyId: targetCompanyId,
        companyName: company.companyName,
      },
    });

    // Step 7 (task 27 정책 변경): cascade soft-delete 제거.
    // 외부 폴더는 husk (빈 껍데기) 로 유지하여 신규 동기화의 routing 진입을 보장한다
    // (`task 26 Phase 1.5`: tryRouteExternalUpload 가 deletedAt=null folder 만 lookup).
    // husk 정리는 admin 의 명시 액션 (`DELETE /folders/external-husk/:rootId`) 으로 분리.
    const deletedExternalFolders = 0;

    // Step 8: 이벤트 1회 발행
    this.eventsGateway.emitGlobal({
      type: 'folder:migrated',
      folderId: externalRootFolderId,
      data: {
        externalRootFolderId,
        targetCompanyId,
        movedFolders,
        movedFiles,
        deletedExternalFolders,
      },
    });

    this.logger.log(
      {
        externalRootFolderId,
        targetCompanyId,
        movedFolders,
        movedFiles,
        deletedExternalFolders,
        conflicts: conflicts.length,
      },
      'migrateExternalFolderTreeToCompany completed'
    );

    return { movedFolders, movedFiles, deletedExternalFolders, conflicts };
  }

  /**
   * 업체 루트 하위 동명 template 폴더 (folderKind='template') 를 idempotent 하게 확보.
   * `migrateExternalFolderTreeToCompany` step 4a 전용 helper.
   */
  private async ensureCompanyTemplateFolder(
    tx: Prisma.TransactionClient,
    parentId: string,
    companyId: number,
    name: string
  ): Promise<{ id: string; path: string | null }> {
    const existing = await tx.webhardFolder.findFirst({
      where: { parentId, name, deletedAt: null },
      select: { id: true, path: true },
    });
    if (existing) return existing;

    const parent = await tx.webhardFolder.findUnique({
      where: { id: parentId },
      select: { path: true, name: true },
    });
    const newPath =
      parent?.path && parent.path !== '/'
        ? `${parent.path}/${name}`
        : `/${parent?.name ?? ''}/${name}`;
    throw new BadRequestException(
      `Company template folder is not provisioned in Google Drive: companyId=${companyId}, parentId=${parentId}, path=${newPath}`
    );
  }

  /**
   * 신규 parent 하위에서 `desiredName` 충돌 시 `(1)`, `(2)` 자동 suffix 로 unique 이름 결정.
   */
  private async resolveConflictName(
    tx: Prisma.TransactionClient,
    parentId: string,
    desiredName: string,
    conflicts: Array<{ originalName: string; renamedTo: string }>
  ): Promise<string> {
    const existing = await tx.webhardFolder.findMany({
      where: {
        parentId,
        deletedAt: null,
        OR: [{ name: desiredName }, { name: { startsWith: `${desiredName} (` } }],
      },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((f) => f.name));
    if (!existingNames.has(desiredName)) return desiredName;
    let counter = 1;
    while (existingNames.has(`${desiredName} (${counter})`)) {
      counter++;
    }
    const renamedTo = `${desiredName} (${counter})`;
    conflicts.push({ originalName: desiredName, renamedTo });
    return renamedTo;
  }

  /**
   * 폴더 subtree 를 새 parent 아래로 이동 + 전체 descendant 의 path/companyId 갱신 +
   * 모든 파일의 companyId 갱신. R2 object key (`WebhardFile.path`) 는 절대 변경하지 않는다.
   *
   * @returns 이동된 폴더 수 (자기 + descendants), 갱신된 파일 수
   */
  private async moveSubtreeToCompany(
    tx: Prisma.TransactionClient,
    folder: { id: string; name: string; parentId: string | null },
    newParentId: string,
    newName: string,
    newCompanyId: number
  ): Promise<{ folders: number; files: number }> {
    // 1. 이동된 폴더의 새 path 계산
    const parent = await tx.webhardFolder.findUnique({
      where: { id: newParentId },
      select: { path: true, name: true },
    });
    const newPath =
      parent?.path && parent.path !== '/'
        ? `${parent.path}/${newName}`
        : `/${parent?.name ?? ''}/${newName}`;

    // 2. 이동된 폴더 자체 갱신
    await tx.webhardFolder.update({
      where: { id: folder.id },
      data: {
        parentId: newParentId,
        name: newName,
        path: newPath,
        companyId: newCompanyId,
      },
    });

    // 3. BFS — descendants 의 path / companyId 갱신
    const allFolderIds: string[] = [folder.id];
    const idToPath = new Map<string, string>([[folder.id, newPath]]);
    const queue: string[] = [folder.id];
    let folderCount = 1;
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      const curPath = idToPath.get(cur) as string;
      const children = await tx.webhardFolder.findMany({
        where: { parentId: cur, deletedAt: null },
        select: { id: true, name: true },
      });
      for (const child of children) {
        const childPath = `${curPath}/${child.name}`;
        idToPath.set(child.id, childPath);
        await tx.webhardFolder.update({
          where: { id: child.id },
          data: { path: childPath, companyId: newCompanyId },
        });
        allFolderIds.push(child.id);
        folderCount++;
        queue.push(child.id);
      }
    }

    // 4. 파일 companyId 갱신 (folderId / path 는 변경 없음 — R2 key 불변)
    const fileUpd = await tx.webhardFile.updateMany({
      where: { folderId: { in: allFolderIds }, deletedAt: null },
      data: { companyId: newCompanyId },
    });

    return { folders: folderCount, files: fileUpd.count };
  }
}
