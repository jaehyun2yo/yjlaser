import { logger } from '@/lib/utils/logger';
import {
  serverGetDashboardStats,
  serverGetRecentCompanies,
  serverGetFeedbackStatusCounts,
} from '@/lib/api/nestjs-server-client';
import { StatsCards } from './StatsCards';

interface Company {
  id: number;
  company_name: string;
  created_at: string;
}

interface ContactReferral {
  referral_source: string | null;
  count: number;
}

interface FeedbackCounts {
  pending: number;
  in_progress: number;
  total: number;
}

/**
 * 대시보드 통계 카드 - 비동기 서버 컴포넌트
 * Suspense 경계 내에서 사용하여 점진적 로딩 지원
 * NestJS API 경유로 전환됨
 */
export async function DashboardStats() {
  const adminLogger = logger.createLogger('DASHBOARD_STATS');

  let todayContactCount = 0;
  let yesterdayContactCount = 0;
  let newCompanyCount = 0;
  let yesterdayCompanyCount = 0;
  let dailyContactsData: { date: string; count: number; fullDate: string }[] = [];
  let newCompanies: Company[] = [];
  let referralSources: ContactReferral[] = [];
  let feedbackCounts: FeedbackCounts = { pending: 0, in_progress: 0, total: 0 };

  try {
    // 병렬로 모든 통계 데이터 가져오기 (NestJS API 경유)
    const [statsData, companiesData, feedbackData] = await Promise.all([
      // 1. Contacts 통계 (NestJS dashboard-stats API)
      serverGetDashboardStats(),

      // 2. 최근 30일 신규 업체 목록
      serverGetRecentCompanies(30),

      // 3. 불편사항 통계
      serverGetFeedbackStatusCounts(),
    ]);

    // Dashboard stats 결과 처리
    if (statsData && statsData.length > 0) {
      const stats = statsData[0];
      yesterdayContactCount = Number(stats.yesterday_contact_count) || 0;
      todayContactCount = Number(stats.today_contact_count) || 0;
      newCompanyCount = Number(stats.new_company_count) || 0;
      yesterdayCompanyCount = Number(stats.yesterday_company_count) || 0;
      dailyContactsData =
        (stats.daily_contacts as Array<{ date: string; count: number; fullDate: string }>) || [];
      referralSources = (stats.referral_sources as ContactReferral[]) || [];
    }

    // Companies 결과 처리
    newCompanies = (companiesData || []).map((c) => ({
      id: c.id,
      company_name: c.company_name,
      created_at: c.created_at || '',
    }));

    // Feedback 결과 처리
    feedbackCounts = {
      pending: feedbackData.pending || 0,
      in_progress: feedbackData.in_progress || 0,
      total: feedbackData.total || 0,
    };
  } catch (error) {
    adminLogger.error('Error in DashboardStats', error);
  }

  // 어제 대비 변화 계산
  const contactChange = todayContactCount - yesterdayContactCount;

  // 오늘 등록된 업체 계산
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const todayCompanies = newCompanies.filter((company) => {
    const createdDate = new Date(company.created_at);
    return createdDate >= todayStart && createdDate <= todayEnd;
  }).length;

  const companyChange = todayCompanies - yesterdayCompanyCount;

  return (
    <StatsCards
      todayContactCount={todayContactCount}
      contactChange={contactChange}
      newCompanyCount={newCompanyCount}
      companyChange={companyChange}
      dailyContactsData={dailyContactsData}
      newCompanies={newCompanies}
      referralSources={referralSources}
      feedbackCounts={feedbackCounts}
    />
  );
}
