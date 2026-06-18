'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { FaEnvelope, FaBuilding, FaCommentDots, FaTimes } from 'react-icons/fa';

interface FloatingButtonsProps {
  isAuthenticated?: boolean;
}

export default function FloatingButtons({ isAuthenticated = false }: FloatingButtonsProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const pathname = usePathname();
  const lastScrollY = useRef(0);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 스크롤 시 버튼 숨김/표시 로직
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // 스크롤 다운 시 숨김
      if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
        setIsVisible(false);
        // 기존 타이머 취소
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }
      } else {
        // 스크롤 업 시 표시
        setIsVisible(true);
      }

      lastScrollY.current = currentScrollY;

      // 스크롤 멈춤 감지 - 일정 시간 후 버튼 표시
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      hideTimeoutRef.current = setTimeout(() => {
        setIsVisible(true);
      }, 1500); // 1.5초 후 다시 표시
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // 관리자 페이지, 웹하드 페이지, 업체 페이지, 로그인/회원가입 페이지, 문의하기 페이지에서는 플로팅 버튼 숨김
  if (
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/webhard') ||
    pathname?.startsWith('/worker') ||
    pathname?.startsWith('/company/') ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/register') ||
    pathname?.startsWith('/contact')
  ) {
    return null;
  }

  return (
    <>
      {/* 플로팅 버튼 그룹 */}
      <motion.div
        className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-50 hidden flex-col items-end gap-3 md:flex"
        initial={{ opacity: 1, x: 0 }}
        animate={{
          opacity: isVisible ? 1 : 0,
          x: isVisible ? 0 : 100,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        {/* 업체등록 버튼 - 로그인 시 숨김 */}
        {!isAuthenticated && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 20 }}
          >
            <Link
              href="/register"
              className="group flex items-center gap-3 bg-gray-900 hover:bg-gray-800 text-white pl-5 pr-4 py-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300"
            >
              <span className="text-sm font-medium whitespace-nowrap">업체등록</span>
              <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center group-hover:bg-white/20 transition-colors">
                <FaBuilding className="w-4 h-4" />
              </div>
            </Link>
          </motion.div>
        )}

        {/* 문의하기 버튼 */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 20 }}
        >
          <Link
            href="/contact"
            className="group flex items-center gap-3 bg-[#ED6C00] hover:bg-[#d15f00] text-white pl-5 pr-4 py-3 rounded-full shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 transition-all duration-300"
          >
            <span className="text-sm font-medium whitespace-nowrap">문의하기</span>
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center group-hover:bg-white/30 transition-colors">
              <FaEnvelope className="w-4 h-4" />
            </div>
          </Link>
        </motion.div>

        {/* 챗봇 버튼 */}
        <motion.button
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0, type: 'spring', stiffness: 300, damping: 20 }}
          onClick={() => setIsChatOpen(true)}
          className="group flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white pl-5 pr-4 py-3 rounded-full shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all duration-300"
        >
          <span className="text-sm font-medium whitespace-nowrap">챗봇 상담</span>
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center group-hover:bg-white/30 transition-colors">
            <FaCommentDots className="w-4 h-4" />
          </div>
        </motion.button>
      </motion.div>

      {/* 모바일에서는 하나의 상담 버튼으로 축약해 본문과 빈 상태를 가리지 않게 한다. */}
      <motion.div
        className="fixed bottom-4 right-4 z-50 md:hidden"
        initial={{ opacity: 1, y: 0 }}
        animate={{
          opacity: isVisible ? 1 : 0,
          y: isVisible ? 0 : 80,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        <button
          type="button"
          aria-expanded={isMobileMenuOpen}
          aria-label="상담 메뉴 열기"
          onClick={() => setIsMobileMenuOpen((open) => !open)}
          className="flex min-h-12 min-w-12 items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/30 transition-colors hover:bg-brand-hover"
        >
          상담
          <FaEnvelope className="h-4 w-4" />
        </button>

        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              className="absolute bottom-14 right-0 flex w-40 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
            >
              <Link
                href="/contact"
                className="flex min-h-11 items-center gap-2 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <FaEnvelope className="h-4 w-4 text-brand" />
                문의하기
              </Link>
              {!isAuthenticated && (
                <Link
                  href="/register"
                  className="flex min-h-11 items-center gap-2 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <FaBuilding className="h-4 w-4 text-brand" />
                  업체등록
                </Link>
              )}
              <button
                type="button"
                className="flex min-h-11 items-center gap-2 px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsChatOpen(true);
                }}
              >
                <FaCommentDots className="h-4 w-4 text-brand" />
                챗봇 상담
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 챗봇 모달 */}
      <AnimatePresence>
        {isChatOpen && (
          <>
            {/* 오버레이 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
              onClick={() => setIsChatOpen(false)}
            />

            {/* 챗봇 창 */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="fixed bottom-6 right-6 w-[380px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-6rem)] bg-white rounded-2xl shadow-2xl z-[70] flex flex-col overflow-hidden"
            >
              {/* 챗봇 헤더 */}
              <div className="bg-blue-600 text-white px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <FaCommentDots className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">챗봇 상담</h3>
                    <p className="text-xs text-blue-100">무엇이든 물어보세요</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <FaTimes className="w-4 h-4" />
                </button>
              </div>

              {/* 챗봇 메시지 영역 */}
              <div className="flex-1 p-5 overflow-y-auto bg-gray-50">
                {/* 환영 메시지 */}
                <div className="flex gap-3 mb-4">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex-shrink-0 flex items-center justify-center">
                    <FaCommentDots className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-white rounded-2xl rounded-tl-none px-4 py-3 shadow-sm max-w-[85%]">
                    <p className="text-sm text-gray-700">안녕하세요! 무엇을 도와드릴까요?</p>
                    <p className="text-sm text-gray-700 mt-2">
                      아래 버튼을 선택하시거나 직접 질문을 입력해주세요.
                    </p>
                  </div>
                </div>

                {/* 빠른 질문 버튼들 */}
                <div className="flex flex-wrap gap-2 ml-11">
                  <button className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors">
                    서비스 안내
                  </button>
                  <button className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors">
                    견적 문의
                  </button>
                  <button className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors">
                    납품 일정
                  </button>
                  <button className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors">
                    업체 등록
                  </button>
                </div>
              </div>

              {/* 입력 영역 */}
              <div className="p-4 border-t border-gray-200 bg-white">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="메시지를 입력하세요..."
                    className="flex-1 px-4 py-3 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                  <button className="w-12 h-12 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center text-white transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                      />
                    </svg>
                  </button>
                </div>
                <p className="text-xs text-gray-400 text-center mt-2">
                  현재 챗봇은 준비 중입니다. 빠른 상담은 문의하기를 이용해주세요.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
