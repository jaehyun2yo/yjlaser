/**
 * Search Modal - 검색 모달 스타일 상수
 */

/**
 * 검색 모달 스타일
 */
export const SEARCH_MODAL = {
  overlay: `
    fixed inset-0 z-[100]
    bg-gray-900/95 backdrop-blur-sm
    flex flex-col
  `,
  header: `
    flex items-center gap-3
    px-4 py-3
    border-b border-gray-800
  `,
  input: `
    flex-1 bg-transparent
    text-white text-lg
    placeholder:text-gray-500
    outline-none
  `,
  closeButton: `
    p-2 text-gray-400 hover:text-white
    rounded-lg hover:bg-gray-800
    transition-colors
  `,
  resultsContainer: `
    flex-1 overflow-y-auto
    px-4 py-6
  `,
  resultItem: `
    flex items-center gap-4
    px-4 py-3
    rounded-lg
    hover:bg-gray-800
    cursor-pointer
    transition-colors
  `,
  emptyState: `
    flex flex-col items-center justify-center
    h-full text-center
    text-gray-500
  `,
} as const;
