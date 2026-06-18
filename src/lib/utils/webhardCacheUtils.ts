/**
 * 웹하드 캐시 관리 유틸리티
 * 정밀한 캐시 무효화 및 Optimistic Update 지원
 */

import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { WebhardFile } from '@/types/webhard';

interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  company_id: number;
  created_by: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// 조상 폴더 캐시 (메모리 캐시로 API 호출 최소화)
const ancestorCache = new Map<string, { ancestors: string[]; timestamp: number }>();
const ANCESTOR_CACHE_TTL = 5 * 60 * 1000; // 5분

/**
 * 조상 폴더 ID 목록 조회
 * 캐시된 폴더 목록에서 재귀적으로 조회
 */
export async function getAncestorFolderIds(
  folderId: string,
  queryClient: QueryClient,
  companyId?: string | number
): Promise<string[]> {
  // 메모리 캐시 확인
  const cached = ancestorCache.get(folderId);
  if (cached && Date.now() - cached.timestamp < ANCESTOR_CACHE_TTL) {
    return cached.ancestors;
  }

  // React Query 캐시에서 폴더 목록 가져오기
  const foldersData = queryClient.getQueryData<{ folders: Folder[] }>(
    queryKeys.webhard.folders.list(companyId)
  );

  if (!foldersData?.folders) {
    // 캐시가 없으면 API 호출
    try {
      const response = await fetch(`/api/webhard/folders/${folderId}/ancestors`);
      if (response.ok) {
        const data = await response.json();
        ancestorCache.set(folderId, { ancestors: data.ancestors, timestamp: Date.now() });
        return data.ancestors;
      }
    } catch {
      // API 실패 시 빈 배열 반환
    }
    return [];
  }

  // 캐시된 폴더 목록에서 조상 찾기
  const folderMap = new Map(foldersData.folders.map((f) => [f.id, f]));
  const ancestors: string[] = [];
  let currentId: string | null = folderId;

  for (let i = 0; i < 50 && currentId; i++) {
    const folder = folderMap.get(currentId);
    if (!folder) break;

    if (folder.parent_id) {
      ancestors.push(folder.parent_id);
      currentId = folder.parent_id;
    } else {
      break;
    }
  }

  // 메모리 캐시 저장
  ancestorCache.set(folderId, { ancestors, timestamp: Date.now() });
  return ancestors;
}

/**
 * 캐시 무효화 유틸리티
 */
