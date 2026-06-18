import { useCallback, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { createWebhardApiError, fetchWebhardFiles, isWebhardAuthError } from '@/lib/api/webhard';
import type { WebhardFilesResponse } from '@/lib/api/webhard';
import type { WebhardFile } from '@/types/webhard';
import type { SortBy } from '@/store/webhard';
import { WEBHARD_CACHE_CONFIG, sortFiles as sortFilesUtil } from '@/app/webhard/_lib';
import {
  getWebhardCompanyId,
  getWebhardFilesQueryKey,
  getWebhardNewFilesQueryKey,
  type WebhardMainScope,
} from '@/app/webhard/_lib/webhardMainContracts';

const NEW_FILES_PAGE_SIZE = 20;
const FILES_PAGE_SIZE = 50;

type SortOrder = 'asc' | 'desc';
type SortableWebhardFile = Omit<WebhardFile, 'folder_path'> & { folder_path?: string };
type NewFilesApiFile = Omit<WebhardFile, 'companies'> & {
  companies?: WebhardFile['companies'] | NonNullable<WebhardFile['companies']>[] | null;
  folder_path?: string | null;
};

interface NewFilesApiResponse {
  files: NewFilesApiFile[];
  total: number;
  hasMore?: boolean;
}

interface NewFilesPage {
  files: SortableWebhardFile[];
  total: number;
  page: number;
  hasMore: boolean;
}

interface UseWebhardFilesQueryOptions extends WebhardMainScope {
  isNewFilesMode: boolean;
  sortBy: SortBy;
  sortOrder: SortOrder;
  socketConnected: boolean;
}

function normalizeNewFile(file: NewFilesApiFile): SortableWebhardFile {
  return {
    ...file,
    companies: Array.isArray(file.companies)
      ? (file.companies[0] ?? null)
      : (file.companies ?? null),
    folder_path: file.folder_path ?? undefined,
  };
}

function toSortableFile(file: WebhardFile): SortableWebhardFile {
  return { ...file, folder_path: file.folder_path ?? undefined };
}

export function useWebhardFilesQuery(options: UseWebhardFilesQueryOptions) {
  const { selectedFolderId, userType, userId, isNewFilesMode, sortBy, sortOrder, socketConnected } =
    options;
  const companyId = getWebhardCompanyId(options);
  const queryClient = useQueryClient();
  const [isFetchingNextFilesPage, setIsFetchingNextFilesPage] = useState(false);
  const filesQueryKey = useMemo(() => getWebhardFilesQueryKey(options), [options]);

  const filesQuery = useQuery({
    queryKey: filesQueryKey,
    queryFn: () =>
      fetchWebhardFiles({
        folderId: selectedFolderId || undefined,
        companyId,
        sortBy: 'date',
        sortOrder: 'desc',
        page: 1,
        limit: FILES_PAGE_SIZE,
      }),
    staleTime: WEBHARD_CACHE_CONFIG.files.staleTime,
    gcTime: WEBHARD_CACHE_CONFIG.files.gcTime,
    refetchOnWindowFocus: false,
    refetchInterval: socketConnected ? false : 30_000,
    refetchIntervalInBackground: false,
    retry: (failureCount, error) => !isWebhardAuthError(error) && failureCount < 3,
    enabled: !isNewFilesMode,
  });

  const fetchNextFilesPage = useCallback(async () => {
    const currentData = queryClient.getQueryData<WebhardFilesResponse>(filesQueryKey);
    const currentPagination = currentData?.pagination;

    if (!currentPagination?.hasMore || isFetchingNextFilesPage) {
      return;
    }

    const nextPage = currentPagination.page + 1;
    setIsFetchingNextFilesPage(true);

    try {
      const nextData = await fetchWebhardFiles({
        folderId: selectedFolderId || undefined,
        companyId,
        sortBy: 'date',
        sortOrder: 'desc',
        page: nextPage,
        limit: currentPagination.limit || FILES_PAGE_SIZE,
      });

      queryClient.setQueryData<WebhardFilesResponse>(filesQueryKey, (oldData) => {
        if (!oldData) return nextData;

        return {
          files: [...oldData.files, ...nextData.files],
          pagination: nextData.pagination,
        };
      });
    } finally {
      setIsFetchingNextFilesPage(false);
    }
  }, [companyId, filesQueryKey, isFetchingNextFilesPage, queryClient, selectedFolderId]);

  const newFilesQuery = useInfiniteQuery({
    queryKey: getWebhardNewFilesQueryKey(options),
    queryFn: async ({ pageParam = 1 }) => {
      const page = typeof pageParam === 'number' ? pageParam : 1;
      const params = new URLSearchParams();
      if (userType === 'company') {
        params.set('companyId', userId);
      }
      params.set('page', String(page));
      params.set('limit', String(NEW_FILES_PAGE_SIZE));
      params.set('sortBy', 'date');
      params.set('sortOrder', 'desc');

      const response = await fetch(`/api/webhard/files/new?${params.toString()}`);
      if (!response.ok) {
        throw await createWebhardApiError(response, 'Failed to fetch new files');
      }
      const data = (await response.json()) as NewFilesApiResponse;
      return {
        files: data.files.map(normalizeNewFile),
        total: data.total,
        page,
        hasMore: data.hasMore ?? page * NEW_FILES_PAGE_SIZE < data.total,
      } satisfies NewFilesPage;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: WEBHARD_CACHE_CONFIG.newFiles.staleTime,
    gcTime: WEBHARD_CACHE_CONFIG.newFiles.gcTime,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => !isWebhardAuthError(error) && failureCount < 3,
    enabled: isNewFilesMode,
  });

  const files = useMemo(() => {
    const sorted = (fileList: SortableWebhardFile[]) => sortFilesUtil(fileList, sortBy, sortOrder);

    if (isNewFilesMode) {
      const allNewFiles = newFilesQuery.data?.pages?.flatMap((page) => page.files) ?? [];
      return sorted(allNewFiles);
    }

    const fileList = (filesQuery.data?.files ?? []).map(toSortableFile);
    const currentFolderId = selectedFolderId || null;
    const filteredFiles = fileList.filter((file) => (file.folder_id || null) === currentFolderId);
    return sorted(filteredFiles);
  }, [
    filesQuery.data?.files,
    isNewFilesMode,
    newFilesQuery.data?.pages,
    selectedFolderId,
    sortBy,
    sortOrder,
  ]);

  return {
    files,
    filesData: filesQuery.data,
    filesQueryKey,
    isLoadingFiles: filesQuery.isLoading,
    newFilesData: newFilesQuery.data,
    hasAuthError: isWebhardAuthError(filesQuery.error) || isWebhardAuthError(newFilesQuery.error),
    isLoadingNewFiles: newFilesQuery.isLoading,
    isFetchingNextPage: isNewFilesMode ? newFilesQuery.isFetchingNextPage : isFetchingNextFilesPage,
    hasNextPage: isNewFilesMode
      ? newFilesQuery.hasNextPage
      : (filesQuery.data?.pagination?.hasMore ?? false),
    fetchNextPage: isNewFilesMode ? newFilesQuery.fetchNextPage : fetchNextFilesPage,
  };
}
