'use client';

import { useState, useEffect } from 'react';
import { CompanySidebar } from './CompanySidebar';
import { CompanyTopBar } from './CompanyTopBar';
import { CompanyMobileNav } from './CompanyMobileNav';
import { COMPANY_THEME } from '@/lib/styles';
import { useNotifications } from '@/app/company/_lib/hooks';
import { useSessionHeartbeat } from '@/lib/hooks/useSessionHeartbeat';

const DEFAULT_SIDEBAR_WIDTH = 240;
const SIDEBAR_WIDTH_KEY = 'company-sidebar-width';

interface CompanyLayoutClientProps {
  children: React.ReactNode;
  companyName: string;
  contacts?: Array<{
    id: number;
    inquiry_title?: string;
    name?: string;
    status?: string;
    created_at?: string;
    process_stage?: string;
  }>;
}

export function CompanyLayoutClient({
  children,
  companyName,
  contacts = [],
}: CompanyLayoutClientProps) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { unreadCount } = useNotifications();

  // 세션 하트비트 (접속 상태 유지)
  useSessionHeartbeat(true);

  // 저장된 사이드바 너비 복원
  useEffect(() => {
    const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (savedWidth) {
      setSidebarWidth(parseInt(savedWidth, 10));
    }
  }, []);

  const handleSidebarResize = (width: number) => {
    setSidebarWidth(width);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, width.toString());
  };

  return (
    <div className={`min-h-screen ${COMPANY_THEME.pageBackground}`}>
      {/* 데스크톱 사이드바 */}
      <div className="hidden lg:block">
        <CompanySidebar
          companyName={companyName}
          width={sidebarWidth}
          onResize={handleSidebarResize}
        />
      </div>

      {/* 모바일 상단바 */}
      <CompanyTopBar companyName={companyName} notificationCount={unreadCount} />

      {/* 메인 콘텐츠 영역 */}
      <main
        className="min-h-screen lg:pt-0 pb-28 lg:pb-0 transition-[margin-left] duration-150"
        style={{ marginLeft: `var(--sidebar-width, 0px)` }}
      >
        <style jsx>{`
          @media (min-width: 1024px) {
            main {
              --sidebar-width: ${sidebarWidth}px;
            }
          }
        `}</style>
        <div className={COMPANY_THEME.contentPadding}>{children}</div>
      </main>

      {/* 모바일 하단 네비게이션 */}
      <CompanyMobileNav
        companyName={companyName}
        contacts={contacts}
        onSearchOpenChange={setIsSearchOpen}
      />
    </div>
  );
}
