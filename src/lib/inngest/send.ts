/**
 * Inngest 이벤트 전송 헬퍼
 * 기존 동기 함수들을 비동기 이벤트로 대체
 */

import { inngest, type WebhardEvents } from './client';
import { logger } from '@/lib/utils/logger';

const sendLogger = logger.createLogger('INNGEST_SEND');

/**
 * 활동 로그를 비동기로 기록
 * 기존 logActivity 대신 사용하면 API 응답 속도 향상
 */
export async function logActivityAsync(
  params: WebhardEvents['webhard/activity.log']['data']
): Promise<void> {
  try {
    await inngest.send({
      name: 'webhard/activity.log',
      data: params,
    });
  } catch (error) {
    // 이벤트 전송 실패해도 API 응답에 영향 없음
    sendLogger.error('Failed to send activity log event', { error, params });
  }
}

/**
 * Slack 알림을 비동기로 전송
 * 기존 sendFileUploadNotification 대신 사용
 */
export async function sendNotificationAsync(
  params: WebhardEvents['webhard/notification.slack']['data']
): Promise<void> {
  try {
    await inngest.send({
      name: 'webhard/notification.slack',
      data: params,
    });
  } catch (error) {
    sendLogger.error('Failed to send notification event', { error, params });
  }
}

/**
 * 캐시 무효화를 비동기로 처리 (선택적)
 * 즉시 무효화가 필요 없는 경우 사용
 */
export async function invalidateCacheAsync(
  params: WebhardEvents['webhard/cache.invalidate']['data']
): Promise<void> {
  try {
    await inngest.send({
      name: 'webhard/cache.invalidate',
      data: params,
    });
  } catch (error) {
    sendLogger.error('Failed to send cache invalidation event', { error, params });
  }
}
