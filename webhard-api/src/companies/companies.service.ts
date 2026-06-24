import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, StorageProvider } from '@prisma/client';
import { CompanyQueryDto, UpdateCompanyProfileDto, CreateCompanyDto } from './dto/company.dto';
import { DriveProvisioningService } from '../folders/drive-provisioning.service';
import { StorageRepairService } from '../storage/storage-repair.service';
import { StorageService } from '../storage/storage.service';
import { toDriveReference } from '../storage/storage-reference.util';
import type { StorageRepairOperation } from '../storage/storage-repair.service';

const COMPANY_DELETE_RETENTION_DAYS = 30;
const ADMIN_PRIVATE_ROOT_NAME = '관리자전용';
const ADMIN_PRIVATE_ROOT_PATH = '/외부웹하드/관리자전용';
const ADMIN_PRIVATE_ROOT_KIND = 'admin_private_root';
const ADMIN_PRIVATE_COMPANY_KIND = 'admin_private_co';
const LEGACY_ADMIN_PRIVATE_COMPANY_KIND = 'admin_private_company';

export interface UploadedCompanyBusinessRegistrationFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

function getCompanyDeleteMarker(companyId: number): string {
  return `company:${companyId}`;
}

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly driveProvisioningService?: DriveProvisioningService,
    @Optional() private readonly storageService?: StorageService,
    @Optional() private readonly storageRepairService?: StorageRepairService
  ) {}

  private getCompanyRestoreDeadline(deletedAt: Date): Date {
    return new Date(deletedAt.getTime() + COMPANY_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  }

  private getCompanyRestoreDaysRemaining(deletedAt: Date): number {
    const deadline = this.getCompanyRestoreDeadline(deletedAt);
    return Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  }

  private collectFolderTreeIds(
    rootIds: string[],
    folders: Array<{ id: string; parentId: string | null }>
  ): string[] {
    const childrenByParent = new Map<string | null, string[]>();
    for (const folder of folders) {
      const children = childrenByParent.get(folder.parentId) ?? [];
      children.push(folder.id);
      childrenByParent.set(folder.parentId, children);
    }

    const folderIds = new Set<string>();
    const queue = [...rootIds];
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId || folderIds.has(currentId)) {
        continue;
      }
      folderIds.add(currentId);
      const children = childrenByParent.get(currentId) ?? [];
      queue.push(...children);
    }

    return Array.from(folderIds);
  }

  private sanitizeDriveName(name: string): string {
    return name
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
  }

  private async ensureAdminPrivateCompanyFolder(company: {
    id: number;
    companyName: string;
  }): Promise<{ id: string; driveFolderId: string }> {
    if (!this.storageService) {
      throw new BadRequestException('Google Drive storage service is unavailable');
    }

    let rootFolder = await this.prisma.webhardFolder.findFirst({
      where: {
        parentId: null,
        companyId: null,
        name: ADMIN_PRIVATE_ROOT_NAME,
        folderKind: ADMIN_PRIVATE_ROOT_KIND,
        deletedAt: null,
      },
      select: { id: true, driveFolderId: true },
    });

    if (!rootFolder) {
      const driveFolder = await this.storageService.createDriveFolder({
        name: ADMIN_PRIVATE_ROOT_NAME,
        parentStorageFolderId: null,
      });
      rootFolder = await this.prisma.webhardFolder.create({
        data: {
          name: ADMIN_PRIVATE_ROOT_NAME,
          parentId: null,
          companyId: null,
          path: ADMIN_PRIVATE_ROOT_PATH,
          folderKind: ADMIN_PRIVATE_ROOT_KIND,
          storageProvider: StorageProvider.GOOGLE_DRIVE,
          driveFolderId: driveFolder.storageFolderId,
        },
        select: { id: true, driveFolderId: true },
      });
    }

    if (!rootFolder.driveFolderId) {
      throw new BadRequestException('관리자 전용 Drive 루트가 준비되지 않았습니다.');
    }

    const companyFolderName =
      this.sanitizeDriveName(company.companyName) || `company-${company.id}`;
    let companyFolder = await this.prisma.webhardFolder.findFirst({
      where: {
        parentId: rootFolder.id,
        companyId: null,
        name: companyFolderName,
        folderKind: { in: [ADMIN_PRIVATE_COMPANY_KIND, LEGACY_ADMIN_PRIVATE_COMPANY_KIND] },
        deletedAt: null,
      },
      select: { id: true, driveFolderId: true },
    });

    if (!companyFolder) {
      const driveFolder = await this.storageService.createDriveFolder({
        name: companyFolderName,
        parentStorageFolderId: rootFolder.driveFolderId,
      });
      companyFolder = await this.prisma.webhardFolder.create({
        data: {
          name: companyFolderName,
          parentId: rootFolder.id,
          companyId: null,
          path: `${ADMIN_PRIVATE_ROOT_PATH}/${companyFolderName}`,
          folderKind: ADMIN_PRIVATE_COMPANY_KIND,
          storageProvider: StorageProvider.GOOGLE_DRIVE,
          driveFolderId: driveFolder.storageFolderId,
        },
        select: { id: true, driveFolderId: true },
      });
    }

    if (!companyFolder.driveFolderId) {
      throw new BadRequestException('업체 관리자 전용 Drive 폴더가 준비되지 않았습니다.');
    }

    return { id: companyFolder.id, driveFolderId: companyFolder.driveFolderId };
  }

  async uploadBusinessRegistrationToDrive(
    companyId: number,
    file: UploadedCompanyBusinessRegistrationFile
  ): Promise<Record<string, unknown>> {
    if (!this.storageService) {
      throw new BadRequestException('Google Drive storage service is unavailable');
    }

    const startedAt = Date.now();
    this.logger.log(`Business registration Drive upload start: companyId=${companyId}`);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, companyName: true },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const folder = await this.ensureAdminPrivateCompanyFolder(company);
    const safeOriginalName = this.sanitizeDriveName(file.originalname) || 'business-registration';
    const displayName = `사업자등록증_${safeOriginalName}`;
    const uploaded = await this.storageService.uploadDriveBuffer({
      fileName: displayName,
      mimeType: file.mimetype || 'application/octet-stream',
      buffer: file.buffer,
      parentStorageFolderId: folder.driveFolderId,
    });

    await this.prisma.webhardFile.create({
      data: {
        name: displayName,
        originalName: file.originalname || displayName,
        size: BigInt(uploaded.size ?? file.size ?? 0),
        mimeType: uploaded.mimeType ?? file.mimetype ?? 'application/octet-stream',
        path: `${folder.id}/${displayName}`,
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFileId: uploaded.storageFileId,
        driveMimeType: uploaded.mimeType ?? null,
        folderId: folder.id,
        companyId: null,
        uploadedBy: 'admin',
        inquiryNumber: null,
      },
    });

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        businessRegistrationFileUrl: toDriveReference(uploaded.storageFileId),
        businessRegistrationFileName: file.originalname || displayName,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `Business registration Drive upload success: companyId=${companyId}, elapsedMs=${
        Date.now() - startedAt
      }`
    );

    return this.toSnakeCase(updated);
  }

  private async recordStorageRepair(input: {
    operation: StorageRepairOperation;
    driveFolderId?: string | null;
    webhardFolderId?: string | null;
    expectedDbState: Record<string, unknown>;
    actualDriveState: Record<string, unknown>;
  }): Promise<void> {
    if (!this.storageRepairService) {
      return;
    }
    await this.storageRepairService.recordDriveDbMismatch({
      operation: input.operation,
      storageProvider: 'google_drive',
      driveFolderId: input.driveFolderId ?? undefined,
      webhardFolderId: input.webhardFolderId ?? undefined,
      expectedDbState: input.expectedDbState,
      actualDriveState: input.actualDriveState,
    });
  }

  private getExternalErrorStatus(error: unknown): number | null {
    if (typeof error !== 'object' || error === null) {
      return null;
    }
    const candidate = error as {
      code?: unknown;
      status?: unknown;
      response?: { status?: unknown };
    };
    const statusCandidates = [candidate.status, candidate.response?.status, candidate.code];
    for (const statusCandidate of statusCandidates) {
      if (statusCandidate === undefined || statusCandidate === null || statusCandidate === '') {
        continue;
      }
      const status = Number(statusCandidate);
      if (Number.isFinite(status)) {
        return status;
      }
    }
    return null;
  }

  private isDriveMissingError(error: unknown): boolean {
    const status = this.getExternalErrorStatus(error);
    if (status === 404) {
      return true;
    }
    if (error instanceof Error) {
      return /not found|file not found|folder not found/i.test(error.message);
    }
    return false;
  }

  private async trashCompanyRootDriveFolder(input: {
    folder: {
      id: string;
      storageProvider: StorageProvider;
      driveFolderId: string | null;
    };
    companyId: number;
    deletedAt: string;
    folderIds: string[];
  }): Promise<{ id: string; driveFolderId: string } | null> {
    if (input.folder.storageProvider !== StorageProvider.GOOGLE_DRIVE) {
      return null;
    }

    if (!this.storageService) {
      throw new BadRequestException('Google Drive storage service is not configured');
    }

    if (!input.folder.driveFolderId) {
      await this.recordStorageRepair({
        operation: 'trash',
        webhardFolderId: input.folder.id,
        expectedDbState: {
          companyId: input.companyId,
          deletedAt: input.deletedAt,
          folderIds: input.folderIds,
        },
        actualDriveState: {
          skipped: true,
          reason: 'missing_drive_folder_id',
        },
      });
      return null;
    }

    try {
      await this.storageService.trashDriveFolder({ storageFolderId: input.folder.driveFolderId });
      return { id: input.folder.id, driveFolderId: input.folder.driveFolderId };
    } catch (error) {
      if (!this.isDriveMissingError(error)) {
        throw error;
      }
      await this.recordStorageRepair({
        operation: 'trash',
        driveFolderId: input.folder.driveFolderId,
        webhardFolderId: input.folder.id,
        expectedDbState: {
          companyId: input.companyId,
          deletedAt: input.deletedAt,
          folderIds: input.folderIds,
        },
        actualDriveState: {
          skipped: true,
          reason: 'drive_folder_not_found',
          status: this.getExternalErrorStatus(error),
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return null;
    }
  }

  private async restoreCompanyRootDriveFolder(input: {
    folder: {
      id: string;
      storageProvider: StorageProvider;
      driveFolderId: string | null;
    };
    companyId: number;
    restoredAt: string;
    folderIds: string[];
  }): Promise<{ id: string; driveFolderId: string } | null> {
    if (input.folder.storageProvider !== StorageProvider.GOOGLE_DRIVE) {
      return null;
    }

    if (!this.storageService) {
      throw new BadRequestException('Google Drive storage service is not configured');
    }

    if (!input.folder.driveFolderId) {
      await this.recordStorageRepair({
        operation: 'restore',
        webhardFolderId: input.folder.id,
        expectedDbState: {
          companyId: input.companyId,
          restoredAt: input.restoredAt,
          folderIds: input.folderIds,
        },
        actualDriveState: {
          skipped: true,
          reason: 'missing_drive_folder_id',
        },
      });
      return null;
    }

    try {
      await this.storageService.restoreDriveFolder({
        storageFolderId: input.folder.driveFolderId,
      });
      return { id: input.folder.id, driveFolderId: input.folder.driveFolderId };
    } catch (error) {
      if (!this.isDriveMissingError(error)) {
        throw error;
      }
      await this.recordStorageRepair({
        operation: 'restore',
        driveFolderId: input.folder.driveFolderId,
        webhardFolderId: input.folder.id,
        expectedDbState: {
          companyId: input.companyId,
          restoredAt: input.restoredAt,
          folderIds: input.folderIds,
        },
        actualDriveState: {
          skipped: true,
          reason: 'drive_folder_not_found',
          status: this.getExternalErrorStatus(error),
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return null;
    }
  }

  private async createAdminCompanyNotification(input: {
    type: string;
    title: string;
    message: string;
    companyId: number;
    companyName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userType: 'admin',
          userId: null,
          type: input.type,
          title: input.title,
          message: input.message,
          metadata: {
            companyId: input.companyId,
            companyName: input.companyName,
            link: `/admin/integration/companies/${input.companyId}`,
            ...input.metadata,
          },
        },
      });
    } catch (err) {
      this.logger.warn(
        `company notification failed: type=${input.type}, companyId=${input.companyId}, error=${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * 업체 목록 조회 (검색, 필터, 페이지네이션)
   */
  async findAll(query: CompanyQueryDto) {
    const {
      status,
      search,
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'desc',
      isApproved,
    } = query;

    const where: Prisma.CompanyWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (isApproved !== undefined) {
      where.isApproved = isApproved;
    }

    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { managerName: { contains: search, mode: 'insensitive' } },
        { managerEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Map snake_case sort fields to camelCase
    const sortFieldMap: Record<string, string> = {
      created_at: 'createdAt',
      company_name: 'companyName',
      status: 'status',
      updated_at: 'updatedAt',
    };

    const orderByField = sortFieldMap[sortBy] || 'createdAt';

    const [companies, total] = await this.prisma.executeWithRetry(
      () =>
        Promise.all([
          this.prisma.company.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { [orderByField]: sortOrder },
          }),
          this.prisma.company.count({ where }),
        ]),
      { operationName: 'companies.findAll' }
    );

    return {
      companies: companies.map((c) => this.toSnakeCase(c)),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  /**
   * 업체 단건 조회
   */
  async findById(id: number) {
    const company = await this.prisma.executeWithRetry(
      () => this.prisma.company.findUnique({ where: { id } }),
      { operationName: 'companies.findById' }
    );
    if (!company) {
      throw new NotFoundException(`Company ${id} not found`);
    }
    return this.toSnakeCase(company);
  }

  /**
   * username으로 업체 조회
   */
  async findByUsername(username: string) {
    const company = await this.prisma.executeWithRetry(
      () => this.prisma.company.findUnique({ where: { username } }),
      { operationName: 'companies.findByUsername' }
    );
    if (!company) return null;
    return this.toSnakeCase(company);
  }

  /**
   * 업체명으로 조회
   */
  async findByCompanyName(companyName: string) {
    const company = await this.prisma.executeWithRetry(
      () => this.prisma.company.findFirst({ where: { companyName } }),
      { operationName: 'companies.findByCompanyName' }
    );
    if (!company) return null;
    return this.toSnakeCase(company);
  }

  /**
   * 업체 생성
   */
  async create(data: CreateCompanyDto) {
    const company = await this.prisma.executeWithRetry(
      () =>
        this.prisma.company.create({
          data: {
            companyName: data.companyName,
            username: data.username,
            passwordHash: data.passwordHash,
            businessRegistrationNumber: data.businessRegistrationNumber,
            representativeName: data.representativeName,
            businessAddress: data.businessAddress,
            managerName: data.managerName,
            managerPosition: data.managerPosition,
            managerPhone: data.managerPhone,
            managerEmail: data.managerEmail,
            businessType: data.businessType || null,
            businessCategory: data.businessCategory || null,
            accountantName: data.accountantName || null,
            accountantPhone: data.accountantPhone || null,
            accountantEmail: data.accountantEmail || null,
            accountantFax: data.accountantFax || null,
            quoteMethodEmail: data.quoteMethodEmail || false,
            quoteMethodFax: data.quoteMethodFax || false,
            quoteMethodSms: data.quoteMethodSms || false,
            businessRegistrationFileUrl: data.businessRegistrationFileUrl || null,
            businessRegistrationFileName: data.businessRegistrationFileName || null,
            status: 'pending',
            isApproved: false,
          },
        }),
      { operationName: 'companies.create' }
    );
    await this.createAdminCompanyNotification({
      type: 'company_approval_pending',
      title: '업체 승인 필요',
      message: `${company.companyName} 업체가 가입 승인을 기다리고 있습니다.`,
      companyId: company.id,
      companyName: company.companyName,
      metadata: { status: company.status },
    });
    return this.toSnakeCase(company);
  }

  /**
   * 업체 수정
   */
  async update(id: number, data: UpdateCompanyProfileDto) {
    const updateData: Prisma.CompanyUpdateInput = {};

    if (data.companyName !== undefined) updateData.companyName = data.companyName;
    if (data.businessRegistrationNumber !== undefined)
      updateData.businessRegistrationNumber = data.businessRegistrationNumber;
    if (data.representativeName !== undefined)
      updateData.representativeName = data.representativeName;
    if (data.businessType !== undefined) updateData.businessType = data.businessType;
    if (data.businessCategory !== undefined) updateData.businessCategory = data.businessCategory;
    if (data.businessAddress !== undefined) updateData.businessAddress = data.businessAddress;
    if (data.businessRegistrationFileUrl !== undefined)
      updateData.businessRegistrationFileUrl = data.businessRegistrationFileUrl;
    if (data.businessRegistrationFileName !== undefined)
      updateData.businessRegistrationFileName = data.businessRegistrationFileName;
    if (data.managerName !== undefined) updateData.managerName = data.managerName;
    if (data.managerPosition !== undefined) updateData.managerPosition = data.managerPosition;
    if (data.managerPhone !== undefined) updateData.managerPhone = data.managerPhone;
    if (data.managerEmail !== undefined) updateData.managerEmail = data.managerEmail;
    if (data.accountantName !== undefined) updateData.accountantName = data.accountantName;
    if (data.accountantPhone !== undefined) updateData.accountantPhone = data.accountantPhone;
    if (data.accountantEmail !== undefined) updateData.accountantEmail = data.accountantEmail;
    if (data.accountantFax !== undefined) updateData.accountantFax = data.accountantFax;
    if (data.quoteMethodEmail !== undefined) updateData.quoteMethodEmail = data.quoteMethodEmail;
    if (data.quoteMethodFax !== undefined) updateData.quoteMethodFax = data.quoteMethodFax;
    if (data.quoteMethodSms !== undefined) updateData.quoteMethodSms = data.quoteMethodSms;
    if (data.passwordHash !== undefined) updateData.passwordHash = data.passwordHash;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.isApproved !== undefined) updateData.isApproved = data.isApproved;
    if (data.approvedAt !== undefined) updateData.approvedAt = new Date(data.approvedAt);
    if (data.approvedBy !== undefined) updateData.approvedBy = data.approvedBy;
    if (data.webhardAccess !== undefined) updateData.webhardAccess = data.webhardAccess;
    if (data.laserOnly !== undefined) updateData.laserOnly = data.laserOnly;

    updateData.updatedAt = new Date();

    const company = await this.prisma.executeWithRetry(
      () => this.prisma.company.update({ where: { id }, data: updateData }),
      { operationName: 'companies.update' }
    );

    return this.toSnakeCase(company);
  }

  /**
   * 업체 삭제 대기 처리
   *
   * 업체 row는 30일 복구 가능하도록 soft delete 상태로 전환하고,
   * 매칭된 업체 웹하드 루트 폴더와 하위 파일/폴더는 휴지통으로 이동한다.
   */
  async deleteCompany(id: number, deletedBy: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company ${id} not found`);
    }

    if (company.deletedAt || company.status === 'deleted') {
      return {
        company: this.toSnakeCase(company),
        alreadyDeleted: true,
        restoreDeadlineAt: company.deletedAt
          ? this.getCompanyRestoreDeadline(company.deletedAt).toISOString()
          : null,
      };
    }

    const rootFolders = await this.prisma.webhardFolder.findMany({
      where: { companyId: id, parentId: null, deletedAt: null },
      select: {
        id: true,
        name: true,
        parentId: true,
        companyId: true,
        storageProvider: true,
        driveFolderId: true,
      },
    });
    const activeCompanyFolders = await this.prisma.webhardFolder.findMany({
      where: { companyId: id, deletedAt: null },
      select: { id: true, parentId: true },
    });

    const rootFolderIds = rootFolders.map((folder) => folder.id);
    const folderIdsToTrash = this.collectFolderTreeIds(rootFolderIds, activeCompanyFolders);
    const trashedDriveFolders: Array<{ id: string; driveFolderId: string }> = [];
    const now = new Date();

    for (const folder of rootFolders) {
      const trashedDriveFolder = await this.trashCompanyRootDriveFolder({
        folder,
        companyId: id,
        deletedAt: now.toISOString(),
        folderIds: folderIdsToTrash,
      });
      if (trashedDriveFolder) {
        trashedDriveFolders.push(trashedDriveFolder);
      }
    }

    const deletedMarker = getCompanyDeleteMarker(id);
    let updatedCompany: typeof company;
    let folderResult: Prisma.BatchPayload;
    let fileResult: Prisma.BatchPayload;

    try {
      [updatedCompany, folderResult, fileResult] = await this.prisma.executeWithRetry(
        () =>
          this.prisma.$transaction([
            this.prisma.company.update({
              where: { id },
              data: {
                status: 'deleted',
                webhardAccess: false,
                deletedAt: now,
                deletedBy,
                deletedPreviousStatus: company.status,
                deletedPreviousWebhardAccess: company.webhardAccess,
                updatedAt: now,
              },
            }),
            this.prisma.webhardFolder.updateMany({
              where: { id: { in: folderIdsToTrash }, deletedAt: null },
              data: { deletedAt: now, deletedBy: deletedMarker, updatedAt: now },
            }),
            this.prisma.webhardFile.updateMany({
              where: { folderId: { in: folderIdsToTrash }, deletedAt: null },
              data: { deletedAt: now, deletedBy: deletedMarker },
            }),
          ]),
        { operationName: 'companies.deleteCompany.transaction' }
      );
    } catch (error) {
      await Promise.all(
        trashedDriveFolders.map((folder) =>
          this.recordStorageRepair({
            operation: 'trash',
            driveFolderId: folder.driveFolderId,
            webhardFolderId: folder.id,
            expectedDbState: {
              companyId: id,
              deletedAt: now.toISOString(),
              folderIds: folderIdsToTrash,
            },
            actualDriveState: { trashed: true, dbUpdateFailed: true },
          })
        )
      );
      throw error;
    }

    await this.createAdminCompanyNotification({
      type: 'company_deleted',
      title: '업체 삭제 대기',
      message: `${company.companyName} 업체가 삭제 대기 상태로 변경되었습니다.`,
      companyId: company.id,
      companyName: company.companyName,
      metadata: {
        deletedBy,
        restoreDeadlineAt: this.getCompanyRestoreDeadline(now).toISOString(),
        foldersDeleted: folderResult.count,
        filesDeleted: fileResult.count,
      },
    });

    return {
      company: this.toSnakeCase(updatedCompany),
      alreadyDeleted: false,
      foldersDeleted: folderResult.count,
      filesDeleted: fileResult.count,
      restoreDeadlineAt: this.getCompanyRestoreDeadline(now).toISOString(),
      daysUntilPermanentDelete: this.getCompanyRestoreDaysRemaining(now),
    };
  }

  /**
   * 삭제 대기 업체 복구
   */
  async restoreCompany(id: number) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company ${id} not found`);
    }

    if (!company.deletedAt && company.status !== 'deleted') {
      return {
        company: this.toSnakeCase(company),
        alreadyRestored: true,
      };
    }

    if (!company.deletedAt) {
      throw new BadRequestException('업체 삭제 일시가 없어 복구할 수 없습니다.');
    }

    const restoreDeadline = this.getCompanyRestoreDeadline(company.deletedAt);
    if (Date.now() > restoreDeadline.getTime()) {
      throw new BadRequestException('업체 삭제 후 30일이 지나 복구할 수 없습니다.');
    }

    const deletedMarker = getCompanyDeleteMarker(id);
    const rootFolders = await this.prisma.webhardFolder.findMany({
      where: {
        companyId: id,
        parentId: null,
        deletedBy: deletedMarker,
        deletedAt: { not: null },
      },
      select: {
        id: true,
        storageProvider: true,
        driveFolderId: true,
      },
    });
    const deletedCompanyFolders = await this.prisma.webhardFolder.findMany({
      where: {
        companyId: id,
        deletedBy: deletedMarker,
        deletedAt: { not: null },
      },
      select: { id: true, parentId: true },
    });
    const folderIdsToRestore = deletedCompanyFolders.map((folder) => folder.id);
    const restoredDriveFolders: Array<{ id: string; driveFolderId: string }> = [];
    const now = new Date();

    for (const folder of rootFolders) {
      const restoredDriveFolder = await this.restoreCompanyRootDriveFolder({
        folder,
        companyId: id,
        restoredAt: now.toISOString(),
        folderIds: folderIdsToRestore,
      });
      if (restoredDriveFolder) {
        restoredDriveFolders.push(restoredDriveFolder);
      }
    }

    const restoreStatus =
      company.deletedPreviousStatus && company.deletedPreviousStatus !== 'deleted'
        ? company.deletedPreviousStatus
        : 'inactive';
    const restoreWebhardAccess = company.deletedPreviousWebhardAccess ?? true;
    let updatedCompany: typeof company;
    let folderResult: Prisma.BatchPayload;
    let fileResult: Prisma.BatchPayload;

    try {
      [updatedCompany, folderResult, fileResult] = await this.prisma.executeWithRetry(
        () =>
          this.prisma.$transaction([
            this.prisma.company.update({
              where: { id },
              data: {
                status: restoreStatus,
                webhardAccess: restoreWebhardAccess,
                deletedAt: null,
                deletedBy: null,
                deletedPreviousStatus: null,
                deletedPreviousWebhardAccess: null,
                updatedAt: now,
              },
            }),
            this.prisma.webhardFolder.updateMany({
              where: {
                id: { in: folderIdsToRestore },
                deletedBy: deletedMarker,
                deletedAt: { not: null },
              },
              data: { deletedAt: null, deletedBy: null, updatedAt: now },
            }),
            this.prisma.webhardFile.updateMany({
              where: {
                folderId: { in: folderIdsToRestore },
                deletedBy: deletedMarker,
                deletedAt: { not: null },
              },
              data: { deletedAt: null, deletedBy: null },
            }),
          ]),
        { operationName: 'companies.restoreCompany.transaction' }
      );
    } catch (error) {
      await Promise.all(
        restoredDriveFolders.map((folder) =>
          this.recordStorageRepair({
            operation: 'restore',
            driveFolderId: folder.driveFolderId,
            webhardFolderId: folder.id,
            expectedDbState: {
              companyId: id,
              restoredAt: now.toISOString(),
              folderIds: folderIdsToRestore,
            },
            actualDriveState: { restored: true, dbUpdateFailed: true },
          })
        )
      );
      throw error;
    }

    await this.createAdminCompanyNotification({
      type: 'company_restored',
      title: '업체 복구 완료',
      message: `${company.companyName} 업체가 복구되었습니다.`,
      companyId: company.id,
      companyName: company.companyName,
      metadata: {
        restoredStatus: restoreStatus,
        restoredWebhardAccess: restoreWebhardAccess,
        foldersRestored: folderResult.count,
        filesRestored: fileResult.count,
      },
    });

    return {
      company: this.toSnakeCase(updatedCompany),
      alreadyRestored: false,
      foldersRestored: folderResult.count,
      filesRestored: fileResult.count,
    };
  }

  /**
   * 업체 상태 변경
   */
  async updateStatus(id: number, status: string, approvedBy?: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company ${id} not found`);
    }

    const updateData: Prisma.CompanyUpdateInput = {
      status,
      updatedAt: new Date(),
    };

    // active로 변경 시 자동 승인
    if (status === 'active' && !company.isApproved) {
      updateData.isApproved = true;
      updateData.approvedAt = new Date();
      if (approvedBy) updateData.approvedBy = approvedBy;
    }

    const updated = await this.prisma.company.update({
      where: { id },
      data: updateData,
    });
    const driveProvisioning =
      status === 'active' && this.driveProvisioningService
        ? await this.driveProvisioningService.ensureCompanyDriveRoot(id)
        : null;
    await this.createAdminCompanyNotification({
      type: status === 'active' ? 'company_approved' : 'company_status_updated',
      title: status === 'active' ? '업체 승인 완료' : '업체 상태 변경',
      message: `${updated.companyName} 업체 상태가 ${status}(으)로 변경되었습니다.`,
      companyId: updated.id,
      companyName: updated.companyName,
      metadata: { previousStatus: company.status, status },
    });

    return {
      company: this.toSnakeCase(updated),
      previousStatus: company.status,
      driveProvisioning,
    };
  }

  /**
   * 웹하드 접근 토글
   */
  async toggleWebhardAccess(id: number, allowed: boolean) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company ${id} not found`);
    }

    const previousAccess = company.webhardAccess;

    const updated = await this.prisma.company.update({
      where: { id },
      data: { webhardAccess: allowed, updatedAt: new Date() },
    });

    return {
      company: this.toSnakeCase(updated),
      previousAccess,
    };
  }

  /**
   * 레이저 전용 토글
   */
  async toggleLaserOnly(id: number, laserOnly: boolean) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company ${id} not found`);
    }

    const previousLaserOnly = company.laserOnly;

    const updated = await this.prisma.company.update({
      where: { id },
      data: { laserOnly, updatedAt: new Date() },
    });

    return {
      company: this.toSnakeCase(updated),
      previousLaserOnly,
    };
  }

  /**
   * 업체 승인
   */
  async approve(id: number, approvedBy: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company ${id} not found`);
    }

    if (company.isApproved) {
      return { company: this.toSnakeCase(company), alreadyApproved: true };
    }

    const updated = await this.prisma.company.update({
      where: { id },
      data: {
        isApproved: true,
        status: 'active',
        approvedAt: new Date(),
        approvedBy,
        updatedAt: new Date(),
      },
    });
    await this.createAdminCompanyNotification({
      type: 'company_approved',
      title: '업체 승인 완료',
      message: `${updated.companyName} 업체가 승인되었습니다.`,
      companyId: updated.id,
      companyName: updated.companyName,
      metadata: { previousStatus: company.status, approvedBy },
    });
    const driveProvisioning = this.driveProvisioningService
      ? await this.driveProvisioningService.ensureCompanyDriveRoot(id)
      : null;

    return {
      company: this.toSnakeCase(updated),
      previousStatus: company.status,
      alreadyApproved: false,
      driveProvisioning,
    };
  }

  async retryDriveProvisioning(id: number) {
    if (!this.driveProvisioningService) {
      return {
        company_id: id,
        status: 'failed' as const,
        drive_root_folder_id: null,
        error: 'Drive provisioning service is not configured',
      };
    }
    return this.driveProvisioningService.ensureCompanyDriveRoot(id);
  }

  /**
   * username 중복 체크
   */
  async checkDuplicateUsername(username: string, excludeId?: number) {
    const where: Prisma.CompanyWhereInput = { username };
    if (excludeId) {
      where.id = { not: excludeId };
    }
    const existing = await this.prisma.company.findFirst({ where });
    return { exists: !!existing, id: existing?.id || null };
  }

  /**
   * 사업자등록번호 중복 체크
   */
  async checkDuplicateBusinessNumber(brn: string, excludeId?: number) {
    const where: Prisma.CompanyWhereInput = { businessRegistrationNumber: brn };
    if (excludeId) {
      where.id = { not: excludeId };
    }
    const existing = await this.prisma.company.findFirst({ where });
    return { exists: !!existing, id: existing?.id || null };
  }

  /**
   * 업체 수 조회
   */
  async count(where?: Prisma.CompanyWhereInput) {
    return this.prisma.company.count({ where });
  }

  /**
   * 최근 업체 목록 (기간별)
   */
  async findRecent(since: Date, selectFields?: string) {
    const companies = await this.prisma.company.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
    return companies.map((c) => this.toSnakeCase(c));
  }

  /**
   * 업체명 목록 조회 (셀렉트 박스용)
   */
  async findCompanyNames() {
    const companies = await this.prisma.company.findMany({
      select: { id: true, companyName: true },
      where: { status: 'active' },
      orderBy: { companyName: 'asc' },
    });
    return companies.map((c) => ({
      id: c.id,
      company_name: c.companyName,
    }));
  }

  /**
   * password_hash 포함한 인증용 조회
   */
  async findForAuth(username: string) {
    const company = await this.prisma.company.findUnique({
      where: { username },
    });
    if (!company) return null;
    return {
      ...this.toSnakeCase(company),
      password_hash: company.passwordHash,
    };
  }

  /**
   * Prisma camelCase → snake_case 변환 (기존 코드 호환)
   */
  private toSnakeCase(company: {
    id: number;
    companyName: string;
    managerName: string;
    createdAt: Date | null;
    updatedAt: Date | null;
    username: string;
    passwordHash: string;
    businessRegistrationNumber: string;
    representativeName: string;
    businessType: string | null;
    businessCategory: string | null;
    businessAddress: string;
    businessRegistrationFileUrl: string | null;
    businessRegistrationFileName: string | null;
    managerPosition: string;
    managerPhone: string;
    managerEmail: string;
    accountantName: string | null;
    accountantPhone: string | null;
    accountantEmail: string | null;
    accountantFax: string | null;
    quoteMethodEmail: boolean | null;
    quoteMethodFax: boolean | null;
    quoteMethodSms: boolean | null;
    status: string | null;
    webhardAccess: boolean;
    laserOnly: boolean;
    isApproved: boolean;
    approvedAt: Date | null;
    approvedBy: string | null;
    driveRootFolderId?: string | null;
    driveProvisioningStatus?: 'PENDING' | 'READY' | 'FAILED' | null;
    driveProvisioningError?: string | null;
    driveProvisioningLastAttemptAt?: Date | null;
    driveProvisionedAt?: Date | null;
    deletedAt?: Date | null;
    deletedBy?: string | null;
    deletedPreviousStatus?: string | null;
    deletedPreviousWebhardAccess?: boolean | null;
  }) {
    const restoreDeadline = company.deletedAt
      ? this.getCompanyRestoreDeadline(company.deletedAt)
      : null;

    return {
      id: company.id,
      company_name: company.companyName,
      manager_name: company.managerName,
      created_at: company.createdAt?.toISOString() || null,
      updated_at: company.updatedAt?.toISOString() || null,
      username: company.username,
      business_registration_number: company.businessRegistrationNumber,
      representative_name: company.representativeName,
      business_type: company.businessType,
      business_category: company.businessCategory,
      business_address: company.businessAddress,
      business_registration_file_url: company.businessRegistrationFileUrl,
      business_registration_file_name: company.businessRegistrationFileName,
      manager_position: company.managerPosition,
      manager_phone: company.managerPhone,
      manager_email: company.managerEmail,
      accountant_name: company.accountantName,
      accountant_phone: company.accountantPhone,
      accountant_email: company.accountantEmail,
      accountant_fax: company.accountantFax,
      quote_method_email: company.quoteMethodEmail,
      quote_method_fax: company.quoteMethodFax,
      quote_method_sms: company.quoteMethodSms,
      status: company.status,
      webhard_access: company.webhardAccess,
      laser_only: company.laserOnly,
      is_approved: company.isApproved,
      approved_at: company.approvedAt?.toISOString() || null,
      approved_by: company.approvedBy,
      drive_root_folder_id: company.driveRootFolderId ?? null,
      drive_provisioning_status: this.toDriveProvisioningStatus(company.driveProvisioningStatus),
      drive_provisioning_error: company.driveProvisioningError ?? null,
      drive_provisioning_last_attempt_at:
        company.driveProvisioningLastAttemptAt?.toISOString() ?? null,
      drive_provisioned_at: company.driveProvisionedAt?.toISOString() ?? null,
      deleted_at: company.deletedAt?.toISOString() ?? null,
      deleted_by: company.deletedBy ?? null,
      deleted_previous_status: company.deletedPreviousStatus ?? null,
      deleted_previous_webhard_access: company.deletedPreviousWebhardAccess ?? null,
      restore_deadline_at: restoreDeadline?.toISOString() ?? null,
      days_until_permanent_delete: company.deletedAt
        ? this.getCompanyRestoreDaysRemaining(company.deletedAt)
        : null,
    };
  }

  private toDriveProvisioningStatus(status?: 'PENDING' | 'READY' | 'FAILED' | null) {
    if (status === 'READY') return 'ready';
    if (status === 'FAILED') return 'failed';
    return 'pending';
  }
}
