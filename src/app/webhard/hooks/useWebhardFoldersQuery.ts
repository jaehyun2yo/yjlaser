import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createWebhardApiError, isWebhardAuthError } from '@/lib/api/webhard';
import type { WebhardFolder } from '@/app/webhard/_lib';
import { WEBHARD_CACHE_CONFIG } from '@/app/webhard/_lib';
import {
  buildFolderListUrl,
  toBreadcrumbPath,
  type FolderAncestorsResponse,
} from '@/app/webhard/_lib/folderLoading';
import {
  getWebhardCompanyId,
  getWebhardFoldersPageQueryKey,
  sortWebhardFolders,
  type WebhardMainScope,
} from '@/app/webhard/_lib/webhardMainContracts';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { SortBy, SortOrder } from '@/store/webhard';

interface UseWebhardFoldersQueryOptions extends WebhardMainScope {
  isNewFilesMode: boolean;
  sortBy: SortBy;
  sortOrder: SortOrder;
}

export function useWebhardFoldersQuery(options: UseWebhardFoldersQueryOptions) {
  const { selectedFolderId, isNewFilesMode, sortBy, sortOrder } = options;
  const companyId = getWebhardCompanyId(options);

  const foldersQuery = useQuery({
    queryKey: getWebhardFoldersPageQueryKey(options),
    queryFn: async () => {
      const response = await fetch(
        buildFolderListUrl({
          parentId: selectedFolderId,
          companyId,
        })
      );
      if (!response.ok) {
        throw await createWebhardApiError(response, 'Failed to fetch folders');
      }
      return response.json() as Promise<{ folders: WebhardFolder[] }>;
    },
    staleTime: WEBHARD_CACHE_CONFIG.folders.staleTime,
    gcTime: WEBHARD_CACHE_CONFIG.folders.gcTime,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => !isWebhardAuthError(error) && failureCount < 3,
  });

  const allFolders = useMemo(() => foldersQuery.data?.folders ?? [], [foldersQuery.data?.folders]);

  const breadcrumbQuery = useQuery({
    queryKey: selectedFolderId
      ? queryKeys.webhard.folders.ancestors(selectedFolderId)
      : queryKeys.webhard.folders.ancestors('root'),
    queryFn: async () => {
      if (!selectedFolderId) return null;
      const response = await fetch(`/api/webhard/folders/${selectedFolderId}/ancestors`);
      if (!response.ok) {
        throw await createWebhardApiError(response, 'Failed to fetch folder ancestors');
      }
      return response.json() as Promise<FolderAncestorsResponse>;
    },
    enabled: selectedFolderId !== null,
    staleTime: WEBHARD_CACHE_CONFIG.folders.staleTime,
    gcTime: WEBHARD_CACHE_CONFIG.folders.gcTime,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => !isWebhardAuthError(error) && failureCount < 3,
  });

  const breadcrumbPath = useMemo(
    () => toBreadcrumbPath(breadcrumbQuery.data ?? null),
    [breadcrumbQuery.data]
  );
  const subFolders = useMemo(
    () =>
      isNewFilesMode
        ? []
        : sortWebhardFolders(
            allFolders.filter((folder) => folder.parent_id === selectedFolderId),
            sortBy,
            sortOrder
          ),
    [allFolders, isNewFilesMode, selectedFolderId, sortBy, sortOrder]
  );
  const mainFolderIds = useMemo(() => subFolders.map((folder) => folder.id), [subFolders]);

  return {
    allFolders,
    breadcrumbPath,
    foldersData: foldersQuery.data,
    hasAuthError:
      isWebhardAuthError(foldersQuery.error) || isWebhardAuthError(breadcrumbQuery.error),
    isLoadingFolders: foldersQuery.isLoading,
    isFetchingFolders: foldersQuery.isFetching,
    mainFolderIds,
    subFolders,
  };
}
