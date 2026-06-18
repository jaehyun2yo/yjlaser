'use client';

import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { FaSignOutAlt, FaUserCog, FaBars, FaTimes, FaCloud } from 'react-icons/fa';
import { logoutAction } from '@/app/actions/auth';
import { AdminNotificationBadge } from './AdminNotificationBadge';
import { ThemeToggle } from './ThemeToggle';
import {
  GLASS_BUTTON,
  HEADER_NAV_TEXT,
  HEADER_NAV_BUTTON,
  TEXT_COLOR,
  BG_COLOR,
  BORDER_COLOR,
} from '@/lib/styles';

// WebhardBadge를 lazy loading으로 변경하여 초기 로드 시 API 호출 방지
const WebhardBadge = lazy(() =>
  import('./WebhardBadge').then((mod) => ({ default: mod.WebhardBadge }))
);

interface HeaderProps {
  isAuthenticated?: boolean;
  userType?: 'admin' | 'company' | null;
  companyName?: string | null;
}

export default function Header({
  isAuthenticated = false,
  userType = null,
  companyName = null,
}: HeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const headerRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  // 스크롤 방향 감지 - 내리면 숨기고, 올리면 보이기
  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;

          // 스크롤 위치 감지 (배경 효과용)
          setIsScrolled(currentScrollY > 10);

          // 스크롤 방향 감지 - 최상단 근처에서는 항상 보이기
          if (currentScrollY < 100) {
            setIsHeaderVisible(true);
          } else if (currentScrollY > lastScrollY + 5) {
            // 스크롤 내리면 숨김 (5px 이상 움직였을 때만)
            setIsHeaderVisible(false);
          } else if (currentScrollY < lastScrollY - 5) {
            // 스크롤 올리면 표시 (5px 이상 움직였을 때만)
            setIsHeaderVisible(true);
          }

          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    // 초기 상태 설정
    setIsScrolled(window.scrollY > 10);
    setIsHeaderVisible(true);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [pathname]);

  // 모바일 메뉴 열릴 때 body 스크롤 방지
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

  // 관리자(/admin), 업체(/company/), 웹하드(/webhard), 홈페이지(/), 로그인/회원가입 페이지에서는 이 Header를 표시하지 않음
  // 홈페이지는 HomeHeader 컴포넌트를 사용
  // 로그인/회원가입 페이지는 원페이지 형식
  if (
    pathname === '/' ||
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/company/') ||
    pathname?.startsWith('/webhard') ||
    pathname?.startsWith('/worker') ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/register')
  ) {
    return null;
  }

  const navItems = [
    { href: '/about', label: '소개' },
    { href: '/portfolio', label: '포트폴리오' },
    { href: '/notice', label: '공지사항' },
    { href: '/contact', label: '문의하기' },
  ];

  // 색상 전환 애니메이션 클래스
  const colorTransitionClass = 'transition-colors duration-200';

  return (
    <>
      <header
        ref={headerRef}
        className={`fixed top-0 left-0 right-0 z-50 border-b transition-all duration-300 ease-in-out ${
          isScrolled
            ? 'bg-transparent backdrop-blur-xl border-white/20 shadow-lg shadow-black/5'
            : 'bg-transparent backdrop-blur-none border-transparent'
        }`}
        style={{
          transform: isHeaderVisible ? 'translateY(0)' : 'translateY(-100%)',
        }}
        role="banner"
      >
        {/* 모바일: h-14 (56px), 태블릿: h-16 (64px), 데스크톱: h-[72px] */}
        <div className="flex justify-between items-center px-4 py-3 h-14 sm:px-6 md:px-12 md:py-3.5 md:h-16 lg:px-16 lg:py-4 lg:h-[72px] xl:px-20">
          {/* 로고 */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex-shrink-0"
          >
            <Link href="/" className="flex items-center" aria-label="홈으로 이동">
              {/* 모바일: h-7, 태블릿: h-8, 데스크톱: h-10 */}
              <div className="h-7 md:h-8 lg:h-10 w-auto overflow-hidden flex items-center">
                <Image
                  src="/mainLogo.svg"
                  alt="회사 로고"
                  width={120}
                  height={40}
                  className="max-h-full max-w-full object-contain"
                  priority
                />
              </div>
            </Link>
          </motion.div>

          {/* 모바일: 아이콘 버튼들 + 햄버거 메뉴 */}
          <div className="flex items-center gap-2 md:hidden">
            {/* 모바일 테마 토글 - 홈페이지가 아닌 경우에만 표시 */}
            {pathname !== '/' && (
              <ThemeToggle
                size="sm"
                variant="outline"
                className={`!w-auto !h-auto p-2.5 ${TEXT_COLOR.secondary} border ${BORDER_COLOR.default} hover:border-brand hover:text-brand`}
              />
            )}
            {isAuthenticated && (
              <>
                <Link
                  href="/webhard"
                  className={HEADER_NAV_BUTTON.mobile}
                  aria-label="웹하드로 이동"
                >
                  <FaCloud className="text-base" />
                  <Suspense fallback={null}>
                    <WebhardBadge asIcon={true} />
                  </Suspense>
                </Link>
                <Link
                  href={userType === 'company' ? '/company/dashboard' : '/admin'}
                  className={HEADER_NAV_BUTTON.mobile}
                  aria-label={
                    userType === 'company' ? '공정관리페이지로 이동' : '관리자 페이지로 이동'
                  }
                >
                  <FaUserCog className="text-base" />
                  {userType === 'admin' && <AdminNotificationBadge userType={userType} />}
                </Link>
              </>
            )}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`p-2 rounded-lg ${HEADER_NAV_TEXT.default} ${colorTransitionClass}`}
              style={{ backgroundColor: 'transparent' }}
              aria-label={isMobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu-panel"
            >
              {isMobileMenuOpen ? (
                <FaTimes className="text-base" />
              ) : (
                <FaBars className="text-base" />
              )}
            </motion.button>
          </div>

          {/* 태블릿/데스크톱: 네비게이션 */}
          <nav
            className="hidden md:flex items-center gap-2 lg:gap-6"
            role="navigation"
            aria-label="주요 메뉴"
          >
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <motion.div key={item.href} whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }}>
                  <Link
                    href={item.href}
                    className={`relative text-xs lg:text-sm ${colorTransitionClass} px-2.5 lg:px-3 py-1.5 lg:py-2 focus:outline-none ${
                      isActive
                        ? HEADER_NAV_TEXT.active
                        : `${HEADER_NAV_TEXT.default} ${HEADER_NAV_TEXT.hover} ${BG_COLOR.hoverMuted} rounded-lg`
                    }`}
                    aria-label={item.label}
                  >
                    {item.label}
                    {isActive && (
                      <motion.div
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#ED6C00]"
                        layoutId="activeNavUnderline"
                        transition={{
                          type: 'spring',
                          stiffness: 380,
                          damping: 30,
                        }}
                      />
                    )}
                  </Link>
                </motion.div>
              );
            })}

            {/* 로그인 상태에 따른 UI */}
            {isAuthenticated ? (
              <div className="ml-2 lg:ml-8 flex items-center gap-2 lg:gap-3">
                {/* 사용자 이름 - 데스크톱에서만 표시 */}
                <span
                  className={`hidden lg:block ${HEADER_NAV_TEXT.default} text-xs px-3 py-2 ${colorTransitionClass}`}
                >
                  {userType === 'company' && companyName ? companyName : '관리자'}
                </span>
                <Link
                  href="/webhard"
                  className={`relative ${HEADER_NAV_BUTTON.outline}`}
                  aria-label="웹하드로 이동"
                >
                  <FaCloud className="text-xs" aria-hidden="true" />
                  <span className="hidden sm:inline">웹하드</span>
                  <Suspense fallback={null}>
                    <WebhardBadge asIcon />
                  </Suspense>
                </Link>
                <Link
                  href={userType === 'company' ? '/company/dashboard' : '/admin'}
                  className={HEADER_NAV_BUTTON.outline}
                  aria-label={
                    userType === 'company' ? '공정관리페이지로 이동' : '관리자 페이지로 이동'
                  }
                >
                  <FaUserCog className="text-xs" aria-hidden="true" />
                  <span className="hidden sm:inline">
                    {userType === 'company' ? (
                      <span className="lg:hidden">공정관리</span>
                    ) : (
                      <span className="lg:hidden">관리자</span>
                    )}
                    <span className="hidden lg:inline">
                      {userType === 'company' ? '공정관리페이지' : '관리자 페이지'}
                    </span>
                  </span>
                  {userType === 'admin' && <AdminNotificationBadge userType={userType} />}
                </Link>
                {/* 테마 토글 버튼 */}
                <ThemeToggle size="sm" />
                <form action={logoutAction}>
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={GLASS_BUTTON.danger}
                    aria-label="로그아웃"
                  >
                    <FaSignOutAlt className="text-xs" aria-hidden="true" />
                    <span className="hidden sm:inline">로그아웃</span>
                  </motion.button>
                </form>
              </div>
            ) : (
              <div className="ml-4 lg:ml-8 flex items-center gap-2 lg:gap-3">
                {/* 테마 토글 버튼 */}
                <ThemeToggle size="sm" />
                <Link
                  href="/login"
                  className={`text-xs lg:text-sm ${colorTransitionClass} px-2.5 lg:px-3 py-1.5 lg:py-2 text-[#ED6C00] hover:text-[#d15f00] transition-all duration-200`}
                  aria-label="기업 로그인 페이지로 이동"
                >
                  기업 로그인
                </Link>
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* 모바일 메뉴 패널 */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* 오버레이 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />

            {/* 모바일 메뉴 패널 */}
            <motion.div
              id="mobile-menu-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-80 max-w-[85vw] z-[70] shadow-2xl backdrop-blur-xl border-l border-white/20 md:hidden"
              style={{ backgroundColor: 'transparent' }}
              role="dialog"
              aria-modal="true"
              aria-label="모바일 메뉴"
            >
              <div className="flex flex-col h-full">
                {/* 모바일 메뉴 헤더 */}
                <div
                  className={`flex items-center justify-between p-6 border-b ${BORDER_COLOR.default}`}
                >
                  <Link
                    href="/"
                    className="flex items-center"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <div className="h-8 w-auto overflow-hidden flex items-center">
                      <Image
                        src="/mainLogo.svg"
                        alt="회사 로고"
                        width={120}
                        height={40}
                        className="max-h-full max-w-full object-contain"
                        priority
                      />
                    </div>
                  </Link>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`p-2 rounded-lg ${BG_COLOR.card} ${BG_COLOR.hoverMuted} ${TEXT_COLOR.primary} transition-all duration-300`}
                    aria-label="메뉴 닫기"
                  >
                    <FaTimes className="text-lg" />
                  </motion.button>
                </div>

                {/* 모바일 메뉴 네비게이션 */}
                <nav className="flex-1 overflow-y-auto p-6" aria-label="모바일 메뉴 네비게이션">
                  <div className="flex flex-col gap-2">
                    {navItems.map((item, index) => (
                      <motion.div
                        key={item.href}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1, duration: 0.3 }}
                      >
                        <Link
                          href={item.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={`block px-4 py-3 rounded-lg text-base font-medium transition-all duration-300 ${
                            pathname === item.href
                              ? `${BG_COLOR.brandLight} ${TEXT_COLOR.brand}`
                              : `${TEXT_COLOR.primary} ${BG_COLOR.hoverMuted}`
                          }`}
                        >
                          {item.label}
                        </Link>
                      </motion.div>
                    ))}
                  </div>

                  {/* 로그인 상태에 따른 모바일 메뉴 */}
                  {isAuthenticated && (
                    <div
                      className={`mt-6 pt-6 border-t ${BORDER_COLOR.default} flex flex-col gap-3`}
                    >
                      <Link
                        href="/webhard"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={GLASS_BUTTON.navMobileMenu}
                      >
                        <FaCloud className="text-base" />
                        <span>웹하드</span>
                        <Suspense fallback={null}>
                          <WebhardBadge inline />
                        </Suspense>
                      </Link>
                      <Link
                        href={userType === 'company' ? '/company/dashboard' : '/admin'}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={GLASS_BUTTON.navMobileMenu}
                      >
                        <FaUserCog className="text-base" />
                        <span>{userType === 'company' ? '공정관리페이지' : '관리자 페이지'}</span>
                        {userType === 'admin' && <AdminNotificationBadge userType={userType} />}
                      </Link>
                      <form action={logoutAction}>
                        <motion.button
                          type="submit"
                          whileTap={{ scale: 0.95 }}
                          className={`${GLASS_BUTTON.navMobileMenu} !text-destructive !bg-destructive/10 !border-destructive/30`}
                        >
                          <FaSignOutAlt className="text-base" />
                          <span>로그아웃</span>
                        </motion.button>
                      </form>
                    </div>
                  )}
                  {!isAuthenticated && (
                    <div className={`mt-6 pt-6 border-t ${BORDER_COLOR.default}`}>
                      <Link
                        href="/login"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="block px-4 py-3 text-[#ED6C00] hover:text-[#d15f00] font-medium transition-all duration-300"
                      >
                        기업 로그인
                      </Link>
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
