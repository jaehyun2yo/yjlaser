/**
 * Navigation System - 네비게이션 관련 스타일 상수
 */

/**
 * 네비게이션 버튼 스타일
 */
export const NAV_BUTTON = {
  base: `
    flex items-center gap-1.5
    px-3 py-2
    rounded-lg
    text-xs font-medium
    bg-gray-900/80 dark:bg-white/10
    text-white dark:text-gray-200
    border border-gray-800 dark:border-white/20
    hover:bg-gray-800 dark:hover:bg-white/20
    active:bg-gray-950 dark:active:bg-white/5
    transition-colors duration-200
    focus:outline-none
  `,
  navDesktop: `
    flex items-center gap-1.5
    px-3 py-2
    rounded-lg
    text-xs font-medium
    bg-gray-900/80 dark:bg-white/10
    text-white dark:text-gray-200
    border border-gray-800 dark:border-white/20
    hover:bg-gray-800 dark:hover:bg-white/20
    active:bg-gray-950 dark:active:bg-white/5
    transition-colors duration-200
    focus:outline-none
  `,
  navMobile: `
    flex items-center justify-center
    p-2.5
    rounded-lg
    bg-gray-900/80 dark:bg-white/10
    text-white dark:text-gray-200
    border border-gray-800 dark:border-white/20
    hover:bg-gray-800 dark:hover:bg-white/20
    active:bg-gray-950 dark:active:bg-white/5
    transition-colors duration-200
    focus:outline-none
  `,
  navMobileMenu: `
    flex items-center gap-3
    w-full px-4 py-3
    rounded-lg
    text-base font-medium
    bg-gray-900/80 dark:bg-white/10
    text-white dark:text-gray-200
    border border-gray-800 dark:border-white/20
    hover:bg-gray-800 dark:hover:bg-white/20
    active:bg-gray-950 dark:active:bg-white/5
    transition-colors duration-200
    text-left
    focus:outline-none
  `,
  primary: `
    flex items-center gap-1.5
    px-3 py-2
    rounded-lg
    text-xs font-semibold
    bg-brand hover:bg-brand-hover
    text-white
    border border-brand hover:border-brand-hover
    active:bg-brand-hover
    transition-colors duration-200
    focus:outline-none
  `,
  primaryOutline: `
    flex items-center gap-1.5
    px-3 py-2
    rounded-lg
    text-xs font-semibold
    bg-transparent hover:bg-brand/10
    text-brand
    border border-brand/50 hover:border-brand
    active:bg-brand/20
    transition-colors duration-200
    focus:outline-none
  `,
  outline: `
    flex items-center gap-1.5
    px-3 py-2
    rounded-lg
    text-xs font-semibold
    bg-transparent
    text-gray-500 dark:text-gray-400
    border border-gray-300 dark:border-gray-600
    hover:border-brand hover:text-brand
    transition-colors duration-200
    focus:outline-none
  `,
  danger: `
    flex items-center gap-1.5
    px-3 py-2
    rounded-lg
    text-xs font-semibold
    bg-red-600/80 hover:bg-red-600/90
    text-white
    border border-red-500/50 hover:border-red-500/70
    active:bg-red-700/90
    transition-colors duration-200
    focus:outline-none
  `,
  dangerOutline: `
    flex items-center gap-1.5
    px-3 py-2
    rounded-lg
    text-xs font-semibold
    bg-transparent hover:bg-red-500/10
    text-red-600 dark:text-red-400
    border border-red-500/50 hover:border-red-500
    active:bg-red-500/20
    transition-colors duration-200
    focus:outline-none
  `,
  ghost: `
    flex items-center gap-1.5
    px-3 py-2
    rounded-lg
    text-xs font-semibold
    bg-transparent
    text-gray-700 dark:text-gray-300
    hover:bg-gray-100 dark:hover:bg-gray-800
    active:bg-gray-200 dark:active:bg-gray-700
    transition-colors duration-200
    focus:outline-none
  `,
  secondary: `
    flex items-center gap-1.5
    px-3 py-2
    rounded-lg
    text-xs font-semibold
    bg-gray-100 dark:bg-gray-800
    text-gray-700 dark:text-gray-300
    border border-gray-200 dark:border-gray-700
    hover:bg-gray-200 dark:hover:bg-gray-700
    active:bg-gray-300 dark:active:bg-gray-600
    transition-colors duration-200
    focus:outline-none
  `,
} as const;

// 이전 버전과의 호환성을 위한 별칭
export const GLASS_BUTTON = NAV_BUTTON;

