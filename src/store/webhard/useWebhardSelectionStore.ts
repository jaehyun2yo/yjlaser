/**
 * 웹하드 파일 선택 상태 관리 스토어
 * - 단일/다중 선택
 * - Ctrl+Click 토글
 * - Shift+Click 범위 선택
 */
import { create } from 'zustand';

interface FileWithId {
  id: string;
}

interface SelectionState {
  // State
  selectedFiles: Set<string>;
  selectedFolders: Set<string>;
  lastClickedFileIndex: number | null;

  // Actions
  selectFile: (id: string, index: number) => void;
  toggleFile: (id: string, index: number) => void;
  selectRange: (startIndex: number | null, endIndex: number, files: FileWithId[]) => void;
  selectAll: (fileIds: string[]) => void;
  clearSelection: () => void;
  removeFromSelection: (id: string) => void;
  addToSelection: (id: string) => void;
  setSelection: (ids: Set<string>) => void;
  addToSelectionBulk: (ids: string[]) => void;
  removeFromSelectionBulk: (ids: string[]) => void;
  setLastClickedIndex: (index: number | null) => void;

  // Folder selection actions
  selectFolder: (id: string) => void;
  toggleFolder: (id: string) => void;
  selectAllFolders: (folderIds: string[]) => void;
  clearFolderSelection: () => void;
  isFolderSelected: (id: string) => boolean;

  // Getters
  isSelected: (id: string) => boolean;
  selectedCount: number;
}

export const useWebhardSelectionStore = create<SelectionState>((set, get) => ({
  // Initial State
  selectedFiles: new Set<string>(),
  selectedFolders: new Set<string>(),
  lastClickedFileIndex: null,

  // Actions
  selectFile: (id: string, index: number) => {
    set({
      selectedFiles: new Set([id]),
      lastClickedFileIndex: index,
    });
  },

  toggleFile: (id: string, index: number) => {
    const { selectedFiles } = get();
    const newSelected = new Set(selectedFiles);

    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }

    set({
      selectedFiles: newSelected,
      lastClickedFileIndex: index,
    });
  },

  selectRange: (startIndex: number | null, endIndex: number, files: FileWithId[]) => {
    // lastClickedFileIndex가 없으면 단일 선택처럼 동작
    if (startIndex === null) {
      const file = files[endIndex];
      if (file) {
        set({
          selectedFiles: new Set([file.id]),
          lastClickedFileIndex: endIndex,
        });
      }
      return;
    }

    // 범위 계산 (역방향도 지원)
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);

    const newSelected = new Set<string>();
    for (let i = start; i <= end; i++) {
      const file = files[i];
      if (file) {
        newSelected.add(file.id);
      }
    }

    set({
      selectedFiles: newSelected,
      lastClickedFileIndex: endIndex,
    });
  },

  selectAll: (fileIds: string[]) => {
    set({
      selectedFiles: new Set(fileIds),
      lastClickedFileIndex: null,
    });
  },

  clearSelection: () => {
    set({
      selectedFiles: new Set<string>(),
      selectedFolders: new Set<string>(),
      lastClickedFileIndex: null,
    });
  },

  removeFromSelection: (id: string) => {
    const { selectedFiles } = get();
    const newSelected = new Set(selectedFiles);
    newSelected.delete(id);
    set({ selectedFiles: newSelected });
  },

  addToSelection: (id: string) => {
    const { selectedFiles } = get();
    const newSelected = new Set(selectedFiles);
    newSelected.add(id);
    set({ selectedFiles: newSelected });
  },

  setSelection: (ids: Set<string>) => {
    set({ selectedFiles: new Set(ids) });
  },

  addToSelectionBulk: (ids: string[]) => {
    const { selectedFiles } = get();
    const newSelected = new Set(selectedFiles);
    ids.forEach((id) => newSelected.add(id));
    set({ selectedFiles: newSelected });
  },

  removeFromSelectionBulk: (ids: string[]) => {
    const { selectedFiles } = get();
    const newSelected = new Set(selectedFiles);
    ids.forEach((id) => newSelected.delete(id));
    set({ selectedFiles: newSelected });
  },

  setLastClickedIndex: (index: number | null) => {
    set({ lastClickedFileIndex: index });
  },

  // Folder selection actions
  selectFolder: (id: string) => {
    set({
      selectedFiles: new Set<string>(),
      selectedFolders: new Set([id]),
      lastClickedFileIndex: null,
    });
  },

  toggleFolder: (id: string) => {
    const { selectedFolders } = get();
    const newSelected = new Set(selectedFolders);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    set({ selectedFolders: newSelected });
  },

  selectAllFolders: (folderIds: string[]) => {
    set({ selectedFolders: new Set(folderIds) });
  },

  clearFolderSelection: () => {
    set({ selectedFolders: new Set<string>() });
  },

  isFolderSelected: (id: string) => {
    return get().selectedFolders.has(id);
  },

  // Getters
  isSelected: (id: string) => {
    return get().selectedFiles.has(id);
  },

  get selectedCount() {
    return get().selectedFiles.size + get().selectedFolders.size;
  },
}));
