import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 동기화 상태 upsert (기존 RPC: update_sync_state)
   */
  async updateSyncState(data: {
    companyId: number;
    lastSyncAt?: string;
    lastSyncHash?: string;
    filesSynced?: number;
    foldersSynced?: number;
    syncType?: string;
    syncStatus?: string;
    errorMessage?: string;
  }) {
    const result = await this.prisma.webhardSyncState.upsert({
      where: { companyId: data.companyId },
      create: {
        companyId: data.companyId,
        lastSyncAt: data.lastSyncAt ? new Date(data.lastSyncAt) : new Date(),
        lastSyncHash: data.lastSyncHash || null,
        filesSynced: data.filesSynced || 0,
        foldersSynced: data.foldersSynced || 0,
        syncType: data.syncType || 'full',
        syncStatus: data.syncStatus || 'completed',
        errorMessage: data.errorMessage || null,
      },
      update: {
        lastSyncAt: data.lastSyncAt ? new Date(data.lastSyncAt) : new Date(),
        lastSyncHash: data.lastSyncHash || undefined,
        filesSynced: data.filesSynced ?? undefined,
        foldersSynced: data.foldersSynced ?? undefined,
        syncType: data.syncType || undefined,
        syncStatus: data.syncStatus || undefined,
        errorMessage: data.errorMessage !== undefined ? data.errorMessage : undefined,
        updatedAt: new Date(),
      },
    });

    return {
      id: result.id,
      company_id: result.companyId,
      last_sync_at: result.lastSyncAt?.toISOString() || null,
      sync_status: result.syncStatus,
    };
  }

  /**
   * 동기화 상태 조회
   */
  async getSyncState(companyId: number) {
    const state = await this.prisma.webhardSyncState.findUnique({
      where: { companyId },
    });

    if (!state) return null;

    return {
      id: state.id,
      company_id: state.companyId,
      last_sync_at: state.lastSyncAt?.toISOString() || null,
      last_sync_hash: state.lastSyncHash,
      files_synced: state.filesSynced,
      folders_synced: state.foldersSynced,
      sync_type: state.syncType,
      sync_status: state.syncStatus,
      error_message: state.errorMessage,
    };
  }
}
