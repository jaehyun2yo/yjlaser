import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { serverMarkNotificationRead } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';

const notificationLogger = logger.createLogger('Notifications');

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/notifications/[id]/read
 * 알림 읽음 처리 (NestJS API 경유)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { id } = await params;

    const success = await serverMarkNotificationRead(id);

    return NextResponse.json({ success });
  } catch (error) {
    notificationLogger.error('Mark read error', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