export const webhardCacheUtils = {
  /**
   * 특정 폴더의 파일 목록만 무효화
   */
  invalidateFiles: (queryClient: QueryClient, folderId: string | null) => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhard.files.list({ folderId: folderId ?? undefined }),
      exact: false,
    });
  },

  /**
   * 특정 폴더 뱃지만 무효화
   */
  invalidateBadge: (queryClient: QueryClient, folderId: string) => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhard.folders.undownloadedCount(folderId),
      exact: true,
    });
  },

  /**
   * 전체 뱃지 카운트 무효화
   */
  invalidateTotalBadge: (queryClient: QueryClient) => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhard.totalUndownloadedCount(),
    });
  },

  /**
   * 배치 뱃지 카운트 무효화 (특정 폴더들)
   */
  invalidateBatchBadge: (queryClient: QueryClient, folderIds?: string[]) => {
    if (folderIds && folderIds.length > 0) {
      // 특정 폴더들만 무효화
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          if (
            key[0] === 'webhard' &&
            key[1] === 'folders' &&
            key[2] === 'batch-undownloaded-count'
          ) {
            // 해당 폴더 ID가 포함된 쿼리만 무효화
            const queryFolderIds = key[3] as string[] | undefined;
            if (queryFolderIds) {
              return folderIds.some((id) => queryFolderIds.includes(id));
            }
          }
          return false;
        },
      });
    } else {
      // 전체 배치 뱃지 무효화
      queryClient.invalidateQueries({
        queryKey: queryKeys.webhard.folders.batchUndownloadedCount(),
      });
    }
  },

  /**
   * 조상 폴더들 뱃지 무효화 (파일 추가/삭제 시)
   */
  invalidateAncestorBadges: async (
    queryClient: QueryClient,
    folderId: string,
    companyId?: string | number
  ) => {
    const ancestors = await getAncestorFolderIds(folderId, queryClient, companyId);
    const allFolderIds = [folderId, ...ancestors];

    // 해당 폴더들의 뱃지만 무효화
    webhardCacheUtils.invalidateBatchBadge(queryClient, allFolderIds);

    // 전체 카운트도 무효화
    webhardCacheUtils.invalidateTotalBadge(queryClient);

    // 통합 뱃지 카운트 캐시도 무효화
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhard.badgeCounts(),
    });
  },

  /**
   * 폴더 목록 무효화
   */
  invalidateFolders: (queryClient: QueryClient, companyId?: string | number) => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhard.folders.list(companyId),
    });
  },

  /**
   * Optimistic update - 새 파일 추가
   * @security 중복 파일 ID 검사로 이벤트 중복 처리 방지
   */
  addFileOptimistic: (
    queryClient: QueryClient,
    folderId: string | null,
    newFile: Partial<WebhardFile> & { id: string; name: string }
  ) => {
    const queryKey = queryKeys.webhard.files.list({ folderId: folderId ?? undefined });

    queryClient.setQueryData<{ files: WebhardFile[]; hasMore: boolean }>(queryKey, (old) => {
      if (!old) return old;

      // 🔒 중복 파일 ID 검사 - 이미 존재하면 추가하지 않음
      const existingFileIds = new Set(old.files.map((f) => f.id));
      if (existingFileIds.has(newFile.id)) {
        return old;
      }

      return {
        ...old,
        files: [newFile as WebhardFile, ...old.files],
      };
    });
  },

  /**
   * Optimistic update - 파일 제거
   */
  removeFileOptimistic: (queryClient: QueryClient, folderId: string | null, fileId: string) => {
    const queryKey = queryKeys.webhard.files.list({ folderId: folderId ?? undefined });

    queryClient.setQueryData<{ files: WebhardFile[]; hasMore: boolean }>(queryKey, (old) => {
      if (!old) return old;
      return {
        ...old,
        files: old.files.filter((f) => f.id !== fileId),
      };
    });
  },

  /**
   * Optimistic update - 파일 업데이트
   */
  updateFileOptimistic: (
    queryClient: QueryClient,
    folderId: string | null,
    fileId: string,
    updates: Partial<WebhardFile>
  ) => {
    const queryKey = queryKeys.webhard.files.list({ folderId: folderId ?? undefined });

    queryClient.setQueryData<{ files: WebhardFile[]; hasMore: boolean }>(queryKey, (old) => {
      if (!old) return old;
      return {
        ...old,
        files: old.files.map((f) => (f.id === fileId ? { ...f, ...updates } : f)),
      };
    });
  },

  /**
   * Optimistic update - 새 폴더 추가
   * @security 중복 폴더 ID 검사로 이벤트 중복 처리 방지
   */
  addFolderOptimistic: (
    queryClient: QueryClient,
    companyId: string | number | undefined,
    newFolder: Folder
  ) => {
    const queryKey = queryKeys.webhard.folders.list(companyId);

    queryClient.setQueryData<{ folders: Folder[] }>(queryKey, (old) => {
      if (!old) return { folders: [newFolder] };

      // 🔒 중복 폴더 ID 검사 - 이미 존재하면 추가하지 않음
      const existingFolderIds = new Set(old.folders.map((f) => f.id));
      if (existingFolderIds.has(newFolder.id)) {
        return old;
      }

      return {
        folders: [...old.folders, newFolder],
      };
    });
  },

  /**
   * Optimistic update - 폴더 제거
   */
  removeFolderOptimistic: (
    queryClient: QueryClient,
    companyId: string | number | undefined,
    folderId: string
  ) => {
    const queryKey = queryKeys.webhard.folders.list(companyId);

    queryClient.setQueryData<{ folders: Folder[] }>(queryKey, (old) => {
      if (!old) return old;
      return {
        folders: old.folders.filter((f) => f.id !== folderId),
      };
    });

    // 조상 캐시에서도 제거
    ancestorCache.delete(folderId);
  },

  /**
   * Optimistic update - 폴더 업데이트
   */
  updateFolderOptimistic: (
    queryClient: QueryClient,
    companyId: string | number | undefined,
    folderId: string,
    updates: Partial<Folder>
  ) => {
    const queryKey = queryKeys.webhard.folders.list(companyId);

    queryClient.setQueryData<{ folders: Folder[] }>(queryKey, (old) => {
      if (!old) return old;
      return {
        folders: old.folders.map((f) => (f.id === folderId ? { ...f, ...updates } : f)),
      };
    });
  },

  /**
   * 조상 캐시 클리어
   */
  clearAncestorCache: () => {
    ancestorCache.clear();
  },
};

export default webhardCacheUtils;
