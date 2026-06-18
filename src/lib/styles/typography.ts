/**
 * Typography System - 타이포그래피 스타일 상수
 */

/**
 * 반응형 타이포그래피 스타일
 * 모바일 -> 태블릿 -> 데스크탑 순으로 적용
 */
export const TYPOGRAPHY = {
  // Headings - 제목 스타일
  h1: 'text-3xl md:text-4xl lg:text-5xl font-bold leading-tight',
  h2: 'text-2xl md:text-3xl lg:text-4xl font-bold leading-tight',
  h3: 'text-xl md:text-2xl lg:text-3xl font-semibold leading-snug',
  h4: 'text-lg md:text-xl lg:text-2xl font-semibold leading-snug',
  h5: 'text-base md:text-lg lg:text-xl font-semibold leading-normal',
  h6: 'text-sm md:text-base lg:text-lg font-semibold leading-normal',

  // Body Text - 본문 텍스트
  body: {
    large: 'text-base md:text-lg font-normal leading-relaxed',
    base: 'text-sm md:text-base font-normal leading-relaxed',
    small: 'text-xs md:text-sm font-normal leading-relaxed',
  },

  // Special Text - 특수 텍스트
  caption: 'text-xs font-normal leading-normal',
  overline: 'text-xs font-medium uppercase tracking-wide leading-normal',

  // Button Text - 버튼 텍스트
  button: {
    large: 'text-base md:text-lg font-medium',
    base: 'text-sm md:text-base font-medium',
    small: 'text-xs md:text-sm font-medium',
  },

  // Label Text - 라벨 텍스트
  label: {
    large: 'text-base font-medium leading-normal',
    base: 'text-sm font-medium leading-normal',
    small: 'text-xs font-medium leading-normal',
  },

  // Link Text - 링크 텍스트
  link: {
    large: 'text-base md:text-lg font-medium underline-offset-4 hover:underline',
    base: 'text-sm md:text-base font-medium underline-offset-4 hover:underline',
    small: 'text-xs md:text-sm font-medium underline-offset-4 hover:underline',
  },
} as const;
