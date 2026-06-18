'use client';

/**
 * useFileOperations
 * 파일 작업 관련 비즈니스 로직 훅
 * - 업로드, 다운로드, 삭제, 이동, 이름 변경
 * - 진행 상태 관리
 * - 에러 핸들링
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { uploadFilesBatch } from '@/lib/utils/uploadQueue';
import { batchMoveFiles } from '@/app/actions/webhard-move';
import {
  invalidateAfterDelete,
  invalidateAfterMove,
  invalidateStorageUsage,
  removeFilesFromCache,
  rollbackCache,
} from '@/app/webhard/_lib/cacheHelpers';
import { logger } from '@/lib/utils/logger';
import type { BatchOperationResultDTO, WebhardFileDTO } from '@/app/webhard/_lib/types';

const log = logger.createLogger('FileOperations');

// ============ Types ============

export interface ProgressItem {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
}

export interface DownloadItem extends ProgressItem {
  size: number;
  downloadedSize: number;
}

interface UseFileOperationsOptions {
  /** 현재 폴더 ID */
  currentFolderId: string | null;
  /** 회사 ID (company 사용자일 경우) */
  companyId: number | null;
  /** 사용자 타입 */
  userType: 'admin' | 'company';
  /** 사용자 ID */
  userId: string;
  /** 작업 완료 후 선택 해제 콜백 */
  onClearSelection?: () => void;
}

interface UseFileOperationsReturn {
  // 업로드
  isUploading: boolean;
  uploadProgress: Record<string, number>;
  uploadFiles: (files: File[]) => Promise<void>;

  // 다운로드
  isDownloading: boolean;
  downloadItems: DownloadItem[];
  downloadFiles: (files: WebhardFileDTO[]) => Promise<void>;

  // 삭제
  isDeleting: boolean;
  deleteItems: ProgressItem[];
  deleteFiles: (fileIds: string[]) => Promise<void>;

  // 이동
  isMoving: boolean;
  moveItems: ProgressItem[];
  moveFiles: (fileIds: string[], targetFolderId: string | null) => Promise<void>;

  // 이름 변경
  renameFile: (fileId: string, newName: string) => Promise<boolean>;

  // 상태 리셋
  resetUploadState: () => void;
  resetDownloadState: () => void;
  resetDeleteState: () => void;
  resetMoveState: () => void;
}

// ============ Hook ============

