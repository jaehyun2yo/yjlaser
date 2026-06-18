'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { FaBars, FaTimes } from 'react-icons/fa';

export function PortfolioMinimalNav() {
  const pathname = usePathname();
  const [_isVisible, setIsVisible] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState<number | null>(null);

  // 포트폴리오 페이지에서는 항상 표시
  useEffect(() => {
    setIsVisible(true);

    // 초기 화면 크기 설정
    if (typeof window !== 'undefined') {
      setWindowWidth(window.innerWidth);

      // 화면 크기 변경 감지
      const handleResize = () => {
        setWindowWidth(window.innerWidth);
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // 모바일 메뉴 닫기
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

  const navItems = [
    { href: '/about', label: '소개' },
    { href: '/portfolio', label: '포트폴리오' },
    { href: '/notice', label: '공지사항' },
    { href: '/contact', label: '문의하기' },
  ];

  // 포트폴리오 페이지가 아니면 렌더링하지 않음
  if (pathname !== '/portfolio') {
    return null;
  }

  // 화면 크기에 따른 버전 결정
  const isMobile = windowWidth === null ? true : windowWidth < 768;
  const isTablet = windowWidth !== null && windowWidth >= 768 && windowWidth < 1024;
  const isDesktop = windowWidth !== null && windowWidth >= 1024;

  return (
    <>
      {/* 모바일 버전: 0px ~ 767px */}
      <AnimatePresence mode="wait">
        {isMobile && (
          <motion.nav
            key="mobile-nav"
            initial={{ y: -100, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -100, opacity: 0, scale: 0.95 }}
            transition={{
              duration: 0.4,
              ease: [0.25, 0.1, 0.25, 1],
            }}
            className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[80] pointer-events-auto w-[280px]"
          >
            <motion.div
              className="bg-white/10 backdrop-blur-2xl rounded-full px-8 py-4 shadow-2xl border border-white/20 h-[62px]"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
              }}
              whileHover={{
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                borderColor: 'rgba(255, 255, 255, 0.3)',
              }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center justify-between gap-6 w-full h-full">
                {/* 로고 */}
                <Link href="/" className="flex items-center flex-shrink-0">
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="h-6 w-[100px] overflow-hidden flex items-center flex-shrink-0"
                  >
                    <Image
                      src="/mainLogo.svg"
                      alt="My Company Logo"
                      width={100}
                      height={24}
                      className="w-full h-full object-contain"
                      priority
                    />
                  </motion.div>
                </Link>

                {/* 모바일 햄버거 버튼 */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all duration-300 flex-shrink-0"
                  aria-label="메뉴 열기"
                >
                  {isMobileMenuOpen ? (
                    <FaTimes className="text-lg" />
                  ) : (
                    <FaBars className="text-lg" />
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* 태블릿 버전: 768px ~ 1023px */}
      <AnimatePresence mode="wait">
        {isTablet && (
          <motion.nav
            key="tablet-nav"
            initial={{ y: -100, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -100, opacity: 0, scale: 0.95 }}
            transition={{
              duration: 0.4,
              ease: [0.25, 0.1, 0.25, 1],
            }}
            className="fixed top-5 left-1/2 transform -translate-x-1/2 z-[80] pointer-events-auto w-[450px]"
          >
            <motion.div
              className="bg-white/10 backdrop-blur-2xl rounded-full px-8 py-4 shadow-2xl border border-white/20 h-[62px]"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
              }}
              whileHover={{
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                borderColor: 'rgba(255, 255, 255, 0.3)',
              }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center justify-between gap-8 w-full h-full">
                {/* 로고 */}
                <Link href="/" className="flex items-center flex-shrink-0">
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="h-7 w-[110px] overflow-hidden flex items-center flex-shrink-0"
                  >
                    <Image
                      src="/mainLogo.svg"
                      alt="My Company Logo"
                      width={110}
                      height={28}
                      className="w-full h-full object-contain"
                      priority
                    />
                  </motion.div>
                </Link>

                {/* 태블릿 메뉴 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* 구분선 */}
                  {/* <div className="h-5 w-px bg-white/30 flex-shrink-0" /> */}

                  {/* 메뉴 항목들 - 태블릿은 더 작은 간격 */}
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {navItems.map((item, index) => (
                      <motion.div
                        key={item.href}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05, duration: 0.3 }}
                        className="flex-shrink-0"
                      >
                        <Link href={item.href} className="relative group whitespace-nowrap">
                          <span
                            className={`text-xs font-medium transition-colors duration-300 ${
                              pathname === item.href
                                ? 'text-white'
                                : 'text-white/70 hover:text-white'
                            }`}
                          >
                            {item.label}
                          </span>
                          {pathname === item.href && (
                            <motion.div
                              className="absolute -bottom-1 left-0 right-0 h-0.5 bg-white"
                              layoutId="activeTabTablet"
                              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                            />
                          )}
                          <motion.div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-white/50 scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300" />
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* 데스크톱 버전: 1024px 이상 */}
      <AnimatePresence mode="wait">
        {isDesktop && (
          <motion.nav
            key="desktop-nav"
            initial={{ y: -100, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -100, opacity: 0, scale: 0.95 }}
            transition={{
              duration: 0.4,
              ease: [0.25, 0.1, 0.25, 1],
            }}
            className="fixed top-6 left-1/2 transform -translate-x-1/2 z-[80] pointer-events-auto w-[580px]"
          >
            <motion.div
              className="bg-white/10 backdrop-blur-2xl rounded-full px-10 py-4 shadow-2xl border border-white/20 h-[62px]"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
              }}
              whileHover={{
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                borderColor: 'rgba(255, 255, 255, 0.3)',
              }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center justify-between gap-12 w-full h-full">
                {/* 로고 */}
                <Link href="/" className="flex items-center flex-shrink-0">
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="h-8 w-[120px] overflow-hidden flex items-center flex-shrink-0"
                  >
                    <Image
                      src="/mainLogo.svg"
                      alt="My Company Logo"
                      width={120}
                      height={32}
                      className="w-full h-full object-contain"
                      priority
                    />
                  </motion.div>
                </Link>

                {/* 데스크톱 메뉴 */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {/* 구분선 */}
                  {/* <div className="h-6 w-px bg-white/30 flex-shrink-0" /> */}

                  {/* 메뉴 항목들 */}
                  <div className="flex items-center gap-10 flex-shrink-0">
                    {navItems.map((item, index) => (
                      <motion.div
                        key={item.href}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05, duration: 0.3 }}
                        className="flex-shrink-0"
                      >
                        <Link href={item.href} className="relative group whitespace-nowrap">
                          <span
                            className={`text-sm font-medium transition-colors duration-300 ${
                              pathname === item.href
                                ? 'text-white'
                                : 'text-white/70 hover:text-white'
                            }`}
                          >
                            {item.label}
                          </span>
                          {pathname === item.href && (
                            <motion.div
                              className="absolute -bottom-1 left-0 right-0 h-0.5 bg-white"
                              layoutId="activeTabDesktop"
                              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                            />
                          )}
                          <motion.div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-white/50 scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300" />
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* 모바일 메뉴 (모바일 버전만) */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* 오버레이 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[90]"
              style={{ display: isMobile ? 'block' : 'none' }}
              onClick={() => setIsMobileMenuOpen(false)}
            />

            {/* 모바일 메뉴 패널 */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-80 max-w-[85vw] z-[100] shadow-2xl"
              style={{
                display: isMobile ? 'block' : 'none',
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
              }}
            >
              <div className="flex flex-col h-full">
                {/* 모바일 헤더 */}
                <div className="flex items-center justify-between p-6">
                  <Link
                    href="/"
                    className="flex items-center"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <div className="h-8 w-auto overflow-hidden flex items-center">
                      <Image
                        src="/mainLogo.svg"
                        alt="My Company Logo"
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
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all duration-300"
                    aria-label="메뉴 닫기"
                  >
                    <FaTimes className="text-lg" />
                  </motion.button>
                </div>

                {/* 모바일 메뉴 항목들 */}
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
                          className={`block px-4 py-3 rounded-lg text-base font-medium transition-all duration-300 text-white ${
                            pathname === item.href ? 'bg-white/20' : 'hover:bg-white/10'
                          }`}
                          style={{ color: '#ffffff' }}
                        >
                          {item.label}
                        </Link>
                      </motion.div>
                    ))}
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
