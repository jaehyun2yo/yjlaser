/**
 * 웹하드 Optimistic Update 헬퍼 함수들
 * 파일/폴더 상태 변경을 즉시 UI에 반영하고, 에러 시 롤백
 */

import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { WebhardFile } from '@/types/webhard';

// ============ Types ============
interface OptimisticUpdateOptions {
  filesQueryKey: unknown[];
  companyId?: string;
}

interface OptimisticUpdateResult<T> {
  previousData: T | undefined;
  rollback: () => void;
}

interface BadgeCountsData {
  totalCount: number;
  folderCounts: Record<string, number>;
}

/**
 * 뱃지 카운트를 Optimistic하게 조정
 * @param delta - 증감값 (양수: 증가, 음수: 감소)
 * @param folderId - 폴더별 카운트 조정 시 폴더 ID
 */
export function optimisticBadgeCountAdjust(
  queryClient: QueryClient,
  delta: number,
  folderId?: string | null,
  companyId?: string
): { previousData: BadgeCountsData | undefined; rollback: () => void } {
  const badgeCountsKey = queryKeys.webhard.badgeCounts({
    companyId: companyId ?? null,
    includeFolderCounts: true,
  });
  const previousData = queryClient.getQueryData<BadgeCountsData>(badgeCountsKey);

  if (previousData) {
    queryClient.setQueryData<BadgeCountsData>(badgeCountsKey, (old) => {
      if (!old) return old;
      const newTotal = Math.max(0, (old.totalCount || 0) + delta);

      let newFolderCounts = old.folderCounts;
      if (folderId && old.folderCounts) {
        newFolderCounts = { ...old.folderCounts };
        const currentCount = newFolderCounts[folderId] || 0;
        newFolderCounts[folderId] = Math.max(0, currentCount + delta);
      }

      return { ...old, totalCount: newTotal, folderCounts: newFolderCounts };
    });
  }

  return {
    previousData,
    rollback: () => {
      if (previousData) {
        queryClient.setQueryData(badgeCountsKey, previousData);
      }
    },
  };
}

// ============ File Updates ============

/**
 * 파일 캐시에서 특정 파일 업데이트 (Optimistic Update)
 * @returns 롤백을 위한 이전 데이터와 롤백 함수
 */
export function optimisticFileUpdate(
  queryClient: QueryClient,
  fileId: string,
  updates: Partial<WebhardFile>,
  options: OptimisticUpdateOptions
): OptimisticUpdateResult<{ files: WebhardFile[] }> {
  const previousData = queryClient.getQueryData<{ files: WebhardFile[] }>(options.filesQueryKey);

  queryClient.setQueryData(
    options.filesQueryKey,
    (oldData: { files: WebhardFile[] } | undefined) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        files: oldData.files.map((f) => (f.id === fileId ? { ...f, ...updates } : f)),
      };
    }
  );

  return {
    previousData,
    rollback: () => {
      if (previousData) {
        queryClient.setQueryData(options.filesQueryKey, previousData);
      }
    },
  };
}

/**
 * 파일 캐시에서 특정 파일들 제거 (Optimistic Update)
 * @returns 롤백을 위한 이전 데이터와 롤백 함수
 */
export function optimisticFileRemove(
  queryClient: QueryClient,
  fileIds: string[],
  options: OptimisticUpdateOptions
): OptimisticUpdateResult<{ files: WebhardFile[] }> {
  const previousData = queryClient.getQueryData<{ files: WebhardFile[] }>(options.filesQueryKey);

  const fileIdSet = new Set(fileIds);

  // 삭제 대상 중 미다운로드 파일 수 계산 → 뱃지 카운트 조정
  if (previousData) {
    const undownloadedCount = previousData.files.filter(
      (f) => fileIdSet.has(f.id) && !f.is_downloaded
    ).length;
    if (undownloadedCount > 0) {
      const folderId = previousData.files.find((f) => fileIdSet.has(f.id))?.folder_id;
      optimisticBadgeCountAdjust(queryClient, -undownloadedCount, folderId, options.companyId);
    }
  }

  // 메인 캐시에서 파일 제거
  queryClient.setQueryData(
    options.filesQueryKey,
    (oldData: { files: WebhardFile[] } | undefined) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        files: oldData.files.filter((f) => !fileIdSet.has(f.id)),
      };
    }
  );

  // 새 파일 목록에서도 제거
  queryClient.setQueryData(
    queryKeys.webhard.newFiles(options.companyId),
    (oldData: { files: WebhardFile[]; total: number } | undefined) => {
      if (!oldData) return oldData;
      const removedCount = oldData.files.filter((f) => fileIdSet.has(f.id)).length;
      return {
        ...oldData,
        files: oldData.files.filter((f) => !fileIdSet.has(f.id)),
        total: Math.max(0, oldData.total - removedCount),
      };
    }
  );

  return {
    previousData,
    rollback: () => {
      if (previousData) {
        queryClient.setQueryData(options.filesQueryKey, previousData);
      }
    },
  };
}

