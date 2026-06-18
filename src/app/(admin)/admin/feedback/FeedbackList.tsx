'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('FeedbackList');
import {
  FaEnvelope,
  FaClock,
  FaTag,
  FaStar as _FaStar,
  FaTrash as _FaTrash,
  FaChevronDown as _FaChevronDown,
  FaChevronUp as _FaChevronUp,
} from 'react-icons/fa';
import { BG_COLOR, BORDER_COLOR, FILTER_BUTTON_STYLES, TEXT_COLOR } from '@/lib/styles';

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

interface StatusCounts {
  all: number;
  pending: number;
  in_progress: number;
  resolved: number;
  closed: number;
}

interface FeedbackListProps {
  initialFeedbacks: Feedback[];
  statusFilter: string;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  statusCounts: StatusCounts;
}

const categoryLabels: Record<string, string> = {
  notice: '공지사항',
  portfolio: '포트폴리오',
  contact: '문의하기',
  process: '공정관리페이지',
  other: '기타',
};

const getCategoryLabel = (category: string, categoryOther: string | null): string => {
  if (category === 'other' && categoryOther) {
    return `기타: ${categoryOther}`;
  }
  return categoryLabels[category] || category;
};

const statusLabels: Record<string, string> = {
  pending: '대기중',
  in_progress: '처리중',
  resolved: '해결됨',
  closed: '종료',
};

const statusColors: Record<string, string> = {
  pending: `${BG_COLOR.warningMediumDeep} ${TEXT_COLOR.warningDeep}`,
  in_progress: `${BG_COLOR.infoMedium} ${TEXT_COLOR.infoDeepest}`,
  resolved: `${BG_COLOR.successMedium} ${TEXT_COLOR.successDeepest}`,
  closed: `${BG_COLOR.light} ${TEXT_COLOR.grayDark}`,
};

