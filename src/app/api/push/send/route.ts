import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { serverGetPushSubscriptions, nestjsFetch } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';
import { requireAdminSession } from '@/app/api/_lib/route-authorization';

const pushSendLogger = logger.createLogger('PUSH_SEND');

/**
 * POST /api/push/send
 * 특정 작업자에게 푸시 알림 발송
 *
 * Body:
 * {
 *   workerId: string;
 *   title: string;
 *   body: string;
 *   url?: string; // 알림 클릭 시 이동할 URL
 *   data?: unknown;   // 추가 데이터
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as {
      workerId?: unknown;
      title?: unknown;
      body?: unknown;
      url?: unknown;
      data?: unknown;
    };
    const { workerId, title, body: messageBody, url, data } = body;

    if (
      typeof workerId !== 'string' ||
      !workerId ||
      typeof title !== 'string' ||
      !title ||
      typeof messageBody !== 'string' ||
      !messageBody
    ) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // VAPID 키 확인 (환경 변수에서 로드)
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:yjlaserbusiness@gmail.com';

    if (!vapidPublicKey || !vapidPrivateKey) {
      pushSendLogger.error('VAPID keys not configured');
      return NextResponse.json(
        { success: false, error: 'VAPID 키가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    // 작업자의 푸시 구독 정보 조회 (NestJS API)
    const subscriptions = (await serverGetPushSubscriptions(workerId)) as {
      endpoint: string;
      p256dh: string;
      auth: string;
    }[];

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json(
        { success: false, error: '푸시 구독 정보가 없습니다.' },
        { status: 404 }
      );
    }

    // 푸시 알림 페이로드
    const payload = JSON.stringify({
      title,
      body: messageBody,
      url: typeof url === 'string' && url ? url : '/worker/dashboard',
      data,
    });

    // 모든 구독에 푸시 발송
    const sendResults = await Promise.allSettled(
      subscriptions.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        return webpush.sendNotification(pushSubscription, payload);
      })
    );

    const successCount = sendResults.filter((r) => r.status === 'fulfilled').length;
    const failureCount = sendResults.filter((r) => r.status === 'rejected').length;

    // 실패한 구독 정보 정리 (404, 410 에러는 만료된 구독)
    for (let i = 0; i < sendResults.length; i++) {
      const result = sendResults[i];
      if (result.status === 'rejected') {
        const error = result.reason;
        if (error.statusCode === 404 || error.statusCode === 410) {
          await nestjsFetch('/push-subscriptions', {
            method: 'DELETE',
            body: { workerId, endpoint: subscriptions[i].endpoint },
            useApiKey: true,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      sent: successCount,
      failed: failureCount,
    });
  } catch (error) {
    pushSendLogger.error('Push send error', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
