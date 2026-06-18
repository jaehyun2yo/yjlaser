'use client';

/**
 * useFileUpload
 * 파일 업로드 비즈니스 로직 훅
 * - 파일 크기/개수 검증
 * - 배치/단일 업로드 분기
 * - 진행률 추적
 * - Optimistic Update (파일 선택 시 즉시 UI 반영)
 * - 캐시 무효화
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { uploadFilesBatch, CONCURRENT_UPLOADS } from '@/lib/utils/uploadQueue';
import { invalidateBadgeCounts, invalidateStorageUsage } from '@/app/webhard/_lib/cacheHelpers';
import { logger } from '@/lib/utils/logger';
import type { PendingFileDTO, FileListItem } from '@/app/webhard/_lib/types';

const uploadLogger = logger.createLogger('FileUpload');

// ============ Constants ============
const MAX_BATCH_SIZE = 100;
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

// ============ Types ============
interface NotificationSettings {
  notifyOnUploadComplete: boolean;
  notifyOnError: boolean;
}

interface UseFileUploadOptions {
  /** 현재 선택된 폴더 ID */
  selectedFolderId: string | null;
  /** 사용자 타입 */
  userType: 'admin' | 'company';
  /** 사용자 ID */
  userId: string;
  /** 알림 설정 */
  notificationSettings: NotificationSettings;
  /** 파일 input ref (업로드 후 초기화용) */
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
}

interface UseFileUploadReturn {
  /** 업로드 중 여부 */
  isUploading: boolean;
  /** 파일별 업로드 진행률 (0-100, -1은 에러) */
  uploadProgress: Record<string, number>;
  /** 파일 업로드 핸들러 */
  uploadFiles: (files: FileList | File[], targetFolderId?: string | null) => Promise<void>;
  /** 상태 리셋 */
  resetUploadState: () => void;
}

// ============ Helper Functions ============

/**
 * File 객체에서 PendingFileDTO 생성
 */
function createPendingFile(
  file: File,
  folderId: string | null,
  companyId: number | null
): PendingFileDTO {
  const tempId = crypto.randomUUID();
  const now = new Date().toISOString();

  return {
    id: tempId, // 임시 ID
    name: file.name,
    original_name: file.name,
    size: file.size,
    mime_type: file.type || 'application/octet-stream',
    path: '', // 실제 경로는 업로드 완료 시 결정됨
    folder_id: folderId,
    company_id: companyId,
    uploaded_by: 0,
    inquiry_number: null,
    is_downloaded: false,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    deleted_by: null,
    companies: null,
    // 업로드 상태 전용 필드
    isPending: true,
    uploadProgress: 0,
    uploadStatus: 'pending',
    tempId,
  };
}

