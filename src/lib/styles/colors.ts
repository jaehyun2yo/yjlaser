/**
 * Color System - CSS 변수 기반 시맨틱 색상 토큰
 *
 * 규칙:
 * 1. 새 코드는 NEW 섹션의 키만 사용
 * 2. DEPRECATED 섹션은 마이그레이션 완료 후 제거 예정
 * 3. dark: 접두사 사용 금지 — CSS 변수가 자동 처리
 */

// ──────────────────────────────────────────────
// NEW: 시맨틱 토큰
// ──────────────────────────────────────────────

const TEXT_NEW = {
  // === Gray Scale ===
  primary: 'text-foreground',
  secondary: 'text-muted-foreground',
  muted: 'text-muted-foreground/70',
  disabled: 'text-muted-foreground/50',
  white: 'text-white',
  inverted: 'text-background',

  // === Brand ===
  brand: 'text-brand',
  brandHover: 'hover:text-brand-hover',

  // === Status ===
  success: 'text-success',
  successStrong: 'text-success-foreground',
  warning: 'text-warning',
  warningStrong: 'text-warning-foreground',
  error: 'text-destructive',
  errorStrong: 'text-error-foreground',
  info: 'text-info',
  infoStrong: 'text-info-foreground',

  // === Hover ===
  hoverPrimary: 'hover:text-foreground',
  hoverBrand: 'hover:text-brand',
  hoverError: 'hover:text-destructive',
} as const;

const BG_NEW = {
  // === Base ===
  page: 'bg-background',
  card: 'bg-card',
  muted: 'bg-muted',
  elevated: 'bg-card',
  overlay: 'bg-black/50',

  // === Brand ===
  brand: 'bg-brand',
  brandHover: 'hover:bg-brand-hover',
  brandLight: 'bg-brand-light',

  // === Status Light ===
  success: 'bg-success-light',
  warning: 'bg-warning-light',
  error: 'bg-error-light',
  info: 'bg-info-light',

  // === Status Solid ===
  successSolid: 'bg-success',
  warningSolid: 'bg-warning',
  errorSolid: 'bg-error',
  infoSolid: 'bg-info',

  // === Hover ===
  hoverMuted: 'hover:bg-muted',
  hoverCard: 'hover:bg-accent',
  hoverBrand: 'hover:bg-brand-light',
  hoverError: 'hover:bg-error-light',
} as const;

const BORDER_NEW = {
  default: 'border-border',
  strong: 'border-border',
  light: 'border-border/50',
  brand: 'border-brand',
  success: 'border-success',
  warning: 'border-warning',
  error: 'border-destructive',
  info: 'border-info',
  transparent: 'border-transparent',
  hoverBrand: 'hover:border-brand',
} as const;

const DIVIDE_NEW = {
  default: 'divide-gray-200 dark:divide-gray-700',
  light: 'divide-gray-100 dark:divide-gray-700',
  lightSoft: 'divide-gray-100 dark:divide-gray-700/50',
  lighter: 'divide-gray-100 dark:divide-gray-800',
} as const;

const RING_NEW = {
  grayMedium: 'ring-gray-400 dark:ring-gray-500',
} as const;

// ──────────────────────────────────────────────
// DEPRECATED: 기존 키 → 원래 값 보존 (backward compat)
// 마이그레이션 완료 후 제거 예정
// ──────────────────────────────────────────────

