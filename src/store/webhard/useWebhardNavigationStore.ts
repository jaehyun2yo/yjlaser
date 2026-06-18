/**
 * 웹하드 네비게이션 상태 관리 스토어
 * - 정렬 옵션
 * - 새 파일 모드
 *
 * Note: 폴더 네비게이션은 URL 기반으로 WebhardMain.tsx에서 처리
 */
import { create } from 'zustand';

export type SortBy = 'name' | 'date' | 'size' | 'uploader';
export type SortOrder = 'asc' | 'desc';

interface NavigationState {
  // State
  sortBy: SortBy;
  sortOrder: SortOrder;
  isNewFilesMode: boolean;

  // Actions
  setSort: (sortBy: SortBy, sortOrder: SortOrder) => void;
  toggleSortOrder: (sortBy: SortBy) => void;
  setNewFilesMode: (enabled: boolean) => void;
  toggleNewFilesMode: () => void;
  reset: () => void;
}

const initialState = {
  sortBy: 'date' as SortBy,
  sortOrder: 'desc' as SortOrder,
  isNewFilesMode: false,
};

export const useWebhardNavigationStore = create<NavigationState>((set, get) => ({
  // Initial State
  ...initialState,

  // Actions
  setSort: (sortBy: SortBy, sortOrder: SortOrder) => {
    set({ sortBy, sortOrder });
  },

  toggleSortOrder: (sortBy: SortBy) => {
    const { sortBy: currentSortBy, sortOrder } = get();

    if (currentSortBy === sortBy) {
      // 같은 컬럼이면 순서 토글
      set({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' });
    } else {
      // 다른 컬럼이면 asc로 시작
      set({ sortBy, sortOrder: 'asc' });
    }
  },

  setNewFilesMode: (enabled: boolean) => {
    set({ isNewFilesMode: enabled });
  },

  toggleNewFilesMode: () => {
    const { isNewFilesMode } = get();
    set({ isNewFilesMode: !isNewFilesMode });
  },

  reset: () => {
    set(initialState);
  },
}));
