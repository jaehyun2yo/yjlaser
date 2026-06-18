'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';

export interface WebhardSettingsState {
  downloadFolderPath: string;
  notifyOnDownloadComplete: boolean;
  notifyOnUploadComplete: boolean;
  notifyOnError: boolean;
}

const DEFAULT_SETTINGS: WebhardSettingsState = {
  downloadFolderPath: 'Downloads',
  notifyOnDownloadComplete: true,
  notifyOnUploadComplete: true,
  notifyOnError: true,
};

/**
 * 웹하드 설정을 관리하는 훅 (React Query 캐싱)
 * - 페이지 로드 시 자동으로 설정 불러옴
 * - 설정 모달에서도 같은 캐시 사용
 * - 중복 API 호출 방지
 */
export function useWebhardSettings() {
  const queryClient = useQueryClient();

  const {
    data: settings,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.webhard.settings(),
    queryFn: async () => {
      const response = await fetch('/api/webhard/settings');

      if (response.ok) {
        return response.json() as Promise<WebhardSettingsState>;
      }

      if (response.status === 404) {
        // 처음 사용하는 경우 - 기본값 사용
        return DEFAULT_SETTINGS;
      }

      // 다른 에러 - 기본값으로 폴백
      return DEFAULT_SETTINGS;
    },
    staleTime: 5 * 60 * 1000, // 5분
    gcTime: 30 * 60 * 1000, // 30분
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const saveMutation = useMutation({
    mutationFn: async (newSettings: WebhardSettingsState) => {
      const response = await fetch('/api/webhard/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      return response.json() as Promise<WebhardSettingsState>;
    },
    onSuccess: (newSettings) => {
      // 캐시 업데이트
      queryClient.setQueryData(queryKeys.webhard.settings(), newSettings);
    },
  });

  return {
    settings: settings ?? DEFAULT_SETTINGS,
    isLoading,
    error,
    saveSettings: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
}
