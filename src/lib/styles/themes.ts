/**
 * Theme System - 테마 관련 스타일 상수
 */

/**
 * 업체 대시보드 테마 스타일
 */
export const COMPANY_THEME = {
  mainContent: 'lg:ml-[260px] min-h-screen',
  contentPadding: 'px-4 py-6 sm:px-6 lg:px-8 lg:py-8',
  pageBackground: 'bg-background',
  greeting: {
    container: 'mb-8',
    title: 'text-2xl md:text-3xl font-bold text-foreground mb-2',
    subtitle: 'text-sm md:text-base text-gray-600 dark:text-gray-400',
    date: 'text-xs text-gray-500 mt-1',
  },
  card: 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg',
  cardPadding: 'p-6 md:p-8',
  sectionTitle: 'text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-6',
} as const;

/**
 * 홈페이지 섹션 배경 스타일
 */
export const HOME_SECTION_BG = {
  hero: 'bg-black',
  aboutUs: 'bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-800',
  companyIntro:
    'bg-gradient-to-b from-gray-900 via-gray-800 to-white dark:from-black dark:via-gray-900 dark:to-gray-800',
  inquiry: 'bg-[#0a0a0a] dark:bg-black',
  process: 'bg-[#0a0a0a] dark:bg-black',
  portfolio: 'bg-white dark:bg-gray-900',
} as const;

/**
 * 홈페이지 섹션 텍스트 스타일
 */
export const HOME_SECTION_TEXT = {
  heroTitle: 'text-white',
  heroSubtitle: 'text-gray-300',
  aboutTitle: 'text-gray-900 dark:text-white',
  aboutSubtitle: 'text-gray-600 dark:text-gray-400',
  aboutCardTitle: 'text-gray-900 dark:text-white group-hover:text-brand',
  aboutCardText: 'text-gray-600 dark:text-gray-400',
  companyTitle: 'text-white',
  companyText: 'text-white/70 dark:text-gray-300',
  inquiryTitle: 'text-white',
  inquiryText: 'text-white/60 dark:text-gray-400',
} as const;

/**
 * 홈페이지 카드 스타일
 */
export const HOME_CARD = {
  aboutUs:
    'bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-500 border border-gray-100 dark:border-gray-700',
  portfolio:
    'bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100 dark:border-gray-700',
} as const;

/**
 * 포트폴리오 페이지 스타일
 */
export const PORTFOLIO_THEME = {
  pageBg: 'bg-gray-50 dark:bg-gray-900',
  galleryBg: 'bg-black dark:bg-black',
  navBg: 'bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl',
  navText: 'text-gray-900 dark:text-white',
  filterInactive:
    'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
  filterActive: 'bg-brand text-white',
  modalBg: 'bg-white dark:bg-gray-900',
  modalText: 'text-gray-900 dark:text-white',
  modalSubtext: 'text-gray-600 dark:text-gray-400',
} as const;
