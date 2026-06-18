import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { logger } from '@/lib/utils/logger';
import { serverGetRecentContactIds } from '@/lib/api/nestjs-server-client';

const notificationsLogger = logger.createLogger('ADMIN_NOTIFICATIONS_RECENT');

export interface RecentContactIdsResponse {
  ids: string[];
}

/**
 * GET /api/admin/notifications/recent
 * 최근 문의사항 ID 목록 조회 (토스트 알림 초기화용)
 */
export async function GET() {
  try {
    const guardResult = await requireAdmin();
    if (!guardResult.authorized) {
      return guardResult.response;
    }

    const ids = await serverGetRecentContactIds(100);

    const response: RecentContactIdsResponse = { ids };

    return NextResponse.json(response);
  } catch (error) {
    notificationsLogger.error('Exception in GET recent contact ids', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
