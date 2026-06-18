import { Injectable, Logger } from '@nestjs/common';
import { DriveProvisioningStatus, StorageProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageRepairService } from '../storage/storage-repair.service';
import { StorageService } from '../storage/storage.service';
import { FolderTemplateNode } from './dto/folder.dto';
import { DriveProvisioningResultDto } from './dto/drive-provisioning.dto';
import { FolderTemplateService } from './folder-template.service';

@Injectable()
export class DriveProvisioningService {
  private readonly logger = new Logger(DriveProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly storageRepairService: StorageRepairService,
    private readonly folderTemplateService: FolderTemplateService
  ) {}

  async ensureCompanyDriveRoot(companyId: number): Promise<DriveProvisioningResultDto> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return {
        company_id: companyId,
        status: 'failed',
        drive_root_folder_id: null,
        error: 'Company not found',
      };
    }

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        driveProvisioningStatus: DriveProvisioningStatus.PENDING,
        driveProvisioningError: null,
        driveProvisioningLastAttemptAt: new Date(),
      },
    });

    try {
      const rootFolder = await this.ensureFolderRow({
        companyId,
        name: company.companyName,
        parentId: null,
        parentDriveFolderId: null,
        folderKind: 'generic',
      });
      const template = await this.folderTemplateService.getFolderTemplate();
      await this.ensureTemplateFolders(
        companyId,
        rootFolder.id,
        rootFolder.driveFolderId,
        template
      );

      const updated = await this.prisma.company.update({
        where: { id: companyId },
        data: {
          driveRootFolderId: rootFolder.driveFolderId,
          driveProvisioningStatus: DriveProvisioningStatus.READY,
          driveProvisioningError: null,
          driveProvisionedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return {
        company_id: updated.id,
        status: 'ready',
        drive_root_folder_id: updated.driveRootFolderId,
        error: null,
      };
    } catch (error) {
      const safeMessage = this.sanitizeProvisioningError(error);
      this.logger.warn(`Drive provisioning failed: companyId=${companyId} error=${safeMessage}`);
      await this.prisma.company.update({
        where: { id: companyId },
        data: {
          driveProvisioningStatus: DriveProvisioningStatus.FAILED,
          driveProvisioningError: safeMessage,
          updatedAt: new Date(),
        },
      });
      return {
        company_id: companyId,
        status: 'failed',
        drive_root_folder_id: null,
        error: safeMessage,
      };
    }
  }

  private async ensureTemplateFolders(
    companyId: number,
    parentId: string,
    parentDriveFolderId: string,
    nodes: FolderTemplateNode[]
  ): Promise<void> {
    for (const node of nodes) {
      const folder = await this.ensureFolderRow({
        companyId,
        name: node.name,
        parentId,
        parentDriveFolderId,
        folderKind: 'template',
      });
      if (node.children?.length) {
        await this.ensureTemplateFolders(companyId, folder.id, folder.driveFolderId, node.children);
      }
    }
  }

  private async ensureFolderRow(input: {
    companyId: number;
    name: string;
    parentId: string | null;
    parentDriveFolderId: string | null;
    folderKind: string;
  }): Promise<{ id: string; driveFolderId: string }> {
    const existing = await this.prisma.webhardFolder.findFirst({
      where: {
        name: input.name,
        parentId: input.parentId,
        companyId: input.companyId,
        deletedAt: null,
      },
      select: { id: true, driveFolderId: true },
    });

    if (existing?.driveFolderId) {
      await this.ensureDriveFolderCreated({
        folderId: existing.id,
        name: input.name,
        parentDriveFolderId: input.parentDriveFolderId,
        driveFolderId: existing.driveFolderId,
      });
      return { id: existing.id, driveFolderId: existing.driveFolderId };
    }

    const [reservedDriveFolderId] = await this.storageService.generateDriveIds(1);

    if (existing) {
      const updated = await this.prisma.webhardFolder.update({
        where: { id: existing.id },
        data: {
          storageProvider: StorageProvider.GOOGLE_DRIVE,
          driveFolderId: reservedDriveFolderId,
          folderKind: input.folderKind,
        },
        select: { id: true, driveFolderId: true },
      });
      await this.ensureDriveFolderCreated({
        folderId: updated.id,
        name: input.name,
        parentDriveFolderId: input.parentDriveFolderId,
        driveFolderId: reservedDriveFolderId,
      });
      return { id: updated.id, driveFolderId: updated.driveFolderId as string };
    }

    const path = await this.computePath(input.parentId, input.name);
    const created = await this.prisma.webhardFolder.create({
      data: {
        name: input.name,
        parentId: input.parentId,
        companyId: input.companyId,
        path,
        folderKind: input.folderKind,
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFolderId: reservedDriveFolderId,
      },
      select: { id: true, driveFolderId: true },
    });
    await this.ensureDriveFolderCreated({
      folderId: created.id,
      name: input.name,
      parentDriveFolderId: input.parentDriveFolderId,
      driveFolderId: reservedDriveFolderId,
    });
    return { id: created.id, driveFolderId: created.driveFolderId as string };
  }

  private async ensureDriveFolderCreated(input: {
    folderId: string;
    name: string;
    parentDriveFolderId: string | null;
    driveFolderId: string;
  }): Promise<void> {
    try {
      await this.storageService.createDriveFolder({
        name: input.name,
        parentStorageFolderId: input.parentDriveFolderId,
        storageFolderId: input.driveFolderId,
      });
    } catch (error) {
      await this.storageRepairService.recordDriveDbMismatch({
        operation: 'folder_provision',
        storageProvider: 'google_drive',
        driveFolderId: input.driveFolderId,
        webhardFolderId: input.folderId,
        expectedDbState: { driveFolderId: input.driveFolderId },
        actualDriveState: { createFailed: true },
      });
      throw error;
    }
  }

  private async computePath(parentId: string | null, name: string): Promise<string> {
    if (!parentId) return `/${name}`;
    const parent = await this.prisma.webhardFolder.findUnique({
      where: { id: parentId },
      select: { path: true, name: true },
    });
    return parent?.path ? `${parent.path}/${name}` : `/${parent?.name ?? ''}/${name}`;
  }

  private sanitizeProvisioningError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message
      .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
      .replace(/"private_key"\s*:\s*"[^"]+"/g, '"private_key":"[redacted]"')
      .replace(/https:\/\/www\.googleapis\.com\/upload\/[^\s"]+/g, '[redacted-upload-url]')
      .slice(0, 500);
  }
}
