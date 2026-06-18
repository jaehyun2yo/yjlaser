/**
 * Button & Input System - 버튼 및 입력 필드 스타일 상수
 */

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from './colors';
import { TRANSITION_STYLES } from './layout';

/**
 * 버튼 배경색 (StepIndicator와 동일한 회색)
 */
export const BUTTON_BG_COLORS = {
  // 라이트 모드: gray-200, 다크 모드: gray-700
  default: 'bg-gray-200 dark:bg-gray-700',
  hover: 'hover:bg-gray-300 dark:hover:bg-gray-600',
} as const;

/**
 * 버튼 스타일
 * 모든 버튼은 14px(text-sm) 글자 크기와 py-3 px-8 크기로 통일
 */
export const BUTTON_STYLES = {
  primary: `bg-brand hover:bg-brand-hover text-white text-sm py-3 px-8 rounded-lg ${TRANSITION_STYLES.base} shadow-md hover:shadow-lg cursor-pointer`,
  primaryDisabled: `bg-brand hover:bg-brand-hover disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm py-3 px-8 rounded-lg ${TRANSITION_STYLES.base} shadow-md hover:shadow-lg cursor-pointer`,
  secondary: `${BUTTON_BG_COLORS.default} ${BUTTON_BG_COLORS.hover} ${TEXT_COLOR.primary} text-sm py-3 px-8 rounded-lg ${TRANSITION_STYLES.colors} cursor-pointer`,
  modal: `bg-brand hover:bg-brand-hover text-white text-sm py-3 px-8 rounded-lg ${TRANSITION_STYLES.base} flex items-center justify-center gap-2 cursor-pointer`,
  // 헤더 네비게이션 버튼 스타일 (공정관리, 로그아웃 등)
  headerNav: `${BUTTON_BG_COLORS.default} ${BUTTON_BG_COLORS.hover} ${TEXT_COLOR.primary} ${TRANSITION_STYLES.colors} cursor-pointer`,
  // 위험한 액션 버튼 (삭제 등)
  danger: `bg-error hover:bg-error/90 text-white text-sm py-3 px-8 rounded-lg ${TRANSITION_STYLES.base} cursor-pointer`,
  // Ghost 버튼 (테두리만)
  ghost: `border ${BORDER_COLOR.default} ${BG_COLOR.hoverLight} ${TEXT_COLOR.primary} text-sm py-3 px-8 rounded-lg ${TRANSITION_STYLES.colors} cursor-pointer`,
  // 작은 버튼
  small: `bg-brand hover:bg-brand-hover text-white text-xs py-2 px-4 rounded ${TRANSITION_STYLES.base} cursor-pointer`,
} as const;

/**
 * 입력 필드 스타일
 */
export const INPUT_STYLES = {
  base: `px-4 py-2 border ${BORDER_COLOR.dark} rounded-lg ${BG_COLOR.white} ${TEXT_COLOR.primary} placeholder:text-sm placeholder:${TEXT_COLOR.muted} focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand ${TRANSITION_STYLES.base}`,
  focus: 'focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand',
  full: 'w-full',
  twoThirds: 'w-2/3',
  oneThird: 'w-1/3',
  // 작은 검색 입력 필드 스타일 (관리자 페이지용)
  searchSmall: `px-2.5 sm:px-3 py-1.5 border ${BORDER_COLOR.dark} rounded-lg ${BG_COLOR.white} ${TEXT_COLOR.primary} text-xs placeholder:${TEXT_COLOR.muted} focus:outline-none focus:ring-2 focus:ring-brand ${TRANSITION_STYLES.base}`,
  searchSmallWidth: 'w-40 sm:w-48',
  // Textarea
  textarea: `px-4 py-2 border ${BORDER_COLOR.dark} rounded-lg ${BG_COLOR.white} ${TEXT_COLOR.primary} placeholder:text-sm placeholder:${TEXT_COLOR.muted} focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand ${TRANSITION_STYLES.base} resize-none`,
} as const;

/**
 * 체크박스/라디오 스타일
 */
export const CHECKBOX_STYLES = {
  base: `w-4 h-4 ${BG_COLOR.light} ${BORDER_COLOR.dark} focus:ring-2 dark:ring-offset-gray-800`,
  primary: 'text-brand focus:ring-brand',
} as const;

/**
 * 파일 입력 스타일
 */
export const FILE_INPUT_STYLES = {
  base: `w-full px-4 py-3 border ${BORDER_COLOR.dark} rounded-lg ${BG_COLOR.white} ${TEXT_COLOR.primary} placeholder:text-sm placeholder:${TEXT_COLOR.muted} focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand ${TRANSITION_STYLES.base}`,
  fileButton:
    'file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-brand-light file:text-brand hover:file:bg-primary-100',
} as const;

/**
 * 링크 스타일
 */
export const LINK_STYLES = {
  primary: 'text-brand hover:text-brand-hover font-medium underline',
  plain: `text-brand hover:text-brand-hover ${TRANSITION_STYLES.colors}`,
} as const;

/**
 * 필터/카테고리 버튼 스타일 (통일된 스타일)
 */
export const FILTER_BUTTON_STYLES = {
  // 비활성 상태 (기본)
  inactive: `${BG_COLOR.light} ${TEXT_COLOR.secondary} ${BG_COLOR.hoverGray} cursor-pointer`,
  // 활성 상태
  active: `bg-brand text-white shadow-md cursor-pointer`,
  // 카테고리 배지 (호버 효과 없음)
  badge: `${BG_COLOR.light} ${TEXT_COLOR.secondary}`,
} as const;

/**
 * 스텝 인디케이터 스타일
 */
export const STEP_STYLES = {
  active: {
    text: 'text-brand',
    circle: 'bg-brand text-white',
  },
  inactive: {
    text: 'text-gray-400',
    circle: 'bg-gray-200 dark:bg-gray-700 text-gray-500',
  },
} as const;

/**
 * 대시보드 액션 버튼 스타일
 */
export const DASHBOARD_ACTION_BUTTON = {
  base: 'h-[28px] px-3 sm:px-4 flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg transition-colors',
  /** 카드 액션 버튼 공통 스타일 — 흰색 배경 + 미세 보더 + 그림자 (forced-light) */
  cardAction:
    'bg-white/90 hover:bg-white border border-gray-200 text-gray-600 hover:text-gray-800 shadow-sm h-[28px] px-3 sm:px-4 flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg transition-colors',
  revision:
    'bg-white/90 hover:bg-white border border-gray-200 text-gray-600 hover:text-gray-800 shadow-sm h-[28px] px-3 sm:px-4 flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg transition-colors',
  change:
    'bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-white h-[28px] px-3 sm:px-4 flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg transition-colors',
  cancel:
    'bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-white h-[28px] px-3 sm:px-4 flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg transition-colors',
  secondary:
    'bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-white h-[28px] px-3 sm:px-4 flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg transition-colors',
} as const;

/**
 * 대시보드 상태 뱃지 스타일
 */
export const DASHBOARD_STATUS_BADGE = {
  base: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-medium border flex-shrink-0',
  completed: 'bg-green-600 text-white border-green-600',
  inProgress: 'bg-brand text-white border-brand',
  revision: 'bg-red-600 text-white border-red-600',
  pending: 'bg-gray-600 text-white border-gray-600',
  sampleReady:
    'h-[24px] px-3 flex items-center justify-center bg-brand text-white text-xs font-medium rounded-full whitespace-nowrap',
  samplePending:
    'h-[24px] px-2 flex items-center justify-center bg-gray-600 text-white text-xs font-medium rounded-full whitespace-nowrap',
} as const;
