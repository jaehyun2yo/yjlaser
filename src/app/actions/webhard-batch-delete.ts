'use server';

/**
 * 웹하드 배치 삭제 Server Actions
 *
 * NestJS API 경유 (Prisma ORM)
 *
 * 성능 최적화:
 * - 100개씩 청크 처리 (NestJS batch API 제한)
 * - NestJS가 R2 삭제 포함 처리
 */

import { headers } from 'next/headers';
import { getSessionUser } from '@/lib/auth/session';
import { logger } from '@/lib/utils/logger';
import { logActivity } from '@/lib/activity-logger';
import { chunkArray } from '@/lib/utils/chunk';
import { PERMANENT_DELETE_APPROVAL } from '@/lib/api/permanent-delete-approval';
import {
  serverBatchDeleteFiles,
  serverBatchDeleteFolders,
  serverEmptyTrash,
  serverGetTrashCount,
} from '@/lib/api/nestjs-server-client';

const deleteLogger = logger.createLogger('WEBHARD_BATCH_DELETE');

// NestJS batch API는 100개 제한
const CHUNK_SIZE = 100;

// ============ 타입 정의 ============

export interface BatchDeleteResult {
  success: boolean;
  filesDeleted: number;
  foldersDeleted: number;
  storageDeleted: number;
  storageFailed: number;
  durationMs: number;
  errors?: string[];
  code?: string;
  companyId?: number;
  companyName?: string;
  folderName?: string;
  redirectTo?: string;
}

// ============ Soft Delete (휴지통 이동) ============

/**
 * 다중 파일 배치 Soft Delete (휴지통으로 이동)
 * 청크 처리로 대용량 파일도 빠르게 처리
 */
