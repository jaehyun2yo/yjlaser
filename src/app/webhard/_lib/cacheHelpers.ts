/**
 * 웹하드 React Query 캐시 관련 헬퍼 함수들
 */

import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { WebhardFile } from '@/types/webhard';

/**
 * 웹하드 React Query 캐시 설정
 * 모든 웹하드 쿼리에서 이 설정을 사용하여 일관성 보장
 */
export const WEBHARD_CACHE_CONFIG = {
  files: {
    staleTime: 10 * 60 * 1000, // 10분 - 파일 목록 캐싱 개선
    gcTime: 30 * 60 * 1000, // 30분 - 메모리 최적화
  },
  newFiles: {
    staleTime: 2 * 60 * 1000, // 2분 - 새 파일은 실시간성 유지
    gcTime: 10 * 60 * 1000, // 10분
  },
  folders: {
    staleTime: 10 * 60 * 1000, // 10분 - 폴더 구조는 덜 변경됨
    gcTime: 30 * 60 * 1000, // 30분
  },
  badges: {
    staleTime: 3 * 60 * 1000, // 3분 - 뱃지 카운트 (요청 감소)
    gcTime: 10 * 60 * 1000,
  },
} as const;

/**
 * 파일 목록 캐시 무효화
 */
export function invalidateFilesCache(queryClient: QueryClient): void {
  queryClient.invalidateQueries({
    queryKey: queryKeys.webhard.files.all(),
    exact: false,
    refetchType: 'none',
  });
}

/**
 * 뱃지 카운트 캐시 무효화
 * useUndownloadedCount.ts는 queryKeys.webhard.badgeCounts() prefix를 사용
 */
export function invalidateBadgeCounts(queryClient: QueryClient): void {
  queryClient.invalidateQueries({
    queryKey: queryKeys.webhard.badgeCounts(),
    refetchType: 'active',
  });
}

/**
 * 저장공간 사용량 캐시 무효화
 * 파일 생성/삭제/복원처럼 활성 저장 용량이 바뀌는 작업 후 즉시 갱신한다.
 */
export function invalidateStorageUsage(queryClient: QueryClient): void {
  queryClient.invalidateQueries({
    queryKey: queryKeys.webhard.storageAll(),
    refetchType: 'active',
  });
}

/**
 * 새 파일 목록 캐시 무효화
 */
export function invalidateNewFilesCache(queryClient: QueryClient, companyId?: string): void {
  queryClient.invalidateQueries({
    queryKey: queryKeys.webhard.newFiles(companyId),
    refetchType: 'active',
  });
}

interface FileCacheUpdateOptions {
  filesQueryKey: readonly unknown[];
  companyId?: string;
}

/**
 * 파일 캐시에서 특정 파일 업데이트 (Optimistic Update)
 */
export function updateFileInCache(
  queryClient: QueryClient,
  fileId: string,
  updates: Partial<WebhardFile>,
  options: FileCacheUpdateOptions
): void {
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
}

/**
 * 파일 캐시에서 특정 파일들 제거 (Optimistic Update)
 */
export function removeFilesFromCache(
  queryClient: QueryClient,
  fileIds: string[],
  options: FileCacheUpdateOptions
): { files: WebhardFile[] } | undefined {
  const previousData = queryClient.getQueryData<{ files: WebhardFile[] }>(options.filesQueryKey);

  queryClient.setQueryData(
    options.filesQueryKey,
    (oldData: { files: WebhardFile[] } | undefined) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        files: oldData.files.filter((f) => !fileIds.includes(f.id)),
      };
    }
  );

  // 새 파일 목록에서도 제거 (무한 스크롤 구조 지원)
  removeFilesFromNewFilesInfiniteCache(queryClient, fileIds, options.companyId);

  return previousData;
}

/**
 * 다운로드 완료 후 파일 상태 업데이트 (is_downloaded: true)
 */
