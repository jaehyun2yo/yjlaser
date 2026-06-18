/**
 * ContactForm 스타일 모듈
 * Tailwind 반응형 클래스로 모바일/태블릿/데스크톱 처리
 */

import { useState, useEffect } from 'react';
import { TRANSITION_STYLES, TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

// Tailwind 반응형 스타일 (md: = 768px, lg: = 1024px)
export const CONTACT_STYLES = {
  container:
    'w-full py-3 px-2 max-w-full md:py-7 md:px-6 md:max-w-3xl lg:py-8 lg:px-8 lg:max-w-4xl mx-auto',
  title: 'text-lg md:text-2xl lg:text-3xl font-bold',
  sectionTitle: 'text-base md:text-xl font-semibold mb-3 md:mb-5 lg:mb-6',
  label: `block text-xs md:text-sm font-medium ${TEXT_COLOR.primary} mb-1.5 md:mb-2`,
  input: `w-full px-2 md:px-4 py-2 md:py-2.5 lg:py-2 text-[15px] md:text-sm border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.white} ${TEXT_COLOR.primary} placeholder:text-[11px] md:placeholder:text-sm ${TEXT_COLOR.muted} ${TRANSITION_STYLES.colors} focus:outline-none focus:ring-2 focus:ring-[#ED6C00]`,
  inputTwoThirds: `w-full md:w-2/3 px-2 md:px-4 py-2 md:py-2.5 lg:py-2 text-[15px] md:text-sm border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.white} ${TEXT_COLOR.primary} placeholder:text-[11px] md:placeholder:text-sm ${TEXT_COLOR.muted} ${TRANSITION_STYLES.colors} focus:outline-none focus:ring-2 focus:ring-[#ED6C00]`,
  inputOneThird: `w-full md:w-1/3 px-2 md:px-4 py-2 md:py-2.5 lg:py-2 text-[15px] md:text-sm border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.white} ${TEXT_COLOR.primary} placeholder:text-[13px] md:placeholder:text-sm ${TEXT_COLOR.muted} ${TRANSITION_STYLES.colors} focus:outline-none focus:ring-2 focus:ring-[#ED6C00]`,
  inputSelect: `w-full md:w-2/3 lg:w-1/3 px-2 md:px-4 py-2 md:py-2.5 lg:py-2 pr-6 md:pr-8 text-[13px] md:text-sm border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.white} ${TEXT_COLOR.primary} placeholder:text-[13px] md:placeholder:text-sm ${TEXT_COLOR.muted} ${TRANSITION_STYLES.colors} focus:outline-none focus:ring-2 focus:ring-[#ED6C00] appearance-none bg-no-repeat bg-[length:12px_12px] bg-[right_0.5rem_center] md:bg-[right_1rem_center] bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 9L1 4h10z'/%3E%3C/svg%3E")]`,
  inputSelectTwoThirds: `w-full md:w-2/3 px-2 md:px-4 py-2 md:py-2.5 lg:py-2 pr-6 md:pr-8 text-[13px] md:text-sm border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.white} ${TEXT_COLOR.primary} placeholder:text-[13px] md:placeholder:text-sm ${TEXT_COLOR.muted} ${TRANSITION_STYLES.colors} focus:outline-none focus:ring-2 focus:ring-[#ED6C00] appearance-none bg-no-repeat bg-[length:12px_12px] bg-[right_0.5rem_center] md:bg-[right_1rem_center] bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 9L1 4h10z'/%3E%3C/svg%3E")]`,
  button:
    'bg-[#ED6C00] hover:bg-[#d15f00] text-white text-[13px] md:text-sm py-2.5 md:py-3 px-5 md:px-8 rounded-lg transition-colors duration-300 shadow-md hover:shadow-lg focus:outline-none',
  buttonSecondary: `${BG_COLOR.light} ${BG_COLOR.hoverGray} ${TEXT_COLOR.primary} text-[13px] md:text-sm py-2.5 md:py-3 px-5 md:px-8 rounded-lg ${TRANSITION_STYLES.colors} focus:outline-none`,
  errorText: `mt-1 text-[12px] md:text-xs ${TEXT_COLOR.error}`,
  hintText: `mt-2 text-[12px] md:text-xs leading-relaxed md:leading-normal ${TEXT_COLOR.muted}`,
  spacing: 'mb-5 md:mb-7 lg:mb-8',
  sectionPadding: 'p-3 md:p-5 lg:p-6',
} as const;

// 스타일 타입 정의
export type ContactFormStyleType = keyof typeof CONTACT_STYLES;

/**
 * 화면 크기 감지 및 스타일 반환을 위한 커스텀 훅
 */
export function useContactFormStyles() {
  const [windowWidth, setWindowWidth] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWindowWidth(window.innerWidth);

      const handleResize = () => {
        setWindowWidth(window.innerWidth);
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const isMobile = windowWidth === null ? true : windowWidth < 768;
  const isTablet = windowWidth !== null && windowWidth >= 768 && windowWidth < 1024;
  const isDesktop = windowWidth !== null && windowWidth >= 1024;

  const getStyle = (styleType: ContactFormStyleType): string => CONTACT_STYLES[styleType];

  return {
    getStyle,
    windowWidth,
    isMobile,
    isTablet,
    isDesktop,
  };
}
