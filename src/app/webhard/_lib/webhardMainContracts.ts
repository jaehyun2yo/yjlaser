import { queryKeys } from '@/lib/react-query/queryKeys';
import type { SortBy } from '@/store/webhard';
import type { WebhardFolderDTO } from '@/app/webhard/_lib/types';

export const WEBHARD_VIRTUAL_LIST_THRESHOLD = 50;
export const WEBHARD_FORBIDDEN_DELETE_MESSAGE = '관리자에게 삭제 요청해주세요';
export const WEBHARD_FOLDER_DRAG_MIME = 'application/x-folder-id';
export const WEBHARD_SESSION_EXPIRED_REDIRECT_PATH = '/login';

export type WebhardUserType = 'admin' | 'company';
export type WebhardSortOrder = 'asc' | 'desc';

export interface WebhardMainScope {
  selectedFolderId: string | null;
  userType: WebhardUserType;
  userId: string;
}

export function getWebhardCompanyId({ userType, userId }: WebhardMainScope): string | undefined {
  return userType === 'company' ? userId : undefined;
}

export function getWebhardFilesQueryKey(scope: WebhardMainScope) {
  return queryKeys.webhard.files.list({
    folderId: scope.selectedFolderId || undefined,
    companyId: getWebhardCompanyId(scope),
  });
}

export function getWebhardNewFilesQueryKey(scope: WebhardMainScope) {
  return queryKeys.webhard.newFiles(getWebhardCompanyId(scope));
}

export function getWebhardFoldersPageQueryKey(scope: WebhardMainScope) {
  return queryKeys.webhard.folders.page(scope.selectedFolderId, getWebhardCompanyId(scope));
}

export function shouldUseVirtualizedFileList(fileCount: number): boolean {
  return fileCount > WEBHARD_VIRTUAL_LIST_THRESHOLD;
}

export function getDragFileIds(fileId: string, selectedFiles: ReadonlySet<string>): string[] {
  return selectedFiles.has(fileId) ? Array.from(selectedFiles) : [fileId];
}

export function getContextMenuSelectionCount({
  isFileSelected,
  selectedFileCount,
}: {
  isFileSelected: boolean;
  selectedFileCount: number;
}): number {
  return isFileSelected && selectedFileCount > 1 ? selectedFileCount : 1;
}

export type WebhardItemType = 'file' | 'folder';
export type WebhardItemClickSelectionAction =
  | 'clear'
  | 'select-file'
  | 'select-folder'
  | 'add-file'
  | 'add-folder'
  | 'remove-file'
  | 'remove-folder';

export function getWebhardItemClickSelectionAction({
  itemType,
  itemId,
  selectedFiles,
  selectedFolders,
}: {
  itemType: WebhardItemType;
  itemId: string;
  selectedFiles: ReadonlySet<string>;
  selectedFolders: ReadonlySet<string>;
}): WebhardItemClickSelectionAction {
  const selectedCount = selectedFiles.size + selectedFolders.size;
  const isSelected = itemType === 'file' ? selectedFiles.has(itemId) : selectedFolders.has(itemId);

  if (selectedCount === 0) {
    return itemType === 'file' ? 'select-file' : 'select-folder';
  }

  if (isSelected) {
    if (selectedCount === 1) {
      return 'clear';
    }

    return itemType === 'file' ? 'remove-file' : 'remove-folder';
  }

  return itemType === 'file' ? 'add-file' : 'add-folder';
}

export function shouldShowUploadLinkPrompt({
  previousIsUploading,
  isUploading,
  userType,
  hasRecentFile,
}: {
  previousIsUploading: boolean;
  isUploading: boolean;
  userType: 'admin' | 'company';
  hasRecentFile: boolean;
}): boolean {
  return previousIsUploading && !isUploading && userType === 'company' && hasRecentFile;
}

export function canCreateWebhardFolder(userType: WebhardUserType): boolean {
  return userType === 'admin';
}

export function canDeleteWebhardItems(userType: WebhardUserType): boolean {
  return userType === 'admin';
}

export function canMoveWebhardFolder(userType: WebhardUserType): boolean {
  return userType === 'admin';
}

export function canOpenWebhardFolderContextMenu(userType: WebhardUserType): boolean {
  return userType === 'admin';
}

export function getFolderDisplayDate(
  folder: Pick<WebhardFolderDTO, 'created_at' | 'latest_file_created_at'>
): string {
  return folder.latest_file_created_at ?? folder.created_at;
}

export function getFolderUploaderDisplayName(
  folder: Pick<WebhardFolderDTO, 'latest_file_uploader_display_name' | 'companies'>
): string {
  return folder.latest_file_uploader_display_name ?? folder.companies?.company_name ?? '-';
}

function toSortableTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function sortWebhardFolders<T extends WebhardFolderDTO>(
  folders: readonly T[],
  sortBy: SortBy,
  sortOrder: WebhardSortOrder
): T[] {
  return [...folders].sort((a, b) => {
    let comparison = 0;

    if (sortBy === 'name') {
      comparison = a.name.localeCompare(b.name, 'ko');
    } else if (sortBy === 'date') {
      comparison =
        toSortableTime(getFolderDisplayDate(a)) - toSortableTime(getFolderDisplayDate(b));
    } else if (sortBy === 'uploader') {
      comparison = getFolderUploaderDisplayName(a).localeCompare(
        getFolderUploaderDisplayName(b),
        'ko'
      );
    }

    if (comparison === 0) {
      comparison = a.name.localeCompare(b.name, 'ko');
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });
}

export function shouldHoldMainItemsUntilReady({
  isNewFilesMode,
  isLoadingFiles,
  isLoadingNewFiles,
  isLoadingFolders,
  hasCachedFiles,
}: {
  isNewFilesMode: boolean;
  isLoadingFiles: boolean;
  isLoadingNewFiles: boolean;
  isLoadingFolders: boolean;
  hasCachedFiles: boolean;
}): boolean {
  if (isNewFilesMode) {
    return isLoadingNewFiles && !hasCachedFiles;
  }

  return isLoadingFolders || (isLoadingFiles && !hasCachedFiles);
}

export function shouldRedirectWebhardAuthError(hasAuthError: boolean): boolean {
  return hasAuthError;
}
