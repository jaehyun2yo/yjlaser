import { logger, toSafeLogError } from '@/lib/utils/logger';
import {
  serverUpsertActiveSession,
  serverDeleteActiveSession,
  serverGetActiveSessionsCount,
  serverGetActiveSessionsList,
} from '@/lib/api/nestjs-server-client';

const sessionLogger = logger.createLogger('ActiveSessions');

export interface ActiveSession {
  id: number;
  user_type: 'admin' | 'company';
  user_id: number;
  username: string;
  company_name: string | null;
  last_activity: string;
}

export interface ActiveSessionsCount {
  total_count: number;
  admin_count: number;
  company_count: number;
}

/**
 * 활성 세션 업데이트 (하트비트) - NestJS API 경유
 */
export async function updateActiveSession(
  userType: 'admin' | 'company',
  userId: number,
  username: string,
  companyName?: string | null
): Promise<boolean> {
  try {
    return await serverUpsertActiveSession(userType, userId, username, companyName);
  } catch (error) {
    sessionLogger.error('Active presence update failed', toSafeLogError(error));
    return false;
  }
}

/**
 * 활성 세션 삭제 (로그아웃) - NestJS API 경유
 */
export async function deleteActiveSession(
  userType: 'admin' | 'company',
  userId: number
): Promise<boolean> {
  try {
    return await serverDeleteActiveSession(userType, userId);
  } catch (error) {
    sessionLogger.error('Active presence delete failed', toSafeLogError(error));
    return false;
  }
}

/**
 * 활성 세션 수 조회 - NestJS API 경유
 */
export async function getActiveSessionsCount(): Promise<ActiveSessionsCount> {
  try {
    return await serverGetActiveSessionsCount();
  } catch (error) {
    sessionLogger.error('Active presence count failed', toSafeLogError(error));
    return { total_count: 0, admin_count: 0, company_count: 0 };
  }
}

/**
 * 활성 세션 목록 조회 - NestJS API 경유
 */
export async function getActiveSessionsList(): Promise<ActiveSession[]> {
  try {
    const data = await serverGetActiveSessionsList();
    return data as ActiveSession[];
  } catch (error) {
    sessionLogger.error('Active presence list failed', toSafeLogError(error));
    return [];
  }
}
