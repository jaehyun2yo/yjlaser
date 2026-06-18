'use client';

/**
 * useFileBatchDownload
 * 파일 일괄 다운로드 비즈니스 로직 훅
 * - Signed URL 요청
 * - 동시성 제어 (3개씩)
 * - 진행률 추적
 * - Optimistic Update (is_downloaded)
 * - 뱃지 카운트 갱신
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { downloadViaSignedUrl } from '@/app/webhard/_lib/downloadHelpers';
import { invalidateBadgeCounts } from '@/app/webhard/_lib/cacheHelpers';
import type { WebhardFile } from '@/types/webhard';

// ============ Constants ============
/**
 * 다운로드 동시성 제한
 *
 * R2 Signed URL은 별도 도메인(*.r2.cloudflarestorage.com) 사용
 * 브라우저 HTTP/2 동시 연결 제한(약 6-8개)은 도메인당 적용되므로
 * R2 다운로드 동시성을 독립적으로 6개까지 활용 가능
 */
const CONCURRENT_LIMIT = 6;

// ============ Types ============
export interface DownloadItem {
  id: string;
  name: string;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  error?: string;
}

interface NotificationSettings {
  notifyOnDownloadComplete: boolean;
  notifyOnError: boolean;
}

interface FolderHandleOptions {
  folderHandle: FileSystemDirectoryHandle | null;
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'unknown';
  requestPermission: () => Promise<boolean>;
}

interface UseFileBatchDownloadOptions {
  /** 파일 목록 쿼리 키 */
  filesQueryKey: readonly unknown[];
  /** 알림 설정 */
  notificationSettings: NotificationSettings;
  /** 폴더 핸들 옵션 (File System Access API) */
  folderHandleOptions?: FolderHandleOptions;
  /** 모달 열기 함수 */
  openModal?: (modal: string, data?: Record<string, unknown>) => void;
  /** 선택 해제 함수 */
  clearSelection?: () => void;
}

interface UseFileBatchDownloadReturn {
  /** 다운로드 중 여부 */
  isDownloading: boolean;
  /** 다운로드 항목 목록 */
  downloadItems: DownloadItem[];
  /** 파일들 일괄 다운로드 */
  downloadFiles: (files: WebhardFile[]) => Promise<void>;
  /** 상태 리셋 */
  resetDownloadState: () => void;
}

