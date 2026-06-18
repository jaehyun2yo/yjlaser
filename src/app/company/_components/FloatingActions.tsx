'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface FloatingActionsProps {
  isSearchOpen?: boolean;
}

export function FloatingActions({ isSearchOpen = false }: FloatingActionsProps) {
  const [isScrollVisible, setIsScrollVisible] = useState(true);
  const lastScrollY = useRef(0);

  // 스크롤 시 버튼 숨김/표시 로직
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // 스크롤 다운 시 숨김 (100px 이상 스크롤 시)
      if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
        setIsScrollVisible(false);
      } else {
        // 스크롤 업 또는 가만히 있을 때 표시
        setIsScrollVisible(true);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // 검색바가 열려있으면 숨김
  const isVisible = !isSearchOpen && isScrollVisible;

  return (
    <div
      className="fixed bottom-6 right-6 z-40 hidden lg:flex flex-col items-end gap-3 print:hidden"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
        pointerEvents: isVisible ? 'auto' : 'none',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
      }}
    >
      {/* 새로운문의 버튼 */}
      <Link
        href="/contact"
        className="group flex items-center bg-[#ED6C00] hover:bg-[#d15f00] text-white px-5 py-2.5 lg:px-6 lg:py-3 rounded-full shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 transition-all duration-300"
      >
        <span className="text-sm lg:text-base font-medium whitespace-nowrap">새로운문의</span>
      </Link>
    </div>
  );
}
