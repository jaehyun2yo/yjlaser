/**
 * 웹하드 업로드 상태 관리 스토어
 * - 업로드 큐
 * - 진행률 추적
 * - 상태 관리 (pending, uploading, completed, error)
 *
 * @optimization File 객체는 별도 Map에 저장하여 메모리 누수 방지
 */
import { create } from 'zustand';

export type UploadStatus = 'pending' | 'uploading' | 'completed' | 'error';

// ============================================================================
// File 객체 외부 저장소 (메모리 최적화)
// ============================================================================

/**
 * File 객체를 Zustand 상태와 분리하여 저장
 * - 완료된 업로드의 File 참조를 즉시 해제 가능
 * - Zustand 상태 변경 시 File 객체 직렬화 방지
 */
const fileStorage = new Map<string, File>();

/**
 * File 객체 저장
 */
export function storeFile(id: string, file: File): void {
  fileStorage.set(id, file);
}

/**
 * File 객체 조회
 */
export function getFile(id: string): File | undefined {
  return fileStorage.get(id);
}

/**
 * File 객체 삭제 (메모리 해제)
 */
export function releaseFile(id: string): void {
  fileStorage.delete(id);
}

/**
 * 여러 File 객체 삭제
 */
export function releaseFiles(ids: string[]): void {
  ids.forEach((id) => fileStorage.delete(id));
}

/**
 * 모든 File 객체 삭제
 */
export function releaseAllFiles(): void {
  fileStorage.clear();
}

/**
 * 저장된 File 개수
 */
export function getFileStorageSize(): number {
  return fileStorage.size;
}

// ============================================================================
// 타입 정의
// ============================================================================

export interface UploadItem {
  id: string;
  /** @deprecated File 객체는 fileStorage에서 getFile(id)로 조회 */
  file?: File;
  fileName: string;
  fileSize: number;
  folderId: string;
  status: UploadStatus;
  errorMessage?: string;
  createdAt: Date;
}

interface UploadState {
  // State
  isUploading: boolean;
  uploadQueue: UploadItem[];
  uploadProgress: Record<string, number>;

  // Actions
  addToQueue: (files: File[], folderId: string) => void;
  startUpload: () => void;
  stopUpload: () => void;
  updateItemStatus: (id: string, status: UploadStatus, errorMessage?: string) => void;
  updateProgress: (id: string, progress: number) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  clearCompleted: () => void;
  retryFailed: (id: string) => void;

  // Computed values (calculate on access)
  getQueueCount: () => number;
  getTotalProgress: () => number;
  getPendingCount: () => number;
  getCompletedCount: () => number;
  getFailedCount: () => number;
  getHasErrors: () => boolean;
}

// 고유 ID 생성
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const initialState = {
  isUploading: false,
  uploadQueue: [] as UploadItem[],
  uploadProgress: {} as Record<string, number>,
};

export const useWebhardUploadStore = create<UploadState>((set, get) => ({
  // Initial State
  ...initialState,

  // Actions
  addToQueue: (files: File[], folderId: string) => {
    const newItems: UploadItem[] = files.map((file) => {
      const id = generateId();
      // 🔧 File 객체는 외부 저장소에 저장 (메모리 최적화)
      storeFile(id, file);
      return {
        id,
        // file 프로퍼티는 더 이상 저장하지 않음 (getFile(id)로 조회)
        fileName: file.name,
        fileSize: file.size,
        folderId,
        status: 'pending' as UploadStatus,
        createdAt: new Date(),
      };
    });

    set((state) => ({
      uploadQueue: [...state.uploadQueue, ...newItems],
    }));
  },

  startUpload: () => {
    set({ isUploading: true });
  },

  stopUpload: () => {
    set({ isUploading: false });
  },

  updateItemStatus: (id: string, status: UploadStatus, errorMessage?: string) => {
    set((state) => ({
      uploadQueue: state.uploadQueue.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
              errorMessage: status === 'error' ? errorMessage : undefined,
            }
          : item
      ),
    }));
  },

  updateProgress: (id: string, progress: number) => {
    set((state) => {
      const newProgress = { ...state.uploadProgress, [id]: progress };
      const newQueue = state.uploadQueue.map((item) =>
        item.id === id && progress >= 100 ? { ...item, status: 'completed' as UploadStatus } : item
      );

      return {
        uploadProgress: newProgress,
        uploadQueue: newQueue,
      };
    });
  },

  removeFromQueue: (id: string) => {
    // 🔧 File 참조 해제
    releaseFile(id);

    set((state) => {
      const { [id]: _, ...remainingProgress } = state.uploadProgress;
      return {
        uploadQueue: state.uploadQueue.filter((item) => item.id !== id),
        uploadProgress: remainingProgress,
      };
    });
  },

  clearQueue: () => {
    // 🔧 모든 File 참조 해제
    const ids = get().uploadQueue.map((item) => item.id);
    releaseFiles(ids);

    set(initialState);
  },

  clearCompleted: () => {
    set((state) => {
      const completedIds = state.uploadQueue
        .filter((item) => item.status === 'completed')
        .map((item) => item.id);

      // 🔧 완료된 항목의 File 참조 해제
      releaseFiles(completedIds);

      const newProgress = { ...state.uploadProgress };
      completedIds.forEach((id) => delete newProgress[id]);

      return {
        uploadQueue: state.uploadQueue.filter((item) => item.status !== 'completed'),
        uploadProgress: newProgress,
      };
    });
  },

  retryFailed: (id: string) => {
    set((state) => ({
      uploadQueue: state.uploadQueue.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'pending' as UploadStatus,
              errorMessage: undefined,
            }
          : item
      ),
      uploadProgress: {
        ...state.uploadProgress,
        [id]: 0,
      },
    }));
  },

  // Computed value methods
  getQueueCount: () => get().uploadQueue.length,

  getTotalProgress: () => {
    const { uploadQueue, uploadProgress } = get();
    if (uploadQueue.length === 0) return 0;

    const total = uploadQueue.reduce((sum, item) => {
      return sum + (uploadProgress[item.id] || 0);
    }, 0);

    return Math.round(total / uploadQueue.length);
  },

  getPendingCount: () => get().uploadQueue.filter((item) => item.status === 'pending').length,

  getCompletedCount: () => get().uploadQueue.filter((item) => item.status === 'completed').length,

  getFailedCount: () => get().uploadQueue.filter((item) => item.status === 'error').length,

  getHasErrors: () => get().uploadQueue.some((item) => item.status === 'error'),
}));