export function useFileOperations({
  currentFolderId,
  companyId,
  userType,
  userId,
  onClearSelection,
}: UseFileOperationsOptions): UseFileOperationsReturn {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const companyQueryId = userType === 'company' ? String(companyId ?? userId) : undefined;
  const currentFilesQueryKey = queryKeys.webhard.files.list({
    folderId: currentFolderId || undefined,
    companyId: companyQueryId,
  });

  // ============ Upload State ============
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  // ============ Download State ============
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadItems, setDownloadItems] = useState<DownloadItem[]>([]);

  // ============ Delete State ============
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteItems, setDeleteItems] = useState<ProgressItem[]>([]);

  // ============ Move State ============
  const [isMoving, setIsMoving] = useState(false);
  const [moveItems, setMoveItems] = useState<ProgressItem[]>([]);

  // ============ Query Invalidation ============
  const invalidateFiles = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhard.files.all(),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhard.badgeCounts(),
    });
    invalidateStorageUsage(queryClient);
  }, [queryClient]);

  const invalidateFolders = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhard.folders.all(),
    });
  }, [queryClient]);

  // ============ Upload ============
  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      setIsUploading(true);
      setUploadProgress({});

      try {
        // 진행률 콜백
        const onProgress = (fileName: string, progress: number) => {
          setUploadProgress((prev) => ({
            ...prev,
            [fileName]: progress,
          }));
        };

        // 배치 업로드 실행
        const result = await uploadFilesBatch(files, {
          folderId: currentFolderId || '',
          onProgress,
        });

        if (result.success > 0) {
          success(`${result.success}개 파일 업로드 완료`);
        }
        if (result.failed > 0) {
          showError(`${result.failed}개 파일 업로드 실패`);
        }

        // 파일 목록 갱신
        invalidateFiles();
      } catch (error) {
        log.error('Upload error:', error);
        showError(error instanceof Error ? error.message : '업로드 중 오류가 발생했습니다');
      } finally {
        setIsUploading(false);
      }
    },
    [currentFolderId, invalidateFiles, success, showError]
  );

  // ============ Download ============
  const downloadFiles = useCallback(
    async (files: WebhardFileDTO[]) => {
      if (files.length === 0) return;

      setIsDownloading(true);

      // 진행 항목 초기화
      const items: DownloadItem[] = files.map((file) => ({
        id: file.id,
        name: file.original_name || file.name,
        status: 'pending',
        progress: 0,
        size: file.size,
        downloadedSize: 0,
      }));
      setDownloadItems(items);

      try {
        // 단일 파일 다운로드
        if (files.length === 1) {
          const file = files[0];
          setDownloadItems((prev) =>
            prev.map((item) => (item.id === file.id ? { ...item, status: 'processing' } : item))
          );

          const response = await fetch(`/api/webhard/download?fileId=${file.id}`);
          if (!response.ok) throw new Error('다운로드 실패');

          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.original_name || file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);

          setDownloadItems((prev) =>
            prev.map((item) =>
              item.id === file.id ? { ...item, status: 'completed', progress: 100 } : item
            )
          );
          success('파일 다운로드 완료');
        } else {
          // 다중 파일 ZIP 다운로드
          const fileIds = files.map((f) => f.id);
          const response = await fetch('/api/webhard/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileIds }),
          });

          if (!response.ok) throw new Error('다운로드 실패');

          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `webhard_files_${new Date().toISOString().slice(0, 10)}.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);

          setDownloadItems((prev) =>
            prev.map((item) => ({ ...item, status: 'completed', progress: 100 }))
          );
          success(`${files.length}개 파일 다운로드 완료`);
        }

        // 다운로드 상태 갱신
        invalidateFiles();
      } catch (error) {
        log.error('Download error:', error);
        setDownloadItems((prev) =>
          prev.map((item) => ({
            ...item,
            status: 'error',
            error: error instanceof Error ? error.message : '다운로드 실패',
          }))
        );
        showError(error instanceof Error ? error.message : '다운로드 중 오류가 발생했습니다');
      } finally {
        setIsDownloading(false);
      }
    },
    [invalidateFiles, success, showError]
  );

  // ============ Delete ============
  const deleteFiles = useCallback(
    async (fileIds: string[]) => {
      if (fileIds.length === 0) return;

      setIsDeleting(true);

      // 진행 항목 초기화
      const items: ProgressItem[] = fileIds.map((id) => ({
        id,
        name: id, // 실제로는 파일명을 알아야 함
        status: 'pending',
        progress: 0,
      }));
      setDeleteItems(items);

      const previousData = removeFilesFromCache(queryClient, fileIds, {
        filesQueryKey: currentFilesQueryKey,
        companyId: companyQueryId,
      });
      onClearSelection?.();

      try {
        const response = await fetch('/api/webhard/files/batch/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileIds }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || '삭제 실패');
        }

        const result = (await response.json()) as BatchOperationResultDTO;
        if (!result.success || result.failed > 0) {
          throw new Error(result.errors?.join(', ') || '삭제 실패');
        }

        setDeleteItems((prev) =>
          prev.map((item) => ({ ...item, status: 'completed', progress: 100 }))
        );

        success(`${result.processed || fileIds.length}개 파일을 휴지통으로 이동했습니다`);
        invalidateAfterDelete(queryClient, {
          folderId: currentFolderId,
          companyId: companyQueryId,
        });
      } catch (error) {
        log.error('Delete error:', error);
        rollbackCache(queryClient, currentFilesQueryKey, previousData);
        setDeleteItems((prev) =>
          prev.map((item) => ({
            ...item,
            status: 'error',
            error: error instanceof Error ? error.message : '삭제 실패',
          }))
        );
        showError(error instanceof Error ? error.message : '삭제 중 오류가 발생했습니다');
      } finally {
        setIsDeleting(false);
      }
    },
    [
      companyQueryId,
      currentFilesQueryKey,
      currentFolderId,
      onClearSelection,
      queryClient,
      success,
      showError,
    ]
  );

  // ============ Move ============
  const moveFiles = useCallback(
    async (fileIds: string[], targetFolderId: string | null) => {
      if (fileIds.length === 0) return;

      setIsMoving(true);

      // 진행 항목 초기화
      const items: ProgressItem[] = fileIds.map((id) => ({
        id,
        name: id,
        status: 'pending',
        progress: 0,
      }));
      setMoveItems(items);

      const previousData = removeFilesFromCache(queryClient, fileIds, {
        filesQueryKey: currentFilesQueryKey,
        companyId: companyQueryId,
      });
      onClearSelection?.();

      try {
        const result = await batchMoveFiles(fileIds, targetFolderId);

        if (result.success) {
          setMoveItems((prev) =>
            prev.map((item) => ({ ...item, status: 'completed', progress: 100 }))
          );
          // 토스트 제거: 빠른 이동 UX를 위해 별도 알림 없음

          invalidateAfterMove(queryClient, {
            folderId: currentFolderId,
            targetFolderId,
            companyId: companyQueryId,
          });
          invalidateFolders();
        } else {
          throw new Error(result.error || '이동 실패');
        }
      } catch (error) {
        log.error('Move error:', error);
        rollbackCache(queryClient, currentFilesQueryKey, previousData);
        setMoveItems((prev) =>
          prev.map((item) => ({
            ...item,
            status: 'error',
            error: error instanceof Error ? error.message : '이동 실패',
          }))
        );
        showError(error instanceof Error ? error.message : '이동 중 오류가 발생했습니다');
      } finally {
        setIsMoving(false);
      }
    },
    [
      companyQueryId,
      currentFilesQueryKey,
      currentFolderId,
      invalidateFolders,
      onClearSelection,
      queryClient,
      success,
      showError,
    ]
  );

  // ============ Rename ============
  const renameFile = useCallback(
    async (fileId: string, newName: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/webhard/files/${fileId}/rename`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newName }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || '이름 변경 실패');
        }

        success('파일 이름이 변경되었습니다');
        invalidateFiles();
        return true;
      } catch (error) {
        log.error('Rename error:', error);
        showError(error instanceof Error ? error.message : '이름 변경 중 오류가 발생했습니다');
        return false;
      }
    },
    [invalidateFiles, success, showError]
  );

  // ============ Reset Functions ============
  const resetUploadState = useCallback(() => {
    setIsUploading(false);
    setUploadProgress({});
  }, []);

  const resetDownloadState = useCallback(() => {
    setIsDownloading(false);
    setDownloadItems([]);
  }, []);

  const resetDeleteState = useCallback(() => {
    setIsDeleting(false);
    setDeleteItems([]);
  }, []);

  const resetMoveState = useCallback(() => {
    setIsMoving(false);
    setMoveItems([]);
  }, []);

  return {
    // Upload
    isUploading,
    uploadProgress,
    uploadFiles,

    // Download
    isDownloading,
    downloadItems,
    downloadFiles,

    // Delete
    isDeleting,
    deleteItems,
    deleteFiles,

    // Move
    isMoving,
    moveItems,
    moveFiles,

    // Rename
    renameFile,

    // Reset
    resetUploadState,
    resetDownloadState,
    resetDeleteState,
    resetMoveState,
  };
}
