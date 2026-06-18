/**
 * 웹하드 드래그앤드롭 상태 관리 스토어
 * - 파일 드래그
 * - 폴더 드롭 타겟
 * - 드래그 선택 (박스 선택)
 * - 외부 파일 드래그 (업로드용)
 */
import { create } from 'zustand';

interface Point {
  x: number;
  y: number;
}

interface BoundingRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface DragDropState {
  // State
  draggedFileId: string | null;
  dragOverFolderId: string | null;
  isDragOver: boolean;
  isDragSelecting: boolean;
  dragSelectStart: Point | null;
  dragSelectEnd: Point | null;
  isExternalDragOver: boolean;

  // Actions
  startDrag: (fileId: string) => void;
  endDrag: () => void;
  setDragOver: (folderId: string | null) => void;
  startDragSelect: (x: number, y: number) => void;
  updateDragSelect: (x: number, y: number) => void;
  endDragSelect: () => void;
  setExternalDragOver: (isDragOver: boolean) => void;
  resetDrag: () => void;

  // Getters
  isDragging: boolean;
  getBoundingRect: () => BoundingRect | null;
}

const initialState = {
  draggedFileId: null as string | null,
  dragOverFolderId: null as string | null,
  isDragOver: false,
  isDragSelecting: false,
  dragSelectStart: null as Point | null,
  dragSelectEnd: null as Point | null,
  isExternalDragOver: false,
};

export const useWebhardDragDropStore = create<DragDropState>((set, get) => ({
  // Initial State
  ...initialState,

  // Actions
  startDrag: (fileId: string) => {
    set({ draggedFileId: fileId });
  },

  endDrag: () => {
    set({
      draggedFileId: null,
      dragOverFolderId: null,
      isDragOver: false,
    });
  },

  setDragOver: (folderId: string | null) => {
    // 같은 값이면 업데이트 건너뛰기 (무한 루프 방지)
    if (get().dragOverFolderId === folderId) return;
    set({
      dragOverFolderId: folderId,
      isDragOver: folderId !== null,
    });
  },

  startDragSelect: (x: number, y: number) => {
    set({
      isDragSelecting: true,
      dragSelectStart: { x, y },
      dragSelectEnd: { x, y },
    });
  },

  updateDragSelect: (x: number, y: number) => {
    set({ dragSelectEnd: { x, y } });
  },

  endDragSelect: () => {
    set({
      isDragSelecting: false,
      dragSelectStart: null,
      dragSelectEnd: null,
    });
  },

  setExternalDragOver: (isDragOver: boolean) => {
    // 같은 값이면 업데이트 건너뛰기 (무한 루프 방지)
    if (get().isExternalDragOver === isDragOver) return;
    set({
      isDragOver,
      isExternalDragOver: isDragOver,
    });
  },

  resetDrag: () => {
    set(initialState);
  },

  // Getters
  get isDragging() {
    return get().draggedFileId !== null;
  },

  getBoundingRect: () => {
    const { dragSelectStart, dragSelectEnd } = get();

    if (!dragSelectStart || !dragSelectEnd) {
      return null;
    }

    const left = Math.min(dragSelectStart.x, dragSelectEnd.x);
    const top = Math.min(dragSelectStart.y, dragSelectEnd.y);
    const right = Math.max(dragSelectStart.x, dragSelectEnd.x);
    const bottom = Math.max(dragSelectStart.y, dragSelectEnd.y);

    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    };
  },
}));
