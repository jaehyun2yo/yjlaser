'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  FaEnvelope,
  FaBuilding,
  FaChartLine,
  FaRoute,
  FaExclamationTriangle,
  FaCalendarAlt,
  FaNewspaper,
  FaImages,
  FaClock,
  FaCog,
  FaUsers,
  FaCircle,
  FaSpinner,
} from 'react-icons/fa';
// FaNewspaper, FaImages는 빠른링크에서 사용
import Link from 'next/link';
// Dynamic imports for chart modals (recharts ~150KB each)
// loading: null — 모달은 기본 닫힌 상태이므로 fallback 불필요
const ContactsChartModal = dynamic(
  () => import('./ContactsChartModal').then((mod) => ({ default: mod.ContactsChartModal })),
  { ssr: false }
);

const NewCompaniesModal = dynamic(
  () => import('./NewCompaniesModal').then((mod) => ({ default: mod.NewCompaniesModal })),
  { ssr: false }
);

const ReferralSourceModal = dynamic(
  () => import('./ReferralSourceModal').then((mod) => ({ default: mod.ReferralSourceModal })),
  { ssr: false }
);

const LoadingTestModal = dynamic(
  () => import('./LoadingTestModal').then((mod) => ({ default: mod.LoadingTestModal })),
  { ssr: false }
);

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

interface TodayBooking {
  id: number;
  visit_date: string;
  visit_time_slot: string;
  company_name: string;
  status: string;
}

interface ActiveSession {
  id: number;
  user_type: 'admin' | 'company';
  user_id: number;
  username: string;
  company_name: string | null;
  last_activity: string;
}

interface ActiveSessionsCount {
  total_count: number;
  admin_count: number;
  company_count: number;
}

interface DashboardClientProps {
  newContactCount: number;
  todayContactCount: number;
  newCompanyCount: number;
  contactChange: number;
  companyChange: number;
  dailyContactsData: { date: string; count: number; fullDate: string }[];
  newCompanies: Company[];
  referralSources: ContactReferral[];
  feedbackCounts: FeedbackCounts;
  upcomingBookings: TodayBooking[];
  activeSessions: ActiveSession[];
  activeSessionsCount: ActiveSessionsCount;
}

// 시간 슬롯 포맷팅
function formatTimeSlot(slot: string): string {
  const times: Record<string, string> = {
    slot1: '09:00~10:00',
    slot2: '10:00~11:00',
    slot3: '11:00~12:00',
    slot4: '13:00~14:00',
    slot5: '14:00~15:00',
    slot6: '15:00~16:00',
    slot7: '16:00~17:00',
  };
  return times[slot] || slot;
}

// 상대 활동 시간 포맷팅
function formatLastActivity(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 5) return `${diffMinutes}분 전`;
  return '5분 이상 전';
}