/**
 * 다운로드 완료 후 파일 상태 업데이트 (is_downloaded: true)
 * 여러 캐시를 동시에 업데이트
 */
export function optimisticBatchDownload(
  queryClient: QueryClient,
  files: WebhardFile[],
  options: OptimisticUpdateOptions
): OptimisticUpdateResult<{ files: WebhardFile[] }> {
  const previousData = queryClient.getQueryData<{ files: WebhardFile[] }>(options.filesQueryKey);

  const fileIdSet = new Set(files.map((f) => f.id));

  // 다운로드 대상 중 미다운로드 파일 수만큼 뱃지 카운트 차감
  const newlyDownloadedCount = files.filter((f) => !f.is_downloaded).length;
  if (newlyDownloadedCount > 0) {
    const folderId = files[0]?.folder_id;
    optimisticBadgeCountAdjust(queryClient, -newlyDownloadedCount, folderId, options.companyId);
  }

  // 메인 캐시 업데이트
  queryClient.setQueryData(
    options.filesQueryKey,
    (oldData: { files: WebhardFile[] } | undefined) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        files: oldData.files.map((f) => (fileIdSet.has(f.id) ? { ...f, is_downloaded: true } : f)),
      };
    }
  );

  // 각 파일이 속한 폴더의 캐시도 업데이트
  files.forEach((file) => {
    const folderQueryKey = queryKeys.webhard.files.list({
      folderId: file.folder_id || undefined,
      companyId: options.companyId,
    });

    queryClient.setQueryData(folderQueryKey, (oldData: { files: WebhardFile[] } | undefined) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        files: oldData.files.map((f) => (f.id === file.id ? { ...f, is_downloaded: true } : f)),
      };
    });
  });

  // 새 파일 목록에서 제거
  queryClient.setQueryData(
    queryKeys.webhard.newFiles(options.companyId),
    (oldData: { files: WebhardFile[]; total: number } | undefined) => {
      if (!oldData) return oldData;
      const removedCount = oldData.files.filter((f) => fileIdSet.has(f.id)).length;
      return {
        ...oldData,
        files: oldData.files.filter((f) => !fileIdSet.has(f.id)),
        total: Math.max(0, oldData.total - removedCount),
      };
    }
  );

  return {
    previousData,
    rollback: () => {
      if (previousData) {
        queryClient.setQueryData(options.filesQueryKey, previousData);
      }
    },
  };
}

/**
 * 파일 이름 변경 Optimistic Update
 */
export function optimisticRename(
  queryClient: QueryClient,
  fileId: string,
  newName: string,
  options: OptimisticUpdateOptions
): OptimisticUpdateResult<{ files: WebhardFile[] }> {
  return optimisticFileUpdate(
    queryClient,
    fileId,
    { original_name: newName, name: newName },
    options
  );
}

/**
 * 파일 이동 Optimistic Update
 * 현재 폴더에서 파일을 제거하고, 대상 폴더에 추가
 */
export function optimisticMove(
  queryClient: QueryClient,
  files: WebhardFile[],
  targetFolderId: string | null,
  options: OptimisticUpdateOptions
): OptimisticUpdateResult<{ files: WebhardFile[] }> {
  const previousData = queryClient.getQueryData<{ files: WebhardFile[] }>(options.filesQueryKey);

  const fileIdSet = new Set(files.map((f) => f.id));

  // 이동 대상 중 미다운로드 파일 수 → 소스 폴더 감소, 대상 폴더 증가
  const undownloadedCount = files.filter((f) => !f.is_downloaded).length;
  if (undownloadedCount > 0) {
    const sourceFolderId = files[0]?.folder_id;
    if (sourceFolderId) {
      optimisticBadgeCountAdjust(
        queryClient,
        -undownloadedCount,
        sourceFolderId,
        options.companyId
      );
    }
    if (targetFolderId) {
      optimisticBadgeCountAdjust(queryClient, undownloadedCount, targetFolderId, options.companyId);
    }
    // totalCount는 변하지 않으므로 delta=0 (폴더 간 이동은 전체 수에 영향 없음)
  }

  // 현재 폴더에서 파일 제거
  queryClient.setQueryData(
    options.filesQueryKey,
    (oldData: { files: WebhardFile[] } | undefined) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        files: oldData.files.filter((f) => !fileIdSet.has(f.id)),
      };
    }
  );

  // 대상 폴더에 파일 추가
  const targetFolderQueryKey = queryKeys.webhard.files.list({
    folderId: targetFolderId || undefined,
    companyId: options.companyId,
  });

  queryClient.setQueryData(
    targetFolderQueryKey,
    (oldData: { files: WebhardFile[] } | undefined) => {
      if (!oldData) {
        return { files: files.map((f) => ({ ...f, folder_id: targetFolderId })) };
      }
      return {
        ...oldData,
        files: [...oldData.files, ...files.map((f) => ({ ...f, folder_id: targetFolderId }))],
      };
    }
  );

  return {
    previousData,
    rollback: () => {
      if (previousData) {
        queryClient.setQueryData(options.filesQueryKey, previousData);
      }
    },
  };
}
