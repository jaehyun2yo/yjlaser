'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaBars,
  FaTimes,
  FaSearch,
  FaClipboardList,
  FaFileInvoice,
  FaExclamationCircle,
  FaCloud,
  FaUserEdit,
  FaSignOutAlt,
  FaBoxOpen,
} from 'react-icons/fa';
import { logoutAction } from '@/app/actions/auth';
import { BOTTOM_NAV, MOBILE_SLIDE_MENU, BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { WebhardBadge } from '@/components/WebhardBadge';
import { useTheme } from 'next-themes';
import type { SearchResult, SearchResultType } from '@/app/company/_lib/types';

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
        className={`flex items-center justify-between px-4 py-3 rounded-lg ${BG_COLOR.muted} border ${BORDER_COLOR.default}`}
      >
        <span className={`text-base font-medium ${TEXT_COLOR.primary}`}>테마</span>
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
      <span className={`text-base font-medium ${TEXT_COLOR.primary}`}>테마</span>
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

interface CompanyMobileNavProps {
  companyName: string;
  contacts: Array<{
    id: number;
    inquiry_title?: string;
    name?: string;
    status?: string;
    created_at?: string;
    process_stage?: string;
  }>;
  onSearchOpenChange?: (isOpen: boolean) => void;
}

const navItems = [
  { href: '/company/dashboard', label: '진행상황', icon: <FaClipboardList /> },
  { href: '/company/orders', label: '주문 현황', icon: <FaBoxOpen /> },
  { href: '/company/billing', label: '청구서', icon: <FaFileInvoice /> },
  { href: '/company/feedback', label: '불편사항', icon: <FaExclamationCircle /> },
];

const actionItems = [
  { href: '/webhard', label: '웹하드', icon: <FaCloud />, hasBadge: true },
  { href: '/company/profile', label: '정보수정', icon: <FaUserEdit /> },
];

const getStatusLabel = (status?: string) => {
  switch (status) {
    case 'new':
      return '신규';
    case 'in_progress':
      return '진행중';
    case 'completed':
      return '완료';
    case 'cancelled':
      return '취소';
    default:
      return status || '알 수 없음';
  }
};

export function CompanyMobileNav({
  companyName,
  contacts,
  onSearchOpenChange,
}: CompanyMobileNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // 검색 결과 필터링
  const performSearch = useCallback(
    (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      const lowerQuery = searchQuery.toLowerCase();

      const filteredResults: SearchResult[] = contacts
        .filter((contact) => {
          const title = contact.inquiry_title?.toLowerCase() || '';
          const name = contact.name?.toLowerCase() || '';
          const status = contact.status?.toLowerCase() || '';
          const stage = contact.process_stage?.toLowerCase() || '';

          return (
            title.includes(lowerQuery) ||
            name.includes(lowerQuery) ||
            status.includes(lowerQuery) ||
            stage.includes(lowerQuery)
          );
        })
        .map((contact) => ({
          id: String(contact.id),
          type: 'contact' as SearchResultType,
          title: contact.inquiry_title || '제목 없음',
          subtitle: `${contact.name || companyName} · ${getStatusLabel(contact.status)}`,
          status: contact.status,
          date: contact.created_at,
          link: `/company/dashboard?highlight=${contact.id}`,
        }))
        .slice(0, 5);

      setResults(filteredResults);
    },
    [contacts, companyName]
  );

  // 쿼리 변경 시 검색 실행
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      performSearch(query);
    }, 200);

    return () => clearTimeout(debounceTimer);
  }, [query, performSearch]);

  // 외부 클릭 시 결과 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        resultsRef.current &&
        !resultsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleResultClick = (result: SearchResult) => {
    setQuery('');
    setResults([]);
    setIsFocused(false);
    router.push(result.link);
  };

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

  const isActiveLink = (href: string) => {
    if (href === '/company/dashboard') {
      return pathname === '/company/dashboard' || pathname === '/company';
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* 하단 네비게이션 */}
      <div className={BOTTOM_NAV.container}>
        {/* 검색 결과 드롭다운 - 검색바 위에 표시 */}
        <AnimatePresence>
          {isSearchOpen && isFocused && results.length > 0 && (
            <motion.div
              ref={resultsRef}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className={`mb-2 ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto`}
            >
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleResultClick(result)}
                  className={`w-full flex items-center gap-3 px-4 py-3 ${BG_COLOR.hoverGray} transition-colors text-left`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`${TEXT_COLOR.strong} text-sm font-medium truncate`}>
                      {result.title}
                    </p>
                    <p className={`text-xs ${TEXT_COLOR.tertiary} truncate`}>{result.subtitle}</p>
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 검색 입력 필드 영역 */}
        <AnimatePresence>
          {isSearchOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className={`${BOTTOM_NAV.innerContainer} relative`}>
                <FaSearch className="text-gray-500 text-sm flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  placeholder="문의 검색..."
                  className={`flex-1 bg-transparent ${TEXT_COLOR.strong} text-sm placeholder-gray-500 focus:outline-none ml-2`}
                  autoComplete="off"
                />
                {query && (
                  <button
                    onClick={() => {
                      setQuery('');
                      setResults([]);
                    }}
                    className={`text-gray-500 ${TEXT_COLOR.hoverSecondary}`}
                  >
                    <FaTimes className="text-sm" />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 하단 메뉴 아이콘 3개 */}
        <div className="flex items-center justify-center">
          <div className="flex items-center justify-center gap-20 px-6 py-2">
            {/* 웹하드 버튼 */}
            <Link href="/webhard" className={BOTTOM_NAV.actionButton} aria-label="웹하드">
              <FaCloud className="text-lg" />
            </Link>

            {/* 검색 버튼 */}
            <button
              onClick={() => {
                const newIsOpen = !isSearchOpen;
                setIsSearchOpen(newIsOpen);
                onSearchOpenChange?.(newIsOpen);
                if (newIsOpen) {
                  // 검색창이 열릴 때 input에 포커스
                  setTimeout(() => inputRef.current?.focus(), 100);
                } else {
                  // 검색창이 닫힐 때 초기화
                  setQuery('');
                  setResults([]);
                  setIsFocused(false);
                }
              }}
              className={`${BOTTOM_NAV.actionButton} ${isSearchOpen ? 'text-[#ED6C00]' : ''}`}
              aria-label="문의 검색"
            >
              <FaSearch className="text-lg" />
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

      {/* 슬라이드 메뉴 (홈페이지와 동일한 오른쪽 슬라이드) */}
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

            {/* 메뉴 패널 (오른쪽에서 슬라이드) */}
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
