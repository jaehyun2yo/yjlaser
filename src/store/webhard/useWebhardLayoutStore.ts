/**
 * 웹하드 레이아웃 상태 관리 스토어
 * - 뷰 모드 (리스트/그리드)
 * - 사이드바 너비/접힘
 * - 컬럼 너비
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 상수
const DEFAULT_SIDEBAR_WIDTH = 256; // 픽셀 (w-64)
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 500;
const DEFAULT_FILENAME_COL_WIDTH = 75; // 퍼센트
const DEFAULT_DATE_COL_WIDTH = 10; // 퍼센트
const MIN_COLUMN_WIDTH = 10; // 최소 퍼센트

type ViewMode = 'list' | 'grid';
type ColumnType = 'fileName' | 'date';

interface LayoutState {
  // State
  viewMode: ViewMode;
  sidebarWidth: number;
  isSidebarCollapsed: boolean;
  fileNameColWidth: number;
  dateColWidth: number;
  resizingColumn: ColumnType | null;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setColumnWidth: (column: ColumnType, width: number) => void;
  startResizing: (column: ColumnType) => void;
  stopResizing: () => void;
  resetLayout: () => void;

  // Getters
  isResizing: boolean;
}

const initialState = {
  viewMode: 'list' as ViewMode,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  isSidebarCollapsed: false,
  fileNameColWidth: DEFAULT_FILENAME_COL_WIDTH,
  dateColWidth: DEFAULT_DATE_COL_WIDTH,
  resizingColumn: null as ColumnType | null,
};

export const useWebhardLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      // Initial State
      ...initialState,

      // Actions
      setViewMode: (mode: ViewMode) => {
        set({ viewMode: mode });
      },

      setSidebarWidth: (width: number) => {
        // 최소/최대 범위 제한
        const clampedWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, width));
        set({ sidebarWidth: clampedWidth });
      },

      setSidebarCollapsed: (collapsed: boolean) => {
        set({ isSidebarCollapsed: collapsed });
      },

      toggleSidebar: () => {
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed }));
      },

      setColumnWidth: (column: ColumnType, width: number) => {
        // 최소 너비 제한
        const clampedWidth = Math.max(MIN_COLUMN_WIDTH, width);

        if (column === 'fileName') {
          set({ fileNameColWidth: clampedWidth });
        } else if (column === 'date') {
          set({ dateColWidth: clampedWidth });
        }
      },

      startResizing: (column: ColumnType) => {
        set({ resizingColumn: column });
      },

      stopResizing: () => {
        set({ resizingColumn: null });
      },

      resetLayout: () => {
        set(initialState);
      },

      // Getters
      get isResizing() {
        return get().resizingColumn !== null;
      },
    }),
    {
      name: 'webhard-layout',
      partialize: (state) => ({
        viewMode: state.viewMode,
        sidebarWidth: state.sidebarWidth,
        isSidebarCollapsed: state.isSidebarCollapsed,
        fileNameColWidth: state.fileNameColWidth,
        dateColWidth: state.dateColWidth,
      }),
    }
  )
);
