'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { FaChartLine, FaBuilding, FaRoute, FaExclamationTriangle } from 'react-icons/fa';

// Dynamic imports for chart modals
// loading: null — 모달은 기본 닫힌 상태이므로 fallback 불필요
const ContactsChartModal = dynamic(
  () => import('../ContactsChartModal').then((mod) => ({ default: mod.ContactsChartModal })),
  { ssr: false }
);

const NewCompaniesModal = dynamic(
  () => import('../NewCompaniesModal').then((mod) => ({ default: mod.NewCompaniesModal })),
  { ssr: false }
);

const ReferralSourceModal = dynamic(
  () => import('../ReferralSourceModal').then((mod) => ({ default: mod.ReferralSourceModal })),
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

interface StatsCardsProps {
  todayContactCount: number;
  contactChange: number;
  newCompanyCount: number;
  companyChange: number;
  dailyContactsData: { date: string; count: number; fullDate: string }[];
  newCompanies: Company[];
  referralSources: ContactReferral[];
  feedbackCounts: FeedbackCounts;
}

export function StatsCards({
  todayContactCount,
  contactChange,
  newCompanyCount,
  companyChange,
  dailyContactsData,
  newCompanies,
  referralSources,
  feedbackCounts,
}: StatsCardsProps) {
  const [contactsModalOpen, setContactsModalOpen] = useState(false);
  const [companiesModalOpen, setCompaniesModalOpen] = useState(false);
  const [referralModalOpen, setReferralModalOpen] = useState(false);

  const totalReferrals = referralSources.reduce((sum, item) => sum + item.count, 0);
  const topReferral = referralSources.length > 0 ? referralSources[0] : null;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 오늘 문의 */}
        <button
          onClick={() => setContactsModalOpen(true)}
          className={`text-left ${BG_COLOR.card} p-3 rounded-lg shadow-sm hover:shadow-md transition-all border ${BORDER_COLOR.default}`}
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
          className={`text-left ${BG_COLOR.card} p-3 rounded-lg shadow-sm hover:shadow-md transition-all border ${BORDER_COLOR.default}`}
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
          className={`text-left ${BG_COLOR.card} p-3 rounded-lg shadow-sm hover:shadow-md transition-all border ${BORDER_COLOR.default}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-2 ${BG_COLOR.purpleLight} rounded-lg`}>
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
          className={`text-left ${BG_COLOR.card} p-3 rounded-lg shadow-sm hover:shadow-md transition-all border ${BORDER_COLOR.default}`}
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
    </>
  );
}
