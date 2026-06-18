import {
  WEBHARD_FORBIDDEN_DELETE_MESSAGE,
  WEBHARD_FOLDER_DRAG_MIME,
  WEBHARD_SESSION_EXPIRED_REDIRECT_PATH,
  WEBHARD_VIRTUAL_LIST_THRESHOLD,
  canCreateWebhardFolder,
  canDeleteWebhardItems,
  canMoveWebhardFolder,
  canOpenWebhardFolderContextMenu,
  getFolderDisplayDate,
  getFolderUploaderDisplayName,
  getContextMenuSelectionCount,
  getDragFileIds,
  getWebhardItemClickSelectionAction,
  getWebhardFilesQueryKey,
  getWebhardFoldersPageQueryKey,
  getWebhardNewFilesQueryKey,
  sortWebhardFolders,
  shouldHoldMainItemsUntilReady,
  shouldRedirectWebhardAuthError,
  shouldShowUploadLinkPrompt,
  shouldUseVirtualizedFileList,
} from '@/app/webhard/_lib/webhardMainContracts';
import { queryKeys } from '@/lib/react-query/queryKeys';

describe('AUDIT-14 WebhardMain split contracts', () => {
  it('keeps file, new-file, and folder query keys identical to queryKeys.webhard factories', () => {
    const options = {
      selectedFolderId: 'folder-a',
      userType: 'company' as const,
      userId: '42',
    };

    expect(getWebhardFilesQueryKey(options)).toEqual(
      queryKeys.webhard.files.list({ folderId: 'folder-a', companyId: '42' })
    );
    expect(getWebhardNewFilesQueryKey(options)).toEqual(queryKeys.webhard.newFiles('42'));
    expect(getWebhardFoldersPageQueryKey(options)).toEqual(
      queryKeys.webhard.folders.page('folder-a', '42')
    );
  });

  it('keeps admin query keys unscoped and root folder IDs represented as null/undefined consistently', () => {
    const options = {
      selectedFolderId: null,
      userType: 'admin' as const,
      userId: 'admin-1',
    };

    expect(getWebhardFilesQueryKey(options)).toEqual(
      queryKeys.webhard.files.list({ folderId: undefined, companyId: undefined })
    );
    expect(getWebhardNewFilesQueryKey(options)).toEqual(queryKeys.webhard.newFiles(undefined));
    expect(getWebhardFoldersPageQueryKey(options)).toEqual(
      queryKeys.webhard.folders.page(null, undefined)
    );
  });

  it('keeps the virtual list threshold at more than 50 files', () => {
    expect(WEBHARD_VIRTUAL_LIST_THRESHOLD).toBe(50);
    expect(shouldUseVirtualizedFileList(50)).toBe(false);
    expect(shouldUseVirtualizedFileList(51)).toBe(true);
  });

  it('keeps drag payload policy for selected and unselected files', () => {
    expect(getDragFileIds('a', new Set(['a', 'b']))).toEqual(['a', 'b']);
    expect(getDragFileIds('c', new Set(['a', 'b']))).toEqual(['c']);
  });

  it('keeps context menu selected-count policy', () => {
    expect(getContextMenuSelectionCount({ isFileSelected: true, selectedFileCount: 3 })).toBe(3);
    expect(getContextMenuSelectionCount({ isFileSelected: false, selectedFileCount: 3 })).toBe(1);
  });

  it('adds a plain click to existing file and folder selections instead of replacing them', () => {
    expect(
      getWebhardItemClickSelectionAction({
        itemType: 'file',
        itemId: 'file-b',
        selectedFiles: new Set(['file-a']),
        selectedFolders: new Set(),
      })
    ).toBe('add-file');

    expect(
      getWebhardItemClickSelectionAction({
        itemType: 'folder',
        itemId: 'folder-b',
        selectedFiles: new Set(['file-a']),
        selectedFolders: new Set(['folder-a']),
      })
    ).toBe('add-folder');
  });

  it('keeps re-click behavior explicit for selected items', () => {
    expect(
      getWebhardItemClickSelectionAction({
        itemType: 'file',
        itemId: 'file-a',
        selectedFiles: new Set(['file-a']),
        selectedFolders: new Set(),
      })
    ).toBe('clear');

    expect(
      getWebhardItemClickSelectionAction({
        itemType: 'folder',
        itemId: 'folder-a',
        selectedFiles: new Set(['file-a']),
        selectedFolders: new Set(['folder-a']),
      })
    ).toBe('remove-folder');
  });

  it('shows upload link prompt only after a company upload finishes with a recent file', () => {
    expect(
      shouldShowUploadLinkPrompt({
        previousIsUploading: true,
        isUploading: false,
        userType: 'company',
        hasRecentFile: true,
      })
    ).toBe(true);
    expect(
      shouldShowUploadLinkPrompt({
        previousIsUploading: true,
        isUploading: false,
        userType: 'admin',
        hasRecentFile: true,
      })
    ).toBe(false);
    expect(
      shouldShowUploadLinkPrompt({
        previousIsUploading: false,
        isUploading: false,
        userType: 'company',
        hasRecentFile: true,
      })
    ).toBe(false);
  });

  it('holds the main list until file and folder queries are ready together', () => {
    expect(
      shouldHoldMainItemsUntilReady({
        isNewFilesMode: false,
        isLoadingFiles: false,
        isLoadingNewFiles: false,
        isLoadingFolders: true,
        hasCachedFiles: true,
      })
    ).toBe(true);

    expect(
      shouldHoldMainItemsUntilReady({
        isNewFilesMode: false,
        isLoadingFiles: true,
        isLoadingNewFiles: false,
        isLoadingFolders: false,
        hasCachedFiles: false,
      })
    ).toBe(true);

    expect(
      shouldHoldMainItemsUntilReady({
        isNewFilesMode: false,
        isLoadingFiles: false,
        isLoadingNewFiles: false,
        isLoadingFolders: false,
        hasCachedFiles: false,
      })
    ).toBe(false);
  });

  it('redirects expired webhard sessions to login instead of rendering the empty state', () => {
    expect(WEBHARD_SESSION_EXPIRED_REDIRECT_PATH).toBe('/login');
    expect(shouldRedirectWebhardAuthError(true)).toBe(true);
    expect(shouldRedirectWebhardAuthError(false)).toBe(false);
  });

  it('keeps destructive folder/file actions admin-only in the UI contract', () => {
    expect(canCreateWebhardFolder('admin')).toBe(true);
    expect(canCreateWebhardFolder('company')).toBe(false);
    expect(canDeleteWebhardItems('admin')).toBe(true);
    expect(canDeleteWebhardItems('company')).toBe(false);
    expect(canMoveWebhardFolder('admin')).toBe(true);
    expect(canMoveWebhardFolder('company')).toBe(false);
    expect(canOpenWebhardFolderContextMenu('admin')).toBe(true);
    expect(canOpenWebhardFolderContextMenu('company')).toBe(false);
    expect(WEBHARD_FORBIDDEN_DELETE_MESSAGE).toBe('관리자에게 삭제 요청해주세요');
  });

  it('uses a dedicated folder drag MIME type separate from file drag payloads', () => {
    expect(WEBHARD_FOLDER_DRAG_MIME).toBe('application/x-folder-id');
  });

  it('sorts folders by displayed upload date with folder-created fallback', () => {
    const folders = [
      {
        id: 'old-empty',
        name: '빈폴더',
        parent_id: null,
        company_id: 1,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-11T00:00:00.000Z',
        deleted_at: null,
      },
      {
        id: 'latest-file',
        name: '최신파일폴더',
        parent_id: null,
        company_id: 1,
        created_at: '2026-05-02T00:00:00.000Z',
        updated_at: '2026-05-02T00:00:00.000Z',
        deleted_at: null,
        latest_file_created_at: '2026-05-10T00:00:00.000Z',
      },
      {
        id: 'older-file',
        name: '이전파일폴더',
        parent_id: null,
        company_id: 1,
        created_at: '2026-05-03T00:00:00.000Z',
        updated_at: '2026-05-03T00:00:00.000Z',
        deleted_at: null,
        latest_file_created_at: '2026-05-08T00:00:00.000Z',
      },
    ];

    expect(sortWebhardFolders(folders, 'date', 'desc').map((folder) => folder.id)).toEqual([
      'latest-file',
      'older-file',
      'old-empty',
    ]);
    expect(getFolderDisplayDate(folders[0])).toBe('2026-05-01T00:00:00.000Z');
    expect(getFolderDisplayDate(folders[1])).toBe('2026-05-10T00:00:00.000Z');
  });

  it('sorts folders by uploader display name and falls back to company name', () => {
    const folders = [
      {
        id: 'company-fallback',
        name: '회사명폴더',
        parent_id: null,
        company_id: 1,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
        deleted_at: null,
        companies: { company_name: '나회사' },
      },
      {
        id: 'admin-uploader',
        name: '관리자폴더',
        parent_id: null,
        company_id: 1,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
        deleted_at: null,
        latest_file_uploader_display_name: '관리자',
      },
    ];

    expect(sortWebhardFolders(folders, 'uploader', 'asc').map((folder) => folder.id)).toEqual([
      'admin-uploader',
      'company-fallback',
    ]);
    expect(getFolderUploaderDisplayName(folders[0])).toBe('나회사');
    expect(getFolderUploaderDisplayName(folders[1])).toBe('관리자');
  });
});