// ============ Hook ============
export function useFileUpload({
  selectedFolderId,
  userType,
  userId,
  notificationSettings,
  fileInputRef,
}: UseFileUploadOptions): UseFileUploadReturn {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  // 파일 목록 쿼리 키 (캐시 조작용)
  const getFilesQueryKey = useCallback(
    (folderId: string | null | undefined) =>
      queryKeys.webhard.files.list({
        folderId: folderId || undefined,
        companyId: userType === 'company' ? userId : undefined,
      }),
    [userType, userId]
  );

  const uploadFiles = useCallback(
    async (files: FileList | File[], targetFolderId?: string | null) => {
      const fileArray = Array.isArray(files) ? files : Array.from(files);
      if (fileArray.length === 0) return;

      // targetFolderId가 undefined면 현재 선택된 폴더 사용 (드래그 앤 드롭 시)
      const uploadFolderId = targetFolderId !== undefined ? targetFolderId : selectedFolderId;
      const filesQueryKey = getFilesQueryKey(uploadFolderId);

      // 최대 파일 개수 검증
      if (fileArray.length > MAX_BATCH_SIZE) {
        if (notificationSettings.notifyOnError) {
          showError('오류', `최대 ${MAX_BATCH_SIZE}개까지 업로드할 수 있습니다.`);
        }
        return;
      }

      // 파일 크기 검증
      const oversizedFiles = fileArray.filter((file) => file.size > MAX_FILE_SIZE);
      if (oversizedFiles.length > 0) {
        if (notificationSettings.notifyOnError) {
          const fileNames = oversizedFiles.map((f) => f.name).join(', ');
          showError(
            '파일 크기 초과',
            `다음 파일이 2GB를 초과합니다: ${fileNames.length > 50 ? fileNames.slice(0, 50) + '...' : fileNames}`
          );
        }
        return;
      }

      // 빈 파일 검증
      const emptyFiles = fileArray.filter((file) => file.size === 0);
      if (emptyFiles.length > 0) {
        if (notificationSettings.notifyOnError) {
          showError('오류', '빈 파일(0바이트)은 업로드할 수 없습니다.');
        }
        return;
      }

      // 루트 폴더 업로드는 지원하지 않음
      if (uploadFolderId === null) {
        if (notificationSettings.notifyOnError) {
          showError('업로드 불가', '파일을 업로드할 폴더를 먼저 선택해주세요.');
        }
        return;
      }

      setIsUploading(true);
      const progress: Record<string, number> = {};

      // 모든 파일 진행률 초기화
      fileArray.forEach((file) => {
        progress[file.name] = 0;
      });
      setUploadProgress({ ...progress });

      // ======== Optimistic Update: 임시 파일을 캐시에 즉시 추가 ========
      const companyId = userType === 'company' ? Number(userId) : null;
      const pendingFiles = fileArray.map((file) =>
        createPendingFile(file, uploadFolderId, companyId)
      );

      // tempId -> fileName 매핑 (진행률 업데이트용)
      const tempIdToFileName = new Map<string, string>();
      pendingFiles.forEach((pf) => {
        tempIdToFileName.set(pf.original_name, pf.tempId);
      });

      // 캐시에 임시 파일 추가 (UI 즉시 반영)
      queryClient.setQueryData(
        filesQueryKey,
        (oldData: { files: FileListItem[]; total?: number } | undefined) => {
          if (!oldData) {
            return { files: pendingFiles, total: pendingFiles.length };
          }
          return {
            ...oldData,
            files: [...pendingFiles, ...oldData.files],
            total: (oldData.total || 0) + pendingFiles.length,
          };
        }
      );

      try {
        // 배치 업로드: Presigned URL + R2 직접 업로드 (동시성 제어)
        const result = await uploadFilesBatch(fileArray, {
          folderId: uploadFolderId,
          onProgress: (fileName, fileProgress) => {
            progress[fileName] = fileProgress;
            setUploadProgress({ ...progress });

            // ======== 캐시에서 진행률 업데이트 ========
            const tempId = tempIdToFileName.get(fileName);
            if (tempId) {
              queryClient.setQueryData(
                filesQueryKey,
                (oldData: { files: FileListItem[]; total?: number } | undefined) => {
                  if (!oldData) return oldData;
                  return {
                    ...oldData,
                    files: oldData.files.map((f) => {
                      if ('tempId' in f && f.tempId === tempId) {
                        return {
                          ...f,
                          uploadProgress: fileProgress,
                          uploadStatus: fileProgress < 100 ? 'uploading' : 'completed',
                        } as PendingFileDTO;
                      }
                      return f;
                    }),
                  };
                }
              );
            }
          },
          onFileComplete: (fileName, uploadSuccess, error) => {
            progress[fileName] = uploadSuccess ? 100 : -1;
            setUploadProgress({ ...progress });

            // ======== 실패 시 캐시에서 상태 업데이트 ========
            if (!uploadSuccess) {
              const tempId = tempIdToFileName.get(fileName);
              if (tempId) {
                queryClient.setQueryData(
                  filesQueryKey,
                  (oldData: { files: FileListItem[]; total?: number } | undefined) => {
                    if (!oldData) return oldData;
                    return {
                      ...oldData,
                      files: oldData.files.map((f) => {
                        if ('tempId' in f && f.tempId === tempId) {
                          return {
                            ...f,
                            uploadProgress: 0,
                            uploadStatus: 'failed',
                            uploadError: error || '업로드 실패',
                          } as PendingFileDTO;
                        }
                        return f;
                      }),
                    };
                  }
                );
              }
              if (error) {
                uploadLogger.warn(`Upload failed for ${fileName}: ${error}`);
              }
            }
          },
          onBatchComplete: (batchResult) => {
            uploadLogger.info(
              `Batch upload complete: ${batchResult.success} success, ${batchResult.failed} failed (concurrent: ${CONCURRENT_UPLOADS})`
            );
          },
        });

        // 업로드 결과 알림
        if (notificationSettings.notifyOnUploadComplete) {
          if (result.failed > 0) {
            success(
              '업로드 완료',
              `${result.success}개 성공, ${result.failed}개 실패, ${result.skipped}개 스킵됨`
            );
          } else if (result.skipped > 0) {
            success('업로드 완료', `${result.success}개 성공, ${result.skipped}개 스킵(중복)`);
          } else {
            success('업로드 완료', `${result.success}개 파일이 업로드되었습니다.`);
          }
        }

        // 실패한 파일이 있으면 에러 알림
        if (result.failed > 0 && notificationSettings.notifyOnError) {
          const failedNames = result.errors
            .slice(0, 3)
            .map((e) => e.fileName)
            .join(', ');
          showError(
            '일부 파일 업로드 실패',
            `${failedNames}${result.errors.length > 3 ? ` 외 ${result.errors.length - 3}개` : ''}`
          );
        }

        // ======== 업로드 완료 후 캐시에서 임시 파일 제거하고 실제 데이터로 갱신 ========
        // 실패한 파일의 tempId 목록
        const failedTempIds = new Set(
          result.errors.map((e) => tempIdToFileName.get(e.fileName)).filter(Boolean)
        );

        // 캐시에서 실패한 임시 파일 제거 (성공한 파일은 서버에서 refetch)
        queryClient.setQueryData(
          filesQueryKey,
          (oldData: { files: FileListItem[]; total?: number } | undefined) => {
            if (!oldData) return oldData;
            return {
              ...oldData,
              // isPending인 파일들 모두 제거 (서버 refetch로 대체됨)
              files: oldData.files.filter((f) => !('isPending' in f && f.isPending)),
            };
          }
        );

        // 새 파일 목록도 무효화 (새 파일 모드에서 즉시 반영)
        const newFilesQueryKey = queryKeys.webhard.newFiles(
          userType === 'company' ? userId : undefined
        );
        const refreshPromises: Promise<unknown>[] = [
          queryClient.invalidateQueries({ queryKey: filesQueryKey }),
          queryClient.invalidateQueries({
            queryKey: newFilesQueryKey,
            refetchType: 'active',
          }),
        ];

        // 현재 보고 있는 폴더도 무효화 (다른 폴더에 업로드한 경우)
        if (uploadFolderId !== selectedFolderId) {
          refreshPromises.push(
            queryClient.invalidateQueries({
              queryKey: getFilesQueryKey(selectedFolderId),
            })
          );
        }

        // 뱃지 카운트 무효화
        invalidateBadgeCounts(queryClient);
        invalidateStorageUsage(queryClient);

        void Promise.all(refreshPromises).catch((error) => {
          uploadLogger.warn(
            `Post-upload cache refresh failed: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          );
        });
      } catch (err) {
        // ======== 오류 발생 시 캐시에서 모든 임시 파일 제거 ========
        queryClient.setQueryData(
          filesQueryKey,
          (oldData: { files: FileListItem[]; total?: number } | undefined) => {
            if (!oldData) return oldData;
            return {
              ...oldData,
              files: oldData.files.filter((f) => !('isPending' in f && f.isPending)),
            };
          }
        );

        // 오류 알림 (설정에 따라)
        if (notificationSettings.notifyOnError) {
          showError(
            '오류',
            err instanceof Error ? err.message : '파일 업로드 중 오류가 발생했습니다.'
          );
        }
      } finally {
        setIsUploading(false);
        setUploadProgress({});
        // input 초기화
        if (fileInputRef?.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [
      selectedFolderId,
      userType,
      userId,
      notificationSettings,
      fileInputRef,
      queryClient,
      success,
      showError,
      getFilesQueryKey,
    ]
  );

  const resetUploadState = useCallback(() => {
    setIsUploading(false);
    setUploadProgress({});
  }, []);

  return {
    isUploading,
    uploadProgress,
    uploadFiles,
    resetUploadState,
  };
}
