'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaBars,
  FaTimes,
  FaClipboardList,
  FaFileInvoice,
  FaExclamationCircle,
  FaCloud,
  FaUserEdit,
  FaSignOutAlt,
  FaHome,
  FaSearch,
  FaCog,
  FaFolder,
} from 'react-icons/fa';
import { logoutAction } from '@/app/actions/auth';
import { BOTTOM_NAV, MOBILE_SLIDE_MENU, TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';
import { WebhardBadge } from '@/components/WebhardBadge';
import { useTheme } from 'next-themes';

// 테마 토글 행 컴포넌트
function ThemeToggleRow() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={`flex items-center justify-between px-4 py-3 rounded-lg ${BG_COLOR.muted} border ${BORDER_COLOR.default}`}
      >
        <span className={`text-base font-medium ${TEXT_COLOR.secondary}`}>테마</span>
        <div className={`w-8 h-8 rounded-lg ${BG_COLOR.muted}`} />
      </div>
    );
  }

  const isDark = resolvedTheme === 'dark';

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <button
      onClick={toggleTheme}
      className={`flex items-center justify-between w-full px-4 py-3 rounded-lg ${BG_COLOR.muted} border ${BORDER_COLOR.default} ${BG_COLOR.hoverMuted} transition-colors cursor-pointer`}
    >
      <span className={`text-base font-medium ${TEXT_COLOR.secondary}`}>테마</span>
      <div
        className={`w-8 h-8 flex items-center justify-center rounded-lg ${BG_COLOR.muted} ${TEXT_COLOR.themeToggle}`}
      >
        {isDark ? (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        ) : (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        )}
      </div>
    </button>
  );
}

// 관리자용 네비게이션 아이템
const adminNavItems = [
  { href: '/', label: '홈', icon: <FaHome /> },
  { href: '/admin', label: '관리자', icon: <FaCog /> },
];

// 업체용 네비게이션 아이템
const companyNavItems = [
  { href: '/', label: '홈', icon: <FaHome /> },
  { href: '/company/dashboard', label: '진행상황', icon: <FaClipboardList /> },
  { href: '/company/billing', label: '청구서', icon: <FaFileInvoice /> },
  { href: '/company/feedback', label: '불편사항', icon: <FaExclamationCircle /> },
];

const companyActionItems = [{ href: '/company/profile', label: '정보수정', icon: <FaUserEdit /> }];

interface WebhardMobileNavProps {
  userType: 'admin' | 'company';
  onSettingsClick: () => void;
  onSearchClick: () => void;
  onFolderClick: () => void;
}

