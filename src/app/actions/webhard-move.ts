'use server';

/**
 * 웹하드 파일/폴더 이동 Server Actions
 * - 배치 파일 이동: NestJS API 경유
 * - 폴더 이동: NestJS API 경유
 *
 * NestJS API 경유 (Prisma ORM)
 */

import { chunkArray } from '@/lib/utils/chunk';
import { logActivity, type ActivityAction } from '@/lib/activity-logger';
import { logger } from '@/lib/utils/logger';
import { getSessionUser as getAuthSessionUser } from '@/lib/auth/session';
import { serverBatchMoveFiles, serverMoveFolder } from '@/lib/api/nestjs-server-client';

const moveLogger = logger.createLogger('WEBHARD_MOVE');

// NestJS batch/move는 100개 제한이므로 청크 크기 조절
const CHUNK_SIZE = 100;

// ============ 타입 정의 ============

interface MoveResult {
  success: boolean;
  filesMoved?: number;
  error?: string;
}

interface FolderMoveResult {
  success: boolean;
  folderId?: string;
  newParentId?: string | null;
  error?: string;
}

interface SessionUser {
  id: string | number;
  role: 'admin' | 'company';
  companyId: number | null;
}

// ============ 내부 유틸리티 ============

async function getSessionUser(): Promise<SessionUser | null> {
  const authUser = await getAuthSessionUser();
  if (!authUser) return null;

  return {
    id: authUser.userId,
    role: authUser.userType,
    // company인 경우 userId가 companyId
    companyId: authUser.userType === 'company' ? Number(authUser.userId) : null,
  };
}

// ============ 파일 배치 이동 ============

/**
 * 여러 파일을 한 번에 다른 폴더로 이동
 * @param fileIds 이동할 파일 ID 배열
 * @param targetFolderId 대상 폴더 ID (null이면 루트)
 * @returns 이동 결과
 */
export async function batchMoveFiles(
  fileIds: string[],
  targetFolderId: string | null
): Promise<MoveResult> {
  'use server';

  const startTime = Date.now();

  try {
    // 세션 검증
    const user = await getSessionUser();
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // 빈 배열 검증
    if (!fileIds || fileIds.length === 0) {
      return { success: true, filesMoved: 0 };
    }

    // 청크 분할 처리 (NestJS batch/move는 100개 제한)
    const chunks = chunkArray(fileIds, CHUNK_SIZE);
    let totalMoved = 0;

    for (const chunk of chunks) {
      const result = await serverBatchMoveFiles(chunk, targetFolderId);

      if (!result.success) {
        moveLogger.error('NestJS batch move failed', { error: result.error });
        return { success: false, error: result.error };
      }

      totalMoved += result.filesMoved || 0;
    }

    const elapsed = Date.now() - startTime;

    // 활동 로그는 사용자 응답을 막지 않는다.
    void logActivity({
      actorType: user.role === 'admin' ? 'admin' : 'company',
      actorId: String(user.id),
      actorName: String(user.id),
      action: 'MOVE' as ActivityAction,
      resourceType: 'file',
      resourceId: 'batch',
      details: {
        fileCount: totalMoved,
        targetFolderId,
        companyId: user.companyId,
      },
    }).catch((error) => {
      moveLogger.warn('Batch move activity log failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    moveLogger.info('Batch move completed', {
      filesMoved: totalMoved,
      chunks: chunks.length,
      elapsed: `${elapsed}ms`,
    });

    return { success: true, filesMoved: totalMoved };
  } catch (error) {
    moveLogger.error('batchMoveFiles failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============ 폴더 이동 ============

/**
 * 폴더를 다른 폴더로 이동 (순환 참조 방지)
 * @param folderId 이동할 폴더 ID
 * @param targetFolderId 대상 폴더 ID (null이면 루트)
 * @returns 이동 결과
 */
export async function moveFolder(
  folderId: string,
  targetFolderId: string | null
): Promise<FolderMoveResult> {
  'use server';

  const startTime = Date.now();

  try {
    // 세션 검증
    const user = await getSessionUser();
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // 폴더 ID 검증
    if (!folderId) {
      return { success: false, error: 'Folder ID is required' };
    }

    const result = await serverMoveFolder(folderId, targetFolderId);

    if (!result.success) {
      moveLogger.error('NestJS folder move failed', { error: result.error });
      return { success: false, error: result.error };
    }

    const elapsed = Date.now() - startTime;

    // 활동 로그는 사용자 응답을 막지 않는다.
    void logActivity({
      actorType: user.role === 'admin' ? 'admin' : 'company',
      actorId: String(user.id),
      actorName: String(user.id),
      action: 'MOVE' as ActivityAction,
      resourceType: 'folder',
      resourceId: folderId,
      details: {
        newParentId: targetFolderId,
        companyId: user.companyId,
      },
    }).catch((error) => {
      moveLogger.warn('Folder move activity log failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    moveLogger.info('Folder move completed', {
      folderId,
      targetFolderId,
      elapsed: `${elapsed}ms`,
    });

    return {
      success: true,
      folderId: result.folderId,
      newParentId: result.newParentId,
    };
  } catch (error) {
    moveLogger.error('moveFolder failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