const TEXT_DEPRECATED = {
  // gray shades
  tertiary: 'text-gray-600 dark:text-gray-400',
  strong: 'text-gray-900 dark:text-white',
  subtle: 'text-gray-500 dark:text-gray-400',
  dim: 'text-gray-400 dark:text-gray-500',
  bright: 'text-gray-700 dark:text-gray-200',
  softMuted: 'text-gray-600 dark:text-gray-300',
  alphaLight: 'text-gray-600 dark:text-white/60',
  darker: 'text-gray-800 dark:text-gray-200',
  dimInvert: 'text-gray-300 dark:text-gray-600',
  tertiaryMid: 'text-gray-700 dark:text-gray-400',

  // additional status shades
  warningMid: 'text-yellow-800 dark:text-yellow-300',
  purple: 'text-purple-600 dark:text-purple-400',
  purpleDeep: 'text-purple-800 dark:text-purple-200',

  // accent
  accent: 'text-[#ED6C00]',
  accentHover: 'hover:text-[#d15f00]',

  // hover
  hoverSecondary: 'hover:text-gray-700 dark:hover:text-gray-300',
  hoverTertiary: 'hover:text-gray-600 dark:hover:text-gray-300',
  hoverStrongest: 'hover:text-gray-900 dark:hover:text-white',

  // status
  successDeep: 'text-green-800 dark:text-green-200',
  warningDeep: 'text-yellow-800 dark:text-yellow-200',
  errorMid: 'text-red-500 dark:text-red-400',
  errorDeep: 'text-red-800 dark:text-red-200',
  infoDeep: 'text-blue-800 dark:text-blue-200',
  orange: 'text-orange-600 dark:text-orange-400',
  orangeStrong: 'text-orange-700 dark:text-orange-400',
  dimAlpha: 'text-gray-400 dark:text-white/40',
  dimAlphaLight: 'text-gray-500 dark:text-white/50',

  // badge/status text shades
  successDark: 'text-green-800 dark:text-green-400',
  grayDark: 'text-gray-800 dark:text-gray-300',
  infoDark: 'text-blue-800 dark:text-blue-400',
  purpleDark: 'text-purple-800 dark:text-purple-400',
  errorDark: 'text-red-800 dark:text-red-400',
  orangeDark: 'text-orange-800 dark:text-orange-400',
  yellowDark: 'text-yellow-800 dark:text-yellow-400',

  // additional variants
  mediumBright: 'text-gray-700 dark:text-gray-300',
  redLight: 'text-red-600 dark:text-red-300',
  redMuted: 'text-red-300 dark:text-red-700',

  // alpha text
  softWhite: 'text-gray-600 dark:text-white/70',
  separator: 'text-gray-300 dark:text-white/20',
  hoverSoftWhite: 'hover:text-gray-600 dark:hover:text-white/70',

  // deep status variants (900-level)
  infoDeepest: 'text-blue-900 dark:text-blue-200',
  successDeepest: 'text-green-900 dark:text-green-200',

  // orange deep variants
  orangeDeep: 'text-orange-800 dark:text-orange-200',
  orangeMid: 'text-orange-700 dark:text-orange-300',
  hoverOrangeDeep: 'hover:text-orange-800 dark:hover:text-orange-200',

  // teal and indigo lights
  tealLight: 'text-teal-600 dark:text-teal-400',
  indigoLight: 'text-indigo-600 dark:text-indigo-400',

  // bright status colors
  successBright: 'text-green-500 dark:text-green-400',

  // hover info strong
  hoverInfoStrong: 'hover:text-blue-700 dark:hover:text-blue-300',

  // brand orange
  themeToggle: 'text-gray-600 dark:text-yellow-400',
  orangeSolid: 'text-orange-500 dark:text-orange-400',
  hoverAccent: 'hover:text-[#ED6C00] dark:hover:text-orange-400',
  hoverOrangeLight: 'hover:text-orange-700 dark:hover:text-orange-500',
  hoverOrangeSolid: 'hover:text-orange-500 dark:hover:text-orange-400',
  hoverBright: 'hover:text-gray-700 dark:hover:text-gray-200',

  // dim invert soft
  dimInvertSoft: 'text-gray-200 dark:text-gray-700',

  // success/error medium
  successMedium: 'text-green-700 dark:text-green-400',
  errorMedium: 'text-red-700 dark:text-red-400',

  // muted alpha
  mutedAlpha: 'text-gray-500 dark:text-white/40',

  // hover orange mid
  hoverOrangeMid: 'hover:text-orange-700 dark:hover:text-orange-300',

  // amber strong
  amberStrong: 'text-amber-700 dark:text-amber-300',

  // hover error soft
  hoverErrorSoft: 'hover:text-red-500 dark:hover:text-red-400',

  // yellow/brand
  yellowBrand: 'text-yellow-500 dark:text-yellow-400',
  brandBright: 'text-[#ED6C00] dark:text-[#ff8533]',

  // mid colors
  blueMid: 'text-blue-700 dark:text-blue-300',
  cyanMid: 'text-cyan-700 dark:text-cyan-300',
  purpleMid: 'text-purple-700 dark:text-purple-300',
  yellowMid: 'text-yellow-700 dark:text-yellow-400',
} as const;

