import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { serverGetUnreadNotificationCount } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';

const notificationLogger = logger.createLogger('Notifications');

/**
 * GET /api/notifications/count
 * 읽지 않은 알림 개수 조회 (NestJS API 경유)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') ?? undefined;

    const count = await serverGetUnreadNotificationCount(
      user.userType,
      user.userType === 'company' ? Number(user.userId) : null,
      category
    );

    return NextResponse.json({ count });
  } catch (error) {
    notificationLogger.error('Notification count error', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
