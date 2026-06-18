'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { FaSignOutAlt, FaUserCog, FaSun, FaMoon, FaCloud } from 'react-icons/fa';
import { logoutAction } from '@/app/actions/auth';
import { AdminNotificationBadge } from '@/components/AdminNotificationBadge';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR, TRANSITION_STYLES } from '@/lib/styles';

interface TabletHeaderProps {
  isAuthenticated: boolean;
  userType: 'admin' | 'company' | null;
  companyName: string | null;
  theme: string | undefined;
  toggleTheme: () => void;
  mounted: boolean;
  navItems: { href: string; label: string }[];
  pathname: string;
}

export default function TabletHeader({
  isAuthenticated,
  userType,
  companyName,
  theme,
  toggleTheme,
  mounted,
  navItems,
  pathname,
}: TabletHeaderProps) {
  return (
    <motion.header
      key="tablet-header"
      className={`fixed top-0 left-0 right-0 z-50 ${BG_COLOR.whiteAlpha95} backdrop-blur-lg border-b ${BORDER_COLOR.default} shadow-md`}
      role="banner"
    >
      <div className="flex justify-between items-center px-4 py-3.5 h-[64px]">
        {/* 로고 */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex-shrink-0"
        >
          <Link href="/" className="flex items-center" aria-label="홈으로 이동">
            <div className="h-8 w-auto overflow-hidden flex items-center">
              <Image
                src="/mainLogo.svg"
                alt="회사 로고"
                width={110}
                height={32}
                className="max-h-full max-w-full object-contain"
                priority
              />
            </div>
          </Link>
        </motion.div>

        {/* 태블릿 네비게이션 */}
        <nav className="flex items-center gap-2" role="navigation" aria-label="주요 메뉴">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <motion.div key={item.href} whileHover={{ y: -1 }} whileTap={{ scale: 0.95 }}>
                <Link
                  href={item.href}
                  className={`relative text-xs ${TEXT_COLOR.primary} ${TEXT_COLOR.hoverBrand} ${TRANSITION_STYLES.colors} px-2.5 py-1.5 font-medium focus:outline-none ${
                    isActive ? TEXT_COLOR.brand : `${BG_COLOR.hoverBrand} rounded-lg`
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
            <div className="ml-2 flex items-center gap-2">
              <span className={`${TEXT_COLOR.primary} text-[11px] px-2 py-1`}>
                {userType === 'company' && companyName ? companyName : '관리자'}
              </span>
              <Link
                href="/webhard"
                className={`p-2 rounded-lg ${BG_COLOR.muted} ${BG_COLOR.hoverMuted} ${TEXT_COLOR.primary} transition-colors duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-background`}
                aria-label="웹하드로 이동"
              >
                <FaCloud className="text-sm" aria-hidden="true" />
              </Link>
              <Link
                href={userType === 'company' ? '/company/dashboard' : '/admin'}
                className={`relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg ${BG_COLOR.muted} ${BG_COLOR.hoverMuted} ${TEXT_COLOR.primary} transition-colors duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] text-[11px] focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-background`}
                aria-label={
                  userType === 'company' ? '공정관리페이지로 이동' : '관리자 페이지로 이동'
                }
              >
                <FaUserCog className="text-[11px]" aria-hidden="true" />
                <span className="hidden sm:inline">
                  {userType === 'company' ? '공정관리' : '관리자'}
                </span>
                {userType === 'admin' && <AdminNotificationBadge userType={userType} />}
              </Link>
              <form action={logoutAction}>
                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg ${BG_COLOR.muted} ${BG_COLOR.hoverMuted} ${TEXT_COLOR.primary} transition-colors duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] text-[11px] focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-background`}
                  aria-label="로그아웃"
                >
                  <FaSignOutAlt className="text-[11px]" aria-hidden="true" />
                  <span className="hidden sm:inline">로그아웃</span>
                </motion.button>
              </form>
              {/* 테마 토글 버튼 - 로그아웃 오른쪽에 배치 */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleTheme}
                className={`p-2 rounded-lg ${BG_COLOR.muted} ${BG_COLOR.hoverMuted} ${TEXT_COLOR.primary} ${TRANSITION_STYLES.colors} focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-background`}
                aria-label={mounted && theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              >
                {mounted && theme === 'dark' ? (
                  <FaSun className="text-sm" />
                ) : (
                  <FaMoon className="text-sm" />
                )}
              </motion.button>
            </div>
          ) : (
            <div className="ml-4 flex items-center gap-2">
              <Link
                href="/login"
                className={`text-xs ${TRANSITION_STYLES.colors} px-3 py-1.5 rounded-lg ${BG_COLOR.hoverBrand} font-medium focus:outline-none`}
                style={{ color: '#ED6C00' }}
                aria-label="기업 로그인 페이지로 이동"
              >
                기업 로그인
              </Link>
              {/* 테마 토글 버튼 - 비인증 상태에서도 표시 */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleTheme}
                className={`p-2 rounded-lg ${BG_COLOR.muted} ${BG_COLOR.hoverMuted} ${TEXT_COLOR.primary} ${TRANSITION_STYLES.colors} focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-background`}
                aria-label={mounted && theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              >
                {mounted && theme === 'dark' ? (
                  <FaSun className="text-sm" />
                ) : (
                  <FaMoon className="text-sm" />
                )}
              </motion.button>
            </div>
          )}
        </nav>
      </div>
    </motion.header>
  );
}
