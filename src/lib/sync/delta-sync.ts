/**
 * Delta Sync 유틸리티
 * 마지막 동기화 이후 변경된 항목만 가져오는 증분 동기화
 */

import { logger } from '@/lib/utils/logger';
import {
  serverGetFiles,
  serverGetFoldersByCompany,
  serverUpdateSyncState,
  nestjsFetch,
} from '@/lib/api/nestjs-server-client';

const syncLogger = logger.createLogger('DELTA_SYNC');

export interface SyncState {
  companyId: number;
  lastSyncAt: Date | null;
  filesSynced: number;
  foldersSynced: number;
  syncType: 'full' | 'delta';
  syncStatus: 'in_progress' | 'completed' | 'failed';
}

export interface ChangedFile {
  id: string;
  name: string;
  originalName: string;
  size: number;
  mimeType: string;
  path: string;
  folderId: string | null;
  isDownloaded: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  changeType: 'added' | 'updated' | 'deleted';
}

export interface ChangedFolder {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  changeType: 'added' | 'updated' | 'deleted';
}

export interface DeltaSyncResult {
  success: boolean;
  changedFiles: ChangedFile[];
  changedFolders: ChangedFolder[];
  syncType: 'full' | 'delta';
  error?: string;
}

/**
 * 회사의 마지막 동기화 상태 조회
 */
export async function getSyncState(companyId: number): Promise<SyncState | null> {
  try {
    const response = await nestjsFetch<{
      id: string;
      company_id: number;
      last_sync_at: string | null;
      files_synced: number;
      folders_synced: number;
      sync_type: string;
      sync_status: string;
    } | null>(`/sync/state?companyId=${companyId}`, { useApiKey: true });

    if (!response.ok || !response.data) {
      return null;
    }

    const data = response.data;
    return {
      companyId: data.company_id,
      lastSyncAt: data.last_sync_at ? new Date(data.last_sync_at) : null,
      filesSynced: data.files_synced || 0,
      foldersSynced: data.folders_synced || 0,
      syncType: (data.sync_type || 'full') as 'full' | 'delta',
      syncStatus: (data.sync_status || 'completed') as 'in_progress' | 'completed' | 'failed',
    };
  } catch (error) {
    syncLogger.error('Error getting sync state', error);
    return null;
  }
}

/**
 * Delta Sync 실행 - 마지막 동기화 이후 변경 사항만 가져옴
 */
export async function performDeltaSync(companyId: number): Promise<DeltaSyncResult> {
  try {
    // 마지막 동기화 시점 조회
    const syncState = await getSyncState(companyId);
    const lastSyncAt = syncState?.lastSyncAt;

    // 처음 동기화이면 full sync
    if (!lastSyncAt) {
      syncLogger.info('No previous sync, performing full sync', { companyId });
      return await performFullSync(companyId);
    }

    // NestJS API 경유로 변경된 파일 조회
    const filesResponse = await nestjsFetch<Record<string, unknown>[]>(
      `/files/changed-since?companyId=${companyId}&since=${encodeURIComponent(lastSyncAt.toISOString())}`,
      { useApiKey: true }
    );

    if (!filesResponse.ok) {
      syncLogger.error('Error getting changed files');
      throw new Error('Failed to get changed files');
    }
    const changedFilesRaw = filesResponse.data || [];

    // NestJS API 경유로 변경된 폴더 조회
    const foldersResponse = await nestjsFetch<Record<string, unknown>[]>(
      `/folders/changed-since?companyId=${companyId}&since=${encodeURIComponent(lastSyncAt.toISOString())}`,
      { useApiKey: true }
    );

    if (!foldersResponse.ok) {
      syncLogger.error('Error getting changed folders');
      throw new Error('Failed to get changed folders');
    }
    const changedFoldersRaw = foldersResponse.data || [];

    const changedFiles: ChangedFile[] = (changedFilesRaw || []).map(
      (f: Record<string, unknown>) => ({
        id: f.id as string,
        name: f.name as string,
        originalName: f.original_name as string,
        size: f.size as number,
        mimeType: f.mime_type as string,
        path: f.path as string,
        folderId: f.folder_id as string | null,
        isDownloaded: f.is_downloaded as boolean,
        createdAt: new Date(f.created_at as string),
        updatedAt: new Date(f.updated_at as string),
        deletedAt: f.deleted_at ? new Date(f.deleted_at as string) : null,
        changeType: f.change_type as 'added' | 'updated' | 'deleted',
      })
    );

    const changedFolders: ChangedFolder[] = (changedFoldersRaw || []).map(
      (f: Record<string, unknown>) => ({
        id: f.id as string,
        name: f.name as string,
        parentId: f.parent_id as string | null,
        path: f.path as string,
        createdAt: new Date(f.created_at as string),
        updatedAt: new Date(f.updated_at as string),
        deletedAt: f.deleted_at ? new Date(f.deleted_at as string) : null,
        changeType: f.change_type as 'added' | 'updated' | 'deleted',
      })
    );

    // NestJS API 경유로 동기화 상태 업데이트
    await serverUpdateSyncState({
      companyId,
      syncType: 'delta',
      filesSynced: changedFiles.length,
      foldersSynced: changedFolders.length,
      syncStatus: 'completed',
    });

    syncLogger.info('Delta sync completed', {
      companyId,
      changedFiles: changedFiles.length,
      changedFolders: changedFolders.length,
    });

    return {
      success: true,
      changedFiles,
      changedFolders,
      syncType: 'delta',
    };
  } catch (error) {
    syncLogger.error('Delta sync failed', error);
    return {
      success: false,
      changedFiles: [],
      changedFolders: [],
      syncType: 'delta',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Full Sync 실행 - 모든 파일과 폴더를 가져옴
 * NestJS API 경유 (Prisma ORM)
 */
export async function performFullSync(companyId: number): Promise<DeltaSyncResult> {
  try {
    // NestJS API에서 모든 파일 조회
    const filesRaw = await serverGetFiles(companyId);

    // NestJS API에서 모든 폴더 조회
    const foldersRaw = await serverGetFoldersByCompany(companyId);

    const changedFiles: ChangedFile[] = filesRaw.map((f) => ({
      id: f.id,
      name: f.name,
      originalName: f.original_name,
      size: f.size,
      mimeType: f.mime_type,
      path: f.path,
      folderId: f.folder_id,
      isDownloaded: f.is_downloaded,
      createdAt: new Date(f.created_at),
      updatedAt: new Date(f.updated_at),
      deletedAt: null,
      changeType: 'added' as const,
    }));

    const changedFolders: ChangedFolder[] = foldersRaw.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parent_id,
      path: '',
      createdAt: new Date(f.created_at),
      updatedAt: new Date(f.created_at),
      deletedAt: null,
      changeType: 'added' as const,
    }));

    // NestJS API 경유로 동기화 상태 업데이트
    await serverUpdateSyncState({
      companyId,
      syncType: 'full',
      filesSynced: changedFiles.length,
      foldersSynced: changedFolders.length,
      syncStatus: 'completed',
    });

    syncLogger.info('Full sync completed', {
      companyId,
      files: changedFiles.length,
      folders: changedFolders.length,
    });

    return {
      success: true,
      changedFiles,
      changedFolders,
      syncType: 'full',
    };
  } catch (error) {
    syncLogger.error('Full sync failed', error);
    return {
      success: false,
      changedFiles: [],
      changedFolders: [],
      syncType: 'full',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
