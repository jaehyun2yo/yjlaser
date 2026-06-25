import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Prisma, StorageProvider, WebhardFolder } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../auth/auth.service';
import { EventsGateway } from '../events/events.gateway';
import { ContactsGateway } from '../contacts/contacts.gateway';
import { buildInquiryFolderName } from '../common/inquiry-filename.util';
import { extractR2Key } from '../common/r2-key.util';
import { StorageRepairService } from '../storage/storage-repair.service';
import { StorageService } from '../storage/storage.service';
import type { StorageRepairOperation } from '../storage/storage-repair.service';
import { resolveCompanyRoot } from './_lib/resolve-company-root.util';
import {
  FolderLookupClient,
  FolderPathService,
  FolderPathUpdateClient,
} from './folder-path.service';
import {
  FolderResponseDto,
  FolderListResponseDto,
  FolderDetailResponseDto,
  FolderTreeNodeDto,
  GetFoldersQueryDto,
  CreateFolderDto,
  RenameFolderDto,
  MoveFolderDto,
  BatchDeleteStatsResponseDto,
  BatchDeleteResultResponseDto,
  FolderTemplateNode,
} from './dto/folder.dto';
import { FolderAncestorsResponseDto } from './dto/ancestors.dto';
import { DriveProvisioningService } from './drive-provisioning.service';
import { FolderTemplateService } from './folder-template.service';

// 외부웹하드 루트 폴더명 — 관리자만 접근 가능, company 사용자에게 노출 금지
const EXTERNAL_WEBHARD_FOLDERS = ['외부웹하드', '올리기전용', '내리기전용'] as const;

// Cache keys for folder queries
const CACHE_KEY_ALL_FOLDERS = 'folders:all';
const CACHE_KEY_FOLDERS_PATH_MAP = 'folders:path-map';
const FOLDER_CACHE_TTL = 10000; // 10s in ms
const COMPANY_ROOT_FOLDER_DELETE_BLOCKED_CODE = 'COMPANY_ROOT_FOLDER_DELETE_BLOCKED';
const COMPANY_ROOT_FOLDER_DELETE_BLOCKED_MESSAGE =
  '업체와 매칭된 폴더입니다. 삭제하려면 업체삭제를 진행해주세요.';
const DRIVE_FOLDER_TRASH_CONCURRENCY = 8;

type FolderLatestFileMetadata = {
  createdAt: Date;
  uploaderDisplayName: string;
};

type FolderLatestFileMetadataRow = {
  root_id: string;
  created_at: Date;
  uploaded_by: string;
  company_name: string | null;
};

type FolderListRow = {
  id: string;
  name: string;
  parentId: string | null;
  companyId: number | null;
  path: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  company?: { companyName: string } | null;
  _count?: { files?: number; children?: number };
};

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

