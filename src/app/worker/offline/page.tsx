import { Metadata } from 'next';
import { TYPOGRAPHY, TEXT_COLOR, BG_COLOR } from '@/lib/styles';

export const metadata: Metadata = {
  title: '오프라인 | 현장작업',
  description: '인터넷 연결을 확인해주세요.',
};

export default function OfflinePage() {
  return (
    <div className={`flex min-h-screen items-center justify-center ${BG_COLOR.gray}`}>
      <div className="text-center">
        <div className="mb-8">
          <svg
            className="mx-auto h-24 w-24 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
            />
          </svg>
        </div>
        <h1 className={`${TYPOGRAPHY.h1} mb-4`}>오프라인 상태입니다</h1>
        <p className={`${TYPOGRAPHY.body.large} ${TEXT_COLOR.secondary} mb-8`}>
          인터넷 연결을 확인하고 다시 시도해주세요.
          <br />
          저장하지 않은 작업은 온라인 복귀 시 자동으로 동기화됩니다.
        </p>
        <div className="space-y-4">
          <a
            href="/worker/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            다시 시도
          </a>
          <div>
            <a href="/worker/dashboard" className={`${TYPOGRAPHY.link.base}`}>
              작업 목록으로 돌아가기 (캐시된 페이지)
            </a>
          </div>
        </div>
        <div className={`mt-12 rounded-lg ${BG_COLOR.info} p-6 max-w-md mx-auto`}>
          <h2 className={`${TYPOGRAPHY.h3} ${TEXT_COLOR.primary} mb-2`}>알림</h2>
          <p className={`${TYPOGRAPHY.body.small} ${TEXT_COLOR.secondary}`}>
            오프라인 상태에서도 일부 기능은 캐시를 통해 사용 가능합니다.
            <br />
            상태 변경 등의 작업은 온라인 복귀 시 자동으로 동기화됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
