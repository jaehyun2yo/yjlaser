import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { serverMarkAllNotificationsRead } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';

const notificationLogger = logger.createLogger('Notifications');

/**
 * POST /api/notifications/read-all
 * 모든 알림 읽음 처리 (NestJS API 경유)
 */
export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const updatedCount = await serverMarkAllNotificationsRead(
      user.userType,
      user.userType === 'company' ? Number(user.userId) : null
    );

    notificationLogger.info('All notifications marked as read', {
      userType: user.userType,
      updatedCount,
    });

    return NextResponse.json({ updatedCount });
  } catch (error) {
    notificationLogger.error('Mark all read error', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