// ============ Hook ============
export function useFileBatchDownload({
  filesQueryKey,
  notificationSettings,
  folderHandleOptions,
  openModal,
  clearSelection,
}: UseFileBatchDownloadOptions): UseFileBatchDownloadReturn {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadItems, setDownloadItems] = useState<DownloadItem[]>([]);

  const downloadFiles = useCallback(
    async (files: WebhardFile[]) => {
      if (files.length === 0) return;

      // 다운로드 모달 열기 및 초기 상태 설정
      const initialItems: DownloadItem[] = files.map((file) => ({
        id: file.id,
        name: file.original_name,
        status: 'pending' as const,
      }));
      setDownloadItems(initialItems);
      openModal?.('download');
      setIsDownloading(true);

      let completedCount = 0;
      let errorCount = 0;
      let markErrorCount = 0;
      let markErrorMessage = '';
      const successfulFileIds: string[] = [];

      // 파일 하나를 다운로드하는 함수 (Signed URL 사용, 서버 우회로 2-3배 빠름)
      const downloadSingleFile = async (file: WebhardFile) => {
        // 상태를 downloading으로 변경
        setDownloadItems((prev) =>
          prev.map((item) =>
            item.id === file.id ? { ...item, status: 'downloading' as const } : item
          )
        );

        // 롤백용 이전 상태 저장
        const previousData = queryClient.getQueryData<{ files: WebhardFile[] }>(filesQueryKey);

        try {
          // Signed URL 모드로 다운로드 URL 요청 (서버 프록시 우회)
          const response = await fetch(`/api/webhard/download?fileId=${file.id}&mode=signedUrl`);
          if (!response.ok) {
            throw new Error('Failed to get download URL');
          }

          const { signedUrl, filename } = await response.json();
          const downloadFilename = filename || file.original_name || 'download';

          // Signed URL로 직접 다운로드
          await downloadViaSignedUrl(signedUrl, downloadFilename, folderHandleOptions);

          // 캐시 업데이트 (is_downloaded = true)
          queryClient.setQueryData(
            filesQueryKey,
            (oldData: { files: WebhardFile[] } | undefined) => {
              if (!oldData) return oldData;
              return {
                ...oldData,
                files: oldData.files.map((f) =>
                  f.id === file.id ? { ...f, is_downloaded: true } : f
                ),
              };
            }
          );

          // 상태를 completed로 변경
          setDownloadItems((prev) =>
            prev.map((item) =>
              item.id === file.id ? { ...item, status: 'completed' as const } : item
            )
          );
          completedCount++;
          successfulFileIds.push(file.id);
        } catch (err) {
          // 롤백: 이전 캐시 상태 복원
          if (previousData) {
            queryClient.setQueryData(filesQueryKey, previousData);
          }

          // 상태를 error로 변경
          setDownloadItems((prev) =>
            prev.map((item) =>
              item.id === file.id
                ? {
                    ...item,
                    status: 'error' as const,
                    error: err instanceof Error ? err.message : '다운로드 실패',
                  }
                : item
            )
          );
          errorCount++;
        }
      };

      // 병렬 처리 (동시에 CONCURRENT_LIMIT개씩 실행)
      const chunks: WebhardFile[][] = [];
      for (let i = 0; i < files.length; i += CONCURRENT_LIMIT) {
        chunks.push(files.slice(i, i + CONCURRENT_LIMIT));
      }

      for (const chunk of chunks) {
        await Promise.all(chunk.map(downloadSingleFile));
      }

      // 완료 처리
      setIsDownloading(false);

      // 성공한 파일들을 배치로 markDownloaded 처리 (개별 UPDATE 제거 → 1회 배치)
      const newlyDownloadedFileIds = files
        .filter((file) => successfulFileIds.includes(file.id) && !file.is_downloaded)
        .map((file) => file.id);
      if (newlyDownloadedFileIds.length > 0) {
        const markResponse = await fetch('/api/webhard/files/mark-downloaded', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileIds: newlyDownloadedFileIds }),
        });

        if (!markResponse.ok) {
          queryClient.setQueryData(
            filesQueryKey,
            (oldData: { files: WebhardFile[] } | undefined) => {
              if (!oldData) return oldData;
              return {
                ...oldData,
                files: oldData.files.map((file) =>
                  newlyDownloadedFileIds.includes(file.id)
                    ? { ...file, is_downloaded: false }
                    : file
                ),
              };
            }
          );
          markErrorCount += newlyDownloadedFileIds.length;
          const errorText = await markResponse.text();
          markErrorMessage = errorText || '다운로드 확인 처리에 실패했습니다.';
        }
      }

      // 뱃지 카운트 무효화
      invalidateBadgeCounts(queryClient);

      // 알림
      if (completedCount > 0 && notificationSettings.notifyOnDownloadComplete) {
        success('다운로드 완료', `${completedCount}개 파일 다운로드가 완료되었습니다.`);
      }
      if (errorCount > 0 && notificationSettings.notifyOnError) {
        showError('오류', `${errorCount}개 파일 다운로드에 실패했습니다.`);
      }
      if (markErrorCount > 0 && notificationSettings.notifyOnError) {
        showError('오류', `${markErrorCount}개 파일의 ${markErrorMessage}`);
      }

      clearSelection?.();
    },
    [
      filesQueryKey,
      notificationSettings,
      folderHandleOptions,
      openModal,
      clearSelection,
      queryClient,
      success,
      showError,
    ]
  );

  const resetDownloadState = useCallback(() => {
    setIsDownloading(false);
    setDownloadItems([]);
  }, []);

  return {
    isDownloading,
    downloadItems,
    downloadFiles,
    resetDownloadState,
  };
}
