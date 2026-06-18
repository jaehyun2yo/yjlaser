/**
 * Layout & Badge - 레이아웃 및 뱃지 스타일 상수
 */

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from './colors';

/**
 * 레이아웃 공통 스타일
 */
export const LAYOUT = {
  // Container
  container: 'container mx-auto px-4 py-8',
  containerSm: 'container mx-auto px-4 py-4',
  containerLg: 'container mx-auto px-4 py-12',

  // Card
  card: `${BG_COLOR.white} rounded-lg shadow-md ${BORDER_COLOR.default} border`,
  cardHover: `${BG_COLOR.white} rounded-lg shadow-md hover:shadow-lg ${BORDER_COLOR.default} border transition-shadow`,
  cardXl: `${BG_COLOR.white} rounded-xl shadow-md ${BORDER_COLOR.default} border`,

  // Section padding
  section: 'p-6',
  sectionSm: 'p-4',
  sectionLg: 'p-8',

  // Flex layouts
  flexCenter: 'flex items-center justify-center',
  flexBetween: 'flex items-center justify-between',
  flexStart: 'flex items-center justify-start',
  flexEnd: 'flex items-center justify-end',
  flexCol: 'flex flex-col',

  // Grid layouts
  grid2: 'grid grid-cols-1 md:grid-cols-2 gap-6',
  grid3: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6',
  grid4: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6',
} as const;

/**
 * Badge 스타일 (상태 표시 뱃지)
 */
export const BADGE = {
  // Success badge
  success:
    'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-success-light text-success-foreground',
  // Warning badge
  warning:
    'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-warning-light text-warning-foreground',
  // Error badge
  error:
    'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-error-light text-error-foreground',
  // Info badge
  info: 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-info-light text-info-foreground',
  // Gray badge
  gray: 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  // Primary badge
  primary:
    'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-brand-light text-brand',
  // Purple badge
  purple:
    'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',

  // Notification badge (small)
  notification:
    'flex items-center justify-center min-w-[14px] h-[14px] px-1 bg-red-500 text-white text-[8px] font-bold rounded-full leading-none',
  notificationLarge:
    'absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full leading-none',
} as const;

/**
 * Alert/Notification 박스 스타일
 */
export const ALERT = {
  success: `${BG_COLOR.success} ${BORDER_COLOR.success} border rounded-lg p-4 border-l-4`,
  warning: `${BG_COLOR.warning} ${BORDER_COLOR.warning} border rounded-lg p-4 border-l-4`,
  error: `${BG_COLOR.error} ${BORDER_COLOR.error} border rounded-lg p-4 border-l-4`,
  info: `${BG_COLOR.info} ${BORDER_COLOR.info} border rounded-lg p-4 border-l-4`,
} as const;

/**
 * Divider 스타일
 */
export const DIVIDER = {
  horizontal: `border-t ${BORDER_COLOR.default}`,
  vertical: `border-l ${BORDER_COLOR.default}`,
} as const;

/**
 * Tag 스타일 (필터, 카테고리 등)
 */
export const TAG = {
  default: `px-2 py-1 ${BG_COLOR.light} ${TEXT_COLOR.secondary} rounded text-xs`,
  primary: `px-2 py-1 bg-brand text-white rounded text-xs`,
  outline: `px-2 py-1 border ${BORDER_COLOR.default} ${TEXT_COLOR.secondary} rounded text-xs`,
} as const;

/**
 * Transition 스타일 (테마 전환 애니메이션 최적화)
 */
export const TRANSITION_STYLES = {
  // 색상 변경용 (최적화: 더 빠른 전환, GPU 가속)
  colors: 'transition-colors duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
  // 모든 속성 변경용
  all: 'transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
  // 기본 transition
  base: 'transition-colors duration-300',
  // Shadow transition
  shadow: 'transition-shadow duration-300',
} as const;

/**
 * 테이블 스타일
 */
export const TABLE = {
  container: 'overflow-x-auto',
  table: 'w-full',
  thead: `${BG_COLOR.light} ${TEXT_COLOR.primary}`,
  th: `text-left py-3 px-4 text-sm font-semibold ${TEXT_COLOR.primary}`,
  tr: `${BORDER_COLOR.default} border-b`,
  td: `py-3 px-4 text-sm ${TEXT_COLOR.primary}`,
  trHover: `${BORDER_COLOR.default} border-b ${BG_COLOR.hoverLight} ${TRANSITION_STYLES.colors}`,
} as const;

/**
 * Modal/Dialog 스타일
 */
export const MODAL = {
  overlay: 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center',
  container: `${BG_COLOR.white} rounded-lg shadow-xl max-w-lg w-full mx-4`,
  header: `${LAYOUT.section} ${BORDER_COLOR.default} border-b`,
  body: LAYOUT.section,
  footer: `${LAYOUT.section} ${BORDER_COLOR.default} border-t ${LAYOUT.flexEnd} gap-2`,
} as const;

/**
 * 활동 로그 배지 스타일 (액션 유형별)
 */
export const ACTIVITY_LOG_BADGE = {
  login: 'bg-success-light text-success-foreground',
  logout: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  upload: 'bg-info-light text-info-foreground',
  download: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  delete: 'bg-error-light text-error-foreground',
  permissionChange: 'bg-brand-light text-brand',
  update: 'bg-warning-light text-warning-foreground',
  teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
  default: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
} as const;
