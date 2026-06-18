'use client';

/**
 * useFileRename
 * 파일 이름 수정 비즈니스 로직 훅
 * - 이름 수정 상태 관리
 * - Optimistic Update
 * - 에러 롤백
 */

import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { WebhardFile } from '@/types/webhard';

// ============ Types ============
interface NotificationSettings {
  notifyOnError: boolean;
}

interface UseFileRenameOptions {
  /** 파일 목록 쿼리 키 */
  filesQueryKey: readonly unknown[];
  /** 파일 목록 */
  files: WebhardFile[];
  /** 알림 설정 */
  notificationSettings: NotificationSettings;
}

interface UseFileRenameReturn {
  /** 현재 수정 중인 파일 ID */
  editingFileId: string | null;
  /** 현재 수정 중인 파일명 */
  editingFileName: string;
  /** 파일명 수정 시작 */
  startRename: (file: WebhardFile) => void;
  /** 파일명 수정 완료 */
  finishRename: (fileId: string) => Promise<void>;
  /** 파일명 수정 취소 */
  cancelRename: () => void;
  /** 수정 중인 파일명 업데이트 */
  setEditingFileName: (name: string) => void;
  /** 입력 필드 ref */
  editInputRef: React.RefObject<HTMLInputElement | null>;
}

// ============ Hook ============
export function useFileRename({
  filesQueryKey,
  files,
  notificationSettings,
}: UseFileRenameOptions): UseFileRenameReturn {
  const queryClient = useQueryClient();
  const { error: showError } = useToast();

  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState<string>('');
  const editInputRef = useRef<HTMLInputElement | null>(null);

  // 파일명 수정 시작
  const startRename = useCallback((file: WebhardFile) => {
    setEditingFileId(file.id);
    // 확장자 제외한 파일명으로 초기화
    const nameParts = file.original_name.split('.');
    const extension = nameParts.length > 1 ? nameParts.pop() : '';
    const nameWithoutExt = nameParts.join('.');
    setEditingFileName(extension ? nameWithoutExt : file.original_name);

    // 포커스 (다음 렌더링 사이클에서)
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 0);
  }, []);

  // 파일명 수정 완료
  const finishRename = useCallback(
    async (fileId: string) => {
      if (!editingFileName.trim()) {
        setEditingFileId(null);
        setEditingFileName('');
        return;
      }

      // 원본 파일 찾기
      const originalFile = files.find((f) => f.id === fileId);
      if (!originalFile) {
        setEditingFileId(null);
        setEditingFileName('');
        return;
      }

      // 확장자 유지
      const nameParts = originalFile.original_name.split('.');
      const extension = nameParts.length > 1 ? nameParts.pop() : '';
      const newName = extension ? `${editingFileName.trim()}.${extension}` : editingFileName.trim();

      // 변경사항이 없으면 종료
      if (newName === originalFile.original_name) {
        setEditingFileId(null);
        setEditingFileName('');
        return;
      }

      // 이전 데이터 저장 (롤백용)
      const previousData = queryClient.getQueryData<{ files: WebhardFile[] }>(filesQueryKey);

      // Optimistic Update: UI에서 즉시 이름 변경
      queryClient.setQueryData(filesQueryKey, (oldData: { files: WebhardFile[] } | undefined) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          files: oldData.files.map((f) =>
            f.id === fileId ? { ...f, original_name: newName, name: newName } : f
          ),
        };
      });

      setEditingFileId(null);
      setEditingFileName('');

      try {
        const response = await fetch(`/api/webhard/files/${fileId}/rename`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: newName }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to rename file');
        }

        const renamedFile = (await response.json()) as WebhardFile;
        queryClient.setQueryData(filesQueryKey, (oldData: { files: WebhardFile[] } | undefined) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            files: oldData.files.map((f) => (f.id === fileId ? { ...f, ...renamedFile } : f)),
          };
        });

        // 백그라운드에서 캐시 무효화 (다른 폴더 방문 시 반영)
        queryClient.invalidateQueries({
          queryKey: queryKeys.webhard.files.list(),
          refetchType: 'none',
        });
      } catch (err) {
        // 롤백: 이전 데이터로 복원
        if (previousData) {
          queryClient.setQueryData(filesQueryKey, previousData);
        } else if (originalFile) {
          // previousData가 없으면 해당 파일만 복원
          queryClient.setQueryData(
            filesQueryKey,
            (oldData: { files: WebhardFile[] } | undefined) => {
              if (!oldData) return oldData;
              return {
                ...oldData,
                files: oldData.files.map((f) =>
                  f.id === fileId
                    ? {
                        ...f,
                        original_name: originalFile.original_name,
                        name: originalFile.name,
                      }
                    : f
                ),
              };
            }
          );
        }

        // 오류 알림 (설정에 따라)
        if (notificationSettings.notifyOnError) {
          showError(
            '오류',
            err instanceof Error ? err.message : '파일 이름 변경 중 오류가 발생했습니다.'
          );
        }
      }
    },
    [editingFileName, files, filesQueryKey, notificationSettings, queryClient, showError]
  );

  // 파일명 수정 취소
  const cancelRename = useCallback(() => {
    setEditingFileId(null);
    setEditingFileName('');
  }, []);

  return {
    editingFileId,
    editingFileName,
    startRename,
    finishRename,
    cancelRename,
    setEditingFileName,
    editInputRef,
  };
}
