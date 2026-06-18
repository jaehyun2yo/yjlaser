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
} from 'react-icons/fa';
import { logoutAction } from '@/app/actions/auth';
import { BG_COLOR, BORDER_COLOR, BOTTOM_NAV, MOBILE_SLIDE_MENU, TEXT_COLOR } from '@/lib/styles';
import { WebhardBadge } from '@/components/WebhardBadge';
import { useTheme } from 'next-themes';

// 테마 토글 행 컴포넌트 (전체 영역 클릭 가능)
function ThemeToggleRow() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={`flex items-center justify-between px-4 py-3 rounded-lg ${BG_COLOR.lightDark} border ${BORDER_COLOR.default}`}
      >
        <span className={`text-base font-medium ${TEXT_COLOR.bright}`}>테마</span>
        <div className={`w-8 h-8 rounded-lg ${BG_COLOR.light}`} />
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
      className={`flex items-center justify-between w-full px-4 py-3 rounded-lg ${BG_COLOR.lightDark} border ${BORDER_COLOR.default} ${BG_COLOR.hoverDark} transition-colors cursor-pointer`}
    >
      <span className={`text-base font-medium ${TEXT_COLOR.bright}`}>테마</span>
      <div
        className={`w-8 h-8 flex items-center justify-center rounded-lg ${BG_COLOR.light} ${TEXT_COLOR.themeToggle}`}
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

// 네비게이션 아이템 타입
interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  hasBadge?: boolean;
}

// 하단 버튼 아이템 타입
interface BottomButtonItem {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  isActive?: boolean;
}

interface MobileBottomNavProps {
  // 슬라이드 메뉴용 네비게이션 아이템
  navItems: NavItem[];
  // 슬라이드 메뉴용 액션 아이템 (웹하드, 정보수정 등)
  actionItems?: NavItem[];
  // 하단 바에 표시할 버튼들
  bottomButtons: BottomButtonItem[];
  // 추가 슬롯 (검색 영역 등)
  topSlot?: React.ReactNode;
  // 로그아웃 버튼 표시 여부
  showLogout?: boolean;
  // 테마 토글 표시 여부
  showThemeToggle?: boolean;
  // 활성 경로 체크 함수 (커스텀)
  isActiveCheck?: (href: string) => boolean;
}

export function MobileBottomNav({
  navItems,
  actionItems = [],
  bottomButtons,
  topSlot,
  showLogout = true,
  showThemeToggle = true,
  isActiveCheck,
}: MobileBottomNavProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
    if (isActiveCheck) {
      return isActiveCheck(href);
    }
    return pathname?.startsWith(href);
  };

  return (
    <>
      {/* 하단 네비게이션 */}
      <div className={BOTTOM_NAV.container}>
        {/* 상단 슬롯 (검색 영역 등) */}
        {topSlot}

        {/* 하단 메뉴 버튼들 */}
        <div className="flex items-center justify-center">
          <div className="flex items-center justify-center gap-16 px-6 py-2">
            {bottomButtons.map((button, index) => {
              if (button.href) {
                return (
                  <Link
                    key={index}
                    href={button.href}
                    className={`${BOTTOM_NAV.actionButton} ${button.isActive ? 'text-[#ED6C00]' : ''}`}
                    aria-label={button.label}
                  >
                    {button.icon}
                  </Link>
                );
              }
              return (
                <button
                  key={index}
                  onClick={button.onClick}
                  className={`${BOTTOM_NAV.actionButton} ${button.isActive ? 'text-[#ED6C00]' : ''}`}
                  aria-label={button.label}
                >
                  {button.icon}
                </button>
              );
            })}
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

      {/* 슬라이드 메뉴 (오른쪽에서 슬라이드) */}
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
                    {navItems.map((item, index) => {
                      const isActive = isActiveLink(item.href);
                      return (
                        <motion.div
                          key={item.href}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1, duration: 0.3 }}
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
                            {item.hasBadge && <WebhardBadge />}
                          </Link>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* 액션 버튼 영역 */}
                  {(actionItems.length > 0 || showThemeToggle || showLogout) && (
                    <div className={MOBILE_SLIDE_MENU.divider}>
                      <div className={MOBILE_SLIDE_MENU.actionSection}>
                        {actionItems.map((item, index) => (
                          <motion.div
                            key={item.href}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: (navItems.length + index) * 0.1, duration: 0.3 }}
                          >
                            <Link
                              href={item.href}
                              onClick={() => setIsMenuOpen(false)}
                              className={MOBILE_SLIDE_MENU.actionButton}
                            >
                              {item.icon}
                              <span>{item.label}</span>
                              {item.hasBadge && <WebhardBadge />}
                            </Link>
                          </motion.div>
                        ))}

                        {/* 테마 토글 */}
                        {showThemeToggle && <ThemeToggleRow />}

                        {/* 로그아웃 */}
                        {showLogout && (
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
                        )}
                      </div>
                    </div>
                  )}
                </nav>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// 자주 사용되는 네비게이션 아이템 프리셋
export const COMPANY_NAV_ITEMS: NavItem[] = [
  { href: '/company/dashboard', label: '진행상황', icon: <FaClipboardList /> },
  { href: '/company/billing', label: '청구서', icon: <FaFileInvoice /> },
  { href: '/company/feedback', label: '불편사항', icon: <FaExclamationCircle /> },
];

export const COMPANY_ACTION_ITEMS: NavItem[] = [
  { href: '/webhard', label: '웹하드', icon: <FaCloud />, hasBadge: true },
  { href: '/company/profile', label: '정보수정', icon: <FaUserEdit /> },
];

export const WEBHARD_NAV_ITEMS: NavItem[] = [
  { href: '/', label: '홈', icon: <FaHome /> },
  { href: '/company/dashboard', label: '진행상황', icon: <FaClipboardList /> },
  { href: '/company/billing', label: '청구서', icon: <FaFileInvoice /> },
  { href: '/company/feedback', label: '불편사항', icon: <FaExclamationCircle /> },
];

export const WEBHARD_ACTION_ITEMS: NavItem[] = [
  { href: '/company/profile', label: '정보수정', icon: <FaUserEdit /> },
];
