'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FaExclamationTriangle, FaRedo, FaHome } from 'react-icons/fa';
import Link from 'next/link';
import { TEXT_COLOR, BG_COLOR } from '@/lib/styles';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { logger } from '@/lib/utils/logger';

const errorLog = logger.createLogger('WebhardError');

interface WebhardErrorFallbackProps {
  onReset?: () => void;
}

/**
 * 웹하드 전용 에러 폴백 UI
 * 웹하드 컨텍스트에 맞는 에러 메시지와 복구 옵션 제공
 */
function WebhardErrorFallback({ onReset }: WebhardErrorFallbackProps) {
  const queryClient = useQueryClient();

  const handleReset = () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhard.all,
      refetchType: 'active',
    });
    errorLog.info('Invalidated webhard queries before error boundary reset');

    onReset?.();
  };

  return (
    <div className={`flex-1 flex items-center justify-center ${BG_COLOR.page} p-4`}>
      <div className={`max-w-md w-full ${BG_COLOR.card} rounded-lg shadow-lg p-6 text-center`}>
        <div
          className={`w-16 h-16 mx-auto mb-4 rounded-full ${BG_COLOR.brandLight} flex items-center justify-center`}
        >
          <FaExclamationTriangle className={`w-8 h-8 ${TEXT_COLOR.brand}`} />
        </div>
        <h2 className={`text-xl font-semibold ${TEXT_COLOR.primary} mb-2`}>웹하드 오류 발생</h2>
        <p className={`${TEXT_COLOR.secondary} mb-6`}>
          파일 관리 중 예기치 못한 오류가 발생했습니다.
          <br />
          페이지를 새로고침하거나 잠시 후 다시 시도해주세요.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
          >
            <FaRedo className="w-4 h-4" />
            다시 시도
          </button>
          <Link
            href="/"
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 ${BG_COLOR.muted} ${BG_COLOR.hoverMuted} ${TEXT_COLOR.primary} rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2`}
          >
            <FaHome className="w-4 h-4" />
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}

interface WebhardErrorBoundaryProps {
  children: React.ReactNode;
}

/**
 * 웹하드 전용 ErrorBoundary
 * React 컴포넌트 트리에서 발생하는 에러를 포착하고 사용자 친화적인 UI 표시
 */
export function WebhardErrorBoundary({ children }: WebhardErrorBoundaryProps) {
  return (
    <ErrorBoundary fallback={({ reset }) => <WebhardErrorFallback onReset={reset} />}>
      {children}
    </ErrorBoundary>
  );
}

export default WebhardErrorBoundary;