export function markFileAsDownloaded(
  queryClient: QueryClient,
  file: WebhardFile,
  options: FileCacheUpdateOptions
): void {
  // 현재 쿼리 캐시 업데이트
  updateFileInCache(queryClient, file.id, { is_downloaded: true }, options);

  // 파일이 실제로 속한 폴더의 캐시도 업데이트 (새 파일 모드에서 다운로드 시)
  const fileFolderQueryKey = queryKeys.webhard.files.list({
    folderId: file.folder_id || undefined,
    companyId: options.companyId,
  });

  queryClient.setQueryData(fileFolderQueryKey, (oldData: { files: WebhardFile[] } | undefined) => {
    if (!oldData) return oldData;
    return {
      ...oldData,
      files: oldData.files.map((f) => (f.id === file.id ? { ...f, is_downloaded: true } : f)),
    };
  });

  // 새 파일 목록에서 제거 (무한 스크롤 구조 지원)
  removeFileFromNewFilesInfiniteCache(queryClient, file.id, options.companyId);
}

// ============ 무한 스크롤 캐시 헬퍼 ============

interface InfiniteNewFilesPage {
  files: WebhardFile[];
  total: number;
  page: number;
  hasMore: boolean;
}

interface InfiniteNewFilesData {
  pages: InfiniteNewFilesPage[];
  pageParams: number[];
}

/**
 * 새 파일 무한 스크롤 캐시에서 파일 제거 (Optimistic Update)
 * useInfiniteQuery 데이터 구조에 맞게 처리
 */
export function removeFileFromNewFilesInfiniteCache(
  queryClient: QueryClient,
  fileId: string,
  companyId?: string
): void {
  const queryKey = queryKeys.webhard.newFiles(companyId);

  queryClient.setQueryData(queryKey, (oldData: InfiniteNewFilesData | undefined) => {
    if (!oldData?.pages) return oldData;

    return {
      ...oldData,
      pages: oldData.pages.map((page) => ({
        ...page,
        files: page.files.filter((f) => f.id !== fileId),
        total: Math.max(0, page.total - 1),
      })),
    };
  });
}

/**
 * 새 파일 무한 스크롤 캐시에서 여러 파일 제거 (Optimistic Update)
 */
export function removeFilesFromNewFilesInfiniteCache(
  queryClient: QueryClient,
  fileIds: string[],
  companyId?: string
): void {
  const queryKey = queryKeys.webhard.newFiles(companyId);
  const fileIdSet = new Set(fileIds);

  queryClient.setQueryData(queryKey, (oldData: InfiniteNewFilesData | undefined) => {
    if (!oldData?.pages) return oldData;

    let removedCount = 0;
    const newPages = oldData.pages.map((page) => {
      const originalLength = page.files.length;
      const newFiles = page.files.filter((f) => !fileIdSet.has(f.id));
      removedCount += originalLength - newFiles.length;
      return {
        ...page,
        files: newFiles,
      };
    });

    // 첫 번째 페이지의 total만 업데이트 (전체 총계)
    if (newPages.length > 0) {
      newPages[0] = {
        ...newPages[0],
        total: Math.max(0, newPages[0].total - removedCount),
      };
    }

    return {
      ...oldData,
      pages: newPages,
    };
  });
}

/**
 * 캐시 롤백 (에러 발생 시 이전 상태로 복원)
 */
export function rollbackCache(
  queryClient: QueryClient,
  filesQueryKey: readonly unknown[],
  previousData: { files: WebhardFile[] } | undefined
): void {
  if (previousData) {
    queryClient.setQueryData(filesQueryKey, previousData);
  }
}

// ============ 정밀한 캐시 무효화 함수 ============

interface PreciseInvalidateOptions {
  /** 현재 폴더 ID */
  folderId?: string | null;
  /** 업체 ID (company 사용자인 경우) */
  companyId?: string;
  /** userType */
  userType?: 'admin' | 'company';
}

