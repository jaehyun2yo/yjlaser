'use client';

import { useEffect } from 'react';
import { BUTTON_STYLES, TEXT_COLOR, BG_COLOR } from '@/lib/styles';

export default function WorkerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[WorkerError]', error);
    }
  }, [error]);

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 ${BG_COLOR.gray}`}>
      <div className={`max-w-md w-full rounded-lg shadow-lg p-6 ${BG_COLOR.white}`}>
        <div
          className={`flex items-center justify-center w-12 h-12 mx-auto ${BG_COLOR.errorLight} rounded-full mb-4`}
        >
          <svg
            className={`w-6 h-6 ${TEXT_COLOR.error}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className={`text-xl font-semibold text-center mb-2 ${TEXT_COLOR.primary}`}>
          작업자 페이지에서 오류가 발생했습니다
        </h2>
        <p className={`text-center mb-6 ${TEXT_COLOR.tertiary}`}>
          문제가 지속되면 관리자에게 문의해주세요.
        </p>
        <div className="flex gap-3">
          <button onClick={() => reset()} className={`flex-1 ${BUTTON_STYLES.primary}`}>
            다시 시도
          </button>
          <button
            onClick={() => (window.location.href = '/worker')}
            className={`flex-1 ${BUTTON_STYLES.secondary}`}
          >
            작업자 홈
          </button>
        </div>
      </div>
    </div>
  );
}
