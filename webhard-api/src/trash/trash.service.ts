import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { StorageProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageRepairService } from '../storage/storage-repair.service';
import { StorageService } from '../storage/storage.service';
import { SessionUser } from '../auth/auth.service';
import {
  PERMANENT_DELETE_CONFIRMATION,
  TrashFileDto,
  TrashListResponseDto,
  GetTrashQueryDto,
  PermanentDeleteApprovalDto,
} from './dto/trash.dto';

type WebhardFileRecord = {
  id: string;
  name: string;
  originalName: string;
  size: bigint;
  mimeType: string;
  path: string;
  storageProvider: StorageProvider;
  driveFileId: string | null;
  folderId: string | null;
  companyId: number | null;
  uploadedBy: string;
  isDownloaded: boolean;
  createdAt: Date;
  deletedAt: Date | null;
  deletedBy: string | null;
};

const TRASH_RETENTION_DAYS = 30;

@Injectable()
export class TrashService {
  private readonly logger = new Logger(TrashService.name);

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    @Optional() private storageRepairService?: StorageRepairService
  ) {}

  /**
   * Get trash files list
   */
  async getTrashFiles(query: GetTrashQueryDto, user: SessionUser): Promise<TrashListResponseDto> {
    const { companyId, page = 1, limit = 50 } = query;

    // Build where clause
    const where: Record<string, unknown> = {
      deletedAt: { not: null },
    };

    // Company access control
    if (user.userType === 'company') {
      where.companyId = user.companyId;
    } else if (companyId !== undefined) {
      where.companyId = companyId;
    }

    // executeWithRetry로 감싸서 08P01 에러 시 자동 재시도
    const [total, files] = await this.prisma.executeWithRetry(
      () =>
        Promise.all([
          this.prisma.webhardFile.count({ where }),
          this.prisma.webhardFile.findMany({
            where,
            include: {
              company: {
                select: {
                  companyName: true,
                },
              },
              folder: {
                select: {
                  path: true,
                },
              },
            },
            orderBy: { deletedAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
        ]),
      { operationName: 'getTrashFiles' }
    );

    return {
      files: files.map(
        (file: {
          id: string;
          name: string;
          originalName: string;
          size: bigint;
          mimeType: string;
          path: string;
          folderId: string | null;
          companyId: number | null;
          uploadedBy: string;
          isDownloaded: boolean;
          createdAt: Date;
          deletedAt: Date | null;
          deletedBy: string | null;
          company?: { companyName: string } | null;
          folder?: { path: string | null } | null;
        }) => this.mapToTrashDto(file)
      ),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  /**
   * Get trash count
   */
  async getTrashCount(user: SessionUser): Promise<{ count: number }> {
    const where: Record<string, unknown> = {
      deletedAt: { not: null },
    };

    if (user.userType === 'company') {
      where.companyId = user.companyId;
    }

    const count = await this.prisma.executeWithRetry<number>(
      () => this.prisma.webhardFile.count({ where }),
      { operationName: 'getTrashCount' }
    );
    return { count };
  }

  /**
   * Restore file from trash
   */
  async restoreFile(fileId: string, user: SessionUser): Promise<void> {
    const file = await this.prisma.executeWithRetry<WebhardFileRecord | null>(
      () => this.prisma.webhardFile.findUnique({ where: { id: fileId } }),
      { operationName: 'restoreFile.findUnique' }
    );

    if (!file || !file.deletedAt) {
      throw new NotFoundException('File not found in trash');
    }

    this.verifyFileAccess(file, user);

    if (file.storageProvider === StorageProvider.GOOGLE_DRIVE) {
      if (!file.driveFileId) {
        throw new NotFoundException('Drive file not found');
      }
      await this.storageService.restoreDriveFile({ storageFileId: file.driveFileId });
    }

    try {
      await this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFile.update({
            where: { id: fileId },
            data: {
              deletedAt: null,
              deletedBy: null,
            },
          }),
        { operationName: 'restoreFile.update' }
      );
    } catch (error) {
      if (file.storageProvider === StorageProvider.GOOGLE_DRIVE && file.driveFileId) {
        await this.storageRepairService?.recordDriveDbMismatch({
          operation: 'restore',
          storageProvider: 'google_drive',
          driveFileId: file.driveFileId,
          webhardFileId: file.id,
          expectedDbState: { deletedAt: null, deletedBy: null },
          actualDriveState: { restored: true, dbUpdateFailed: true },
        });
      }
      throw error;
    }
  }

  /**
   * Permanently delete a file
   */
  async permanentlyDeleteFile(
    fileId: string,
    user: SessionUser,
    approval?: PermanentDeleteApprovalDto | null
  ): Promise<void> {
    const startTime = Date.now();
    this.assertPermanentDeleteApproval(approval);

    const file = await this.prisma.executeWithRetry<WebhardFileRecord | null>(
      () => this.prisma.webhardFile.findUnique({ where: { id: fileId } }),
      { operationName: 'permanentlyDeleteFile.findUnique' }
    );

    if (!file || !file.deletedAt) {
      throw new NotFoundException('File not found in trash');
    }

    this.verifyFileAccess(file, user);

    let storageDeleted = false;
    try {
      await this.deleteFileFromStorage(file, true);
      storageDeleted = true;

      // Delete from database
      await this.prisma.executeWithRetry(
        () => this.prisma.webhardFile.delete({ where: { id: fileId } }),
        { operationName: 'permanentlyDeleteFile.delete' }
      );
      this.logger.log(
        `Permanent trash file delete completed: provider=${file.storageProvider}, elapsedMs=${
          Date.now() - startTime
        }`
      );
    } catch (error) {
      if (
        storageDeleted &&
        file.storageProvider === StorageProvider.GOOGLE_DRIVE &&
        file.driveFileId
      ) {
        await this.storageRepairService?.recordDriveDbMismatch({
          operation: 'delete',
          storageProvider: 'google_drive',
          driveFileId: file.driveFileId,
          webhardFileId: file.id,
          expectedDbState: { deleted: true },
          actualDriveState: { deleted: true, dbDeleteFailed: true },
        });
      }
      this.logger.warn(
        `Permanent trash file delete failed: elapsedMs=${Date.now() - startTime}, errorType=${this.getErrorType(
          error
        )}`
      );
      throw error;
    }
  }

  /**
   * Empty trash (delete all files in trash)
   */
  async emptyTrash(
    user: SessionUser,
    approval?: PermanentDeleteApprovalDto | null
  ): Promise<{ deleted: number }> {
    const startTime = Date.now();
    this.assertPermanentDeleteApproval(approval);

    const where: Record<string, unknown> = {
      deletedAt: { not: null },
    };

    if (user.userType === 'company') {
      where.companyId = user.companyId;
    }

    // Get all files to delete
    const files = await this.prisma.executeWithRetry<
      Array<{
        id: string;
        path: string;
        storageProvider: StorageProvider;
        driveFileId: string | null;
      }>
    >(
      () =>
        this.prisma.webhardFile.findMany({
          where,
          select: { id: true, path: true, storageProvider: true, driveFileId: true },
        }),
      { operationName: 'emptyTrash.findMany' }
    );

    if (files.length === 0) {
      return { deleted: 0 };
    }

    await this.deleteFilesFromStorage(files, true);

    // Delete from database
    const result = await this.prisma.executeWithRetry<{ count: number }>(
      () =>
        this.prisma.webhardFile.deleteMany({
          where: { id: { in: files.map((f) => f.id) } },
        }),
      { operationName: 'emptyTrash.deleteMany' }
    );

    this.logger.log(
      `Permanent trash empty completed: requested=${files.length}, deleted=${
        result.count
      }, elapsedMs=${Date.now() - startTime}`
    );

    return { deleted: result.count };
  }

  /**
   * Clean up expired files (files older than retention period)
   * Permanent delete now requires explicit user approval, so scheduled cleanup is disabled.
   */
  async cleanupExpiredFiles(): Promise<{ deleted: number }> {
    this.logger.warn('Expired trash cleanup skipped: permanent_delete_requires_user_approval');
    return { deleted: 0 };
  }

  /**
   * Verify user has access to the file
   */
  private verifyFileAccess(file: { companyId: number | null }, user: SessionUser): void {
    if (user.userType === 'admin') {
      return;
    }

    if (file.companyId !== null && file.companyId !== user.companyId) {
      throw new ForbiddenException('Access denied to this file');
    }
  }

  private async deleteFileFromStorage(
    file: {
      path: string;
      storageProvider: StorageProvider;
      driveFileId: string | null;
    },
    permanentDeleteApproved: boolean
  ): Promise<void> {
    if (!permanentDeleteApproved) {
      throw new BadRequestException('Permanent delete requires explicit approval');
    }

    if (file.storageProvider === StorageProvider.GOOGLE_DRIVE) {
      if (!file.driveFileId) {
        throw new NotFoundException('Drive file not found');
      }
      await this.storageService.deleteDriveFile({
        storageFileId: file.driveFileId,
        permanentDeleteApproved,
      });
      return;
    }

    await this.storageService.deleteFile(file.path);
  }

  private async deleteFilesFromStorage(
    files: Array<{
      path: string;
      storageProvider: StorageProvider;
      driveFileId: string | null;
    }>,
    permanentDeleteApproved: boolean
  ): Promise<void> {
    const driveFiles = files.filter(
      (file) => file.storageProvider === StorageProvider.GOOGLE_DRIVE
    );
    const r2Keys = files
      .filter((file) => file.storageProvider !== StorageProvider.GOOGLE_DRIVE)
      .map((file) => file.path);

    await Promise.all(
      driveFiles.map((file) => this.deleteFileFromStorage(file, permanentDeleteApproved))
    );
    if (r2Keys.length > 0) {
      if (!permanentDeleteApproved) {
        throw new BadRequestException('Permanent delete requires explicit approval');
      }
      await this.storageService.deleteFiles(r2Keys);
    }
  }

  private assertPermanentDeleteApproval(approval?: PermanentDeleteApprovalDto | null): void {
    if (
      approval?.confirmPermanentDelete !== true ||
      approval.confirmationText !== PERMANENT_DELETE_CONFIRMATION
    ) {
      this.logger.warn('Permanent trash delete blocked: reason=missing_or_invalid_approval');
      throw new BadRequestException('Permanent delete requires explicit approval');
    }
  }

  private getErrorType(error: unknown): string {
    return error instanceof Error ? error.constructor.name : typeof error;
  }

  /**
   * Map database model to trash DTO
   */
  private mapToTrashDto(file: {
    id: string;
    name: string;
    originalName: string;
    size: bigint;
    mimeType: string;
    path: string;
    folderId: string | null;
    companyId: number | null;
    uploadedBy: string;
    isDownloaded: boolean;
    createdAt: Date;
    deletedAt: Date | null;
    deletedBy: string | null;
    company?: { companyName: string } | null;
    folder?: { path: string | null } | null;
  }): TrashFileDto {
    const deletedAt = file.deletedAt!;
    const daysUntilDelete = Math.max(
      0,
      TRASH_RETENTION_DAYS - Math.floor((Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24))
    );

    return {
      id: file.id,
      name: file.name,
      original_name: file.originalName,
      size: Number(file.size),
      mime_type: file.mimeType,
      path: file.path,
      folder_id: file.folderId,
      company_id: file.companyId,
      uploaded_by: String(file.uploadedBy),
      is_downloaded: file.isDownloaded,
      created_at: file.createdAt.toISOString(),
      deleted_at: deletedAt.toISOString(),
      deleted_by: file.deletedBy ? Number(file.deletedBy) : null,
      days_until_delete: daysUntilDelete,
      folder_path: file.folder?.path ?? undefined,
      companies: file.company
        ? {
            company_name: file.company.companyName,
          }
        : null,
    };
  }
}