/**
 * 섹션 테마에 따라 동적으로 변하는 네비게이션 버튼 스타일
 */
export const getThemeNavButton = (isOnDarkBackground: boolean) => ({
  base: `
    flex items-center gap-1.5
    px-3 py-2
    rounded-lg
    text-xs font-semibold
    border
    transition-all duration-150 ease-out
    focus:outline-none
    ${
      isOnDarkBackground
        ? 'bg-white/10 text-white border-white/30 hover:bg-white/20 hover:border-white/50'
        : 'bg-gray-900/10 text-gray-900 border-gray-900/30 hover:bg-gray-900/20 hover:border-gray-900/50'
    }
  `,
  outline: `
    flex items-center gap-1.5
    px-3 py-2
    rounded-lg
    text-xs font-semibold
    bg-transparent
    border
    transition-all duration-150 ease-out
    focus:outline-none
    ${
      isOnDarkBackground
        ? 'text-white/80 border-white/30 hover:border-brand hover:text-brand'
        : 'text-gray-700 border-gray-400 hover:border-brand hover:text-brand'
    }
  `,
  mobile: `
    flex items-center justify-center
    p-2.5
    rounded-lg
    border
    transition-all duration-150 ease-out
    focus:outline-none
    ${
      isOnDarkBackground
        ? 'bg-white/10 text-white border-white/30 hover:bg-white/20 hover:border-white/50'
        : 'bg-gray-900/10 text-gray-900 border-gray-900/30 hover:bg-gray-900/20 hover:border-gray-900/50'
    }
  `,
});

/**
 * 사이드바 스타일 (데스크톱용 고정 좌측 사이드바)
 */
export const SIDEBAR = {
  container: `
    fixed left-0 top-0 h-full
    bg-white dark:bg-gray-900
    border-r border-gray-200 dark:border-gray-800
    flex flex-col
    z-40
    print:hidden
    pt-4
  `,
  navSection: 'flex-1 overflow-y-auto pb-4 px-3',
  navItem: `
    flex items-center gap-3 px-4 py-2.5
    rounded-lg text-sm font-medium
    transition-colors duration-150
  `,
  navItemActive: 'bg-brand text-white',
  navItemInactive:
    'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800',
  divider: 'border-t border-gray-200 dark:border-gray-800 my-3 mx-3',
  footer: 'p-4 border-t border-gray-200 dark:border-gray-800',
} as const;

/**
 * 하단 네비게이션 스타일 (모바일/태블릿용)
 */
export const BOTTOM_NAV = {
  container: `
    fixed bottom-0 left-0 right-0
    px-3 pb-2 pt-2
    bg-white dark:bg-gray-900
    rounded-t-xl
    shadow-[0_-2px_10px_rgba(0,0,0,0.08)] dark:shadow-[0_-2px_10px_rgba(0,0,0,0.25)]
    border-t border-gray-200 dark:border-gray-700
    z-50
    lg:hidden
    print:hidden
  `,
  innerContainer: `
    flex items-center
    w-full
    px-3 py-2
    bg-gray-100 dark:bg-gray-800
    border border-gray-200 dark:border-gray-700
    rounded-full
    text-sm
  `,
  menuButton: `
    flex items-center justify-center
    w-8 h-8
    text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white
    transition-colors duration-150
  `,
  actionButton: `
    flex items-center justify-center
    w-8 h-8
    text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white
    transition-colors duration-150
  `,
} as const;

/**
 * 헤더 네비게이션 텍스트 색상
 */
export const HEADER_NAV_TEXT = {
  default: 'text-gray-900 dark:text-white',
  hover: 'hover:text-brand',
  active: 'text-brand',
  inactive: 'text-gray-700 dark:text-gray-300',
} as const;

/**
 * 헤더 네비게이션 버튼 스타일
 */
export const HEADER_NAV_BUTTON = {
  outline: `
    flex items-center gap-1.5
    px-3 py-2
    rounded-lg
    text-xs font-semibold
    bg-transparent
    text-gray-600 dark:text-gray-400
    border border-gray-300 dark:border-gray-600
    hover:border-brand hover:text-brand
    transition-colors duration-200
    focus:outline-none
  `,
  mobile: `
    relative
    flex items-center justify-center
    p-2.5
    rounded-lg
    text-gray-700 dark:text-gray-300
    border border-gray-300 dark:border-gray-600
    hover:border-brand hover:text-brand
    transition-colors duration-200
    focus:outline-none
  `,
  login: `
    text-brand hover:text-brand-hover
    font-bold
    transition-colors duration-200
  `,
} as const;
