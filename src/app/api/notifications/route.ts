import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { serverGetNotifications } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';

const notificationLogger = logger.createLogger('Notifications');

/**
 * GET /api/notifications
 * 알림 목록 조회 (NestJS API 경유)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const unreadOnly = searchParams.get('unread_only') === 'true';
    const category = searchParams.get('category') ?? undefined;

    const notifications = await serverGetNotifications({
      userType: user.userType,
      userId: user.userType === 'company' ? Number(user.userId) : null,
      limit,
      offset,
      unreadOnly,
      category,
    });

    return NextResponse.json({ notifications });
  } catch (error) {
    notificationLogger.error('Notification list error', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
