import { create } from 'zustand';
import {
  saveFolderHandle,
  loadFolderHandle,
  removeFolderHandle,
  verifyFolderPermission,
} from '@/lib/utils/indexedDB';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('WebhardFolderStore');

/**
 * 웹하드 알림 설정 인터페이스
 */
export interface WebhardNotificationSettings {
  notifyOnDownloadComplete: boolean;
  notifyOnUploadComplete: boolean;
  notifyOnError: boolean;
}

/**
 * 폴더 권한 상태
 */
export type FolderPermissionStatus = 'unknown' | 'granted' | 'prompt' | 'denied';

interface WebhardFolderStore {
  // File System Access API 핸들 (IndexedDB에도 저장)
  folderHandle: FileSystemDirectoryHandle | null;
  setFolderHandle: (handle: FileSystemDirectoryHandle | null) => void;

  // 선택된 폴더의 메타데이터
  folderName: string | null;
  folderPath: string | null;
  setFolderMetadata: (name: string | null, path: string | null) => void;

  // 다운로드 설정
  isDownloadFolderSupported: boolean;
  setDownloadFolderSupported: (supported: boolean) => void;

  // 알림 설정
  notificationSettings: WebhardNotificationSettings;
  setNotificationSettings: (settings: WebhardNotificationSettings) => void;
  isSettingsLoaded: boolean;
  setSettingsLoaded: (loaded: boolean) => void;

  // IndexedDB 연동
  isHandleLoaded: boolean; // IndexedDB에서 핸들 복원 완료 여부
  permissionStatus: FolderPermissionStatus; // 현재 권한 상태
  setPermissionStatus: (status: FolderPermissionStatus) => void;

  // IndexedDB에서 핸들 복원
  restoreFolderHandle: () => Promise<boolean>;

  // 폴더 핸들 저장 (IndexedDB 포함)
  saveFolderHandleToStorage: (handle: FileSystemDirectoryHandle) => Promise<void>;

  // 폴더 핸들 삭제 (IndexedDB 포함)
  clearFolderHandle: () => Promise<void>;

  // 권한 확인 및 요청
  requestPermission: () => Promise<boolean>;
}

const DEFAULT_NOTIFICATION_SETTINGS: WebhardNotificationSettings = {
  notifyOnDownloadComplete: true,
  notifyOnUploadComplete: true,
  notifyOnError: true,
};

export const useWebhardFolder = create<WebhardFolderStore>((set, get) => ({
  folderHandle: null,
  setFolderHandle: (handle: FileSystemDirectoryHandle | null) => set({ folderHandle: handle }),

  folderName: null,
  folderPath: null,
  setFolderMetadata: (name: string | null, path: string | null) =>
    set({ folderName: name, folderPath: path }),

  isDownloadFolderSupported: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
  setDownloadFolderSupported: (supported: boolean) => set({ isDownloadFolderSupported: supported }),

  // 알림 설정 (기본값: 모두 활성화)
  notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
  setNotificationSettings: (settings: WebhardNotificationSettings) =>
    set({ notificationSettings: settings }),
  isSettingsLoaded: false,
  setSettingsLoaded: (loaded: boolean) => set({ isSettingsLoaded: loaded }),

  // IndexedDB 연동
  isHandleLoaded: false,
  permissionStatus: 'unknown',
  setPermissionStatus: (status: FolderPermissionStatus) => set({ permissionStatus: status }),

  /**
   * IndexedDB에서 folderHandle 복원
   */
  restoreFolderHandle: async () => {
    try {
      const handle = await loadFolderHandle();

      if (handle) {
        // 권한 상태 확인 (요청하지 않고 확인만)
        const hasPermission = await verifyFolderPermission(handle, false);

        set({
          folderHandle: handle,
          folderName: handle.name,
          folderPath: handle.name,
          isHandleLoaded: true,
          permissionStatus: hasPermission ? 'granted' : 'prompt',
        });

        return hasPermission;
      }

      set({ isHandleLoaded: true, permissionStatus: 'unknown' });
      return false;
    } catch (error) {
      log.error('Failed to restore folder handle', error);
      set({ isHandleLoaded: true, permissionStatus: 'unknown' });
      return false;
    }
  },

  /**
   * 폴더 핸들 저장 (메모리 + IndexedDB)
   */
  saveFolderHandleToStorage: async (handle: FileSystemDirectoryHandle) => {
    try {
      // IndexedDB에 저장
      await saveFolderHandle(handle);

      // 메모리에 저장
      set({
        folderHandle: handle,
        folderName: handle.name,
        folderPath: handle.name,
        permissionStatus: 'granted',
      });
    } catch (error) {
      log.error('Failed to save folder handle', error);
      // IndexedDB 저장 실패해도 메모리에는 저장
      set({
        folderHandle: handle,
        folderName: handle.name,
        folderPath: handle.name,
        permissionStatus: 'granted',
      });
    }
  },

  /**
   * 폴더 핸들 삭제 (메모리 + IndexedDB)
   */
  clearFolderHandle: async () => {
    try {
      await removeFolderHandle();
    } catch (error) {
      log.error('Failed to remove folder handle from IndexedDB', error);
    }

    set({
      folderHandle: null,
      folderName: null,
      folderPath: null,
      permissionStatus: 'unknown',
    });
  },

  /**
   * 권한 확인 및 요청
   */
  requestPermission: async () => {
    const { folderHandle } = get();

    if (!folderHandle) {
      return false;
    }

    try {
      const hasPermission = await verifyFolderPermission(folderHandle, true);

      set({
        permissionStatus: hasPermission ? 'granted' : 'denied',
      });

      return hasPermission;
    } catch (error) {
      log.error('Failed to request permission', error);
      set({ permissionStatus: 'denied' });
      return false;
    }
  },
}));
