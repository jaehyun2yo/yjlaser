import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('WebhardSettingsStore');

export type FontSize = 'small' | 'medium' | 'large';

interface WebhardSettings {
  downloadFolder: string | null;
  fontSize: FontSize;
  notificationsEnabled: boolean;
}

export interface WebhardSettingsStore extends WebhardSettings {
  downloadHandle: FileSystemDirectoryHandle | null;
  setDownloadFolder: (folder: string | null, handle?: FileSystemDirectoryHandle) => void;
  setFontSize: (size: FontSize) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  reset: () => void;
  syncWithServer: () => Promise<void>;
}

const defaultSettings: WebhardSettings = {
  downloadFolder: null,
  fontSize: 'small',
  notificationsEnabled: true,
};

// API 호출 헬퍼
const saveSettingsToApi = async (settings: Partial<WebhardSettings>) => {
  try {
    await fetch('/api/webhard/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  } catch (error) {
    log.error('Failed to save settings:', error);
  }
};

export const useWebhardSettingsStore = create<WebhardSettingsStore>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      downloadHandle: null,
      setDownloadFolder: (
        folder: string | null,
        handle: FileSystemDirectoryHandle | null = null
      ) => {
        set({ downloadFolder: folder, downloadHandle: handle });
        saveSettingsToApi({ downloadFolder: folder });
      },
      setFontSize: (size: FontSize) => {
        set({ fontSize: size });
        saveSettingsToApi({ fontSize: size });
      },
      setNotificationsEnabled: (enabled: boolean) => {
        set({ notificationsEnabled: enabled });
        saveSettingsToApi({ notificationsEnabled: enabled });
      },
      reset: () => {
        set({ ...defaultSettings, downloadHandle: null });
        saveSettingsToApi(defaultSettings);
      },
      syncWithServer: async () => {
        try {
          const response = await fetch('/api/webhard/settings');
          if (response.ok) {
            const data = await response.json();
            if (data.settings) {
              set((state) => ({
                ...state,
                ...data.settings,
                // 핸들은 서버에서 가져올 수 없으므로 기존 상태 유지 또는 초기화
                // 하지만 로컬 스토리지에 핸들이 없으므로(partialize됨) 여기서 덮어써도 무방
              }));
            }
          }
        } catch (error) {
          log.error('Failed to sync settings:', error);
        }
      },
    }),
    {
      name: 'webhard-settings',
      version: 1,
      partialize: (state) => ({
        downloadFolder: state.downloadFolder,
        fontSize: state.fontSize,
        notificationsEnabled: state.notificationsEnabled,
      }),
    }
  )
);
