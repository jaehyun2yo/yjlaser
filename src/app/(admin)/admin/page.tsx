import { TEXT_COLOR } from '@/lib/styles';
import { Suspense } from 'react';
import {
  DashboardStats,
  DashboardSessions,
  DashboardBookings,
  DashboardAlerts,
  DashboardNotifications,
  StatsGridSkeleton,
  BookingsListSkeleton,
  SessionsListSkeleton,
} from './_components';

// Build-time SSG 시 NestJS API 호출 회피 (Vercel preview 환경에 NestJS 서버 없음)
export const dynamic = 'force-dynamic';

/**
 * 관리자 대시보드 페이지
 * Suspense 경계를 사용하여 점진적 로딩 지원
 * TTFCP 개선: 각 섹션이 독립적으로 로딩됨
 */
export default function AdminDashboardPage() {
  return (
    <div className="space-y-4">
      {/* 헤더 - 즉시 렌더링 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-xl font-bold ${TEXT_COLOR.primary}`}>대시보드</h1>
          <p className={`text-xs ${TEXT_COLOR.secondary}`}>
            주요 현황과 알림을 압축해서 확인합니다
          </p>
        </div>
      </div>

      {/* 긴급 알림 - Suspense 경계 */}
      <Suspense fallback={null}>
        <DashboardAlerts />
      </Suspense>

      {/* 통계 카드 그리드 - Suspense 경계 */}
      <Suspense fallback={<StatsGridSkeleton />}>
        <DashboardStats />
      </Suspense>

      {/* 메인 콘텐츠 영역 (알림 + 예약 + 접속자) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Suspense fallback={null}>
          <DashboardNotifications />
        </Suspense>

        {/* 오늘 예약 - Suspense 경계 */}
        <Suspense fallback={<BookingsListSkeleton />}>
          <DashboardBookings />
        </Suspense>

        {/* 현재 접속자 - Suspense 경계 */}
        <Suspense fallback={<SessionsListSkeleton />}>
          <DashboardSessions />
        </Suspense>
      </div>
    </div>
  );
}