const BG_DEPRECATED = {
  // 기본 배경
  white: 'bg-white dark:bg-gray-800',
  gray: 'bg-gray-50 dark:bg-gray-900',
  light: 'bg-gray-100 dark:bg-gray-700',
  lightGray: 'bg-gray-100 dark:bg-gray-700',

  // extended gray shades
  medium: 'bg-gray-200 dark:bg-gray-700',
  lightDark: 'bg-gray-100 dark:bg-gray-800',
  whiteDark: 'bg-white dark:bg-gray-700',
  darker: 'bg-white dark:bg-gray-900',
  strong: 'bg-gray-300 dark:bg-gray-600',
  grayHalf: 'bg-gray-50 dark:bg-gray-700/50',
  grayDark: 'bg-gray-50 dark:bg-gray-800',

  // hover 배경
  hoverLight: 'hover:bg-gray-50 dark:hover:bg-gray-700/50',
  hoverGray: 'hover:bg-gray-100 dark:hover:bg-gray-700',
  hoverDark: 'hover:bg-gray-200 dark:hover:bg-gray-600',
  hoverMedium: 'hover:bg-gray-200 dark:hover:bg-gray-700',
  hoverLightDark: 'hover:bg-gray-100 dark:hover:bg-gray-800',
  hoverLighter: 'hover:bg-gray-50 dark:hover:bg-gray-700',
  hoverLighterDark: 'hover:bg-gray-50 dark:hover:bg-gray-600',

  // extended gray shades (2)
  grayLighter: 'bg-gray-50 dark:bg-gray-700',
  mediumStrong: 'bg-gray-300 dark:bg-gray-700',
  weakMedium: 'bg-gray-300/30 dark:bg-gray-700/30',
  weakLight: 'bg-gray-200/50 dark:bg-gray-800/50',
  whiteAlpha: 'bg-white dark:bg-white/5',

  // status 배경
  successLight: 'bg-green-100 dark:bg-green-900/30',
  successMedium: 'bg-green-100 dark:bg-green-900',
  warningLight: 'bg-yellow-50 dark:bg-yellow-900/30',
  errorLight: 'bg-red-100 dark:bg-red-900/30',
  errorMedium: 'bg-red-100 dark:bg-red-900',
  infoLight: 'bg-blue-50 dark:bg-blue-900/30',
  infoLighter: 'bg-blue-100 dark:bg-blue-900/30',
  infoMedium: 'bg-blue-100 dark:bg-blue-900',
  orange: 'bg-orange-50 dark:bg-orange-900/20',
  orangeLight: 'bg-orange-100 dark:bg-orange-900/30',
  orangeMedium: 'bg-orange-100 dark:bg-orange-900',

  // additional special shades
  purple: 'bg-purple-50 dark:bg-purple-900/20',
  purpleLight: 'bg-purple-100 dark:bg-purple-900/30',
  orangeWarm: 'bg-orange-50 dark:bg-orange-900/30',
  grayTranslucent: 'bg-gray-300/50 dark:bg-gray-700/50',

  // status hover 배경
  hoverSuccessDark: 'hover:bg-green-100 dark:hover:bg-green-900/30',
  hoverWarningDark: 'hover:bg-yellow-100 dark:hover:bg-yellow-900/30',
  hoverErrorDark: 'hover:bg-red-100 dark:hover:bg-red-900/30',
  hoverInfoDark: 'hover:bg-blue-100 dark:hover:bg-blue-900/30',
  hoverErrorLight: 'hover:bg-red-100 dark:hover:bg-red-900/30',
  hoverErrorMedium: 'hover:bg-red-200 dark:hover:bg-red-900/40',
  hoverOrange: 'hover:bg-orange-50 dark:hover:bg-orange-900/20',
  hoverGrayDeep: 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
  hoverGrayDark: 'hover:bg-gray-50 dark:hover:bg-gray-800',
  hoverStronger: 'hover:bg-gray-300 dark:hover:bg-gray-600',
  hoverBlue: 'hover:bg-blue-50 dark:hover:bg-blue-900/20',
  hoverWhite: 'hover:bg-white dark:hover:bg-gray-700',

  // primary 배경
  primary: 'bg-[#ED6C00]',
  primaryHover: 'hover:bg-[#d15f00]',
  hoverPrimaryLight: 'hover:bg-orange-50 dark:hover:bg-orange-900/20',

  // additional status backgrounds
  teal: 'bg-teal-100 dark:bg-teal-900/30',
  codeBlock: 'bg-gray-100 dark:bg-gray-900',

  // login page special background
  loginPage: 'bg-gray-50 dark:bg-[#0a0a0a]',

  // alpha status backgrounds
  errorAlpha: 'bg-red-50 dark:bg-red-500/10',
  successAlpha: 'bg-green-50 dark:bg-green-500/10',

  // hover with alpha
  hoverOrangeRow: 'hover:bg-orange-50 dark:hover:bg-gray-700/50',
  hoverWhiteAlpha: 'hover:bg-gray-50 dark:hover:bg-white/5',

  // gradient card
  gradientCard: 'bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-900 dark:to-gray-800',

  // revision badge
  revisionBadge: 'bg-red-200 dark:bg-red-500/20',

  // card hover backgrounds
  hoverCardHeader: 'hover:bg-gray-200/50 dark:hover:bg-gray-800/50',
  hoverCardChevron: 'hover:bg-gray-200/50 dark:hover:bg-gray-700/50',

  // inverted backgrounds
  inverted: 'bg-gray-900 dark:bg-gray-100',
  invertedWhite: 'bg-gray-900 dark:bg-white',

  // tooltip / dark overlay
  tooltip: 'bg-gray-900 dark:bg-gray-800',

  // bright status backgrounds
  infoBright: 'bg-blue-600 dark:bg-blue-400',

  // yellow / purple medium-deep
  warningMediumDeep: 'bg-yellow-100 dark:bg-yellow-900',
  purpleMediumDeep: 'bg-purple-100 dark:bg-purple-900',

  // process stage lighter backgrounds
  yellowLight: 'bg-yellow-100 dark:bg-yellow-900/30',
  indigoLight: 'bg-indigo-100 dark:bg-indigo-900/30',

  // gradient file preview
  gradientFilePreview:
    'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700',

  // amber backgrounds
  amberWarm: 'bg-amber-50 dark:bg-amber-900/20',

  // gray disabled state
  grayDisabled: 'bg-gray-200 dark:bg-gray-800',

  // gray badge/status backgrounds with stronger dark
  mediumDarkStrong: 'bg-gray-200 dark:bg-gray-600',

  // error soft hover
  hoverErrorSoft: 'hover:bg-red-50 dark:hover:bg-red-900/30',

  // active tab selected
  orangeTabSelected: 'bg-orange-50/50 dark:bg-gray-700/50',

  // brand alpha light bg
  brandAlphaLight: 'bg-[#fff7ed]/50 dark:bg-[#ED6C00]/10',

  // orange alpha bg
  orangeAlpha: 'bg-orange-50/50 dark:bg-orange-900/10',

  // orange overlay
  orangeOverlay: 'bg-orange-50/80 dark:bg-orange-900/30',

  // gray alpha
  grayAlpha: 'bg-gray-100 dark:bg-white/5',

  // brand alpha soft
  brandAlphaSoft: 'bg-[#ED6C00]/10 dark:bg-[#ED6C00]/20',

  // error/orange soft
  errorSoft: 'bg-red-50 dark:bg-red-900/10',
  orangeSoft: 'bg-orange-50 dark:bg-orange-900/10',

  // hover status strong backgrounds
  hoverInfoStrong: 'hover:bg-blue-200 dark:hover:bg-blue-800',
  hoverSuccessStrong: 'hover:bg-green-200 dark:hover:bg-green-900/50',
  hoverErrorStrong: 'hover:bg-red-200 dark:hover:bg-red-900/50',
  hoverSuccessSolid: 'hover:bg-green-100 dark:hover:bg-green-800',
  hoverErrorSolid: 'hover:bg-red-100 dark:hover:bg-red-800',
  hoverWarningSolid: 'hover:bg-yellow-100 dark:hover:bg-yellow-900/50',

  // hover light deep
  hoverLightDeep: 'hover:bg-gray-100 dark:hover:bg-gray-900/70',

  // hover medium dark
  hoverMediumDark: 'hover:bg-gray-300 dark:hover:bg-gray-500',

  // brand full
  brandFull: 'bg-[#ED6C00] dark:bg-[#ff8533]',

  // gray translucent light
  grayTranslucentLight: 'bg-gray-200/50 dark:bg-gray-700/50',

  // alpha overlays
  blackAlpha: 'bg-black/10 dark:bg-white/20',
  hoverBlackAlpha: 'hover:bg-black/5 dark:hover:bg-white/10',

  // mixed hover
  hoverGrayToOrange: 'hover:bg-gray-100 dark:hover:bg-orange-800',

  // gray alpha 80%
  grayAlpha80: 'bg-gray-200/80 dark:bg-gray-800/80',

  // gray mid deep
  grayMidDeep: 'bg-gray-400 dark:bg-gray-500',

  // white alpha 95%
  whiteAlpha95: 'bg-white/95 dark:bg-gray-900/95',

  // info alpha
  infoAlpha: 'bg-blue-50/50 dark:bg-blue-900/10',

  // info light mid
  infoLightMid: 'bg-blue-100 dark:bg-blue-900/40',

  // role badge backgrounds
  cyanLight: 'bg-cyan-100 dark:bg-cyan-900/40',
  purpleLightDeep: 'bg-purple-100 dark:bg-purple-900/40',
  amberLightDeep: 'bg-amber-100 dark:bg-amber-900/40',

  // emerald light
  emeraldLight: 'bg-emerald-100 dark:bg-emerald-900/30',

  // success/error soft deep
  successSoftDeep: 'bg-green-50 dark:bg-green-900/30',
  errorSoftDeep: 'bg-red-50 dark:bg-red-900/30',

  // hover black alpha light
  hoverBlackAlphaLight: 'hover:bg-black/5 dark:hover:bg-white/5',

  // hover status deep
  hoverErrorDeep: 'hover:bg-red-200 dark:hover:bg-red-800',
  hoverSuccessMedium: 'hover:bg-green-200 dark:hover:bg-green-800',

  // hover orange strong
  hoverOrangeStrong: 'hover:bg-orange-200 dark:hover:bg-orange-800',

  // hover orange soft
  hoverOrangeSoft: 'hover:bg-orange-50 dark:hover:bg-orange-900/30',

  // error soft alpha
  errorSoftAlpha: 'bg-red-50/50 dark:bg-red-900/10',

  // hover brand alpha
  hoverBrandAlpha: 'hover:bg-[#ED6C00]/10 dark:hover:bg-[#ED6C00]/20',

  // brand warm light
  brandWarmLight: 'bg-[#fff7ed] dark:bg-[#ED6C00]/20',
} as const;

