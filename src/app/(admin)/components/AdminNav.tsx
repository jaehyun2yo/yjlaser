'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, Cloud, LogOut } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';
import { BG_COLOR, BORDER_COLOR, GLASS_BUTTON, TEXT_COLOR } from '@/lib/styles';
import { AdminBadge } from '@/components/AdminBadge';
import { WebhardBadge } from '@/components/WebhardBadge';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationCenter } from '@/components/NotificationCenter';
import { useSessionHeartbeat } from '@/lib/hooks/useSessionHeartbeat';

interface NavItem {
  href: string;
  label: string;
  showBadge?: boolean;
  badgeType?: 'contacts' | 'feedback';
}

const navItems: NavItem[] = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/work-management', label: '작업관리', showBadge: true, badgeType: 'contacts' },
  { href: '/admin/integration/companies', label: '통합관리' },
  { href: '/admin/posts', label: '공지사항' },
  { href: '/admin/portfolio', label: '포트폴리오' },
  { href: '/admin/feedback', label: '불편사항', showBadge: true, badgeType: 'feedback' },
];

export function AdminNav() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // 세션 하트비트 (접속 상태 유지)
  useSessionHeartbeat(true);

  // 모바일 메뉴 열림 시 스크롤 방지
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  // 경로 변경 시 모바일 메뉴 닫기
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const isActiveLink = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin';
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* 네비게이션 바 */}
      <header className={`sticky top-0 z-40 ${BG_COLOR.page} border-b ${BORDER_COLOR.default}`}>
        <div className="px-4 md:px-4 lg:px-8">
          <div className="flex items-center justify-between h-14 md:h-16 lg:h-[72px]">
            {/* 좌측: 로고 + 관리자 */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* 로고 */}
              <Link href="/" className="flex items-center">
                <div className="h-7 md:h-8 lg:h-10 w-auto overflow-hidden flex items-center">
                  <Image
                    src="/mainLogo.svg"
                    alt="로고"
                    width={120}
                    height={40}
                    className="max-h-full max-w-full object-contain"
                    priority
                  />
                </div>
              </Link>

              {/* 구분선 */}
              <div className="w-px h-5 md:h-6 lg:h-7 bg-border" />

              {/* 관리자 타이틀 */}
              <span
                className={`text-sm md:text-base lg:text-lg font-semibold ${TEXT_COLOR.primary} leading-none`}
              >
                관리자
              </span>
            </div>

            {/* 중앙: 네비게이션 링크 (데스크톱) */}
            <nav className="hidden lg:flex flex-1 items-center justify-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    isActiveLink(item.href)
                      ? 'bg-brand text-white'
                      : `${TEXT_COLOR.secondary} ${TEXT_COLOR.hoverPrimary} ${BG_COLOR.hoverMuted}`
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {item.label}
                    {item.showBadge && item.badgeType && (
                      <AdminBadge userType="admin" type={item.badgeType} />
                    )}
                  </span>
                </Link>
              ))}
            </nav>

            {/* 우측: 액션 버튼들 */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* 웹하드 버튼 */}
              <Link href="/webhard" className={`relative ${GLASS_BUTTON.outline}`}>
                <Cloud className="w-3 h-3" />
                <span className="hidden sm:inline">웹하드</span>
                <WebhardBadge asIcon />
              </Link>

              {/* 알림 센터 */}
              <NotificationCenter />

              {/* 다크모드 토글 */}
              <ThemeToggle
                size="sm"
                variant="outline"
                className={`!w-auto !h-auto px-3 py-2 ${BORDER_COLOR.default} hover:border-brand hover:text-brand`}
              />

              {/* 로그아웃 */}
              <form action={logoutAction}>
                <button
                  type="submit"
                  className={`${GLASS_BUTTON.danger} active:scale-95 transition-transform`}
                  aria-label="로그아웃"
                >
                  <LogOut className="w-3 h-3" aria-hidden="true" />
                  <span className="hidden sm:inline">로그아웃</span>
                </button>
              </form>

              {/* 햄버거 메뉴 (모바일/태블릿) */}
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className={`lg:hidden p-1.5 text-muted-foreground ${TEXT_COLOR.hoverPrimary} ${BG_COLOR.hoverMuted} rounded-lg transition-colors`}
                aria-label="메뉴 열기"
              >
                <Menu className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 모바일/태블릿 사이드 메뉴 */}
      {/* 오버레이 */}
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-[60] lg:hidden transition-opacity duration-200 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMobileMenuOpen(false)}
      />

      {/* 메뉴 패널 */}
      <div
        className={`fixed top-0 right-0 h-full w-72 max-w-[85vw] z-[70] ${BG_COLOR.page} shadow-2xl border-l ${BORDER_COLOR.default} lg:hidden transition-transform duration-300 ease-out ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex flex-col h-full">
          {/* 헤더 */}
          <div className={`flex items-center justify-between p-4 border-b ${BORDER_COLOR.default}`}>
            <div className="flex items-center gap-2">
              <Link href="/" onClick={() => setIsMobileMenuOpen(false)}>
                <div className="h-7 w-auto overflow-hidden flex items-center">
                  <Image
                    src="/mainLogo.svg"
                    alt="로고"
                    width={84}
                    height={28}
                    className="max-h-full max-w-full object-contain"
                    priority
                  />
                </div>
              </Link>
              <div className="w-px h-5 bg-border" />
              <span className={`text-sm font-semibold ${TEXT_COLOR.primary}`}>관리자</span>
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className={`p-1.5 text-muted-foreground ${TEXT_COLOR.hoverPrimary} ${BG_COLOR.hoverMuted} rounded-lg transition-colors`}
              aria-label="메뉴 닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 네비게이션 */}
          <nav className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-1">
              {navItems.map((item, index) => (
                <div
                  key={item.href}
                  className={`transition-all duration-200 ${isMobileMenuOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-5'}`}
                  style={{ transitionDelay: isMobileMenuOpen ? `${index * 50}ms` : '0ms' }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${
                      isActiveLink(item.href)
                        ? 'bg-brand text-white'
                        : `${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}`
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.showBadge && item.badgeType && (
                      <AdminBadge userType="admin" type={item.badgeType} inline />
                    )}
                  </Link>
                </div>
              ))}
            </div>
          </nav>

          {/* 하단 버튼들 */}
          <div className={`p-4 border-t ${BORDER_COLOR.default} space-y-2`}>
            <div className="flex items-center gap-2">
              <Link
                href="/webhard"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2 flex-1 px-4 py-3 rounded-lg ${BG_COLOR.muted} ${BG_COLOR.hoverMuted} ${TEXT_COLOR.primary} transition-colors`}
              >
                <Cloud className="w-4 h-4" />
                <span className="text-sm font-semibold">웹하드</span>
                <WebhardBadge inline />
              </Link>
              {/* 다크모드 토글 */}
              <ThemeToggle
                size="md"
                variant="outline"
                className={`!w-auto !h-auto px-4 py-3 ${BORDER_COLOR.default} hover:border-brand hover:text-brand`}
              />
            </div>
            <form action={logoutAction} className="w-full">
              <button
                type="submit"
                className={`flex items-center gap-2 w-full px-4 py-3 rounded-lg ${BG_COLOR.muted} ${BG_COLOR.hoverError} ${TEXT_COLOR.primary} ${TEXT_COLOR.hoverError} transition-colors`}
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-semibold">로그아웃</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
