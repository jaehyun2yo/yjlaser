'use client';

import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { FaSignOutAlt, FaUserCog, FaBars, FaTimes, FaCloud } from 'react-icons/fa';
import { logoutAction } from '@/app/actions/auth';
import { AdminNotificationBadge } from './AdminNotificationBadge';
import { GLASS_BUTTON } from '@/lib/styles';
import { cn } from '@/lib/utils';

const WebhardBadge = lazy(() =>
  import('./WebhardBadge').then((mod) => ({ default: mod.WebhardBadge }))
);

/**
 * 홈페이지 전용 헤더 컴포넌트
 * - 현재 섹션의 data-header-theme 값에 따라 네비게이션 대비를 자동 조정
 * - 홈페이지('/')에서만 표시
 */

type HeaderSectionTheme = 'light' | 'dark';

interface HomeHeaderProps {
  isAuthenticated?: boolean;
  userType?: 'admin' | 'company' | null;
  companyName?: string | null;
}

export default function HomeHeader({
  isAuthenticated = false,
  userType = null,
  companyName = null,
}: HomeHeaderProps) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [sectionTheme, setSectionTheme] = useState<HeaderSectionTheme>('light');
  const headerRef = useRef<HTMLElement>(null);

  const isHomePage = pathname === '/';

  // 스크롤 방향 감지
  useEffect(() => {
    if (!isHomePage) return;

    let lastScrollY = window.scrollY;
    let ticking = false;

    const getCurrentSectionTheme = (): HeaderSectionTheme => {
      const headerHeight = headerRef.current?.offsetHeight ?? 72;
      const probeY = Math.min(Math.max(headerHeight + 1, 1), window.innerHeight - 1);
      const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-header-theme]'));
      const activeSection = sections.find((section) => {
        const rect = section.getBoundingClientRect();
        return rect.top <= probeY && rect.bottom > probeY;
      });

      return activeSection?.dataset.headerTheme === 'dark' ? 'dark' : 'light';
    };

    const updateSectionTheme = () => {
      setSectionTheme(getCurrentSectionTheme());
    };

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;

          setIsScrolled(currentScrollY > 10);
          updateSectionTheme();

          if (currentScrollY < 100) {
            setIsHeaderVisible(true);
          } else if (currentScrollY > lastScrollY + 5) {
            setIsHeaderVisible(false);
          } else if (currentScrollY < lastScrollY - 5) {
            setIsHeaderVisible(true);
          }

          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateSectionTheme, { passive: true });
    setIsScrolled(window.scrollY > 10);
    setIsHeaderVisible(true);
    updateSectionTheme();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateSectionTheme);
    };
  }, [isHomePage]);

  // 모바일 메뉴 열릴 때 body 스크롤 방지
  useEffect(() => {
    if (!isHomePage) return;

    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen, isHomePage]);

  // 홈페이지가 아니면 렌더링하지 않음
  if (!isHomePage) {
    return null;
  }

  const navItems = [
    { href: '/about', label: '소개' },
    { href: '/portfolio', label: '포트폴리오' },
    { href: '/notice', label: '공지사항' },
    { href: '/contact', label: '문의하기' },
  ];

  const isLightSection = sectionTheme === 'light';
  const headerSurfaceClass = isScrolled
    ? isLightSection
      ? 'bg-white/75 backdrop-blur-xl border-neutral-950/10 shadow-lg shadow-neutral-900/10'
      : 'bg-black/40 backdrop-blur-xl border-white/10 shadow-lg shadow-black/20'
    : 'bg-transparent backdrop-blur-none border-transparent';
  const navigationLinkClass = isLightSection
    ? 'text-neutral-950/80 hover:text-neutral-950 hover:bg-neutral-950/10'
    : 'text-white/80 hover:text-white hover:bg-white/10';
  const metaTextClass = isLightSection ? 'text-neutral-950/60' : 'text-white/60';
  const outlineActionClass = isLightSection
    ? 'text-neutral-950/80 border-neutral-950/30 hover:border-brand hover:text-brand hover:bg-brand-light'
    : 'text-white/80 border-white/30 hover:border-brand hover:text-brand hover:bg-white/10';

  return (
    <>
      <header
        ref={headerRef}
        className={cn(
          'fixed top-0 left-0 right-0 z-50 border-b transition-all duration-300 ease-in-out',
          headerSurfaceClass
        )}
        style={{
          transform: isHeaderVisible ? 'translateY(0)' : 'translateY(-100%)',
        }}
        role="banner"
      >
        <div className="flex justify-between items-center px-4 py-3 h-14 sm:px-6 md:px-12 md:py-3.5 md:h-16 lg:px-16 lg:py-4 lg:h-[72px] xl:px-20">
          {/* 로고 */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex-shrink-0"
          >
            <Link href="/" className="flex items-center" aria-label="홈으로 이동">
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
            {isAuthenticated && (
              <>
                <Link
                  href="/webhard"
                  className={cn(
                    'relative p-2 rounded-lg transition-all duration-200',
                    navigationLinkClass
                  )}
                  aria-label="웹하드로 이동"
                >
                  <FaCloud className="text-base" />
                  <Suspense fallback={null}>
                    <WebhardBadge asIcon={true} />
                  </Suspense>
                </Link>
                <Link
                  href={userType === 'company' ? '/company/dashboard' : '/admin'}
                  className={cn(
                    'relative p-2 rounded-lg transition-all duration-200',
                    navigationLinkClass
                  )}
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
              className={cn('p-2 rounded-lg transition-all duration-200', navigationLinkClass)}
              aria-label={isMobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
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
            className="hidden md:flex items-center gap-2 lg:gap-6 flex-nowrap whitespace-nowrap"
            role="navigation"
            aria-label="주요 메뉴"
          >
            {navItems.map((item) => (
              <motion.div
                key={item.href}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
                className="flex-shrink-0"
              >
                <Link
                  href={item.href}
                  className={cn(
                    'relative text-xs lg:text-sm px-2.5 lg:px-3 py-1.5 lg:py-2 rounded-lg transition-all duration-200 whitespace-nowrap',
                    navigationLinkClass
                  )}
                  aria-label={item.label}
                >
                  {item.label}
                </Link>
              </motion.div>
            ))}

            {/* 로그인 상태에 따른 UI */}
            {isAuthenticated ? (
              <div className="ml-2 lg:ml-8 flex items-center gap-2 lg:gap-3 flex-nowrap flex-shrink-0">
                <span className={cn('hidden lg:block text-xs px-3 py-2', metaTextClass)}>
                  {userType === 'company' && companyName ? companyName : '관리자'}
                </span>
                <Link
                  href="/webhard"
                  className={cn(
                    'relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-transparent border transition-colors duration-200 flex-shrink-0',
                    outlineActionClass
                  )}
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
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-transparent border transition-colors duration-200 flex-shrink-0',
                    outlineActionClass
                  )}
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
                {/* 레이아웃 통일을 위한 투명 placeholder (Header의 ThemeToggle 위치) */}
                <div className="w-8 h-8 rounded-lg" aria-hidden="true" />
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
              <div className="ml-4 lg:ml-8 flex items-center gap-2 lg:gap-3 flex-nowrap flex-shrink-0">
                {/* 레이아웃 통일을 위한 투명 placeholder (Header의 ThemeToggle 위치) */}
                <div className="w-8 h-8 rounded-lg" aria-hidden="true" />
                <Link
                  href="/login"
                  className="text-xs lg:text-sm px-2.5 lg:px-3 py-1.5 lg:py-2 text-brand hover:text-brand-hover transition-all duration-200"
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
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />

            {/* 모바일 메뉴 패널 - 다크 테마 고정 */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-80 max-w-[85vw] z-[70] shadow-2xl bg-[#0a0a0a]/95 backdrop-blur-xl border-l border-white/10 md:hidden"
            >
              <div className="flex flex-col h-full">
                {/* 모바일 메뉴 헤더 */}
                <div className="flex items-center justify-between p-6 border-b border-white/10">
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
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-all duration-300"
                    aria-label="메뉴 닫기"
                  >
                    <FaTimes className="text-lg" />
                  </motion.button>
                </div>

                {/* 모바일 메뉴 네비게이션 */}
                <nav className="flex-1 overflow-y-auto p-6">
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
                          className="block px-4 py-3 rounded-lg text-base font-medium text-white/80 hover:text-white hover:bg-white/10 transition-all duration-300"
                        >
                          {item.label}
                        </Link>
                      </motion.div>
                    ))}
                  </div>

                  {/* 로그인 상태에 따른 모바일 메뉴 */}
                  {isAuthenticated && (
                    <div className="mt-6 pt-6 border-t border-white/10 flex flex-col gap-3">
                      <Link
                        href="/webhard"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-all duration-300"
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
                        className="flex items-center gap-3 px-4 py-3 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-all duration-300"
                      >
                        <FaUserCog className="text-base" />
                        <span>{userType === 'company' ? '공정관리페이지' : '관리자 페이지'}</span>
                        {userType === 'admin' && <AdminNotificationBadge userType={userType} />}
                      </Link>
                      <form action={logoutAction}>
                        <motion.button
                          type="submit"
                          whileTap={{ scale: 0.95 }}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-red-600/80 hover:bg-red-600/90 text-white border border-red-500/50 hover:border-red-500/70 transition-all duration-300"
                        >
                          <FaSignOutAlt className="text-base" />
                          <span>로그아웃</span>
                        </motion.button>
                      </form>
                    </div>
                  )}
                  {!isAuthenticated && (
                    <div className="mt-6 pt-6 border-t border-white/10">
                      <Link
                        href="/login"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="block px-4 py-3 text-brand hover:text-brand-hover font-medium transition-all duration-300"
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