export function DashboardClient({
  newContactCount,
  todayContactCount,
  newCompanyCount,
  contactChange,
  companyChange,
  dailyContactsData,
  newCompanies,
  referralSources,
  feedbackCounts,
  upcomingBookings: todayBookings,
  activeSessions,
  activeSessionsCount,
}: DashboardClientProps) {
  const [contactsModalOpen, setContactsModalOpen] = useState(false);
  const [companiesModalOpen, setCompaniesModalOpen] = useState(false);
  const [referralModalOpen, setReferralModalOpen] = useState(false);
  const [loadingTestModalOpen, setLoadingTestModalOpen] = useState(false);

  const totalReferrals = referralSources.reduce((sum, item) => sum + item.count, 0);
  const topReferral = referralSources.length > 0 ? referralSources[0] : null;
  const pendingFeedback = feedbackCounts.pending + feedbackCounts.in_progress;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>대시보드</h1>
          <p className={`text-sm ${TEXT_COLOR.secondary}`}>주요 현황을 한눈에 파악하세요</p>
        </div>
      </div>

      {/* 긴급 알림 */}
      {(newContactCount > 0 || pendingFeedback > 0) && (
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
      )}

      {/* 통계 카드 그리드 (6열) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 오늘 문의 */}
        <button
          onClick={() => setContactsModalOpen(true)}
          className={`text-left ${BG_COLOR.card} p-4 rounded-xl shadow-sm hover:shadow-md transition-all border ${BORDER_COLOR.default}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-2 ${BG_COLOR.brandLight} rounded-lg`}>
              <FaChartLine className="text-orange-500 text-sm" />
            </div>
            <span className={`text-xs ${TEXT_COLOR.secondary}`}>문의</span>
          </div>
          <p className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>{todayContactCount}</p>
          <p
            className={`text-xs mt-1 ${contactChange > 0 ? 'text-red-500' : contactChange < 0 ? 'text-blue-500' : 'text-gray-400'}`}
          >
            어제 대비{' '}
            {contactChange > 0 ? `+${contactChange}` : contactChange < 0 ? contactChange : '-'}
          </p>
        </button>

        {/* 신규 업체 */}
        <button
          onClick={() => setCompaniesModalOpen(true)}
          className={`text-left ${BG_COLOR.card} p-4 rounded-xl shadow-sm hover:shadow-md transition-all border ${BORDER_COLOR.default}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-2 ${BG_COLOR.info} rounded-lg`}>
              <FaBuilding className="text-blue-500 text-sm" />
            </div>
            <span className={`text-xs ${TEXT_COLOR.secondary}`}>업체</span>
          </div>
          <p className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>+{newCompanyCount}</p>
          <p className="text-xs mt-1 text-gray-400">최근 30일</p>
        </button>

        {/* 유입경로 */}
        <button
          onClick={() => setReferralModalOpen(true)}
          className={`text-left ${BG_COLOR.card} p-4 rounded-xl shadow-sm hover:shadow-md transition-all border ${BORDER_COLOR.default}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <FaRoute className="text-purple-500 text-sm" />
            </div>
            <span className={`text-xs ${TEXT_COLOR.secondary}`}>유입</span>
          </div>
          <p className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>{totalReferrals}</p>
          <p className="text-xs mt-1 text-gray-400 truncate">
            {topReferral?.referral_source || '-'}
          </p>
        </button>

        {/* 불편사항 */}
        <Link
          href="/admin/feedback"
          className={`text-left ${BG_COLOR.card} p-4 rounded-xl shadow-sm hover:shadow-md transition-all border ${BORDER_COLOR.default}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-2 ${BG_COLOR.error} rounded-lg`}>
              <FaExclamationTriangle className="text-red-500 text-sm" />
            </div>
            <span className={`text-xs ${TEXT_COLOR.secondary}`}>불편</span>
          </div>
          <p className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>{feedbackCounts.total}</p>
          <p className="text-xs mt-1 text-gray-400">대기 {feedbackCounts.pending}</p>
        </Link>
      </div>

      {/* 메인 콘텐츠 영역 (2열) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 오늘 예약 */}
        <div
          className={`${BG_COLOR.card} rounded-xl shadow-sm border ${BORDER_COLOR.default} overflow-hidden`}
        >
          <div
            className={`flex items-center justify-between px-4 py-3 border-b ${BORDER_COLOR.light} ${BG_COLOR.success}`}
          >
            <div className="flex items-center gap-2">
              <FaCalendarAlt className={TEXT_COLOR.success} />
              <span className={`font-medium ${TEXT_COLOR.primary}`}>오늘 예약</span>
              <span className={`text-sm ${TEXT_COLOR.success} font-bold`}>
                {todayBookings.length}건
              </span>
            </div>
            <Link
              href="/admin/integration/bookings"
              className="text-xs text-orange-500 hover:underline"
            >
              전체보기
            </Link>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {todayBookings.length === 0 ? (
              <div className="p-6 text-center text-gray-400">
                <FaCalendarAlt className="mx-auto text-2xl mb-2 opacity-30" />
                <p className="text-sm">오늘 예약이 없습니다</p>
              </div>
            ) : (
              todayBookings.map((booking) => (
                <div
                  key={booking.id}
                  className={`flex items-center gap-3 px-4 py-3 ${BG_COLOR.hoverMuted}/30`}
                >
                  <div className="flex items-center gap-2 min-w-[90px]">
                    <FaClock className="text-green-500 text-sm" />
                    <span className={`text-sm font-medium ${TEXT_COLOR.primary}`}>
                      {formatTimeSlot(booking.visit_time_slot)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${TEXT_COLOR.secondary} truncate`}>
                      {booking.company_name}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 현재 접속자 */}
        <div
          className={`${BG_COLOR.card} rounded-xl shadow-sm border ${BORDER_COLOR.default} overflow-hidden`}
        >
          <div
            className={`flex items-center justify-between px-4 py-3 border-b ${BORDER_COLOR.light} ${BG_COLOR.info}`}
          >
            <div className="flex items-center gap-2">
              <FaUsers className={TEXT_COLOR.info} />
              <span className={`font-medium ${TEXT_COLOR.primary}`}>현재 접속자</span>
              <span className={`text-sm ${TEXT_COLOR.info} font-bold`}>
                {activeSessionsCount.total_count}명
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className={TEXT_COLOR.secondary}>
                관리자 {activeSessionsCount.admin_count} · 업체 {activeSessionsCount.company_count}
              </span>
            </div>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-60 overflow-y-auto">
            {activeSessions.length === 0 ? (
              <div className="p-6 text-center text-gray-400">
                <FaUsers className="mx-auto text-2xl mb-2 opacity-30" />
                <p className="text-sm">현재 접속자가 없습니다</p>
              </div>
            ) : (
              activeSessions.map((session) => (
                <div
                  key={session.id}
                  className={`flex items-center gap-3 px-4 py-3 ${BG_COLOR.hoverMuted}/30`}
                >
                  <FaCircle
                    className={`text-[8px] flex-shrink-0 ${
                      session.user_type === 'admin' ? 'text-orange-500' : 'text-green-500'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${TEXT_COLOR.secondary} truncate`}>
                      {session.user_type === 'admin' ? (
                        <span className={`font-medium ${TEXT_COLOR.brand}`}>관리자</span>
                      ) : (
                        session.company_name || `업체 #${session.user_id}`
                      )}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {formatLastActivity(session.last_activity)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 빠른 링크 */}
      <div className={`${BG_COLOR.card} rounded-xl shadow-sm border ${BORDER_COLOR.default} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <span className={`font-medium ${TEXT_COLOR.primary}`}>바로가기</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            {
              href: '/admin/work-management',
              label: '문의하기',
              icon: FaEnvelope,
              color: 'text-orange-500',
            },
            {
              href: '/admin/integration/companies',
              label: '업체관리',
              icon: FaBuilding,
              color: 'text-blue-500',
            },
            {
              href: '/admin/integration/bookings',
              label: '예약관리',
              icon: FaCalendarAlt,
              color: 'text-green-500',
            },
            {
              href: '/admin/feedback',
              label: '불편사항',
              icon: FaExclamationTriangle,
              color: 'text-red-500',
            },
            { href: '/admin/posts', label: '공지사항', icon: FaNewspaper, color: 'text-cyan-500' },
            {
              href: '/admin/portfolio',
              label: '포트폴리오',
              icon: FaImages,
              color: 'text-purple-500',
            },
            { href: '/admin/system', label: '시스템', icon: FaCog, color: 'text-gray-500' },
          ].map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg ${BG_COLOR.muted} ${BG_COLOR.hoverMuted} transition-colors text-sm ${TEXT_COLOR.secondary}`}
              >
                <Icon className={`text-sm ${link.color}`} />
                {link.label}
              </Link>
            );
          })}
          {/* 로딩 테스트 버튼 */}
          <button
            onClick={() => setLoadingTestModalOpen(true)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg ${BG_COLOR.warning} ${BG_COLOR.hoverWarningDark} transition-colors text-sm ${TEXT_COLOR.warningStrong} border ${BORDER_COLOR.warning}`}
          >
            <FaSpinner className="text-sm text-yellow-500" />
            로딩 테스트
          </button>
        </div>
      </div>

      {/* 모달들 */}
      <ContactsChartModal
        isOpen={contactsModalOpen}
        onClose={() => setContactsModalOpen(false)}
        data={dailyContactsData}
        yesterdayChange={contactChange}
      />
      <NewCompaniesModal
        isOpen={companiesModalOpen}
        onClose={() => setCompaniesModalOpen(false)}
        companies={newCompanies}
        yesterdayChange={companyChange}
      />
      <ReferralSourceModal
        isOpen={referralModalOpen}
        onClose={() => setReferralModalOpen(false)}
        referralSources={referralSources}
      />
      <LoadingTestModal
        isOpen={loadingTestModalOpen}
        onClose={() => setLoadingTestModalOpen(false)}
      />
    </div>
  );
}