export async function batchSoftDeleteFiles(fileIds: string[]): Promise<BatchDeleteResult> {
  'use server';

  const startTime = Date.now();
  const errors: string[] = [];

  try {
    const user = await getSessionUser();
    if (!user || user.userType !== 'admin') {
      return {
        success: false,
        filesDeleted: 0,
        foldersDeleted: 0,
        storageDeleted: 0,
        storageFailed: 0,
        durationMs: Date.now() - startTime,
        errors: ['Unauthorized: Admin only'],
      };
    }

    if (!fileIds || fileIds.length === 0) {
      return {
        success: false,
        filesDeleted: 0,
        foldersDeleted: 0,
        storageDeleted: 0,
        storageFailed: 0,
        durationMs: Date.now() - startTime,
        errors: ['No file IDs provided'],
      };
    }

    // 청크로 나눠서 처리
    const chunks = chunkArray(fileIds, CHUNK_SIZE);
    let totalDeleted = 0;

    for (const chunk of chunks) {
      const result = await serverBatchDeleteFiles(chunk);

      if (!result.success) {
        errors.push(`Chunk error: ${result.error}`);
        deleteLogger.error('Chunk soft delete failed', { error: result.error });
      } else {
        totalDeleted += result.deleted;
      }
    }

    const durationMs = Date.now() - startTime;
    const headersList = await headers();
    const ipAddress = headersList.get('x-forwarded-for') || 'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    // 활동 로그는 사용자 응답을 막지 않는다.
    void logActivity({
      actorType: 'admin',
      actorId: String(user.userId),
      actorName: 'Admin',
      action: 'BATCH_DELETE',
      resourceType: 'file',
      resourceId: 'batch',
      details: {
        fileCount: fileIds.length,
        totalDeleted,
        durationMs,
      },
      ipAddress,
      userAgent,
    }).catch((error) => {
      deleteLogger.warn('Batch file delete activity log failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    deleteLogger.info('Batch soft delete files completed', {
      requested: fileIds.length,
      deleted: totalDeleted,
      durationMs,
    });

    return {
      success: errors.length === 0,
      filesDeleted: totalDeleted,
      foldersDeleted: 0,
      storageDeleted: 0,
      storageFailed: 0,
      durationMs,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    deleteLogger.error('batchSoftDeleteFiles exception', error);
    return {
      success: false,
      filesDeleted: 0,
      foldersDeleted: 0,
      storageDeleted: 0,
      storageFailed: 0,
      durationMs: Date.now() - startTime,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

/**
 * 다중 폴더 배치 Soft Delete (하위 폴더/파일 포함)
 */
export async function batchSoftDeleteFolders(folderIds: string[]): Promise<BatchDeleteResult> {
  'use server';

  const startTime = Date.now();
  const errors: string[] = [];

  try {
    const user = await getSessionUser();
    if (!user || user.userType !== 'admin') {
      return {
        success: false,
        filesDeleted: 0,
        foldersDeleted: 0,
        storageDeleted: 0,
        storageFailed: 0,
        durationMs: Date.now() - startTime,
        errors: ['Unauthorized: Admin only'],
      };
    }

    if (!folderIds || folderIds.length === 0) {
      return {
        success: false,
        filesDeleted: 0,
        foldersDeleted: 0,
        storageDeleted: 0,
        storageFailed: 0,
        durationMs: Date.now() - startTime,
        errors: ['No folder IDs provided'],
      };
    }

    const result = await serverBatchDeleteFolders(folderIds);

    if (!result.success) {
      errors.push(result.error || 'Delete failed');
    }

    const durationMs = Date.now() - startTime;
    const headersList = await headers();
    const ipAddress = headersList.get('x-forwarded-for') || 'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    // 활동 로그는 사용자 응답을 막지 않는다.
    void logActivity({
      actorType: 'admin',
      actorId: String(user.userId),
      actorName: 'Admin',
      action: 'BATCH_DELETE',
      resourceType: 'folder',
      resourceId: 'batch',
      details: {
        rootFolderIds: folderIds,
        rootFolderCount: folderIds.length,
        totalFoldersDeleted: result.foldersDeleted,
        totalFilesDeleted: result.filesDeleted,
        durationMs,
      },
      ipAddress,
      userAgent,
    }).catch((error) => {
      deleteLogger.warn('Batch folder delete activity log failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    deleteLogger.info('Batch soft delete folders completed', {
      requested: folderIds.length,
      foldersDeleted: result.foldersDeleted,
      filesDeleted: result.filesDeleted,
      durationMs,
    });

    return {
      success: result.success,
      filesDeleted: result.filesDeleted,
      foldersDeleted: result.foldersDeleted,
      storageDeleted: 0,
      storageFailed: 0,
      durationMs,
      errors: errors.length > 0 ? errors : undefined,
      code: result.code,
      companyId: result.companyId,
      companyName: result.companyName,
      folderName: result.folderName,
      redirectTo: result.redirectTo,
    };
  } catch (error) {
    deleteLogger.error('batchSoftDeleteFolders exception', error);
    return {
      success: false,
      filesDeleted: 0,
      foldersDeleted: 0,
      storageDeleted: 0,
      storageFailed: 0,
      durationMs: Date.now() - startTime,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

// ============ Hard Delete (영구 삭제) ============

/**
 * 다중 파일 영구 삭제
 * NestJS trash API의 permanentlyDeleteFile을 활용
 * Note: NestJS trash service가 R2 삭제도 처리
 */
export async function batchPermanentDeleteFiles(fileIds: string[]): Promise<BatchDeleteResult> {
  'use server';

  const startTime = Date.now();
  const errors: string[] = [];

  try {
    const user = await getSessionUser();
    if (!user || user.userType !== 'admin') {
      return {
        success: false,
        filesDeleted: 0,
        foldersDeleted: 0,
        storageDeleted: 0,
        storageFailed: 0,
        durationMs: Date.now() - startTime,
        errors: ['Unauthorized: Admin only'],
      };
    }

    if (!fileIds || fileIds.length === 0) {
      return {
        success: false,
        filesDeleted: 0,
        foldersDeleted: 0,
        storageDeleted: 0,
        storageFailed: 0,
        durationMs: Date.now() - startTime,
        errors: ['No file IDs provided'],
      };
    }

    // NestJS trash API로 개별 영구 삭제
    const { nestjsFetch } = await import('@/lib/api/nestjs-server-client');
    let totalDeleted = 0;

    for (const fileId of fileIds) {
      const response = await nestjsFetch<{ success: boolean }>(`/trash/${fileId}`, {
        method: 'DELETE',
        body: PERMANENT_DELETE_APPROVAL,
      });

      if (response.ok) {
        totalDeleted++;
      } else {
        errors.push(`Failed to delete file ${fileId}`);
      }
    }

    // 활동 로그
    const headersList = await headers();
    await logActivity({
      actorType: 'admin',
      actorId: String(user.userId),
      actorName: 'Admin',
      action: 'PERMANENT_DELETE',
      resourceType: 'file',
      resourceId: 'batch',
      details: {
        fileCount: fileIds.length,
        filesDeleted: totalDeleted,
        durationMs: Date.now() - startTime,
      },
      ipAddress: headersList.get('x-forwarded-for') || 'unknown',
      userAgent: headersList.get('user-agent') || 'unknown',
    });

    deleteLogger.info('Batch permanent delete files completed', {
      requested: fileIds.length,
      filesDeleted: totalDeleted,
      durationMs: Date.now() - startTime,
    });

    return {
      success: errors.length === 0,
      filesDeleted: totalDeleted,
      foldersDeleted: 0,
      storageDeleted: totalDeleted,
      storageFailed: errors.length,
      durationMs: Date.now() - startTime,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    deleteLogger.error('batchPermanentDeleteFiles exception', error);
    return {
      success: false,
      filesDeleted: 0,
      foldersDeleted: 0,
      storageDeleted: 0,
      storageFailed: 0,
      durationMs: Date.now() - startTime,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

/**
 * 다중 폴더 영구 삭제 (하위 파일 R2 + DB 삭제)
 * Note: NestJS가 하위 파일/폴더를 포함하여 처리
 */
export async function batchPermanentDeleteFolders(folderIds: string[]): Promise<BatchDeleteResult> {
  'use server';

  const startTime = Date.now();
  const errors: string[] = [];

  try {
    const user = await getSessionUser();
    if (!user || user.userType !== 'admin') {
      return {
        success: false,
        filesDeleted: 0,
        foldersDeleted: 0,
        storageDeleted: 0,
        storageFailed: 0,
        durationMs: Date.now() - startTime,
        errors: ['Unauthorized: Admin only'],
      };
    }

    if (!folderIds || folderIds.length === 0) {
      return {
        success: false,
        filesDeleted: 0,
        foldersDeleted: 0,
        storageDeleted: 0,
        storageFailed: 0,
        durationMs: Date.now() - startTime,
        errors: ['No folder IDs provided'],
      };
    }

    // NestJS folders batch-delete API 사용 (영구 삭제와 동일 엔드포인트)
    const result = await serverBatchDeleteFolders(folderIds);

    if (!result.success) {
      errors.push(result.error || 'Delete failed');
    }

    // 활동 로그
    const headersList = await headers();
    await logActivity({
      actorType: 'admin',
      actorId: String(user.userId),
      actorName: 'Admin',
      action: 'PERMANENT_DELETE',
      resourceType: 'folder',
      resourceId: 'batch',
      details: {
        folderIds,
        foldersDeleted: result.foldersDeleted,
        filesDeleted: result.filesDeleted,
        durationMs: Date.now() - startTime,
      },
      ipAddress: headersList.get('x-forwarded-for') || 'unknown',
      userAgent: headersList.get('user-agent') || 'unknown',
    });

    deleteLogger.info('Batch permanent delete folders completed', {
      requested: folderIds.length,
      foldersDeleted: result.foldersDeleted,
      filesDeleted: result.filesDeleted,
      durationMs: Date.now() - startTime,
    });

    return {
      success: result.success,
      filesDeleted: result.filesDeleted,
      foldersDeleted: result.foldersDeleted,
      storageDeleted: result.filesDeleted,
      storageFailed: 0,
      durationMs: Date.now() - startTime,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    deleteLogger.error('batchPermanentDeleteFolders exception', error);
    return {
      success: false,
      filesDeleted: 0,
      foldersDeleted: 0,
      storageDeleted: 0,
      storageFailed: 0,
      durationMs: Date.now() - startTime,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

// ============ 휴지통 비우기 ============

/**
 * 휴지통 전체 비우기
 * NestJS trash API 사용
 */
export async function emptyTrashBatch(companyId?: number): Promise<BatchDeleteResult> {
  'use server';

  const startTime = Date.now();
  const errors: string[] = [];

  try {
    const user = await getSessionUser();
    if (!user || user.userType !== 'admin') {
      return {
        success: false,
        filesDeleted: 0,
        foldersDeleted: 0,
        storageDeleted: 0,
        storageFailed: 0,
        durationMs: Date.now() - startTime,
        errors: ['Unauthorized: Admin only'],
      };
    }

    const result = await serverEmptyTrash();

    if (!result.success) {
      errors.push(result.error || 'Empty trash failed');
    }

    // 활동 로그
    const headersList = await headers();
    await logActivity({
      actorType: 'admin',
      actorId: String(user.userId),
      actorName: 'Admin',
      action: 'EMPTY_TRASH',
      resourceType: 'trash',
      resourceId: 'batch',
      details: {
        companyId,
        filesDeleted: result.deleted,
        durationMs: Date.now() - startTime,
      },
      ipAddress: headersList.get('x-forwarded-for') || 'unknown',
      userAgent: headersList.get('user-agent') || 'unknown',
    });

    deleteLogger.info('Empty trash batch completed', {
      companyId,
      filesDeleted: result.deleted,
      durationMs: Date.now() - startTime,
    });

    return {
      success: result.success,
      filesDeleted: result.deleted,
      foldersDeleted: 0,
      storageDeleted: result.deleted,
      storageFailed: 0,
      durationMs: Date.now() - startTime,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    deleteLogger.error('emptyTrashBatch exception', error);
    return {
      success: false,
      filesDeleted: 0,
      foldersDeleted: 0,
      storageDeleted: 0,
      storageFailed: 0,
      durationMs: Date.now() - startTime,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

/**
 * 휴지통 파일 개수 조회
 */
export async function getTrashCount(_companyId?: number): Promise<number> {
  'use server';

  try {
    const user = await getSessionUser();
    if (!user) {
      return 0;
    }

    return await serverGetTrashCount();
  } catch (error) {
    deleteLogger.error('getTrashCount exception', error);
    return 0;
  }
}
