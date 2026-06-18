/**
 * Mobile & Floating - 모바일 메뉴 및 플로팅 액션 스타일 상수
 */

/**
 * 플로팅 액션 버튼 스타일 (데스크톱용)
 */
export const FLOATING_ACTIONS = {
  container: `
    fixed bottom-6 left-1/2 -translate-x-1/2
    hidden lg:flex items-center gap-2
    px-3 py-2
    bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm
    border border-gray-200 dark:border-gray-700
    rounded-full shadow-xl
    z-50
    print:hidden
  `,
  button: `
    w-10 h-10 flex items-center justify-center
    rounded-full
    bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700
    text-gray-700 dark:text-white
    transition-colors duration-150
  `,
  primaryButton: `
    w-10 h-10 flex items-center justify-center
    rounded-full
    bg-brand hover:bg-brand-hover
    text-white
    transition-colors duration-150
  `,
  disabledButton: `
    w-10 h-10 flex items-center justify-center
    rounded-full
    bg-gray-200 dark:bg-gray-800
    text-gray-400 dark:text-gray-500
    opacity-50 cursor-not-allowed
  `,
} as const;

/**
 * 모바일 슬라이드 메뉴 스타일 (공통)
 */
export const MOBILE_SLIDE_MENU = {
  overlay: 'fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]',
  panelRight:
    'fixed top-0 right-0 h-full w-80 max-w-[85vw] z-[70] shadow-2xl backdrop-blur-xl border-l border-white/20 dark:border-white/20',
  panelLeft:
    'fixed top-0 left-0 h-full w-80 max-w-[85vw] z-[70] shadow-2xl backdrop-blur-xl border-r border-white/20 dark:border-white/20',
  panelInner: 'flex flex-col h-full bg-white dark:bg-gray-900',
  header: 'flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700',
  logoContainer: 'h-8 w-auto overflow-hidden flex items-center',
  logoImage: 'max-h-full max-w-full object-contain',
  closeButton:
    'p-2 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-300 transition-all duration-300',
  nav: 'flex-1 overflow-y-auto p-6',
  navItemsContainer: 'flex flex-col gap-2',
  navItem:
    'flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-all duration-300 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
  navItemIcon: 'text-gray-500 dark:text-gray-400',
  navItemActive:
    'flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-all duration-300 bg-brand text-white',
  navItemIconActive: 'text-white',
  divider: 'my-6 pt-6 border-t border-gray-200 dark:border-gray-700',
  actionSection: 'flex flex-col gap-3',
  footer: 'p-6 border-t border-gray-200 dark:border-gray-700',
  logoutButton:
    'flex items-center gap-3 w-full px-4 py-3 rounded-lg text-base font-medium text-red-600 dark:text-red-400 bg-red-500/10 dark:bg-red-500/5 border border-red-500/30 dark:border-red-500/20 hover:bg-red-500/20 transition-colors',
  actionButton:
    'flex items-center gap-3 w-full px-4 py-3 rounded-lg text-base font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors',
} as const;