/**
 * 삭제 후 정밀한 캐시 무효화
 * - Optimistic Update로 UI에서 이미 제거됨
 * - 불필요한 refetch 방지, 뱃지 카운트만 갱신
 */
export function invalidateAfterDelete(
  queryClient: QueryClient,
  options: PreciseInvalidateOptions
): void {
  // 현재 폴더 캐시는 Optimistic Update로 이미 처리됨
  // refetchType: 'none'으로 서버 재요청 방지
  if (options.folderId !== undefined) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhard.files.list({
        folderId: options.folderId || undefined,
        companyId: options.companyId,
      }),
      exact: true,
      refetchType: 'none', // 서버 재요청 하지 않음
    });
  }

  // 새 파일 목록 캐시 무효화 (삭제된 파일이 새 파일이었을 수 있음)
  queryClient.invalidateQueries({
    queryKey: queryKeys.webhard.newFilesAll(),
    exact: false, // 모든 companyId에 대해 무효화
    refetchType: 'active',
  });

  // 뱃지 카운트 갱신 (통합 함수 사용)
  invalidateBadgeCounts(queryClient);
  invalidateStorageUsage(queryClient);
}

interface MoveInvalidateOptions extends PreciseInvalidateOptions {
  /** 이동 대상 폴더 ID */
  targetFolderId?: string | null;
}

/**
 * 이동 후 정밀한 캐시 무효화
 * - 소스 폴더: Optimistic Update로 이미 제거됨, refetch 불필요
 * - 대상 폴더: 다음 방문 시 fetch
 */
export function invalidateAfterMove(
  queryClient: QueryClient,
  options: MoveInvalidateOptions
): void {
  // 소스 폴더 (Optimistic Update로 이미 제거됨)
  if (options.folderId !== undefined) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhard.files.list({
        folderId: options.folderId || undefined,
        companyId: options.companyId,
      }),
      exact: true,
      refetchType: 'none', // 서버 재요청 하지 않음
    });
  }

  // 대상 폴더 (다음 방문 시 fetch)
  if (options.targetFolderId !== undefined) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhard.files.list({
        folderId: options.targetFolderId || undefined,
        companyId: options.companyId,
      }),
      exact: true,
      refetchType: 'none', // 즉시 refetch 하지 않음
    });
  }

  // 뱃지 카운트 갱신 (통합 함수 사용)
  invalidateBadgeCounts(queryClient);
}

/**
 * 폴더 이동 후 폴더 목록과 통합 뱃지 카운트를 함께 갱신
 * - 폴더 이동은 하위 미다운로드 수의 상위 합산 경로를 바꾸므로 badgeCounts까지 즉시 무효화해야 한다.
 */
export function invalidateAfterFolderMove(queryClient: QueryClient): void {
  queryClient.invalidateQueries({
    queryKey: queryKeys.webhard.folders.all(),
    exact: false,
    refetchType: 'active',
  });

  invalidateBadgeCounts(queryClient);
}

/**
 * 업로드 후 정밀한 캐시 무효화
 * - Optimistic Update에서 임시 파일이 이미 제거됨
 * - 해당 폴더만 refetch하여 실제 파일로 대체
 */
export function invalidateAfterUpload(
  queryClient: QueryClient,
  options: PreciseInvalidateOptions
): void {
  // 업로드된 폴더의 파일 목록 갱신 (실제 파일로 대체)
  if (options.folderId !== undefined) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhard.files.list({
        folderId: options.folderId || undefined,
        companyId: options.companyId,
      }),
      exact: true,
      refetchType: 'active', // 실제 파일 데이터로 대체
    });
  }

  // 새 파일 목록도 갱신
  queryClient.invalidateQueries({
    queryKey: queryKeys.webhard.newFilesAll(),
    exact: false,
    refetchType: 'active',
  });

  // 뱃지 카운트 갱신
  invalidateBadgeCounts(queryClient);
  invalidateStorageUsage(queryClient);
}
