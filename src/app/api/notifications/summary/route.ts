import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { serverGetUnreadNotificationSummary } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';

const notificationLogger = logger.createLogger('Notifications');

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const summary = await serverGetUnreadNotificationSummary(
      user.userType,
      user.userType === 'company' ? Number(user.userId) : null
    );

    return NextResponse.json(summary);
  } catch (error) {
    notificationLogger.error('Notification summary error', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