export function FeedbackList({
  initialFeedbacks,
  statusFilter,
  currentPage,
  totalPages,
  totalCount,
  statusCounts,
}: FeedbackListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const handleStatusFilter = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status === 'all') {
      params.delete('status');
    } else {
      params.set('status', status);
    }
    params.delete('page'); // 페이지 초기화
    router.push(`/admin/feedback?${params.toString()}`);
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`/admin/feedback?${params.toString()}`);
  };

  const handleResolve = async (feedbackId: number) => {
    setResolvingId(feedbackId);
    try {
      const response = await fetch(`/api/admin/feedback/${feedbackId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'resolved' }),
      });

      if (response.ok) {
        alert('불편사항이 해결됨으로 변경되었습니다.');
        router.refresh();
      } else {
        const error = await response.json();
        alert(`상태 변경 실패: ${error.error || '알 수 없는 오류가 발생했습니다.'}`);
      }
    } catch (error) {
      log.error('Error resolving feedback:', error);
      alert('상태 변경 중 오류가 발생했습니다.');
    } finally {
      setResolvingId(null);
    }
  };

  const handleDelete = async (feedbackId: number, companyName: string) => {
    if (
      !confirm(
        `정말로 "${companyName}"의 불편사항을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`
      )
    ) {
      return;
    }

    setDeletingId(feedbackId);
    try {
      const response = await fetch(`/api/admin/feedback/${feedbackId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('불편사항이 삭제되었습니다.');
        router.refresh();
      } else {
        const error = await response.json();
        alert(`삭제 실패: ${error.error || '알 수 없는 오류가 발생했습니다.'}`);
      }
    } catch (error) {
      log.error('Error deleting feedback:', error);
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="mb-4 sm:mb-6">
        <h1
          className={`text-xl sm:text-2xl lg:text-3xl font-bold ${TEXT_COLOR.primary} mb-1 sm:mb-2`}
        >
          불편사항 접수
        </h1>
        <p className={`text-sm sm:text-base ${TEXT_COLOR.secondary}`}>
          총 {totalCount}건의 불편사항이 접수되었습니다.
        </p>
      </div>

      {/* 상태 필터 */}
      <div className="mb-4 sm:mb-6 flex flex-wrap gap-2">
        {[
          { value: 'all', label: '전체', count: statusCounts.all },
          { value: 'pending', label: '대기중', count: statusCounts.pending },
          { value: 'in_progress', label: '처리중', count: statusCounts.in_progress },
          { value: 'resolved', label: '해결됨', count: statusCounts.resolved },
          { value: 'closed', label: '종료', count: statusCounts.closed },
        ].map((filter) => (
          <button
            key={filter.value}
            onClick={() => handleStatusFilter(filter.value)}
            className={`px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm rounded-lg font-medium border-0 transition-colors duration-300 ${
              statusFilter === filter.value
                ? FILTER_BUTTON_STYLES.active
                : FILTER_BUTTON_STYLES.inactive
            }`}
          >
            {filter.label} ({filter.count})
          </button>
        ))}
      </div>

      {/* 불편사항 목록 */}
      <div className="space-y-3 sm:space-y-4">
        {initialFeedbacks.length === 0 ? (
          <div
            className={`text-center py-8 sm:py-12 ${BG_COLOR.card} rounded-lg border ${BORDER_COLOR.default}`}
          >
            <p className={`text-sm sm:text-base ${TEXT_COLOR.secondary}`}>불편사항이 없습니다.</p>
          </div>
        ) : (
          initialFeedbacks.map((feedback) => (
            <div
              key={feedback.id}
              className={`${BG_COLOR.card} rounded-lg border ${BORDER_COLOR.default} p-4 sm:p-6 shadow-sm`}
            >
              <div className="mb-3 sm:mb-4">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                  <h3 className={`text-base sm:text-lg font-semibold ${TEXT_COLOR.primary}`}>
                    {feedback.company_name}
                  </h3>
                  <span
                    className={`px-2 py-1 rounded-full text-[10px] sm:text-xs font-medium ${statusColors[feedback.status]}`}
                  >
                    {statusLabels[feedback.status]}
                  </span>
                </div>
                <div
                  className={`flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm ${TEXT_COLOR.secondary}`}
                >
                  {feedback.company_email && (
                    <div className="flex items-center gap-1">
                      <FaEnvelope className="text-[10px] sm:text-xs" />
                      <a
                        href={`mailto:${feedback.company_email}`}
                        className={`${TEXT_COLOR.hoverAccent} break-all`}
                      >
                        {feedback.company_email}
                      </a>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <FaClock className="text-[10px] sm:text-xs" />
                    <span className="whitespace-nowrap">
                      {new Date(feedback.created_at).toLocaleString('ko-KR')}
                    </span>
                  </div>
                </div>
              </div>
              {/* 카테고리명 표시 */}
              <div className="mb-3 sm:mb-4">
                <div className="flex items-center gap-2 mb-1 sm:mb-2">
                  <FaTag className={`text-xs sm:text-sm ${TEXT_COLOR.secondary}`} />
                  <span className={`text-xs sm:text-sm font-medium ${TEXT_COLOR.secondary}`}>
                    카테고리:
                  </span>
                  <span className={`text-xs sm:text-sm font-semibold ${TEXT_COLOR.primary}`}>
                    {getCategoryLabel(feedback.category, feedback.category_other)}
                  </span>
                </div>
              </div>
              {/* 불편사항 내용 표시 */}
              <div className="mb-3 sm:mb-4">
                <div className="mb-1 sm:mb-2">
                  <span className={`text-xs sm:text-sm font-medium ${TEXT_COLOR.secondary}`}>
                    불편사항 내용:
                  </span>
                </div>
                <button
                  onClick={() => setExpandedId(expandedId === feedback.id ? null : feedback.id)}
                  className="text-left w-full transition-colors duration-300"
                >
                  <div
                    className={`${BG_COLOR.card} rounded-lg p-3 sm:p-4 border ${BORDER_COLOR.default}`}
                  >
                    <p
                      className={`text-xs sm:text-sm ${TEXT_COLOR.primary} whitespace-pre-wrap line-clamp-3`}
                    >
                      {feedback.content}
                    </p>
                    {feedback.content.length > 150 && (
                      <p className={`text-[10px] sm:text-xs ${TEXT_COLOR.secondary} mt-2`}>
                        {expandedId === feedback.id ? '접기' : '더보기'}
                      </p>
                    )}
                  </div>
                </button>
                {expandedId === feedback.id && (
                  <div
                    className={`mt-2 ${BG_COLOR.card} rounded-lg p-3 sm:p-4 border ${BORDER_COLOR.default}`}
                  >
                    <p className={`text-xs sm:text-sm ${TEXT_COLOR.primary} whitespace-pre-wrap`}>
                      {feedback.content}
                    </p>
                  </div>
                )}
              </div>
              {feedback.admin_notes && (
                <div
                  className={`mb-3 sm:mb-4 p-2.5 sm:p-3 ${BG_COLOR.info} rounded-lg border ${BORDER_COLOR.info}`}
                >
                  {' '}
                  <p className={`text-[10px] sm:text-xs font-medium ${TEXT_COLOR.infoDeep} mb-1`}>
                    {' '}
                    관리자 메모{' '}
                  </p>{' '}
                  <p className="text-xs sm:text-sm text-blue-900 whitespace-pre-wrap">
                    {' '}
                    {feedback.admin_notes}{' '}
                  </p>{' '}
                </div>
              )}{' '}
              {/* 버튼 영역 - 카드 하단 오른쪽 */}{' '}
              <div className="flex justify-end gap-2 mt-3 sm:mt-4">
                {' '}
                {feedback.status !== 'resolved' && (
                  <button
                    onClick={() => handleResolve(feedback.id)}
                    disabled={resolvingId === feedback.id}
                    className={`px-2.5 py-1.5 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs border-0 rounded-lg ${BG_COLOR.successLight} ${TEXT_COLOR.successStrong} ${BG_COLOR.hoverSuccessSolid} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                    aria-label="불편사항 해결됨으로 변경"
                  >
                    {resolvingId === feedback.id ? '처리 중...' : '해결됨'}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(feedback.id, feedback.company_name)}
                  disabled={deletingId === feedback.id}
                  className={`px-2.5 py-1.5 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs border-0 rounded-lg ${BG_COLOR.errorLight} ${TEXT_COLOR.errorStrong} ${BG_COLOR.hoverErrorSolid} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                  aria-label="불편사항 삭제"
                >
                  {deletingId === feedback.id ? '삭제 중...' : '삭제'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="mt-4 sm:mt-6 flex justify-center gap-1.5 sm:gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => handlePageChange(page)}
              className={`px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm rounded-lg font-medium border-0 transition-colors duration-300 ${
                currentPage === page
                  ? 'bg-[#ED6C00] text-white'
                  : `${BG_COLOR.medium} ${TEXT_COLOR.secondary} ${BG_COLOR.hoverStronger}`
              }`}
            >
              {page}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
