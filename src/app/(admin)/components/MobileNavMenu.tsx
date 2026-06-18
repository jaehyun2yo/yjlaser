'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState, useEffect } from 'react';
import { AdminNavLink } from './AdminNavLink';
import { FaChevronUp, FaChevronDown } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

export function MobileNavMenu() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [mounted, setMounted] = useState(false);

  // 클라이언트 마운트 확인 (hydration 불일치 방지)
  useEffect(() => {
    setMounted(true);
    // 초기 스크롤 위치 확인
    if (typeof window !== 'undefined') {
      const initialScrollY = window.scrollY;
      setLastScrollY(initialScrollY);
      // 초기 스크롤 위치가 0이 아니면 메뉴 접기
      if (initialScrollY > 0) {
        setIsCollapsed(true);
      }
    }
  }, []);

  // 스크롤 감지 및 자동 접기/펼치기 (클라이언트에서만 실행)
  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY > lastScrollY && currentScrollY > 0 && !isCollapsed) {
        // 스크롤을 내리면 바로 접기
        setIsCollapsed(true);
      } else if (currentScrollY < lastScrollY && currentScrollY === 0 && isCollapsed) {
        // 맨 위로 돌아오면 펼치기
        setIsCollapsed(false);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [mounted, isCollapsed, lastScrollY]);

  return (
    <div
      className={`lg:hidden fixed top-[56px] md:top-[64px] left-0 right-0 z-40 ${BG_COLOR.page} border-b ${BORDER_COLOR.default}`}
    >
      {/* 토글 버튼 */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2 ${BG_COLOR.hoverMuted} transition-colors`}
        aria-label={isCollapsed ? '메뉴 펼치기' : '메뉴 접기'}
      >
        <span className={`text-xs ${TEXT_COLOR.secondary}`}>
          {isCollapsed ? '메뉴 펼치기' : '메뉴 접기'}
        </span>
        {isCollapsed ? (
          <FaChevronDown className={`text-xs ${TEXT_COLOR.secondary}`} />
        ) : (
          <FaChevronUp className={`text-xs ${TEXT_COLOR.secondary}`} />
        )}
      </button>

      {/* 네비게이션 메뉴 */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <nav className="grid grid-cols-3 gap-1.5 pb-4 pt-2 px-4">
              <AdminNavLink href="/admin">대시보드</AdminNavLink>
              <AdminNavLink href="/admin/work-management" showBadge={true}>
                작업관리
              </AdminNavLink>
              <AdminNavLink href="/admin/integration/companies">통합관리</AdminNavLink>
              <AdminNavLink href="/admin/posts">공지사항</AdminNavLink>
              <AdminNavLink href="/admin/portfolio">포트폴리오</AdminNavLink>
              <AdminNavLink href="/admin/feedback" showBadge={true} badgeType="feedback">
                불편사항
              </AdminNavLink>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