export function WebhardMobileNav({
  userType,
  onSettingsClick,
  onSearchClick,
  onFolderClick,
}: WebhardMobileNavProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navItems = userType === 'admin' ? adminNavItems : companyNavItems;
  const actionItems = userType === 'admin' ? [] : companyActionItems;

  // 메뉴 열림 시 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMenuOpen]);

  // 경로 변경 시 메뉴 닫기
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // 활성 링크 체크
  const isActiveLink = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    if (href === '/webhard') {
      return pathname?.startsWith('/webhard');
    }
    return pathname?.startsWith(href);
  };

  return (
    <>
      {/* 하단 네비게이션 */}
      <div className={BOTTOM_NAV.container}>
        <div className="flex items-center justify-center">
          <div className="flex items-center justify-center gap-10 px-4 py-2">
            {/* 폴더 버튼 */}
            <button
              onClick={onFolderClick}
              className={`${BOTTOM_NAV.actionButton} text-[#ED6C00]`}
              aria-label="폴더 열기"
            >
              <FaFolder className="text-lg" />
            </button>

            {/* 검색 버튼 */}
            <button onClick={onSearchClick} className={BOTTOM_NAV.actionButton} aria-label="검색">
              <FaSearch className="text-lg" />
            </button>

            {/* 설정 버튼 */}
            <button onClick={onSettingsClick} className={BOTTOM_NAV.actionButton} aria-label="설정">
              <FaCog className="text-lg" />
            </button>

            {/* 메뉴 버튼 */}
            <button
              onClick={() => setIsMenuOpen(true)}
              className={BOTTOM_NAV.menuButton}
              aria-label="메뉴 열기"
            >
              <FaBars className="text-lg" />
            </button>
          </div>
        </div>
      </div>

      {/* 슬라이드 메뉴 */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* 오버레이 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={MOBILE_SLIDE_MENU.overlay}
              onClick={() => setIsMenuOpen(false)}
            />

            {/* 메뉴 패널 */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={MOBILE_SLIDE_MENU.panelRight}
              style={{ backgroundColor: 'transparent' }}
            >
              <div className={MOBILE_SLIDE_MENU.panelInner}>
                {/* 메뉴 헤더 */}
                <div className={MOBILE_SLIDE_MENU.header}>
                  <Link href="/" className="flex items-center" onClick={() => setIsMenuOpen(false)}>
                    <div className={MOBILE_SLIDE_MENU.logoContainer}>
                      <Image
                        src="/mainLogo.svg"
                        alt="회사 로고"
                        width={120}
                        height={40}
                        className={MOBILE_SLIDE_MENU.logoImage}
                        priority
                      />
                    </div>
                  </Link>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsMenuOpen(false)}
                    className={MOBILE_SLIDE_MENU.closeButton}
                    aria-label="메뉴 닫기"
                  >
                    <FaTimes className="text-lg" />
                  </motion.button>
                </div>

                {/* 네비게이션 */}
                <nav className={MOBILE_SLIDE_MENU.nav}>
                  <div className={MOBILE_SLIDE_MENU.navItemsContainer}>
                    {/* 웹하드 (현재 페이지) */}
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0, duration: 0.3 }}
                    >
                      <Link
                        href="/webhard"
                        onClick={() => setIsMenuOpen(false)}
                        className={MOBILE_SLIDE_MENU.navItemActive}
                      >
                        <span className={MOBILE_SLIDE_MENU.navItemIconActive}>
                          <FaCloud />
                        </span>
                        <span>웹하드</span>
                        <WebhardBadge />
                      </Link>
                    </motion.div>

                    {navItems.map((item, index) => {
                      const isActive = isActiveLink(item.href);
                      return (
                        <motion.div
                          key={item.href}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: (index + 1) * 0.1, duration: 0.3 }}
                        >
                          <Link
                            href={item.href}
                            onClick={() => setIsMenuOpen(false)}
                            className={
                              isActive ? MOBILE_SLIDE_MENU.navItemActive : MOBILE_SLIDE_MENU.navItem
                            }
                          >
                            <span
                              className={
                                isActive
                                  ? MOBILE_SLIDE_MENU.navItemIconActive
                                  : MOBILE_SLIDE_MENU.navItemIcon
                              }
                            >
                              {item.icon}
                            </span>
                            <span>{item.label}</span>
                          </Link>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* 액션 버튼 영역 */}
                  <div className={MOBILE_SLIDE_MENU.divider}>
                    <div className={MOBILE_SLIDE_MENU.actionSection}>
                      {actionItems.map((item, index) => (
                        <motion.div
                          key={item.href}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: (navItems.length + index + 1) * 0.1, duration: 0.3 }}
                        >
                          <Link
                            href={item.href}
                            onClick={() => setIsMenuOpen(false)}
                            className={MOBILE_SLIDE_MENU.actionButton}
                          >
                            {item.icon}
                            <span>{item.label}</span>
                          </Link>
                        </motion.div>
                      ))}

                      {/* 테마 토글 */}
                      <ThemeToggleRow />

                      {/* 로그아웃 */}
                      <form action={logoutAction}>
                        <motion.button
                          type="submit"
                          whileTap={{ scale: 0.95 }}
                          className={MOBILE_SLIDE_MENU.logoutButton}
                        >
                          <FaSignOutAlt className="text-base" />
                          <span>로그아웃</span>
                        </motion.button>
                      </form>
                    </div>
                  </div>
                </nav>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
