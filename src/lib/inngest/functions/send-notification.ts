/**
 * Slack 알림 백그라운드 함수
 * API 응답 속도에 영향을 주지 않고 비동기로 알림 전송
 */

import { inngest } from '@/lib/inngest/client';
import type { WebhardEvents } from '@/lib/inngest/client';
import { sendFileUploadNotification } from '@/lib/utils/slack';
import { logger } from '@/lib/utils/logger';

const bgLogger = logger.createLogger('INNGEST_NOTIFICATION');

export const sendNotificationFunction = inngest.createFunction(
  {
    id: 'send-slack-notification',
    name: 'Send Slack Notification',
    retries: 2,
    triggers: [{ event: 'webhard/notification.slack' }],
  },
  async ({ event, step }) => {
    const data = event.data as WebhardEvents['webhard/notification.slack']['data'];

    await step.run('send-slack-message', async () => {
      try {
        if (data.type === 'file_upload') {
          await sendFileUploadNotification({
            fileName: data.fileName || 'Unknown',
            fileSize: data.fileSize || 0,
            companyName: data.companyName || 'Unknown',
            folderName: data.folderName,
            inquiryNumber: data.inquiryNumber,
            uploadedAt: data.uploadedAt ? new Date(data.uploadedAt) : new Date(),
          });
          bgLogger.debug('Slack notification sent via Inngest', {
            type: data.type,
            fileName: data.fileName,
          });
        }
        // 다른 알림 타입 추가 가능
      } catch (err) {
        bgLogger.error('Error in sendNotificationFunction', err);
        throw err;
      }
    });

    return { success: true, type: data.type };
  }
);