const BORDER_DEPRECATED = {
  dark: 'border-gray-300 dark:border-gray-600',
  medium: 'border-gray-200 dark:border-gray-600',
  lightMedium: 'border-gray-100 dark:border-gray-700',
  whiteAlpha: 'border-gray-200 dark:border-white/10',
  stronger: 'border-gray-300 dark:border-gray-500',
  softDark: 'border-gray-300/50 dark:border-gray-700/50',
  orange: 'border-orange-200 dark:border-orange-800',
  errorAlpha: 'border-red-200 dark:border-red-500/20',
  successAlpha: 'border-green-200 dark:border-green-500/20',
  whiteAlphaLight: 'border-gray-300 dark:border-white/20',
  redAlphaMedium: 'border-red-300 dark:border-red-800/50',
  redAlphaLight: 'border-red-300 dark:border-red-800/30',
  grayAlphaMedium: 'border-gray-400/50 dark:border-gray-600/50',
  grayAlphaLight: 'border-gray-400/30 dark:border-gray-600/30',
  revisionBadge: 'border-red-400 dark:border-red-500/30',
  hoverGray: 'hover:border-gray-300 dark:hover:border-gray-600',
  amber: 'border-amber-200 dark:border-amber-800',
  infoMedium: 'border-blue-200 dark:border-blue-700',
  successMedium: 'border-green-300 dark:border-green-800',
  errorBorder: 'border-red-300 dark:border-red-800',
  hoverOrange: 'hover:border-orange-300 dark:hover:border-orange-600',
  errorSoft: 'border-red-100 dark:border-red-900',
  errorBorderMedium: 'border-red-300 dark:border-red-600',
  orangeMedium: 'border-orange-300 dark:border-orange-700',
  orangeAlpha: 'border-orange-300 dark:border-orange-800/50',
  grayMedium: 'border-gray-400 dark:border-gray-500',
} as const;

// ──────────────────────────────────────────────
// EXPORT: 새 키 + deprecated alias 합성
// ──────────────────────────────────────────────

export const TEXT_COLOR = { ...TEXT_NEW, ...TEXT_DEPRECATED } as const;
export const BG_COLOR = { ...BG_NEW, ...BG_DEPRECATED } as const;
export const BORDER_COLOR = { ...BORDER_NEW, ...BORDER_DEPRECATED } as const;
export const DIVIDE_COLOR = { ...DIVIDE_NEW } as const;
export const RING_COLOR = { ...RING_NEW } as const;

export const COLORS = {
  primary: 'var(--brand)',
  primaryHover: 'var(--brand-hover)',
  primaryLight: 'var(--brand-light)',
  primary50: '#fff7ed',
  primary100: '#ffedd5',
  primary200: '#fed7aa',
  primary300: '#fdba74',
  primary400: '#fb923c',
} as const;
