/**
 * Webhard - 웹하드 관련 스타일 상수
 */

/**
 * 폴더 트리 스타일 상수 (미니멀 + 애니메이션)
 */
export const FOLDER_TREE = {
  container: 'space-y-0.5 px-1',
  item: {
    base: 'flex items-center gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-200 ease-out relative group',
    default:
      'text-gray-900 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/70 hover:translate-x-0.5',
    selected: 'bg-brand text-white shadow-md shadow-brand/25 scale-[1.01]',
    dragOver:
      'bg-orange-100 dark:bg-orange-900/30 border-2 border-dashed border-brand scale-[1.02]',
    multiSelected:
      'bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/50',
  },
  checkbox: `
    w-3.5 h-3.5
    rounded
    border border-gray-300 dark:border-gray-500
    text-brand
    focus:ring-1 focus:ring-brand/50 focus:ring-offset-0
    checked:bg-brand checked:border-brand
    hover:border-brand
    cursor-pointer
    flex-shrink-0
    transition-all duration-150
  `,
  chevron: {
    base: 'p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-all duration-200 ease-out',
    expanded: 'rotate-90',
    collapsed: 'rotate-0',
  },
  icon: {
    base: 'text-sm flex-shrink-0 transition-all duration-150',
    default:
      'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300 group-hover:scale-110',
    selected: 'text-white',
  },
  name: {
    base: 'truncate text-sm font-medium',
    default: 'text-gray-900 dark:text-gray-200',
    selected: 'text-white',
  },
  children: {
    container: 'ml-2 overflow-hidden transition-all duration-300 ease-out',
    expanded: 'opacity-100',
    collapsed: 'opacity-0 max-h-0',
  },
  badge: {
    wrapper: 'ml-auto',
    selected: '[&_span]:bg-white [&_span]:text-brand',
  },
  menuButton:
    'p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-all duration-150',
} as const;

/**
 * 뱃지 공통 스타일 상수
 * - 주황 배경(#ED6C00) 선택 항목 위 뱃지 반전 스타일 통일
 * - wrapper: 기본 래퍼 (빈 문자열 — 추가 위치 스타일 없음)
 * - selectedWrapper: 주황 배경 위 반전 트리거 (자식 span에 적용)
 * - onOrange: 주황 배경 위 흰 배경 + 주황 텍스트 (직접 className으로 사용 시)
 */
export const BADGE_STYLES = {
  /** 기본 래퍼 */
  wrapper: '',
  /** 선택 상태 래퍼 — 주황 배경 위 자식 span을 흰 배경 + 주황 텍스트로 반전 */
  selectedWrapper: '[&_span]:bg-white [&_span]:text-brand',
  /** 주황 배경 위 반전 스타일 (span에 직접 적용 시) */
  onOrange: 'bg-white text-brand',
} as const;

/**
 * 웹하드 스타일 상수
 */
export const WEBHARD_STYLES = {
  viewToggle: {
    container:
      'hidden sm:flex items-center border border-gray-200 dark:border-gray-700 rounded-md p-0.5',
    active: 'p-1 rounded transition-colors bg-brand text-white',
    inactive:
      'p-1 rounded transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
  },
  uploadButton:
    'flex items-center gap-1 px-2.5 sm:px-3 py-1.5 bg-brand hover:bg-brand-hover disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md transition-colors text-xs font-medium',
  iconButton:
    'p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors',
  fileActionButton:
    'p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors',
  folder: {
    selected: 'bg-brand text-white',
    hover: 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600',
    dragOver: 'bg-brand-light border-2 border-brand',
  },
  fileRow: {
    base: 'flex items-center px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-all',
    selected: 'bg-brand-light border-brand',
    dragging: 'opacity-50 border-2 border-dashed border-brand',
  },
  tableHeader:
    'grid grid-cols-12 gap-4 px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider',
  fileName: 'text-gray-900 dark:text-gray-100 truncate',
  fileMeta: 'text-xs text-gray-500 dark:text-gray-400',
} as const;
