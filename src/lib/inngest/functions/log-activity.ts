/**
 * 활동 로그 백그라운드 함수
 * API 응답 속도에 영향을 주지 않고 비동기로 로그를 기록
 * NestJS API 경유로 전환됨
 */

import { inngest } from '@/lib/inngest/client';
import type { WebhardEvents } from '@/lib/inngest/client';
import { serverCreateActivityLog } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';

const bgLogger = logger.createLogger('INNGEST_ACTIVITY');

export const logActivityFunction = inngest.createFunction(
  {
    id: 'log-webhard-activity',
    name: 'Log Webhard Activity',
    // 실패 시 재시도 설정
    retries: 3,
    triggers: [{ event: 'webhard/activity.log' }],
  },
  async ({ event, step }) => {
    const data = event.data as WebhardEvents['webhard/activity.log']['data'];

    await step.run('insert-activity-log', async () => {
      try {
        const result = await serverCreateActivityLog({
          actorType: data.actorType,
          actorId: data.actorId,
          actorName: data.actorName,
          action: data.action,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          details: data.details,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        });

        if (!result.success) {
          bgLogger.error('Failed to insert activity log via Inngest + NestJS', { data });
          throw new Error('Activity log insert failed');
        }

        bgLogger.debug('Activity logged via Inngest + NestJS', {
          action: data.action,
          resourceId: data.resourceId,
        });
      } catch (err) {
        bgLogger.error('Error in logActivityFunction', err);
        throw err;
      }
    });

    return { success: true, action: data.action };
  }
);
