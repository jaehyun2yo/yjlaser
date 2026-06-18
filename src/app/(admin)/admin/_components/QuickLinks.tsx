'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  FaEnvelope,
  FaBuilding,
  FaCalendarAlt,
  FaExclamationTriangle,
  FaNewspaper,
  FaImages,
  FaCog,
  FaSpinner,
} from 'react-icons/fa';

// loading: null — 모달은 기본 닫힌 상태이므로 fallback 불필요
const LoadingTestModal = dynamic(
  () => import('../LoadingTestModal').then((mod) => ({ default: mod.LoadingTestModal })),
  { ssr: false }
);

/**
 * 대시보드 빠른 링크 - 클라이언트 컴포넌트
 */
export function QuickLinks() {
  const [loadingTestModalOpen, setLoadingTestModalOpen] = useState(false);

  return (
    <>
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
            {
              href: '/admin/integration/system',
              label: '시스템',
              icon: FaCog,
              color: 'text-gray-500',
            },
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
            className={`flex items-center gap-2 px-3 py-2 rounded-lg ${BG_COLOR.warning} ${BG_COLOR.hoverWarningSolid} transition-colors text-sm ${TEXT_COLOR.warningStrong} border ${BORDER_COLOR.warning}`}
          >
            <FaSpinner className="text-sm text-yellow-500" />
            로딩 테스트
          </button>
        </div>
      </div>

      <LoadingTestModal
        isOpen={loadingTestModalOpen}
        onClose={() => setLoadingTestModalOpen(false)}
      />
    </>
  );
}
