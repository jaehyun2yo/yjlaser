'use client';

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';

/**
 * 통합 뱃지 카운트 시스템
 * =========================
 *
 * 모든 뱃지 카운트는 scope-aware 'webhard', 'badge-counts' 쿼리 키를 단일 소스로 사용합니다.
 * - usePrefetchAllBadgeCounts: 메인 데이터 fetch (웹하드 페이지 진입 시)
 * - useTotalUndownloadedCount: 전체 카운트 조회 (메인 소스 참조)
 * - useFolderUndownloadedCounts: 폴더별 카운트 조회 (메인 소스 참조)
 *
 * 캐시 무효화 시 'badge-counts' 키만 무효화하면 모든 뱃지가 동기화됩니다.
 *
 * NOTE: Realtime 구독은 useWebhardFileRealtime 훅으로 이전됨
 * (정밀한 폴더별 캐시 무효화 지원)
 */

// 뱃지 데이터 타입
interface BadgeCountsData {
  totalCount: number;
  folderCounts: Record<string, number>;
}

export interface BadgeCountsQueryOptions {
  companyId?: string | number | null;
  includeFolderCounts?: boolean;
}

function normalizeBadgeCountsOptions(
  options: BadgeCountsQueryOptions = {}
): Required<BadgeCountsQueryOptions> {
  return {
    companyId: options.companyId ?? null,
    includeFolderCounts: options.includeFolderCounts ?? true,
  };
}

export function buildBadgeCountsUrl(options: BadgeCountsQueryOptions = {}): string {
  const normalized = normalizeBadgeCountsOptions(options);
  const params = new URLSearchParams();
  if (normalized.companyId !== null) params.set('companyId', String(normalized.companyId));
  if (!normalized.includeFolderCounts) params.set('includeFolderCounts', 'false');
  const query = params.toString();
  return query ? `/api/webhard/badge-counts?${query}` : '/api/webhard/badge-counts';
}

async function fetchBadgeCounts(options: BadgeCountsQueryOptions = {}): Promise<BadgeCountsData> {
  const response = await fetch(buildBadgeCountsUrl(options));
  if (!response.ok) {
    throw new Error('Failed to fetch badge counts');
  }
  return response.json() as Promise<BadgeCountsData>;
}

/**
 * 전체 미다운로드 파일 카운트 조회 훅
 * (네비게이션 뱃지용)
 *
 * 통합 badge-counts 캐시에서 totalCount를 가져옵니다.
 */
export function useTotalUndownloadedCount(options: BadgeCountsQueryOptions = {}) {
  const normalizedOptions = normalizeBadgeCountsOptions(options);
  // 통합 캐시에서 데이터 가져오기
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.webhard.badgeCounts(normalizedOptions),
    queryFn: () => fetchBadgeCounts(normalizedOptions),
    staleTime: 3 * 60 * 1000, // 3분 (요청 감소)
    gcTime: 10 * 60 * 1000, // 10분
    refetchOnWindowFocus: false,
    refetchOnMount: true, // stale일 때만 refetch (요청 30% 감소)
    refetchInterval: false,
  });

  return {
    count: data?.totalCount ?? 0,
    isLoading,
    error,
    refetch,
  };
}

/**
 * 폴더별 미다운로드 파일 카운트 조회 훅
 * (폴더 트리 뱃지용)
 *
 * 통합 badge-counts 캐시에서 folderCounts를 가져옵니다.
 * folderIds 파라미터는 하위 호환성을 위해 유지되지만,
 * 실제로는 전체 폴더 카운트에서 필터링합니다.
 */
export function useFolderUndownloadedCounts(
  folderIds: string[],
  options: BadgeCountsQueryOptions = {}
) {
  const normalizedOptions = normalizeBadgeCountsOptions(options);
  // 통합 캐시에서 데이터 가져오기
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.webhard.badgeCounts(normalizedOptions),
    queryFn: () => fetchBadgeCounts(normalizedOptions),
    staleTime: 3 * 60 * 1000, // 3분 (요청 감소)
    gcTime: 10 * 60 * 1000, // 10분
    refetchOnWindowFocus: false,
    refetchOnMount: true, // stale일 때만 refetch
  });

  // 요청된 폴더 ID만 필터링하여 반환
  const counts = useMemo(() => {
    if (!data?.folderCounts) return {};
    if (folderIds.length === 0) return {};

    const filtered: Record<string, number> = {};
    for (const id of folderIds) {
      filtered[id] = data.folderCounts[id] ?? 0;
    }
    return filtered;
  }, [data?.folderCounts, folderIds]);

  return {
    counts,
    isLoading,
    error,
    refetch,
  };
}

/**
 * 수동으로 모든 뱃지 카운트 새로고침
 * 통합 캐시만 무효화하면 모든 뱃지가 동기화됩니다.
 */
export function useRefreshBadgeCounts() {
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.webhard.badgeCounts(),
    });
  }, [queryClient]);

  return { refresh };
}

/**
 * 모든 뱃지 카운트를 한 번에 프리패칭하는 훅
 * 웹하드 페이지 진입 시 호출하여 모든 뱃지가 동시에 표시되도록 함
 *
 * 이 훅이 메인 데이터 소스입니다.
 * useTotalUndownloadedCount, useFolderUndownloadedCounts 모두
 * 동일한 캐시를 참조합니다.
 */
export function usePrefetchAllBadgeCounts(options: BadgeCountsQueryOptions = {}) {
  const normalizedOptions = normalizeBadgeCountsOptions(options);
  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: queryKeys.webhard.badgeCounts(normalizedOptions),
    queryFn: () => fetchBadgeCounts(normalizedOptions),
    staleTime: 3 * 60 * 1000, // 3분 (요청 감소, 무효화 시 즉시 갱신)
    gcTime: 10 * 60 * 1000, // 10분 (캐시 유지 시간)
    refetchOnMount: true, // stale일 때만 refetch (요청 30% 감소)
    refetchOnWindowFocus: false, // 윈도우 포커스 시 refetch 비활성화
  });

  return {
    totalCount: data?.totalCount ?? 0,
    folderCounts: data?.folderCounts ?? {},
    isLoading,
    isFetching,
    error,
    refetch,
  };
}
