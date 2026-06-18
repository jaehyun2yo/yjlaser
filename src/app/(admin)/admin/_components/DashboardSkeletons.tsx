import { BG_COLOR, BORDER_COLOR, DIVIDE_COLOR } from '@/lib/styles';
/**
 * 대시보드 스켈레톤 컴포넌트
 * Suspense 경계에서 로딩 중 표시
 */

// 통계 카드 스켈레톤
export function StatsCardSkeleton() {
  return (
    <div
      className={`${BG_COLOR.card} p-4 rounded-xl shadow-sm border ${BORDER_COLOR.default} animate-pulse`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-2 ${BG_COLOR.muted} rounded-lg w-8 h-8`} />
        <div className={`${BG_COLOR.muted} h-3 w-12 rounded`} />
      </div>
      <div className={`${BG_COLOR.muted} h-8 w-16 rounded mb-1`} />
      <div className={`${BG_COLOR.muted} h-3 w-20 rounded`} />
    </div>
  );
}

// 통계 그리드 스켈레톤
export function StatsGridSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <StatsCardSkeleton key={i} />
      ))}
    </div>
  );
}

// 예약 목록 스켈레톤
export function BookingsListSkeleton() {
  return (
    <div
      className={`${BG_COLOR.card} rounded-xl shadow-sm border ${BORDER_COLOR.default} overflow-hidden animate-pulse`}
    >
      <div
        className={`flex items-center justify-between px-4 py-3 border-b ${BORDER_COLOR.light} ${BG_COLOR.success}`}
      >
        <div className="flex items-center gap-2">
          <div className={`w-5 h-5 ${BG_COLOR.muted} rounded`} />
          <div className={`${BG_COLOR.muted} h-4 w-20 rounded`} />
          <div className={`${BG_COLOR.muted} h-4 w-8 rounded`} />
        </div>
        <div className={`${BG_COLOR.muted} h-3 w-12 rounded`} />
      </div>
      <div className={`divide-y ${DIVIDE_COLOR.lightSoft}`}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="flex items-center gap-2 min-w-[90px]">
              <div className={`w-4 h-4 ${BG_COLOR.muted} rounded`} />
              <div className={`${BG_COLOR.muted} h-4 w-20 rounded`} />
            </div>
            <div className="flex-1">
              <div className={`${BG_COLOR.muted} h-4 w-32 rounded`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 접속자 목록 스켈레톤
export function SessionsListSkeleton() {
  return (
    <div
      className={`${BG_COLOR.card} rounded-xl shadow-sm border ${BORDER_COLOR.default} overflow-hidden animate-pulse`}
    >
      <div
        className={`flex items-center justify-between px-4 py-3 border-b ${BORDER_COLOR.light} ${BG_COLOR.info}`}
      >
        <div className="flex items-center gap-2">
          <div className={`w-5 h-5 ${BG_COLOR.muted} rounded`} />
          <div className={`${BG_COLOR.muted} h-4 w-20 rounded`} />
          <div className={`${BG_COLOR.muted} h-4 w-8 rounded`} />
        </div>
        <div className={`${BG_COLOR.muted} h-3 w-24 rounded`} />
      </div>
      <div className={`divide-y ${DIVIDE_COLOR.lightSoft}`}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className={`w-2 h-2 ${BG_COLOR.muted} rounded-full`} />
            <div className="flex-1">
              <div className={`${BG_COLOR.muted} h-4 w-24 rounded`} />
            </div>
            <div className={`${BG_COLOR.muted} h-3 w-12 rounded`} />
          </div>
        ))}
      </div>
    </div>
  );
}

// 전체 대시보드 스켈레톤
export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="animate-pulse">
        <div className={`${BG_COLOR.muted} h-7 w-32 rounded mb-2`} />
        <div className={`${BG_COLOR.muted} h-4 w-48 rounded`} />
      </div>

      {/* 통계 카드 */}
      <StatsGridSkeleton />

      {/* 메인 콘텐츠 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BookingsListSkeleton />
        <SessionsListSkeleton />
      </div>
    </div>
  );
}
