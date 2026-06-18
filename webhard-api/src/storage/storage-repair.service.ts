import { Injectable, Logger } from '@nestjs/common';
import { SyncLogService } from '../integration/sync-log/sync-log.service';

export type StorageRepairOperation =
  | 'diagnostic'
  | 'drive_change'
  | 'reconciliation'
  | 'folder_provision'
  | 'folder_create'
  | 'file_create'
  | 'file_move'
  | 'folder_move'
  | 'file_rename'
  | 'folder_rename'
  | 'trash'
  | 'restore'
  | 'delete';

export interface RecordDriveDbMismatchInput {
  operation: StorageRepairOperation;
  storageProvider: 'google_drive';
  driveFileId?: string;
  driveFolderId?: string;
  webhardFileId?: string;
  webhardFolderId?: string;
  resourceType?: 'file' | 'folder' | 'drive_change';
  resourceId?: string;
  reason?: string;
  detectedAt?: Date;
  expectedDbState: Record<string, unknown>;
  actualDriveState: Record<string, unknown>;
}

@Injectable()
export class StorageRepairService {
  private readonly logger = new Logger(StorageRepairService.name);

  constructor(private readonly syncLogService: SyncLogService) {}

  async recordDriveDbMismatch(input: RecordDriveDbMismatchInput): Promise<void> {
    try {
      await this.syncLogService.createStorageRepairEvent(input);
    } catch (error) {
      this.logger.warn(
        `storage repair event write failed: operation=${input.operation}, driveFileId=${
          input.driveFileId ?? 'none'
        }, driveFolderId=${input.driveFolderId ?? 'none'}, error=${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
