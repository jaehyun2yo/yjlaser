import { NextRequest, NextResponse } from 'next/server';
import { serverUpsertPushSubscription, nestjsFetch } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';
import { requireWorkerSelf } from '@/app/api/_lib/route-authorization';

const pushLogger = logger.createLogger('PUSH_SUBSCRIBE');

/**
 * POST /api/push/subscribe
 * 푸시 알림 구독 저장
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      workerId?: unknown;
      subscription?: {
        endpoint?: unknown;
        keys?: {
          p256dh?: unknown;
          auth?: unknown;
        };
      };
    };
    const { workerId, subscription } = body;

    if (typeof workerId !== 'string' || !workerId || !subscription) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    const auth = await requireWorkerSelf(workerId);
    if (!auth.ok) return auth.response;

    const { endpoint, keys } = subscription;
    if (
      typeof endpoint !== 'string' ||
      !endpoint ||
      typeof keys?.p256dh !== 'string' ||
      !keys.p256dh ||
      typeof keys?.auth !== 'string' ||
      !keys.auth
    ) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 구독 정보입니다.' },
        { status: 400 }
      );
    }

    // NestJS API를 통해 push subscription upsert
    const result = await serverUpsertPushSubscription({
      workerId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });

    if (!result.success) {
      pushLogger.error('Failed to upsert push subscription', { error: result.error });
      return NextResponse.json(
        { success: false, error: '푸시 구독 저장에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    pushLogger.error('Push subscribe error', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/push/subscribe
 * 푸시 알림 구독 해제
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workerId = searchParams.get('workerId');
    const endpoint = searchParams.get('endpoint');

    if (!workerId || !endpoint) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    const auth = await requireWorkerSelf(workerId);
    if (!auth.ok) return auth.response;

    // NestJS API를 통해 push subscription 삭제
    const response = await nestjsFetch('/push-subscriptions', {
      method: 'DELETE',
      body: { workerId, endpoint },
      useApiKey: true,
    });

    if (!response.ok) {
      pushLogger.error('Failed to delete push subscription', { status: response.status });
      return NextResponse.json(
        { success: false, error: '푸시 구독 해제에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    pushLogger.error('Push unsubscribe error', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
