import { logger } from '@/lib/utils/logger';
import { serverCreateActivityLog } from '@/lib/api/nestjs-server-client';
import { folderPathCache } from '@/lib/cache/webhard-cache';

const activityLogger = logger.createLogger('ACTIVITY');

export type ActivityAction =
  // 인증 관련
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'LOGIN_BLOCKED' // Rate Limit으로 인한 로그인 차단
  | 'PASSWORD_CHANGE'
  // 파일 관련
  | 'UPLOAD'
  | 'DOWNLOAD'
  | 'DELETE'
  | 'PERMANENT_DELETE'
  | 'RESTORE'
  | 'MOVE'
  | 'COPY'
  | 'UPDATE'
  // 폴더 관련
  | 'CREATE_FOLDER'
  // 대량 작업
  | 'BULK_DELETE'
  | 'BULK_DOWNLOAD'
  | 'BATCH_DELETE'
  | 'EMPTY_TRASH'
  // 업체 관련
  | 'REGISTER_COMPANY'
  | 'COMPANY_STATUS_CHANGE'
  | 'COMPANY_DELETE'
  | 'COMPANY_RESTORE'
  // 시스템 관련
  | 'PERMISSION_CHANGE'
  // 마이그레이션 관련
  | 'MIGRATION_START'
  | 'MIGRATION_COMPLETE'
  | 'MIGRATION_FAILED'
  | 'MIGRATION_BATCH_UPLOAD'
  | 'MIGRATION_VERIFY'
  | 'LINK_COMPANY';

export type ActorType = 'admin' | 'company';

export interface LogActivityParams {
  actorType: ActorType;
  actorId: string;
  actorName?: string;
  action: ActivityAction;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * 활동 로그를 기록합니다. (NestJS API 경유)
 * @param params 로그 기록에 필요한 정보
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const result = await serverCreateActivityLog({
      actorType: params.actorType,
      actorId: params.actorId,
      actorName: params.actorName,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      details: params.details,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    if (!result.success) {
      activityLogger.error('Failed to insert activity log via NestJS', { params });
    } else {
      activityLogger.debug('Activity logged via NestJS', params);
    }
  } catch (error) {
    activityLogger.error('Error logging activity', error);
  }
}

/**
 * 폴더 경로를 가져옵니다.
 *
 * @param folderId - 폴더 ID
 * @returns Promise<string> - 폴더 경로 (예: "/folder1/subfolder2")
 */
export async function getFolderPath(folderId: string | null): Promise<string> {
  if (!folderId) {
    return '/';
  }

  try {
    // Redis 캐시를 사용하여 폴더 경로 조회 (캐시 미스 시 DB 조회 후 캐시)
    return await folderPathCache.get(folderId);
  } catch (_error) {
    activityLogger.error('Error getting folder location', {
      folderIdPresent: Boolean(folderId),
      errorType: _error instanceof Error ? _error.name : typeof _error,
    });
    return '/';
  }
}
