/**
 * Inngest API Route
 * Inngest 이벤트를 수신하고 함수를 실행하는 엔드포인트
 */

import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { logActivityFunction, sendNotificationFunction } from '@/lib/inngest/functions';

// Inngest 함수들을 등록하고 서빙
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    logActivityFunction,
    sendNotificationFunction,
  ],
});
