import { verifySession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { logger } from '@/lib/utils/logger';
import { FeedbackList } from './FeedbackList';
import { serverGetFeedback, serverGetFeedbackStatusCounts } from '@/lib/api/nestjs-server-client';

const feedbackPageLogger = logger.createLogger('ADMIN_FEEDBACK_PAGE');

interface Feedback {
  id: number;
  company_id: number;
  company_name: string;
  company_email: string | null;
  category: string;
  category_other: string | null;
  content: string;
  status: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  admin_notes: string | null;
}

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  // 세션 검증
  const isAuthenticated = await verifySession();
  if (!isAuthenticated) {
    redirect('/login');
  }

  const params = await searchParams;
  const statusFilter = params.status || 'all';
  const page = parseInt(params.page || '1', 10);
  const itemsPerPage = 20;

  try {
    // 병렬 실행: 메인 쿼리와 상태별 개수 쿼리를 동시에 실행 (NestJS API)
    const offset = (page - 1) * itemsPerPage;

    const [feedbackResult, statusCountsResult] = await Promise.all([
      serverGetFeedback({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        limit: itemsPerPage,
        offset,
      }),
      serverGetFeedbackStatusCounts(),
    ]);

    const feedbacks = feedbackResult.feedbacks as unknown as Feedback[];
    const totalCount = feedbackResult.total;

    const counts = {
      all: statusCountsResult.total || 0,
      pending: statusCountsResult.pending || 0,
      in_progress: statusCountsResult.in_progress || 0,
      resolved: statusCountsResult.resolved || 0,
      closed: 0,
    };

    const totalPages = Math.ceil(totalCount / itemsPerPage);

    return (
      <FeedbackList
        initialFeedbacks={(feedbacks as Feedback[]) || []}
        statusFilter={statusFilter}
        currentPage={page}
        totalPages={totalPages}
        totalCount={totalCount || 0}
        statusCounts={counts}
      />
    );
  } catch (error) {
    feedbackPageLogger.error('Error in AdminFeedbackPage', error);
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">불편사항 접수</h1>
        <p className="text-red-500">불편사항을 불러오는 중 오류가 발생했습니다.</p>
      </div>
    );
  }
}
