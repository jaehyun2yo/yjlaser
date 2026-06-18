import { Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { StorageProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveStorageProvider } from './google-drive-storage.provider';
import { StorageRepairService } from './storage-repair.service';

interface DriveChangeNotification {
  channelId: string | null;
  resourceId: string | null;
  resourceState: string | null;
  resourceUri: string | null;
  messageNumber: string | null;
  receivedAt: Date;
}

interface ReconciliationInput {
  limit?: number;
  reason?: string;
}

interface ReconciliationSummary {
  checkedFolders: number;
  checkedFiles: number;
  missingFolders: number;
  missingFiles: number;
  quotaBackoffCount: number;
  errors: number;
  queueDepth: number;
  skippedReason: string | null;
}

interface ReconciliationCandidate {
  id: string;
  name: string;
  companyId: number | null;
  path: string | null;
  driveId: string;
}

type HeaderValue = string | string[] | undefined;

const DEFAULT_RECONCILIATION_LIMIT = 25;
const MAX_RECONCILIATION_LIMIT = 100;
const MAX_WEBHOOK_QUEUE_DEPTH = 1000;

@Injectable()
export class StorageReconciliationService {
  private readonly logger = new Logger(StorageReconciliationService.name);
  private readonly pendingChanges: DriveChangeNotification[] = [];
  private isRunning = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Optional() private readonly googleDriveStorageProvider?: GoogleDriveStorageProvider,
    @Optional() private readonly storageRepairService?: StorageRepairService
  ) {}

  async handleDriveChangeWebhook(headers: Record<string, HeaderValue>) {
    const expectedToken = this.configService.get<string>('GOOGLE_DRIVE_WEBHOOK_TOKEN');
    const token = this.getHeader(headers, 'x-goog-channel-token');
    if (!expectedToken || token !== expectedToken) {
      throw new UnauthorizedException('Invalid Drive webhook token');
    }

    const expectedChannelId = this.configService.get<string>('GOOGLE_DRIVE_WEBHOOK_CHANNEL_ID');
    const channelId = this.getHeader(headers, 'x-goog-channel-id');
    if (expectedChannelId && channelId !== expectedChannelId) {
      throw new UnauthorizedException('Invalid Drive webhook channel');
    }

    const notification: DriveChangeNotification = {
      channelId,
      resourceId: this.getHeader(headers, 'x-goog-resource-id'),
      resourceState: this.getHeader(headers, 'x-goog-resource-state'),
      resourceUri: this.getHeader(headers, 'x-goog-resource-uri'),
      messageNumber: this.getHeader(headers, 'x-goog-message-number'),
      receivedAt: new Date(),
    };

    this.enqueue(notification);
    await this.recordDriveChange(notification);

    return {
      accepted: true,
      enqueued: true,
      queueDepth: this.pendingChanges.length,
      resourceState: notification.resourceState,
    };
  }

  @Interval(60_000)
  async runScheduledReconciliation(): Promise<void> {
    if (this.configService.get<string>('GOOGLE_DRIVE_RECONCILIATION_ENABLED') !== 'true') {
      return;
    }

    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const configuredLimit = Number(
        this.configService.get<string>('GOOGLE_DRIVE_RECONCILIATION_LIMIT')
      );
      const limit = Number.isFinite(configuredLimit)
        ? configuredLimit
        : DEFAULT_RECONCILIATION_LIMIT;
      const reason = this.pendingChanges.length > 0 ? 'drive_change_queue' : 'scheduled';
      await this.runReconciliation({ limit, reason });
      this.pendingChanges.splice(0);
    } catch (error) {
      this.logger.warn(
        `Google Drive reconciliation failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      this.isRunning = false;
    }
  }

  async runReconciliation(input?: ReconciliationInput): Promise<ReconciliationSummary> {
    const limit = this.normalizeLimit(input?.limit);
    if (!this.googleDriveStorageProvider) {
      return this.emptySummary('Google Drive storage provider is not configured');
    }

    const [folderCandidates, fileCandidates] = await Promise.all([
      this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFolder.findMany({
            where: {
              storageProvider: StorageProvider.GOOGLE_DRIVE,
              driveFolderId: { not: null },
              deletedAt: null,
            },
            select: { id: true, name: true, companyId: true, path: true, driveFolderId: true },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
            take: limit,
          }),
        { operationName: 'storageReconciliation.folderCandidates' }
      ),
      this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFile.findMany({
            where: {
              storageProvider: StorageProvider.GOOGLE_DRIVE,
              driveFileId: { not: null },
              deletedAt: null,
            },
            select: { id: true, name: true, companyId: true, path: true, driveFileId: true },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
            take: limit,
          }),
        { operationName: 'storageReconciliation.fileCandidates' }
      ),
    ]);

    const summary: ReconciliationSummary = {
      checkedFolders: 0,
      checkedFiles: 0,
      missingFolders: 0,
      missingFiles: 0,
      quotaBackoffCount: 0,
      errors: 0,
      queueDepth: this.pendingChanges.length,
      skippedReason: null,
    };

    for (const folder of folderCandidates) {
      const result = await this.verifyDriveCandidate(
        'folder',
        {
          id: folder.id,
          name: folder.name,
          companyId: folder.companyId,
          path: folder.path,
          driveId: folder.driveFolderId as string,
        },
        input?.reason ?? 'scheduled'
      );
      summary.checkedFolders += 1;
      if (result === 'missing') summary.missingFolders += 1;
      if (result === 'quota_backoff') summary.quotaBackoffCount += 1;
      if (result === 'error') summary.errors += 1;
    }

    for (const file of fileCandidates) {
      const result = await this.verifyDriveCandidate(
        'file',
        {
          id: file.id,
          name: file.name,
          companyId: file.companyId,
          path: file.path,
          driveId: file.driveFileId as string,
        },
        input?.reason ?? 'scheduled'
      );
      summary.checkedFiles += 1;
      if (result === 'missing') summary.missingFiles += 1;
      if (result === 'quota_backoff') summary.quotaBackoffCount += 1;
      if (result === 'error') summary.errors += 1;
    }

    return summary;
  }

  private async verifyDriveCandidate(
    resourceType: 'folder' | 'file',
    candidate: ReconciliationCandidate,
    reason: string
  ): Promise<'ok' | 'missing' | 'quota_backoff' | 'error'> {
    try {
      await this.googleDriveStorageProvider?.getItemMetadata(candidate.driveId);
      return 'ok';
    } catch (error) {
      const status = this.getHttpStatus(error);
      if (status === 404) {
        await this.recordDriveMismatch(resourceType, candidate, 'drive_api_404', status, reason);
        return 'missing';
      }

      if (status === 403 || status === 429) {
        await this.recordDriveMismatch(
          resourceType,
          candidate,
          'drive_quota_or_backoff',
          status,
          reason
        );
        return 'quota_backoff';
      }

      await this.recordDriveMismatch(resourceType, candidate, 'drive_api_error', status, reason);
      return 'error';
    }
  }

  private async recordDriveMismatch(
    resourceType: 'folder' | 'file',
    candidate: ReconciliationCandidate,
    repairReason: string,
    status: number | null,
    reconciliationReason: string
  ): Promise<void> {
    if (!this.storageRepairService) return;

    await this.storageRepairService.recordDriveDbMismatch({
      operation: 'reconciliation',
      storageProvider: 'google_drive',
      resourceType,
      resourceId: candidate.id,
      driveFileId: resourceType === 'file' ? candidate.driveId : undefined,
      driveFolderId: resourceType === 'folder' ? candidate.driveId : undefined,
      webhardFileId: resourceType === 'file' ? candidate.id : undefined,
      webhardFolderId: resourceType === 'folder' ? candidate.id : undefined,
      reason: repairReason,
      detectedAt: new Date(),
      expectedDbState: {
        existsInDrive: true,
        name: candidate.name,
        companyId: candidate.companyId,
        path: candidate.path,
        reconciliationReason,
      },
      actualDriveState: { missing: status === 404, status },
    });
  }

  private async recordDriveChange(notification: DriveChangeNotification): Promise<void> {
    if (!this.storageRepairService) return;

    await this.storageRepairService.recordDriveDbMismatch({
      operation: 'drive_change',
      storageProvider: 'google_drive',
      resourceType: 'drive_change',
      resourceId: notification.resourceId ?? notification.channelId ?? undefined,
      reason: `drive_change_${notification.resourceState ?? 'unknown'}`,
      detectedAt: notification.receivedAt,
      expectedDbState: {
        queuedForReconciliation: true,
        channelId: notification.channelId,
      },
      actualDriveState: {
        resourceId: notification.resourceId,
        resourceState: notification.resourceState,
        messageNumber: notification.messageNumber,
      },
    });
  }

  private enqueue(notification: DriveChangeNotification): void {
    this.pendingChanges.push(notification);
    if (this.pendingChanges.length > MAX_WEBHOOK_QUEUE_DEPTH) {
      this.pendingChanges.shift();
    }
  }

  private normalizeLimit(limit: number | undefined): number {
    if (!Number.isFinite(limit)) return DEFAULT_RECONCILIATION_LIMIT;
    return Math.max(1, Math.min(limit as number, MAX_RECONCILIATION_LIMIT));
  }

  private emptySummary(skippedReason: string): ReconciliationSummary {
    return {
      checkedFolders: 0,
      checkedFiles: 0,
      missingFolders: 0,
      missingFiles: 0,
      quotaBackoffCount: 0,
      errors: 0,
      queueDepth: this.pendingChanges.length,
      skippedReason,
    };
  }

  private getHeader(headers: Record<string, HeaderValue>, name: string): string | null {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }

  private getHttpStatus(error: unknown): number | null {
    if (typeof error !== 'object' || error === null) return null;
    const candidate = error as { code?: unknown; response?: { status?: unknown } };
    const status = Number(candidate.code ?? candidate.response?.status);
    return Number.isFinite(status) ? status : null;
  }
}