@Injectable()
export class FoldersService {
  private readonly logger = new Logger(FoldersService.name);
  private readonly folderPathService: FolderPathService;

  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @Inject(forwardRef(() => ContactsGateway))
    private contactsGateway: ContactsGateway,
    @Optional() folderPathService?: FolderPathService,
    @Optional() private readonly folderTemplateService?: FolderTemplateService,
    @Optional() private readonly driveProvisioningService?: DriveProvisioningService,
    @Optional() private readonly storageService?: StorageService,
    @Optional() private readonly storageRepairService?: StorageRepairService
  ) {
    this.folderPathService = folderPathService ?? new FolderPathService(this.prisma);
  }

  private validFolderStorageWhere(): Prisma.WebhardFolderWhereInput {
    return {
      NOT: {
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFolderId: null,
      },
    };
  }

  private validFileStorageWhere(): Prisma.WebhardFileWhereInput {
    return {
      NOT: {
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFileId: null,
      },
    };
  }

  private getDriveFolderIdForMutation(
    folder: Pick<WebhardFolder, 'id' | 'storageProvider' | 'driveFolderId'>,
    context: string
  ): string | null {
    if (!this.storageService) {
      return null;
    }
    if (folder.storageProvider !== StorageProvider.GOOGLE_DRIVE) {
      return null;
    }
    if (!folder.driveFolderId) {
      throw new BadRequestException(`${context} is not provisioned in Google Drive`);
    }
    return folder.driveFolderId;
  }

  private assertNotCompanyRootFolder(folder: {
    id: string;
    name: string;
    parentId: string | null;
    companyId: number | null;
    company?: { companyName: string } | null;
  }): void {
    if (folder.companyId === null || folder.parentId !== null) {
      return;
    }

    throw new BadRequestException({
      code: COMPANY_ROOT_FOLDER_DELETE_BLOCKED_CODE,
      message: COMPANY_ROOT_FOLDER_DELETE_BLOCKED_MESSAGE,
      companyId: folder.companyId,
      companyName: folder.company?.companyName,
      folderId: folder.id,
      folderName: folder.name,
      redirectTo: `/admin/companies/${folder.companyId}`,
    });
  }

  private async getParentDriveFolderId(parentId: string | null): Promise<string | null> {
    return this.getParentDriveFolderIdWithClient(this.prisma, parentId);
  }

  private async getParentDriveFolderIdWithClient(
    client: Prisma.TransactionClient | PrismaService,
    parentId: string | null
  ): Promise<string | null> {
    if (!this.storageService || !parentId) {
      return null;
    }
    const parent = await client.webhardFolder.findUnique({
      where: { id: parentId },
      select: { id: true, storageProvider: true, driveFolderId: true },
    });
    if (!parent) {
      throw new NotFoundException('Parent folder not found');
    }
    return this.getDriveFolderIdForMutation(parent as WebhardFolder, 'Parent folder');
  }

  private async prepareFolderStorageBeforeDb(input: {
    name: string;
    parentFolder: Pick<WebhardFolder, 'id' | 'storageProvider' | 'driveFolderId'> | null;
  }): Promise<{ storageProvider: StorageProvider; driveFolderId: string | null }> {
    if (input.parentFolder && input.parentFolder.storageProvider !== StorageProvider.GOOGLE_DRIVE) {
      return { storageProvider: StorageProvider.R2, driveFolderId: null };
    }

    const parentDriveFolderId = input.parentFolder
      ? this.getDriveFolderIdForMutation(input.parentFolder, 'Parent folder')
      : null;
    const driveFolderId = await this.createDriveFolderBeforeDb({
      name: input.name,
      parentDriveFolderId,
    });
    return { storageProvider: StorageProvider.GOOGLE_DRIVE, driveFolderId };
  }

  private async prepareChildFolderStorageBeforeDb(
    client: Prisma.TransactionClient | PrismaService,
    parentId: string | null,
    name: string
  ): Promise<{ storageProvider: StorageProvider; driveFolderId: string | null }> {
    if (!parentId) {
      return this.prepareFolderStorageBeforeDb({ name, parentFolder: null });
    }

    const parent = await client.webhardFolder.findUnique({
      where: { id: parentId },
      select: { id: true, storageProvider: true, driveFolderId: true },
    });
    if (!parent) {
      throw new NotFoundException('Parent folder not found');
    }
    return this.prepareFolderStorageBeforeDb({ name, parentFolder: parent });
  }

  private async createDriveFolderBeforeDb(input: {
    name: string;
    parentDriveFolderId: string | null;
  }): Promise<string> {
    if (!this.storageService) {
      throw new BadRequestException('Google Drive storage service is not configured');
    }
    const [driveFolderId] = await this.storageService.generateDriveIds(1);
    await this.storageService.createDriveFolder({
      name: input.name,
      parentStorageFolderId: input.parentDriveFolderId,
      storageFolderId: driveFolderId,
    });
    return driveFolderId;
  }

  private async recordFolderRepair(input: {
    operation: StorageRepairOperation;
    driveFolderId?: string | null;
    webhardFolderId?: string | null;
    expectedDbState: Record<string, unknown>;
    actualDriveState: Record<string, unknown>;
  }): Promise<void> {
    if (!this.storageRepairService || !input.driveFolderId) {
      return;
    }
    await this.storageRepairService.recordDriveDbMismatch({
      operation: input.operation,
      storageProvider: 'google_drive',
      driveFolderId: input.driveFolderId,
      webhardFolderId: input.webhardFolderId ?? undefined,
      expectedDbState: input.expectedDbState,
      actualDriveState: input.actualDriveState,
    });
  }

  /**
   * Fetch all folders from cache or DB.
   * Shared by isDescendantOf, getAncestors, getDescendantFolderIds.
   * TTL: 10s, invalidated on any folder mutation.
   */
  private async getAllFoldersCached(): Promise<
    { id: string; parentId: string | null; companyId: number | null }[]
  > {
    const cached =
      await this.cacheManager.get<
        { id: string; parentId: string | null; companyId: number | null }[]
      >(CACHE_KEY_ALL_FOLDERS);
    if (cached) return cached;

    const folders = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findMany({
          where: { deletedAt: null, ...this.validFolderStorageWhere() },
          select: { id: true, parentId: true, companyId: true },
        }),
      { operationName: 'getAllFoldersCached' }
    );

    await this.cacheManager.set(CACHE_KEY_ALL_FOLDERS, folders, FOLDER_CACHE_TTL);
    return folders;
  }

  /**
   * Invalidate folder caches on any mutation.
   */
  private async invalidateFolderCache(): Promise<void> {
    await Promise.all([
      this.cacheManager.del(CACHE_KEY_ALL_FOLDERS),
      this.cacheManager.del(CACHE_KEY_FOLDERS_PATH_MAP),
    ]);
  }

  /**
   * Returns all folders (id, name, parentId) from cache for path-map construction.
   * Used by SearchService and FilesService to avoid duplicate full-table scans.
   * TTL: 10s, invalidated on any folder mutation.
   */
  async getAllFoldersForPathMap(): Promise<
    { id: string; name: string; parentId: string | null }[]
  > {
    const cached = await this.cacheManager.get<
      { id: string; name: string; parentId: string | null }[]
    >(CACHE_KEY_FOLDERS_PATH_MAP);
    if (cached) return cached;

    const folders = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findMany({
          where: { deletedAt: null, ...this.validFolderStorageWhere() },
          select: { id: true, name: true, parentId: true },
        }),
      { operationName: 'getAllFoldersForPathMap' }
    );

    await this.cacheManager.set(CACHE_KEY_FOLDERS_PATH_MAP, folders, FOLDER_CACHE_TTL);
    return folders;
  }

  /**
   * Get folders list
   */
  async getFolders(query: GetFoldersQueryDto, user: SessionUser): Promise<FolderListResponseDto> {
    const { parentId, companyId, includeFileCounts, includeAll } = query;

    if (user.userType === 'integration') {
      throw new ForbiddenException('Integration principal requires an explicit scoped endpoint');
    }

    // Build where clause
    const where: Record<string, unknown> = {
      deletedAt: null,
      ...this.validFolderStorageWhere(),
    };

    // Parent filter
    // - parentId가 undefined → 루트 폴더만 반환
    // - parentId가 UUID → 해당 폴더의 직계 하위 폴더만 반환
    // 전체 트리가 필요한 호환 호출자는 includeAll=true 또는 GET /folders/tree를 명시적으로 사용한다.
    if (!includeAll) {
      where.parentId = parentId ?? null;
    }

    // Company access control — 자기 회사 폴더만 접근 가능
    if (user.userType === 'company') {
      Object.assign(where, this.companyVisibilityFilter(user.companyId));
    } else if (companyId !== undefined) {
      where.companyId = companyId;
    }

    const folders = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findMany({
          where,
          include: {
            company: {
              select: {
                companyName: true,
              },
            },
            _count: includeFileCounts
              ? {
                  select: {
                    files: {
                      where: { deletedAt: null },
                    },
                  },
                }
              : undefined,
          },
          orderBy: { name: 'asc' },
        }),
      { operationName: 'getFolders' }
    );

    // Optionally get undownloaded counts
    let undownloadedCounts: Record<string, number> = {};
    if (includeFileCounts) {
      const counts = await this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFile.groupBy({
            by: ['folderId'],
            where: {
              deletedAt: null,
              isDownloaded: false,
              folderId: { in: folders.map((f: { id: string }) => f.id) },
            },
            _count: true,
          }),
        { operationName: 'getFolders.undownloadedCounts' }
      );
      undownloadedCounts = counts.reduce(
        (acc: Record<string, number>, c: { folderId: string | null; _count: number }) => {
          if (c.folderId) acc[c.folderId] = c._count;
          return acc;
        },
        {} as Record<string, number>
      );
    }
    const latestFileMetadata = await this.getLatestFileMetadataByFolderRoot(folders, user);

    return {
      folders: folders.map((folder: FolderListRow) => {
        const latestFile = latestFileMetadata.get(folder.id);
        return {
          ...this.mapToDto(folder),
          file_count: folder._count?.files,
          undownloaded_count: undownloadedCounts[folder.id] ?? 0,
          latest_file_created_at: latestFile?.createdAt.toISOString() ?? null,
          latest_file_uploader_display_name: latestFile?.uploaderDisplayName ?? null,
        };
      }),
      total: folders.length,
    };
  }

  /**
   * 회사 사용자 가시성 필터 — `where.AND` 에 합쳐 외부웹하드 root 와 모든 하위 폴더를 차단.
   *
   * 차단 대상 (companyId=null 인 폴더 중):
   *   1. name 이 EXTERNAL_WEBHARD_FOLDERS 와 일치 — root 자체 (path 가 비어 있거나 legacy 인 경우 보호).
   *   2. path 가 `/외부웹하드/`, `/올리기전용/`, `/내리기전용/` 으로 시작 — 모든 하위 (가상 업체 / 문의 폴더 포함).
   *
   * 단, `companyId=null` 이지만 외부웹하드 트리 외부에 있는 시스템 폴더는 그대로 노출 (예: 공지사항).
   * task 25 invariant 6: admin 만 외부웹하드 트리 노출, company 는 root + 하위 모두 차단.
   */
  private companyVisibilityFilter(
    companyId: number | null | undefined
  ): Prisma.WebhardFolderWhereInput {
    return {
      AND: [
        { OR: [{ companyId: companyId ?? null }, { companyId: null }] },
        {
          NOT: {
            AND: [
              { companyId: null },
              {
                OR: [
                  { name: { in: [...EXTERNAL_WEBHARD_FOLDERS] } },
                  ...EXTERNAL_WEBHARD_FOLDERS.map((root) => ({
                    path: { startsWith: `/${root}/` },
                  })),
                ],
              },
            ],
          },
        },
      ],
    };
  }

  /**
   * Get folder tree for navigation
   */
  async getFolderTree(user: SessionUser): Promise<FolderTreeNodeDto[]> {
    const where: Record<string, unknown> = {
      deletedAt: null,
      ...this.validFolderStorageWhere(),
    };

    if (user.userType === 'company') {
      Object.assign(where, this.companyVisibilityFilter(user.companyId));
    }

    const allFolders = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findMany({
          where,
          orderBy: { name: 'asc' },
        }),
      { operationName: 'getFolderTree' }
    );

    // Build tree structure
    const folderMap = new Map<string, FolderTreeNodeDto>();
    const rootFolders: FolderTreeNodeDto[] = [];

    // First pass: create nodes
    for (const folder of allFolders) {
      folderMap.set(folder.id, {
        id: folder.id,
        name: folder.name,
        parent_id: folder.parentId,
        children: [],
      });
    }

    // Second pass: build tree
    for (const folder of allFolders) {
      const node = folderMap.get(folder.id)!;
      if (folder.parentId && folderMap.has(folder.parentId)) {
        folderMap.get(folder.parentId)!.children.push(node);
      } else {
        rootFolders.push(node);
      }
    }

    return rootFolders;
  }

  /**
   * Get child folders of a specific parent (지연 로딩용)
   */
  async getChildFolders(parentId: string | null, user: SessionUser): Promise<FolderResponseDto[]> {
    const where: Record<string, unknown> = {
      deletedAt: null,
      parentId: parentId,
      ...this.validFolderStorageWhere(),
    };

    if (user.userType === 'company') {
      Object.assign(where, this.companyVisibilityFilter(user.companyId));
    }

    const folders = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findMany({
          where,
          include: {
            company: {
              select: {
                companyName: true,
              },
            },
            _count: {
              select: {
                children: {
                  where: { deletedAt: null },
                },
              },
            },
          },
          orderBy: { name: 'asc' },
        }),
      { operationName: 'getChildFolders' }
    );
    const latestFileMetadata = await this.getLatestFileMetadataByFolderRoot(folders, user);

    return folders.map((folder: FolderListRow) => {
      const latestFile = latestFileMetadata.get(folder.id);
      return {
        ...this.mapToDto(folder),
        has_children: (folder._count?.children ?? 0) > 0,
        latest_file_created_at: latestFile?.createdAt.toISOString() ?? null,
        latest_file_uploader_display_name: latestFile?.uploaderDisplayName ?? null,
      };
    });
  }

  /**
   * Get folder detail with contents
   */
  async getFolderDetail(folderId: string, user: SessionUser): Promise<FolderDetailResponseDto> {
    const folder = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findUnique({
          where: { id: folderId },
          include: {
            company: {
              select: {
                companyName: true,
              },
            },
          },
        }),
      { operationName: 'getFolderDetail.findUnique' }
    );

    if (!folder || folder.deletedAt) {
      throw new NotFoundException('Folder not found');
    }

    this.verifyFolderAccess(folder, user);

    // Get subfolders and files in parallel
    const [subfolders, files] = await this.prisma.executeWithRetry(
      () =>
        Promise.all([
          this.prisma.webhardFolder.findMany({
            where: {
              parentId: folderId,
              deletedAt: null,
              ...this.validFolderStorageWhere(),
              ...(user.userType !== 'admin' && {
                OR: [{ companyId: user.companyId }, { companyId: null }],
              }),
            },
            include: {
              company: {
                select: {
                  companyName: true,
                },
              },
            },
            orderBy: { name: 'asc' },
          }),
          this.prisma.webhardFile.findMany({
            where: {
              folderId: folderId,
              deletedAt: null,
              ...this.validFileStorageWhere(),
              ...(user.userType !== 'admin' && {
                OR: [{ companyId: user.companyId }, { companyId: null }],
              }),
            },
            select: {
              id: true,
              name: true,
              originalName: true,
              size: true,
              mimeType: true,
              isDownloaded: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          }),
        ]),
      { operationName: 'getFolderDetail.contents' }
    );

    return {
      ...this.mapToDto(folder),
      subfolders: subfolders.map(this.mapToDto),
      files: files.map(
        (f: {
          id: string;
          name: string;
          originalName: string;
          size: bigint;
          mimeType: string | null;
          isDownloaded: boolean;
          createdAt: Date;
        }) => ({
          id: f.id,
          name: f.name,
          original_name: f.originalName,
          size: Number(f.size),
          mime_type: f.mimeType,
          is_downloaded: f.isDownloaded,
          created_at: f.createdAt.toISOString(),
        })
      ),
    };
  }

  /**
   * Get company webhard access info
   * Returns company name, webhard_access flag, and whether root folder exists
   */
  async getCompanyWebhardInfo(companyId: number): Promise<{
    companyName: string;
    webhardAccess: boolean;
    hasRootFolder: boolean;
  }> {
    const company = await this.prisma.executeWithRetry(
      () =>
        this.prisma.company.findUnique({
          where: { id: companyId },
          select: { companyName: true, webhardAccess: true },
        }),
      { operationName: 'getCompanyWebhardInfo.findCompany' }
    );

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const rootFolder = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findFirst({
          where: {
            companyId,
            parentId: null,
            deletedAt: null,
          },
          select: { id: true },
        }),
      { operationName: 'getCompanyWebhardInfo.findRootFolder' }
    );

    this.logger.log(
      `Company webhard info: companyId=${companyId}, webhardAccess=${company.webhardAccess}, hasRootFolder=${!!rootFolder}`
    );

    return {
      companyName: company.companyName,
      webhardAccess: company.webhardAccess,
      hasRootFolder: !!rootFolder,
    };
  }

  private static readonly DEFAULT_FOLDER_TEMPLATE: FolderTemplateNode[] = [
    { name: '목형의뢰', children: [{ name: '완료' }] },
    { name: '칼선의뢰', children: [{ name: '완료' }] },
    { name: '문의' },
  ];

  private static readonly FOLDER_TEMPLATE_KEY = 'default_folder_template';

  /**
   * Get the folder template from DB, falling back to hardcoded default
   */
  async getFolderTemplate(): Promise<FolderTemplateNode[]> {
    if (this.folderTemplateService) {
      return this.folderTemplateService.getFolderTemplate();
    }

    const setting = await this.prisma.executeWithRetry(
      () =>
        this.prisma.systemSetting.findUnique({
          where: { key: FoldersService.FOLDER_TEMPLATE_KEY },
        }),
      { operationName: 'getFolderTemplate' }
    );

    if (setting) {
      return setting.value as unknown as FolderTemplateNode[];
    }

    return FoldersService.DEFAULT_FOLDER_TEMPLATE;
  }

  /**
   * Update the folder template in DB
   */
  async updateFolderTemplate(template: FolderTemplateNode[]): Promise<{ success: boolean }> {
    if (this.folderTemplateService) {
      return this.folderTemplateService.updateFolderTemplate(template);
    }

    // Prisma InputJsonValue requires plain JSON — use parse/stringify to strip class info
    const jsonValue = JSON.parse(JSON.stringify(template));
    await this.prisma.executeWithRetry(
      () =>
        this.prisma.systemSetting.upsert({
          where: { key: FoldersService.FOLDER_TEMPLATE_KEY },
          update: { value: jsonValue },
          create: {
            key: FoldersService.FOLDER_TEMPLATE_KEY,
            value: jsonValue,
          },
        }),
      { operationName: 'updateFolderTemplate' }
    );

    return { success: true };
  }

  /**
   * Initialize default folder structure for a company
   * Creates folders recursively based on the saved template
   */
  async initializeCompanyFolders(
    companyId: number,
    companyName: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.driveProvisioningService) {
      const result = await this.driveProvisioningService.ensureCompanyDriveRoot(companyId);
      await this.invalidateFolderCache();
      return result.status === 'ready'
        ? { success: true }
        : { success: false, error: result.error ?? 'Google Drive provisioning failed' };
    }

    try {
      // Helper to find or create a folder
      const findOrCreate = async (name: string, parentId: string | null): Promise<string> => {
        const existing = await this.prisma.executeWithRetry(
          () =>
            this.prisma.webhardFolder.findFirst({
              where: {
                name,
                parentId,
                companyId,
                deletedAt: null,
              },
            }),
          { operationName: 'initializeCompanyFolders.findExisting' }
        );

        if (existing) return existing.id;

        const path = await this.computeFolderPath(parentId, name);
        const created = await this.prisma.executeWithRetry(
          () =>
            this.prisma.webhardFolder.create({
              data: {
                name,
                parentId,
                companyId,
                path,
                storageProvider: StorageProvider.R2,
              },
            }),
          { operationName: 'initializeCompanyFolders.create' }
        );

        return created.id;
      };

      // Recursively create folders from template
      const createFromTemplate = async (
        nodes: FolderTemplateNode[],
        parentId: string
      ): Promise<void> => {
        for (const node of nodes) {
          const folderId = await findOrCreate(node.name, parentId);
          if (node.children && node.children.length > 0) {
            await createFromTemplate(node.children, folderId);
          }
        }
      };

      // 1. Root folder (company name)
      const rootFolderId = await findOrCreate(companyName, null);

      // 2. Create template folders under root
      const template = await this.getFolderTemplate();
      await createFromTemplate(template, rootFolderId);

      await this.invalidateFolderCache();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create a new folder
   */
  async createFolder(dto: CreateFolderDto, user: SessionUser): Promise<FolderResponseDto> {
    if (user.userType !== 'admin' && user.userType !== 'integration') {
      throw new ForbiddenException('Only admin users can create folders');
    }

    // Verify parent folder access if specified
    let parentFolder: WebhardFolder | null = null;
    if (dto.parentId) {
      parentFolder = await this.prisma.executeWithRetry(
        () => this.prisma.webhardFolder.findUnique({ where: { id: dto.parentId } }),
        { operationName: 'createFolder.findParent' }
      );

      if (!parentFolder || parentFolder.deletedAt) {
        throw new NotFoundException('Parent folder not found');
      }

      this.verifyFolderAccess(parentFolder, user);
    }

    const effectiveCompanyId = dto.companyId ?? parentFolder?.companyId ?? null;

    // Check for duplicate name in same parent
    const existing = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findFirst({
          where: {
            name: dto.name,
            parentId: dto.parentId ?? null,
            companyId: effectiveCompanyId,
            deletedAt: null,
          },
        }),
      { operationName: 'createFolder.checkDuplicate' }
    );

    if (existing) {
      throw new ConflictException('Folder with this name already exists');
    }

    const path = await this.computeFolderPath(dto.parentId ?? null, dto.name);
    const parentDriveFolderId = parentFolder
      ? this.getDriveFolderIdForMutation(parentFolder, 'Parent folder')
      : null;
    const driveFolderId = await this.createDriveFolderBeforeDb({
      name: dto.name,
      parentDriveFolderId,
    });

    let folder: WebhardFolder & { company?: { companyName: string } | null };
    try {
      folder = await this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFolder.create({
            data: {
              name: dto.name,
              parentId: dto.parentId ?? null,
              companyId: effectiveCompanyId,
              path,
              storageProvider: StorageProvider.GOOGLE_DRIVE,
              driveFolderId,
            },
            include: {
              company: {
                select: {
                  companyName: true,
                },
              },
            },
          }),
        { operationName: 'createFolder.create' }
      );
    } catch (error) {
      await this.recordFolderRepair({
        operation: 'folder_create',
        driveFolderId,
        expectedDbState: { name: dto.name, parentId: dto.parentId ?? null, path },
        actualDriveState: { created: true, dbCreateFailed: true },
      });
      throw error;
    }

    await this.invalidateFolderCache();

    // 실시간 이벤트 발행
    this.eventsGateway.emitGlobal({
      type: 'folder:created',
      folderId: dto.parentId ?? null,
      data: { folderId: folder.id, name: dto.name },
    });

    return this.mapToDto(folder);
  }

  /**
   * Rename a folder
   */
  async renameFolder(
    folderId: string,
    dto: RenameFolderDto,
    user: SessionUser
  ): Promise<FolderResponseDto> {
    // name 또는 newName 파라미터 허용 (문서 호환성)
    const newName = dto.name ?? dto.newName;
    if (!newName) {
      throw new BadRequestException('name or newName is required');
    }

    const folder = await this.prisma.executeWithRetry(
      () => this.prisma.webhardFolder.findUnique({ where: { id: folderId } }),
      { operationName: 'renameFolder.findUnique' }
    );

    if (!folder || folder.deletedAt) {
      throw new NotFoundException('Folder not found');
    }

    this.verifyFolderAccess(folder, user);

    // Check for duplicate name in same parent
    const existing = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findFirst({
          where: {
            name: newName,
            parentId: folder.parentId,
            companyId: folder.companyId,
            deletedAt: null,
            NOT: { id: folderId },
          },
        }),
      { operationName: 'renameFolder.checkDuplicate' }
    );

    if (existing) {
      throw new ConflictException('Folder with this name already exists');
    }

    const newPath = await this.computeFolderPath(folder.parentId, newName);
    const oldPath = folder.path ?? (await this.computeFolderPath(folder.parentId, folder.name));
    const driveFolderId = this.getDriveFolderIdForMutation(folder, 'Folder');
    if (driveFolderId) {
      await this.storageService?.renameDriveFolder({
        storageFolderId: driveFolderId,
        name: newName,
      });
    }

    let updated: WebhardFolder & { company?: { companyName: string } | null };
    try {
      updated = await this.prisma.executeWithRetry(
        () =>
          this.prisma.$transaction(async (tx) => {
            const renamed = await tx.webhardFolder.update({
              where: { id: folderId },
              data: { name: newName, path: newPath },
              include: {
                company: {
                  select: {
                    companyName: true,
                  },
                },
              },
            });
            await this.replaceDescendantPathPrefix(tx, folderId, oldPath, newPath);
            return renamed;
          }),
        { operationName: 'renameFolder.transaction' }
      );
    } catch (error) {
      await this.recordFolderRepair({
        operation: 'folder_rename',
        driveFolderId,
        webhardFolderId: folderId,
        expectedDbState: { name: newName, path: newPath },
        actualDriveState: { renamed: true, dbUpdateFailed: true },
      });
      throw error;
    }

    await this.invalidateFolderCache();

    // 실시간 이벤트 발행
    this.eventsGateway.emitGlobal({
      type: 'folder:renamed',
      folderId: folder.parentId,
      data: { folderId, newName },
    });

    return this.mapToDto(updated);
  }

  /**
   * Move a folder
   */
  async moveFolder(
    folderId: string,
    dto: MoveFolderDto,
    user: SessionUser
  ): Promise<FolderResponseDto> {
    if (user.userType !== 'admin') {
      throw new ForbiddenException('Only admin users can move folders');
    }

    const folder = await this.prisma.executeWithRetry(
      () => this.prisma.webhardFolder.findUnique({ where: { id: folderId } }),
      { operationName: 'moveFolder.findUnique' }
    );

    if (!folder || folder.deletedAt) {
      throw new NotFoundException('Folder not found');
    }

    this.verifyFolderAccess(folder, user);

    // Cannot move to itself
    if (dto.parentId === folderId) {
      throw new BadRequestException('Cannot move folder to itself');
    }

    // Verify target parent folder access if specified
    let targetParentFolder: WebhardFolder | null = null;
    if (dto.parentId) {
      const targetParentId = dto.parentId;
      targetParentFolder = await this.prisma.executeWithRetry(
        () => this.prisma.webhardFolder.findUnique({ where: { id: targetParentId } }),
        { operationName: 'moveFolder.findTarget' }
      );

      if (!targetParentFolder || targetParentFolder.deletedAt) {
        throw new NotFoundException('Target folder not found');
      }

      this.verifyFolderAccess(targetParentFolder, user);

      // Check for circular reference
      const isDescendant = await this.isDescendantOf(dto.parentId, folderId);
      if (isDescendant) {
        throw new BadRequestException('Cannot move folder to its own descendant');
      }
    }

    // Check for duplicate name in target parent and auto-rename if needed (1회 쿼리로 최적화)
    const existingNames = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findMany({
          where: {
            parentId: dto.parentId ?? null,
            companyId: folder.companyId,
            deletedAt: null,
            NOT: { id: folderId },
            OR: [{ name: folder.name }, { name: { startsWith: `${folder.name} (` } }],
          },
          select: { name: true },
        }),
      { operationName: 'moveFolder.findExistingNames' }
    );

    let newName = folder.name;
    if (existingNames.some((f) => f.name === folder.name)) {
      const existingNameSet = new Set(existingNames.map((f) => f.name));
      let counter = 1;
      while (existingNameSet.has(`${folder.name} (${counter})`)) {
        counter++;
      }
      newName = `${folder.name} (${counter})`;
    }

    const movedPath =
      targetParentFolder?.path && targetParentFolder.path !== '/'
        ? `${targetParentFolder.path}/${newName}`
        : await this.computeFolderPath(dto.parentId ?? null, newName);
    const oldPath = folder.path ?? (await this.computeFolderPath(folder.parentId, folder.name));
    const driveFolderId = this.getDriveFolderIdForMutation(folder, 'Folder');
    if (driveFolderId) {
      let targetParentDriveFolderId: string | null = null;
      if (dto.parentId) {
        if (!targetParentFolder) {
          throw new NotFoundException('Target folder not found');
        }
        targetParentDriveFolderId = this.getDriveFolderIdForMutation(
          targetParentFolder,
          'Parent folder'
        );
      }

      if (newName !== folder.name) {
        await this.storageService?.renameDriveFolder({
          storageFolderId: driveFolderId,
          name: newName,
        });
      }
      await this.storageService?.moveDriveFolder({
        storageFolderId: driveFolderId,
        parentStorageFolderId: targetParentDriveFolderId,
      });
    }

    let updated: WebhardFolder & { company?: { companyName: string } | null };
    try {
      updated = await this.prisma.executeWithRetry(
        () =>
          this.prisma.$transaction(async (tx) => {
            const moved = await tx.webhardFolder.update({
              where: { id: folderId },
              data: {
                parentId: dto.parentId ?? null,
                name: newName,
                path: movedPath,
              },
              include: {
                company: {
                  select: {
                    companyName: true,
                  },
                },
              },
            });
            await this.replaceDescendantPathPrefix(tx, folderId, oldPath, movedPath);
            return moved;
          }),
        { operationName: 'moveFolder.transaction' }
      );
    } catch (error) {
      await this.recordFolderRepair({
        operation: 'folder_move',
        driveFolderId,
        webhardFolderId: folderId,
        expectedDbState: { parentId: dto.parentId ?? null, name: newName, path: movedPath },
        actualDriveState: { moved: true, renamed: newName !== folder.name, dbUpdateFailed: true },
      });
      throw error;
    }

    await this.invalidateFolderCache();

    // 실시간 이벤트 발행
    this.eventsGateway.emitGlobal({
      type: 'folder:moved',
      folderId: folder.parentId,
      data: { folderId, targetParentId: dto.parentId ?? null },
    });

    return this.mapToDto(updated);
  }

  /**
   * Delete a folder (soft delete)
   */
  async deleteFolder(folderId: string, user: SessionUser): Promise<void> {
    if (user.userType !== 'admin') {
      throw new ForbiddenException('Only admin users can delete folders');
    }

    const folder = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findUnique({
          where: { id: folderId },
          include: { company: { select: { companyName: true } } },
        }),
      { operationName: 'deleteFolder.findUnique' }
    );

    if (!folder || folder.deletedAt) {
      throw new NotFoundException('Folder not found');
    }

    this.verifyFolderAccess(folder, user);
    this.assertNotCompanyRootFolder(folder);

    // Get all descendant folder IDs
    const descendantIds = await this.getDescendantFolderIds(folderId);
    const allFolderIds = [folderId, ...descendantIds];
    const driveFolderId = this.getDriveFolderIdForMutation(folder, 'Folder');
    if (driveFolderId) {
      await this.storageService?.trashDriveFolder({ storageFolderId: driveFolderId });
    }

    // Soft delete all folders and files in transaction (원자성 보장)
    const deletedBy = String(user.userType === 'admin' ? 1 : (user.companyId ?? 0));
    const now = new Date();
    try {
      await this.prisma.executeWithRetry(
        () =>
          this.prisma.$transaction([
            this.prisma.webhardFolder.updateMany({
              where: { id: { in: allFolderIds } },
              data: { deletedAt: now, deletedBy },
            }),
            this.prisma.webhardFile.updateMany({
              where: { folderId: { in: allFolderIds }, deletedAt: null },
              data: { deletedAt: now, deletedBy },
            }),
          ]),
        { operationName: 'deleteFolder.softDelete' }
      );
    } catch (error) {
      await this.recordFolderRepair({
        operation: 'trash',
        driveFolderId,
        webhardFolderId: folderId,
        expectedDbState: { deletedAt: now.toISOString(), descendantIds },
        actualDriveState: { trashed: true, dbUpdateFailed: true },
      });
      throw error;
    }

    await this.invalidateFolderCache();

    // 실시간 이벤트 발행
    this.eventsGateway.emitGlobal({
      type: 'folder:deleted',
      folderId: folder.parentId,
      data: { folderId, descendantCount: descendantIds.length },
    });
  }

  /**
   * Get batch delete statistics (폴더 수, 파일 수)
   */
  async getBatchDeleteStats(
    folderIds: string[],
    user: SessionUser
  ): Promise<BatchDeleteStatsResponseDto> {
    if (user.userType !== 'admin') {
      throw new ForbiddenException('Only admin users can delete folders');
    }

    // 모든 폴더 조회 및 권한 확인
    const folders = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findMany({
          where: {
            id: { in: folderIds },
            deletedAt: null,
          },
          include: { company: { select: { companyName: true } } },
        }),
      { operationName: 'getBatchDeleteStats.findFolders' }
    );

    if (folders.length === 0) {
      throw new NotFoundException('No folders found');
    }

    // 권한 확인
    for (const folder of folders) {
      this.verifyFolderAccess(folder, user);
      this.assertNotCompanyRootFolder(folder);
    }

    // 모든 하위 폴더 ID 수집
    const allFolderIds = new Set<string>(folderIds);
    for (const folderId of folderIds) {
      const descendantIds = await this.getDescendantFolderIds(folderId);
      for (const id of descendantIds) {
        allFolderIds.add(id);
      }
    }

    // 파일 수 조회
    const fileCount = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFile.count({
          where: {
            folderId: { in: Array.from(allFolderIds) },
            deletedAt: null,
          },
        }),
      { operationName: 'getBatchDeleteStats.countFiles' }
    );

    return {
      folderCount: allFolderIds.size,
      fileCount,
    };
  }

  private async collectBatchDeleteFolderIds(
    selectedFolders: Array<{ id: string; path: string | null }>
  ): Promise<string[]> {
    const selectedFolderIds = selectedFolders.map((folder) => folder.id);
    const folderIds = new Set(selectedFolderIds);
    const pathScopedFolders = selectedFolders.filter(
      (folder): folder is { id: string; path: string } => Boolean(folder.path)
    );

    if (pathScopedFolders.length > 0) {
      const pathOr = pathScopedFolders.map((folder) => ({
        path: { startsWith: `${folder.path}/` },
      }));
      const scopedRows = await this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFolder.findMany({
            where: {
              deletedAt: null,
              OR: [{ id: { in: selectedFolderIds } }, ...pathOr],
            },
            select: { id: true },
          }),
        { operationName: 'batchDeleteFolders.findScopedDescendants' }
      );
      scopedRows.forEach((folder) => folderIds.add(folder.id));
    }

    const missingPathFolderIds = selectedFolders
      .filter((folder) => !folder.path)
      .map((folder) => folder.id);
    if (missingPathFolderIds.length > 0) {
      const allFolders = await this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFolder.findMany({
            where: { deletedAt: null },
            select: { id: true, parentId: true },
          }),
        { operationName: 'batchDeleteFolders.findAllFallback' }
      );

      const childrenMap = new Map<string | null, string[]>();
      for (const folder of allFolders) {
        const parentId = folder.parentId;
        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, []);
        }
        childrenMap.get(parentId)!.push(folder.id);
      }

      const queue = [...missingPathFolderIds];
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const children = childrenMap.get(currentId) || [];
        for (const childId of children) {
          if (!folderIds.has(childId)) {
            folderIds.add(childId);
            queue.push(childId);
          }
        }
      }
    }

    return Array.from(folderIds);
  }

  /**
   * Batch delete folders (soft delete) - 최적화 버전
   */
  async batchDeleteFolders(
    folderIds: string[],
    user: SessionUser
  ): Promise<BatchDeleteResultResponseDto> {
    if (user.userType !== 'admin') {
      throw new ForbiddenException('Only admin users can delete folders');
    }

    const startTime = Date.now();

    // 1. 선택된 폴더만 조회하여 권한 확인
    const selectedFolders = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findMany({
          where: {
            id: { in: folderIds },
            deletedAt: null,
          },
          select: {
            id: true,
            companyId: true,
            parentId: true,
            name: true,
            path: true,
            storageProvider: true,
            driveFolderId: true,
            company: {
              select: {
                companyName: true,
              },
            },
          },
        }),
      { operationName: 'batchDeleteFolders.findSelected' }
    );

    if (selectedFolders.length === 0) {
      throw new NotFoundException('No folders found');
    }

    // 권한 확인
    for (const folder of selectedFolders) {
      this.verifyFolderAccess(folder, user);
      this.assertNotCompanyRootFolder(folder);
    }

    this.logger.log(`webhard batch folder delete started: selected=${selectedFolders.length}`);

    const folderIdsArray = await this.collectBatchDeleteFolderIds(selectedFolders);
    const driveTrashResults = await mapWithConcurrency(
      selectedFolders,
      DRIVE_FOLDER_TRASH_CONCURRENCY,
      async (folder) => {
        const driveFolderId = this.getDriveFolderIdForMutation(folder, 'Folder');
        if (!driveFolderId) {
          return { status: 'skipped' as const };
        }
        try {
          await this.storageService?.trashDriveFolder({ storageFolderId: driveFolderId });
          return { status: 'fulfilled' as const, folder: { id: folder.id, driveFolderId } };
        } catch (error) {
          return { status: 'rejected' as const, reason: error };
        }
      }
    );
    const trashedDriveFolders = driveTrashResults
      .filter(
        (
          result
        ): result is {
          status: 'fulfilled';
          folder: { id: string; driveFolderId: string };
        } => result.status === 'fulfilled'
      )
      .map((result) => result.folder);
    const failedDriveTrash = driveTrashResults.find((result) => result.status === 'rejected') as
      | { status: 'rejected'; reason: unknown }
      | undefined;
    if (failedDriveTrash) {
      await Promise.all(
        trashedDriveFolders.map((folder) =>
          this.recordFolderRepair({
            operation: 'trash',
            driveFolderId: folder.driveFolderId,
            webhardFolderId: folder.id,
            expectedDbState: { deletedAt: 'set', batchFolderIds: folderIdsArray },
            actualDriveState: { trashed: true, dbUpdateSkipped: true, batchDeleteFailed: true },
          })
        )
      );
      this.logger.warn(
        `webhard batch folder delete drive trash failed: selected=${selectedFolders.length}, affectedFolders=${folderIdsArray.length}`
      );
      const reason = failedDriveTrash.reason;
      throw reason instanceof Error
        ? reason
        : new BadRequestException('Google Drive 폴더 삭제 실패');
    }

    // 3. 폴더와 파일을 트랜잭션으로 삭제 (원자성 보장)
    const deletedBy = String(user.userType === 'admin' ? 1 : (user.companyId ?? 0));
    const now = new Date();
    let folderResult: Prisma.BatchPayload;
    let fileResult: Prisma.BatchPayload;
    try {
      [folderResult, fileResult] = await this.prisma.executeWithRetry(
        () =>
          this.prisma.$transaction([
            this.prisma.webhardFolder.updateMany({
              where: { id: { in: folderIdsArray } },
              data: { deletedAt: now, deletedBy },
            }),
            this.prisma.webhardFile.updateMany({
              where: { folderId: { in: folderIdsArray }, deletedAt: null },
              data: { deletedAt: now, deletedBy },
            }),
          ]),
        { operationName: 'batchDeleteFolders.delete' }
      );
    } catch (error) {
      await Promise.all(
        trashedDriveFolders.map((folder) =>
          this.recordFolderRepair({
            operation: 'trash',
            driveFolderId: folder.driveFolderId,
            webhardFolderId: folder.id,
            expectedDbState: { deletedAt: now.toISOString(), batchFolderIds: folderIdsArray },
            actualDriveState: { trashed: true, dbUpdateFailed: true },
          })
        )
      );
      throw error;
    }

    await this.invalidateFolderCache();
    this.logger.log(
      `webhard batch folder delete completed: selected=${selectedFolders.length}, affectedFolders=${folderResult.count}, files=${fileResult.count}, durationMs=${Date.now() - startTime}`
    );

    return {
      foldersDeleted: folderResult.count,
      filesDeleted: fileResult.count,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Check if folderId is a descendant of ancestorId (캐시 공유 버전)
   */
  private async isDescendantOf(folderId: string, ancestorId: string): Promise<boolean> {
    const allFolders = await this.getAllFoldersCached();

    // id -> parentId 맵 구성 (메모리)
    const parentMap = new Map<string, string | null>();
    for (const folder of allFolders) {
      parentMap.set(folder.id, folder.parentId);
    }

    // 3. 메모리에서 조상 체인 탐색
    let currentId: string | null = folderId;
    while (currentId) {
      const parentId = parentMap.get(currentId);
      if (parentId === undefined) break; // 폴더가 맵에 없음
      if (parentId === ancestorId) return true;
      currentId = parentId;
    }

    return false;
  }

  /**
   * Get all descendant folder IDs (캐시 공유 버전)
   */
  private async getDescendantFolderIds(folderId: string): Promise<string[]> {
    const allFolders = await this.getAllFoldersCached();

    // parentId -> children 맵 구성 (메모리)
    const childrenMap = new Map<string | null, string[]>();
    for (const folder of allFolders) {
      const parentId = folder.parentId;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(folder.id);
    }

    // 3. BFS 메모리 탐색
    const descendants: string[] = [];
    const queue = [folderId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = childrenMap.get(currentId) || [];
      for (const childId of children) {
        descendants.push(childId);
        queue.push(childId);
      }
    }

    return descendants;
  }

  // ─── Materialized Path 유지 헬퍼 ─────────────────────────

  /**
   * 부모 폴더 경로를 기반으로 새 폴더의 전체 경로를 계산한다.
   * 부모의 path가 아직 '/'이면 parentId 체인을 상향 탐색하여 구축.
   */
  async computeFolderPath(parentId: string | null, name: string): Promise<string> {
    return this.folderPathService.computeFolderPath(parentId, name);
  }

  private async computeFolderPathWithClient(
    client: FolderLookupClient,
    parentId: string | null,
    name: string
  ): Promise<string> {
    return this.folderPathService.computeFolderPath(parentId, name, client);
  }

  /**
   * 폴더와 모든 하위 폴더의 path를 set-based prefix 치환으로 갱신한다.
   * 기존 path prefix와 slash boundary를 함께 검증해 sibling prefix 오염을 막는다.
   */
  async updateDescendantPaths(
    folderId: string,
    newPath: string,
    client: FolderPathUpdateClient = this.prisma,
    oldPathOverride?: string | null
  ): Promise<void> {
    await this.folderPathService.updateDescendantPaths(folderId, newPath, client, oldPathOverride);
  }

  private async replaceDescendantPathPrefix(
    client: FolderPathUpdateClient,
    folderId: string,
    oldPath: string | null,
    newPath: string
  ): Promise<number> {
    return this.folderPathService.replaceDescendantPathPrefix(client, folderId, oldPath, newPath);
  }

  /**
   * Verify user has access to the folder
   */
  private verifyFolderAccess(
    folder: { companyId: number | null; name: string },
    user: SessionUser
  ): void {
    if (user.userType === 'admin') {
      return;
    }

    // company 사용자: 자기 회사 폴더만 접근 가능 (companyId: null 포함 모두 차단)
    if (folder.companyId !== user.companyId) {
      throw new ForbiddenException('Access denied to this folder');
    }
  }

  /**
   * Get folder ancestors (캐시 활용 최적화 버전)
   * - getAllFoldersCached()로 구조 파악 → 필요한 폴더만 상세 조회 (company 포함)
   */
  async getAncestors(folderId: string, user: SessionUser): Promise<FolderAncestorsResponseDto> {
    // 1. 캐시에서 폴더 구조 가져오기 (10초 TTL)
    const allFolders = await this.getAllFoldersCached();

    // 2. id -> 기본 정보 맵 구성
    const folderMap = new Map<string, (typeof allFolders)[number]>();
    for (const folder of allFolders) {
      folderMap.set(folder.id, folder);
    }

    // 3. 현재 폴더 확인
    const currentFolderBasic = folderMap.get(folderId);
    if (!currentFolderBasic) {
      throw new NotFoundException('Folder not found');
    }

    // 4. 조상 ID 수집
    const ancestorIds: string[] = [];
    let parentId = currentFolderBasic.parentId;
    while (parentId) {
      const parent = folderMap.get(parentId);
      if (!parent) break;
      ancestorIds.unshift(parentId);
      parentId = parent.parentId;
    }

    // 5. 현재 폴더 + 조상 폴더의 상세 정보만 조회 (company 포함)
    const detailIds = [folderId, ...ancestorIds];
    const detailFolders = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findMany({
          where: { id: { in: detailIds } },
          include: { company: { select: { companyName: true } } },
        }),
      { operationName: 'getAncestors.details' }
    );

    const detailMap = new Map(detailFolders.map((f) => [f.id, f]));

    const currentFolder = detailMap.get(folderId);
    if (!currentFolder) {
      throw new NotFoundException('Folder not found');
    }

    this.verifyFolderAccess(currentFolder, user);

    const ancestors = ancestorIds
      .map((id) => detailMap.get(id))
      .filter((f): f is NonNullable<typeof f> => !!f)
      .map(this.mapToDto);

    return {
      ancestors,
      current: this.mapToDto(currentFolder),
    };
  }

  /**
   * Map database model to DTO
   */
  private mapToDto = (folder: {
    id: string;
    name: string;
    parentId: string | null;
    companyId: number | null;
    path: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    company?: { companyName: string } | null;
  }): FolderResponseDto => ({
    id: folder.id,
    name: folder.name,
    parent_id: folder.parentId,
    company_id: folder.companyId,
    path: folder.path,
    created_at: folder.createdAt.toISOString(),
    updated_at: folder.updatedAt.toISOString(),
    deleted_at: folder.deletedAt?.toISOString() ?? null,
    companies: folder.company
      ? {
          company_name: folder.company.companyName,
        }
      : null,
  });

  private async getLatestFileMetadataByFolderRoot(
    folders: { id: string }[],
    user: SessionUser
  ): Promise<Map<string, FolderLatestFileMetadata>> {
    const rootIds = folders.map((folder) => folder.id);
    if (rootIds.length === 0) {
      return new Map();
    }

    const rootValues = Prisma.join(rootIds.map((id) => Prisma.sql`(${id})`));
    const folderVisibility =
      user.userType === 'admin'
        ? Prisma.empty
        : Prisma.sql`AND (child.company_id = ${user.companyId} OR child.company_id IS NULL)`;
    const rootVisibility =
      user.userType === 'admin'
        ? Prisma.empty
        : Prisma.sql`AND (root.company_id = ${user.companyId} OR root.company_id IS NULL)`;

    const rows = await this.prisma.executeWithRetry(
      () =>
        this.prisma.$queryRaw<FolderLatestFileMetadataRow[]>(Prisma.sql`
          WITH RECURSIVE selected_roots(root_id) AS (
            VALUES ${rootValues}
          ),
          folder_tree(root_id, folder_id) AS (
            SELECT selected_roots.root_id, root.id
            FROM selected_roots
            JOIN webhard_folders root
              ON root.id = selected_roots.root_id
             AND root.deleted_at IS NULL
             ${rootVisibility}

            UNION ALL

            SELECT folder_tree.root_id, child.id
            FROM folder_tree
            JOIN webhard_folders child
              ON child.parent_id = folder_tree.folder_id
             AND child.deleted_at IS NULL
             ${folderVisibility}
          ),
          latest_files AS (
            SELECT
              folder_tree.root_id,
              file.created_at,
              file.uploaded_by,
              company.company_name,
              ROW_NUMBER() OVER (
                PARTITION BY folder_tree.root_id
                ORDER BY file.created_at DESC
              ) AS row_number
            FROM folder_tree
            JOIN webhard_files file
              ON file.folder_id = folder_tree.folder_id
             AND file.deleted_at IS NULL
            LEFT JOIN companies company
              ON company.id = file.company_id
          )
          SELECT root_id, created_at, uploaded_by, company_name
          FROM latest_files
          WHERE row_number = 1
        `),
      { operationName: 'getLatestFileMetadataByFolderRoot' }
    );

    const latestByRootId = new Map<string, FolderLatestFileMetadata>();
    for (const row of rows) {
      latestByRootId.set(row.root_id, {
        createdAt: row.created_at,
        uploaderDisplayName: this.resolveFolderFileUploaderName(row.uploaded_by, {
          companyName: row.company_name,
        }),
      });
    }

    return latestByRootId;
  }

  private resolveFolderFileUploaderName(
    uploadedBy: string,
    company: { companyName: string | null } | null
  ): string {
    if (uploadedBy === 'admin' || uploadedBy === '0' || uploadedBy === '1') {
      return '관리자';
    }

    return company?.companyName ?? uploadedBy;
  }

  /**
   * 업체별 중간 `문의/` 폴더(folderKind='template')를 idempotent 하게 확보 (task 20 신규 + fix).
   *
   * - 주어진 rootFolderId 하위에서 `name='문의'` findFirst → 있으면 그대로 반환.
   * - 없으면 `parentId=rootFolderId`, `folderKind='template'` 로 create.
   * - `initializeCompanyFolders` 가 eager 생성한 `문의` 폴더와도 `name` 기준으로 매칭된다.
   * - rootFolderId 는 caller (`ensureInquiryFolder` 등) 가 선행 확보해서 넘긴다.
   *   companyId 는 정식 등록 업체면 number, 외부웹하드 가상 업체면 null 허용.
   */
  async ensureInquiryRootFolder(
    rootFolderId: string,
    companyId: number | null,
    tx?: Prisma.TransactionClient
  ): Promise<WebhardFolder> {
    const client = (tx ?? this.prisma) as Prisma.TransactionClient;

    const existing = await client.webhardFolder.findFirst({
      where: {
        parentId: rootFolderId,
        name: '문의',
        deletedAt: null,
      },
    });
    if (existing) {
      return existing;
    }

    const path = await this.computeFolderPath(rootFolderId, '문의');
    const storage = await this.prepareChildFolderStorageBeforeDb(client, rootFolderId, '문의');
    const created = await client.webhardFolder.create({
      data: {
        name: '문의',
        parentId: rootFolderId,
        companyId,
        path,
        folderKind: 'template',
        storageProvider: storage.storageProvider,
        driveFolderId: storage.driveFolderId,
      },
    });
    await this.invalidateFolderCache();
    return created;
  }

  /**
   * Contact 전용 번호 폴더를 idempotent 하게 확보 (업체 루트 하위 `문의/` 중간 폴더 아래).
   *
   * 로직:
   * 1. findFirst by (contactId, folderKind='inquiry') — 있으면 그대로 반환.
   * 2. 없으면 Contact 조회 → companyName / 번호 확인.
   *    - inquiryNumber / workNumber 둘 다 null → null 반환 (상위 호출자가 루트 fallback 결정).
   *    - companyName 없음 또는 Company 매칭 실패 → null 반환.
   * 3. rootFolder 확보 (없으면 initializeCompanyFolders).
   * 4. `ensureInquiryRootFolder` 로 업체 루트 하위 `문의/` 중간 폴더 확보 — 이 폴더가 새 parent.
   * 5. `folderKind='inquiry'`, `contactId`, `inquiryNumber`, `workNumber` 를 채움.
   * 6. 생성 시 ContactsGateway 로 emit.
   *
   * 이미 존재하는 inquiry 폴더도 현재 O/F 번호 규칙과 다르면 즉시 정규화한다.
   *
   * @returns 폴더 row (번호 없음 / 업체 없음 / 생성 실패 시 null).
   */
  async ensureInquiryFolder(
    contactId: string,
    tx?: Prisma.TransactionClient
  ): Promise<WebhardFolder | null> {
    const client = (tx ?? this.prisma) as Prisma.TransactionClient;

    // 1. 이미 생성되어 있으면 그대로 반환.
    const existing = await client.webhardFolder.findFirst({
      where: {
        contactId,
        folderKind: 'inquiry',
        deletedAt: null,
      },
    });
    if (existing) {
      await this.syncContactWebhardFolderId(contactId, existing.id, client);
      const normalized = await this.renameInquiryFolderForContact(contactId, tx);
      return normalized ?? existing;
    }

    // 2. Contact 조회 — 폴더명 계산에는 문의번호/작업번호만 사용.
    const contact = await client.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        companyName: true,
        inquiryNumber: true,
        workNumber: true,
      },
    });

    if (!contact || !contact.companyName) {
      this.logger.warn({
        reason_code: 'NO_FALLBACK_MATCH',
        contactId,
        companyName: contact?.companyName ?? null,
        inquiryNumber: contact?.inquiryNumber ?? null,
        message: 'ensureInquiryFolder returned null: contact or companyName missing',
      });
      return null;
    }

    const folderName = buildInquiryFolderName({
      inquiryNumber: contact.inquiryNumber,
      workNumber: contact.workNumber,
    });
    if (!folderName) {
      this.logger.warn({
        reason_code: 'NO_INQUIRY_OR_WORK_NUMBER',
        contactId,
        companyName: contact.companyName,
        inquiryNumber: contact.inquiryNumber,
        workNumber: contact.workNumber,
        message: 'ensureInquiryFolder returned null: inquiryNumber/workNumber missing',
      });
      return null;
    }

    // 3. 업체 루트 폴더 탐색 (task 22: 3단계 탐색 유틸 단일 진입점).
    //    resolveCompanyRoot 는 Company 매칭 → name 완전 일치 → 정규화 매칭을 순서대로 시도한다.
    let { rootFolderId, companyId, reasonCode } = await resolveCompanyRoot(
      client,
      contact.companyName
    );

    // 4. NO_COMPANY_ROOT — 정식 Company 는 있지만 루트 폴더가 없는 경우:
    //    initializeCompanyFolders 로 기본 폴더를 생성한 뒤 재탐색.
    if (!rootFolderId && reasonCode === 'NO_COMPANY_ROOT' && companyId !== null) {
      await this.initializeCompanyFolders(companyId, contact.companyName);
      const retry = await resolveCompanyRoot(client, contact.companyName);
      rootFolderId = retry.rootFolderId;
      companyId = retry.companyId;
      reasonCode = retry.reasonCode;
    }

    if (!rootFolderId) {
      this.logger.warn({
        reason_code: reasonCode ?? 'NO_FALLBACK_MATCH',
        contactId,
        companyName: contact.companyName,
        inquiryNumber: contact.inquiryNumber,
        message: 'ensureInquiryFolder returned null: root folder unavailable',
      });
      return null;
    }

    try {
      // 5. 중간 `문의/` 폴더 확보 (rootFolder 직접 전달).
      const inquiryRoot = await this.ensureInquiryRootFolder(rootFolderId, companyId, tx);

      // 6. 중간 `문의/` 폴더 하위에 inquiry 폴더 생성.
      const targetPath = await this.computeFolderPath(inquiryRoot.id, folderName);
      const storage = await this.prepareChildFolderStorageBeforeDb(
        client,
        inquiryRoot.id,
        folderName
      );
      const created = await client.webhardFolder.create({
        data: {
          name: folderName,
          parentId: inquiryRoot.id,
          companyId,
          path: targetPath,
          contactId,
          folderKind: 'inquiry',
          inquiryNumber: contact.inquiryNumber ?? null,
          workNumber: contact.workNumber ?? null,
          storageProvider: storage.storageProvider,
          driveFolderId: storage.driveFolderId,
        },
      });
      await this.invalidateFolderCache();
      this.contactsGateway.emitFolderRenamed({
        contactId,
        folderId: created.id,
        oldName: '',
        newName: folderName,
      });
      await this.syncContactWebhardFolderId(contactId, created.id, client);
      return created;
    } catch (error) {
      this.logger.warn({
        reason_code: 'FOLDER_CREATE_FAILED',
        contactId,
        companyName: contact.companyName,
        inquiryNumber: contact.inquiryNumber,
        error: error instanceof Error ? error.message : String(error),
        message: 'ensureInquiryFolder returned null: folder create threw',
      });
      return null;
    }
  }

  /**
   * inquiry 폴더 ensure 후 contact.webhardFolderId 갱신 (task 29 Phase 2).
   *
   * 정책:
   *   - inquiry 폴더가 확보되면 contact.webhardFolderId 는 inquiryFolderId 를 가리킨다.
   *   - 이미 같은 inquiryFolderId 면 no-op (멱등).
   *
   * 배경: contact.webhardFolderId 가 최초 업로드 폴더에 남아 있으면, 파일은 문의 폴더로
   * relocate 되었는데도 "웹하드에서 열기" 버튼과 카드 경로가 예전 위치를 가리킨다.
   */
  private async syncContactWebhardFolderId(
    contactId: string,
    inquiryFolderId: string,
    client: Prisma.TransactionClient
  ): Promise<void> {
    const target = await client.contact.findUnique({
      where: { id: contactId },
      select: { webhardFolderId: true },
    });
    if (!target || target.webhardFolderId === inquiryFolderId) return;

    await client.contact.update({
      where: { id: contactId },
      data: { webhardFolderId: inquiryFolderId },
    });
  }

  /**
   * Contact 의 inquiryNumber / workNumber 변화에 따라 기존 inquiry 폴더를
   * 현재 번호 전용 폴더명으로 rename (F 번호 추가 발급/구 규칙 정규화 시점 trigger).
   *
   * - findFirst 로 기존 inquiry 폴더 조회. 없으면 no-op.
   * - Contact 의 현재 inquiryNumber / workNumber 를 다시 읽어 새 이름 계산.
   * - 기존 `name` 과 다르면 name / path / inquiryNumber / workNumber 갱신.
   *   WebhardFolder.id 와 WebhardFile.path (R2 key) 는 유지.
   * - 하위 폴더 path 는 prefix 치환으로 일괄 갱신.
   */
  async renameInquiryFolderForContact(
    contactId: string,
    tx?: Prisma.TransactionClient
  ): Promise<WebhardFolder | null> {
    const client = (tx ?? this.prisma) as Prisma.TransactionClient;

    const existing = await client.webhardFolder.findFirst({
      where: {
        contactId,
        folderKind: 'inquiry',
        deletedAt: null,
      },
    });
    if (!existing) {
      return null;
    }

    const contact = await client.contact.findUnique({
      where: { id: contactId },
      select: { inquiryNumber: true, workNumber: true },
    });
    if (!contact) {
      return existing;
    }

    const newName = buildInquiryFolderName({
      inquiryNumber: contact.inquiryNumber,
      workNumber: contact.workNumber,
    });
    if (!newName || newName === existing.name) {
      return existing;
    }

    const oldName = existing.name;
    const oldPath =
      existing.path ?? (await this.computeFolderPathWithClient(client, existing.parentId, oldName));
    const newPath = await this.computeFolderPathWithClient(client, existing.parentId, newName);
    const driveFolderId = this.getDriveFolderIdForMutation(existing, 'Inquiry folder');
    if (driveFolderId) {
      await this.storageService?.renameDriveFolder({
        storageFolderId: driveFolderId,
        name: newName,
      });
    }
    const updated = await client.webhardFolder.update({
      where: { id: existing.id },
      data: {
        name: newName,
        path: newPath,
        inquiryNumber: contact.inquiryNumber ?? null,
        workNumber: contact.workNumber ?? null,
      },
    });
    await this.replaceDescendantPathPrefix(client, updated.id, oldPath, newPath);
    await this.invalidateFolderCache();
    this.contactsGateway.emitFolderRenamed({
      contactId,
      folderId: updated.id,
      oldName,
      newName,
    });
    return updated;
  }

  /**
   * 납품 완료(processStage='delivery') 전환 시 문의 폴더를
   * 업체 루트 하위 `문의/완료/` 폴더로 이동.
   *
   * - 기존 inquiry 폴더 findFirst. 없으면 no-op.
   * - 이미 `문의/완료/` 하위에 있으면 no-op (parentId 가 문의 하위 완료 폴더인지 검사).
   * - 업체 루트 하위 `문의/` 와 그 하위 `완료/` 폴더를 lazy ensure (`folderKind='template'`).
   * - inquiry 폴더의 `parentId` 를 `완료/` 로 변경 + path 재계산. R2 key 유지.
   * - 하위 path 는 prefix 치환으로 일괄 갱신.
   *
   * NOTE: 문의 폴더의 기존 parent 는 업체 루트 하위 `문의/` 폴더.
   *       이관 후 parent 는 업체 루트 하위 `문의/완료/` 폴더.
   */
  async moveInquiryFolderToCompleted(
    contactId: string,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = (tx ?? this.prisma) as Prisma.TransactionClient;

    const inquiryFolder = await client.webhardFolder.findFirst({
      where: {
        contactId,
        folderKind: 'inquiry',
        deletedAt: null,
      },
    });
    if (!inquiryFolder) {
      return;
    }

    if (inquiryFolder.companyId == null) {
      this.logger.warn(
        `moveInquiryFolderToCompleted: inquiry folder ${inquiryFolder.id} has null companyId`
      );
      return;
    }

    const rootFolder = await client.webhardFolder.findFirst({
      where: { companyId: inquiryFolder.companyId, parentId: null, deletedAt: null },
      select: { id: true },
    });
    if (!rootFolder) {
      this.logger.warn(
        `moveInquiryFolderToCompleted: root folder missing for company ${inquiryFolder.companyId}`
      );
      return;
    }

    const inquiryRoot = await this.ensureInquiryRootFolder(
      rootFolder.id,
      inquiryFolder.companyId,
      tx
    );

    if (inquiryFolder.parentId) {
      const parent = await client.webhardFolder.findUnique({
        where: { id: inquiryFolder.parentId },
        select: { id: true, name: true, companyId: true, parentId: true },
      });
      if (parent?.name === '완료' && parent.parentId === inquiryRoot.id) {
        return;
      }
    }

    // 문의/완료/ 폴더 lazy ensure.
    let completedFolder = await client.webhardFolder.findFirst({
      where: {
        companyId: inquiryFolder.companyId,
        parentId: inquiryRoot.id,
        name: '완료',
        deletedAt: null,
      },
      select: { id: true, storageProvider: true, driveFolderId: true },
    });
    if (!completedFolder) {
      const completedPath = await this.computeFolderPathWithClient(client, inquiryRoot.id, '완료');
      const storage = await this.prepareFolderStorageBeforeDb({
        name: '완료',
        parentFolder: inquiryRoot as Pick<
          WebhardFolder,
          'id' | 'storageProvider' | 'driveFolderId'
        >,
      });
      completedFolder = await client.webhardFolder.create({
        data: {
          name: '완료',
          parentId: inquiryRoot.id,
          companyId: inquiryFolder.companyId,
          path: completedPath,
          folderKind: 'template',
          storageProvider: storage.storageProvider,
          driveFolderId: storage.driveFolderId,
        },
        select: { id: true, storageProvider: true, driveFolderId: true },
      });
    }

    const oldPath =
      inquiryFolder.path ??
      (await this.computeFolderPathWithClient(client, inquiryFolder.parentId, inquiryFolder.name));
    const newPath = await this.computeFolderPathWithClient(
      client,
      completedFolder.id,
      inquiryFolder.name
    );
    const inquiryDriveFolderId = this.getDriveFolderIdForMutation(inquiryFolder, 'Inquiry folder');
    const completedDriveFolderId = this.getDriveFolderIdForMutation(
      completedFolder as WebhardFolder,
      'Completed folder'
    );
    if (inquiryDriveFolderId) {
      if (!completedDriveFolderId) {
        throw new BadRequestException('Completed folder is not provisioned in Google Drive');
      }
      await this.storageService?.moveDriveFolder({
        storageFolderId: inquiryDriveFolderId,
        parentStorageFolderId: completedDriveFolderId,
      });
    }
    await client.webhardFolder.update({
      where: { id: inquiryFolder.id },
      data: {
        parentId: completedFolder.id,
        path: newPath,
      },
    });
    await this.replaceDescendantPathPrefix(client, inquiryFolder.id, oldPath, newPath);
    await this.invalidateFolderCache();
  }

  /**
   * Contact 에 연결된 WebhardFile 을 지정된 폴더로 이동.
   *
   * - `DrawingRevision.webhardFileIds` 로 연결된 파일 + inquiryNumber/workNumber 매칭 파일을 합집합으로 수집.
   * - 이미 target 에 있는 파일은 skip.
   * - `path` 는 논리 경로(`computeFilePath`) 로 재계산. R2 object key 는 **절대 건드리지 않는다**.
   * - 이동마다 `emitFileMoved` 발행.
   */
  async relocateContactFiles(
    contactId: string,
    targetFolderId: string,
    tx?: Prisma.TransactionClient
  ): Promise<{ movedIds: string[] }> {
    const client = (tx ?? this.prisma) as Prisma.TransactionClient;

    const contact = await client.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        companyName: true,
        inquiryNumber: true,
        workNumber: true,
        drawingFileUrl: true,
      },
    });
    if (!contact || !contact.companyName) {
      return { movedIds: [] };
    }

    // task 22: Company row 미등록 가상 업체(LGU+ sync 로 생성된 companyId=null 폴더)도
    // resolveCompanyRoot 의 fallback 탐색으로 rootFolder 를 찾는다. 기존 silent bail-out 제거.
    const { rootFolderId, companyId, reasonCode } = await resolveCompanyRoot(
      client,
      contact.companyName
    );
    if (!rootFolderId) {
      this.logger.warn({
        reason_code: reasonCode ?? 'NO_FALLBACK_MATCH',
        contactId,
        companyName: contact.companyName,
        message: '[relocateContactFiles] no root folder',
      });
      return { movedIds: [] };
    }

    const revisions = await client.drawingRevision.findMany({
      where: { contactId },
      select: { webhardFileIds: true },
    });
    const revisionFileIds = revisions.flatMap((r) => r.webhardFileIds ?? []);

    const numberFilter: string[] = [];
    if (contact.inquiryNumber) numberFilter.push(contact.inquiryNumber);
    if (contact.workNumber) numberFilter.push(contact.workNumber);

    // companyId null (fallback 매칭된 가상 업체) 일 때는 companyId 기반 OR 절을 skip.
    // revisionFileIds 경로로만 파일을 식별한다.
    const orClauses: Prisma.WebhardFileWhereInput[] = [];
    if (revisionFileIds.length > 0) {
      orClauses.push({ id: { in: revisionFileIds } });
    }
    const sourceFileKey = contact.drawingFileUrl ? extractR2Key(contact.drawingFileUrl) : null;
    if (sourceFileKey) {
      orClauses.push({ path: sourceFileKey });
    }
    if (companyId !== null && numberFilter.length > 0) {
      orClauses.push({
        companyId,
        inquiryNumber: { in: numberFilter },
      });
    }

    if (orClauses.length === 0) {
      return { movedIds: [] };
    }

    const files = await client.webhardFile.findMany({
      where: {
        deletedAt: null,
        OR: orClauses,
      },
      select: {
        id: true,
        name: true,
        folderId: true,
        storageProvider: true,
        driveFileId: true,
      },
    });

    const targetFolder = await client.webhardFolder.findUnique({
      where: { id: targetFolderId },
      select: { path: true, storageProvider: true, driveFolderId: true },
    });
    const targetFolderPath = targetFolder?.path ?? null;
    const targetDriveFolderId = targetFolder
      ? this.getDriveFolderIdForMutation(targetFolder as WebhardFolder, 'Target folder')
      : null;

    const movedIds: string[] = [];
    for (const file of files) {
      if (file.folderId === targetFolderId) continue;
      const oldFolderId = file.folderId ?? null;
      const newPath = targetFolderPath ? `${targetFolderPath}/${file.name}` : file.name;
      if (file.storageProvider === StorageProvider.GOOGLE_DRIVE && file.driveFileId) {
        if (!targetDriveFolderId) {
          throw new BadRequestException('Target folder is not provisioned in Google Drive');
        }
        await this.storageService?.moveDriveFile({
          storageFileId: file.driveFileId,
          toParentStorageFolderId: targetDriveFolderId,
        });
      }
      try {
        await client.webhardFile.update({
          where: { id: file.id },
          data: { folderId: targetFolderId, path: newPath },
        });
      } catch (error) {
        if (file.storageProvider === StorageProvider.GOOGLE_DRIVE && file.driveFileId) {
          await this.storageRepairService?.recordDriveDbMismatch({
            operation: 'file_move',
            storageProvider: 'google_drive',
            driveFileId: file.driveFileId,
            webhardFileId: file.id,
            expectedDbState: { folderId: targetFolderId, path: newPath },
            actualDriveState: { moved: true, dbUpdateFailed: true },
          });
        }
        throw error;
      }
      movedIds.push(file.id);
      this.contactsGateway.emitFileMoved({
        contactId,
        fileId: file.id,
        oldFolderId,
        newFolderId: targetFolderId,
      });
    }

    if (movedIds.length > 0) {
      await this.invalidateFolderCache();
    }

    return { movedIds };
  }

  /**
   * 파일 업로드 시 해당 폴더 및 모든 상위 폴더의 updated_at 전파
   * - 전체 폴더 목록 1회 조회 후 메모리에서 조상 체인 계산 (N+1 방지)
   * - updateMany 단일 쿼리로 일괄 갱신
   */
  async propagateUpdatedAt(folderId: string, timestamp: Date): Promise<void> {
    // 1. 전체 폴더 목록 1회 조회 (id, parentId만)
    const allFolders = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findMany({
          where: { deletedAt: null },
          select: { id: true, parentId: true },
        }),
      { operationName: 'propagateUpdatedAt.findAll' }
    );

    // 2. id → parentId 맵 구성 (메모리)
    const parentMap = new Map<string, string | null>();
    for (const folder of allFolders) {
      parentMap.set(folder.id, folder.parentId);
    }

    // 3. 해당 폴더 + 모든 상위 폴더 ID 수집 (depth 제한 20)
    const folderIds: string[] = [];
    let currentId: string | null = folderId;
    let depth = 0;
    while (currentId && depth < 20) {
      if (!parentMap.has(currentId)) break;
      folderIds.push(currentId);
      currentId = parentMap.get(currentId) ?? null;
      depth++;
    }

    if (folderIds.length === 0) return;

    // 4. 단일 updateMany로 일괄 갱신
    await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.updateMany({
          where: { id: { in: folderIds } },
          data: { updatedAt: timestamp },
        }),
      { operationName: 'propagateUpdatedAt.updateMany' }
    );
  }

  /**
   * task 26: 외부웹하드 직하의 미매칭 root 폴더 목록 (admin UI 용).
   *
   * 조건 (`docs/specs/features/admin-folder-mapping-ui.md`):
   * - `path` 가 `/외부웹하드/` 직하 (depth=2)
   * - `companyId IS NULL`
   * - `deletedAt IS NULL`
   * - `folderKind IN ('root', 'generic')` (template 폴더 제외)
   * - 동일 name 의 `CompanyFolderAlias status='approved'` 가 없는 것만 (이미 매핑된 폴더 제외)
   *
   * 응답 항목별로 contactCount / fileCount 를 BFS 누적 (depth 무제한, deletedAt=null).
   *
   * @returns admin 운영자가 매뉴얼 매핑 폼에서 선택할 후보 목록.
   */
  async getExternalUnmatchedFolders(): Promise<
    Array<{
      id: string;
      name: string;
      path: string | null;
      contactCount: number;
      fileCount: number;
      createdAt: string;
    }>
  > {
    // 1. 외부웹하드 직하 root + generic 폴더 후보 조회
    const candidates = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findMany({
          where: {
            path: { startsWith: '/외부웹하드/' },
            companyId: null,
            deletedAt: null,
            folderKind: { in: ['root', 'generic'] },
          },
          select: {
            id: true,
            name: true,
            path: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
      { operationName: 'getExternalUnmatchedFolders.candidates' }
    );

    // 2. depth=2 만 필터링 — '/외부웹하드/{X}' (segments=2)
    const depth2 = candidates.filter((f) => {
      const segments = (f.path ?? '').split('/').filter((s) => s.length > 0);
      return segments.length === 2;
    });

    if (depth2.length === 0) return [];

    // 3. 이미 approved alias 가 있는 folderName 제외
    const names = depth2.map((f) => f.name);
    const approvedAliases = await this.prisma.executeWithRetry(
      () =>
        this.prisma.companyFolderAlias.findMany({
          where: { folderName: { in: names }, status: 'approved' },
          select: { folderName: true },
        }),
      { operationName: 'getExternalUnmatchedFolders.aliases' }
    );
    const approvedSet = new Set(approvedAliases.map((a) => a.folderName));
    const unmatched = depth2.filter((f) => !approvedSet.has(f.name));

    if (unmatched.length === 0) return [];

    // 4. 외부웹하드 하위 관계를 한 번에 조회하고 memory map으로 root별 subtree를 누적한다.
    const allExternalFolders = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findMany({
          where: { path: { startsWith: '/외부웹하드/' }, deletedAt: null },
          select: { id: true, parentId: true },
        }),
      { operationName: 'getExternalUnmatchedFolders.subtreeFolders' }
    );

    const childrenByParent = new Map<string | null, string[]>();
    for (const folder of allExternalFolders) {
      const children = childrenByParent.get(folder.parentId) ?? [];
      children.push(folder.id);
      childrenByParent.set(folder.parentId, children);
    }

    const rootByFolderId = new Map<string, string>();
    for (const root of unmatched) {
      const stack = [root.id];
      while (stack.length > 0) {
        const current = stack.pop() as string;
        if (rootByFolderId.has(current)) continue;
        rootByFolderId.set(current, root.id);
        stack.push(...(childrenByParent.get(current) ?? []));
      }
    }

    const subtreeIds = Array.from(rootByFolderId.keys());
    const [fileGroups, contactGroups] =
      subtreeIds.length > 0
        ? await Promise.all([
            this.prisma.executeWithRetry(
              () =>
                this.prisma.webhardFile.groupBy({
                  by: ['folderId'],
                  where: { folderId: { in: subtreeIds }, deletedAt: null },
                  _count: true,
                }),
              { operationName: 'getExternalUnmatchedFolders.fileGroupBy' }
            ),
            this.prisma.executeWithRetry(
              () =>
                this.prisma.contact.groupBy({
                  by: ['webhardFolderId'],
                  where: { webhardFolderId: { in: subtreeIds } },
                  _count: true,
                }),
              { operationName: 'getExternalUnmatchedFolders.contactGroupBy' }
            ),
          ])
        : [[], []];

    const fileCountByRoot = new Map<string, number>();
    for (const group of fileGroups) {
      if (!group.folderId) continue;
      const rootId = rootByFolderId.get(group.folderId);
      if (!rootId) continue;
      fileCountByRoot.set(rootId, (fileCountByRoot.get(rootId) ?? 0) + group._count);
    }

    const contactCountByRoot = new Map<string, number>();
    for (const group of contactGroups) {
      if (!group.webhardFolderId) continue;
      const rootId = rootByFolderId.get(group.webhardFolderId);
      if (!rootId) continue;
      contactCountByRoot.set(rootId, (contactCountByRoot.get(rootId) ?? 0) + group._count);
    }

    return unmatched.map((root) => ({
      id: root.id,
      name: root.name,
      path: root.path,
      contactCount: contactCountByRoot.get(root.id) ?? 0,
      fileCount: fileCountByRoot.get(root.id) ?? 0,
      createdAt: root.createdAt.toISOString(),
    }));
  }

  /**
   * task 27 Phase C: 외부웹하드 husk (빈 껍데기) 정리 후보 목록.
   *
   * 조건:
   * - path startsWith '/외부웹하드/'
   * - depth=2 (직하 root)
   * - companyId IS NULL
   * - deletedAt IS NULL
   * - 자식 폴더 0 + 직접 파일 0 (자손 트리 검증은 cleanup 시점에)
   *
   * @returns admin UI 의 husk 정리 패널 후보 목록.
   */
  async getEmptyExternalHusks(): Promise<
    Array<{ id: string; name: string; path: string | null; createdAt: string }>
  > {
    const candidates = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findMany({
          where: {
            path: { startsWith: '/외부웹하드/' },
            companyId: null,
            deletedAt: null,
          },
          select: { id: true, name: true, path: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
      { operationName: 'getEmptyExternalHusks.candidates' }
    );

    // depth=2 root만 대상으로 직접 자식/직접 파일 존재 여부를 bulk 계산한다.
    const depth2 = candidates.filter((f) => {
      const segments = (f.path ?? '').split('/').filter((s) => s.length > 0);
      return segments.length === 2;
    });

    if (depth2.length === 0) return [];

    const rootIds = depth2.map((f) => f.id);
    const [children, fileGroups] = await Promise.all([
      this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFolder.findMany({
            where: { parentId: { in: rootIds }, deletedAt: null },
            select: { id: true, parentId: true },
          }),
        { operationName: 'getEmptyExternalHusks.children' }
      ),
      this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFile.groupBy({
            by: ['folderId'],
            where: { folderId: { in: rootIds }, deletedAt: null },
            _count: true,
          }),
        { operationName: 'getEmptyExternalHusks.fileGroupBy' }
      ),
    ]);

    const rootsWithChildren = new Set(children.map((child) => child.parentId).filter(Boolean));
    const rootsWithFiles = new Set(
      fileGroups
        .filter((group) => group.folderId && group._count > 0)
        .map((group) => group.folderId)
    );

    return depth2
      .filter((folder) => !rootsWithChildren.has(folder.id) && !rootsWithFiles.has(folder.id))
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        path: folder.path,
        createdAt: folder.createdAt.toISOString(),
      }));
  }

  /**
   * task 27 Phase C: 단일 husk root 정리 (cascade soft-delete).
   *
   * 안전 가드:
   * - depth=2 외부웹하드 root 만 허용
   * - companyId IS NULL 만 허용
   * - 자식 폴더·파일 0 만 허용 (descendants 트리 BFS 검증)
   * - 위반 시 BadRequestException / UnprocessableEntityException
   *
   * 트랜잭션 1회 — root + descendants 모두 deletedAt 갱신.
   */
  async cleanupEmptyExternalHusk(rootId: string): Promise<{ deletedFolderIds: string[] }> {
    const { cleanupEmptyExternalRootHusk } = await import('./_lib/cleanup-external-husk.util');
    return this.prisma.$transaction((tx) => cleanupEmptyExternalRootHusk(tx, rootId));
  }
}
