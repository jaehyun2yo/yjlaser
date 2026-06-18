import { logger } from '@/lib/utils/logger';
import Link from 'next/link';
import { FaEnvelope, FaExclamationTriangle } from 'react-icons/fa';
import {
  serverGetContactCount,
  serverGetFeedbackStatusCounts,
} from '@/lib/api/nestjs-server-client';

/**
 * 대시보드 긴급 알림 - 비동기 서버 컴포넌트
 * 신규 문의와 대기 중인 불편사항 표시
 */
export async function DashboardAlerts() {
  const adminLogger = logger.createLogger('DASHBOARD_ALERTS');

  let newContactCount = 0;
  let pendingFeedback = 0;

  try {
    // 병렬로 데이터 가져오기 (NestJS API)
    const [contactCount, feedbackCounts] = await Promise.all([
      serverGetContactCount({ status: 'received' }),
      serverGetFeedbackStatusCounts(),
    ]);

    newContactCount = contactCount;
    pendingFeedback = (feedbackCounts.pending || 0) + (feedbackCounts.in_progress || 0);
  } catch (error) {
    adminLogger.error('Error in DashboardAlerts', error);
  }

  // 알림이 없으면 아무것도 렌더링하지 않음
  if (newContactCount === 0 && pendingFeedback === 0) {
    return null;
  }

  return (
    <div className="flex gap-3 flex-wrap">
      {newContactCount > 0 && (
        <Link
          href="/admin/work-management?status=new"
          className="flex items-center gap-2 bg-orange-500 px-4 py-2 rounded-full text-white hover:bg-orange-600 transition-colors"
        >
          <FaEnvelope className="text-sm" />
          <span>신규 문의 {newContactCount}건</span>
        </Link>
      )}
      {pendingFeedback > 0 && (
        <Link
          href="/admin/feedback?status=pending"
          className="flex items-center gap-2 bg-red-500 px-4 py-2 rounded-full text-white hover:bg-red-600 transition-colors"
        >
          <FaExclamationTriangle className="text-sm" />
          <span>불편사항 {pendingFeedback}건</span>
        </Link>
      )}
    </div>
  );
}
