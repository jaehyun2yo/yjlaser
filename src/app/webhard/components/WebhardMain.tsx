'use client';

import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { FaUpload, FaDownload, FaTrash, FaFolderPlus } from 'react-icons/fa';
import { BatchCountProvider } from './FolderTree';
import { type ProgressItem } from './DownloadProgressModal';
import { canPreview } from './FilePreviewTooltip';
import { DxfPreviewModal } from './DxfPreviewModal';
import { WebhardNav } from './WebhardNav';
import { FolderUploadModal, type FileWithPath } from './FolderUploadModal';
import { WebhardMobileNav } from './WebhardMobileNav';
import { Badge } from '@/components/Badge';
import { useToast } from '@/hooks/useToast';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { usePrefetchAllBadgeCounts } from '@/lib/hooks/useUndownloadedCount';
import { useWebhardFileRealtime } from '@/lib/hooks/useWebhardFileRealtime';
import { useWebhardFolderRealtime } from '@/lib/hooks/useWebhardFolderRealtime';
import { useWebhardSettings } from '@/lib/hooks/useWebhardSettings';
import { WebhardFile } from '@/types/webhard';
import { useWebhardFolder } from '@/store/webhard-folder';
import {
  useWebhardSelectionStore,
  useWebhardModalStore,
  useWebhardLayoutStore,
  useWebhardNavigationStore,
  useWebhardDragDropStore,
} from '@/store/webhard';
import type { SortBy } from '@/store/webhard';
import { WebhardToolbar } from './WebhardToolbar';
import { WebhardBreadcrumb } from './WebhardBreadcrumb';
import { WebhardEmptyState } from './WebhardEmptyState';
import { WebhardColumnHeader } from './WebhardColumnHeader';
import { WebhardDragSelection } from './WebhardDragSelection';
import { WebhardContextMenu } from './WebhardContextMenu';
import { WebhardFileItem } from './WebhardFileItem';
import { WebhardFolderItem, type WebhardFolderItemFolder } from './WebhardFolderItem';
import { InlineLoading } from '@/components/ui/LogoLoading';
import { VirtualizedFileList } from './VirtualizedFileList';
import { WebhardProvider } from './context/WebhardContext';
import { WebhardSidebar } from './WebhardSidebar';
import { SidebarResizer } from './SidebarResizer';
import { ModalContainer } from './containers';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';
import { fetchWebhardFiles } from '@/lib/api/webhard';
import { getFileIcon } from '@/lib/utils/fileIcons';
import { batchMoveFiles } from '@/lib/api/webhard-api-client';
import { batchSoftDeleteFolders } from '@/app/actions/webhard-batch-delete';
import type { DeleteTarget } from './ConfirmDeleteModal';
import {
  COMPANY_ROOT_FOLDER_DELETE_BLOCKED_CODE,
  CompanyRootFolderDeleteBlockedModal,
  type CompanyRootFolderDeleteBlockedMatch,
  toCompanyRootFolderDeleteBlockedMatch,
} from '@/app/webhard/components/CompanyRootFolderDeleteBlockedModal';
import {
  isFileNew,
  invalidateBadgeCounts,
  invalidateAfterDelete,
  invalidateAfterFolderMove,
  invalidateAfterMove,
  invalidateStorageUsage,
  WEBHARD_CACHE_CONFIG,
  type WebhardFolder,
} from '@/app/webhard/_lib';
import { useFileUpload } from '@/app/webhard/hooks/useFileUpload';
import { useFileBatchDownload } from '@/app/webhard/hooks/useFileBatchDownload';
import { useFileRename } from '@/app/webhard/hooks/useFileRename';
import { useWebhardDragSelection } from '@/app/webhard/hooks/useWebhardDragSelection';
import { useWebhardFileIdHighlight } from '@/app/webhard/hooks/useWebhardFileIdHighlight';
import { useWebhardFilesQuery } from '@/app/webhard/hooks/useWebhardFilesQuery';
import { useWebhardFoldersQuery } from '@/app/webhard/hooks/useWebhardFoldersQuery';
import { useWebhardUploadPrompt } from '@/app/webhard/hooks/useWebhardUploadPrompt';
import {
  WEBHARD_FORBIDDEN_DELETE_MESSAGE,
  WEBHARD_FOLDER_DRAG_MIME,
  WEBHARD_SESSION_EXPIRED_REDIRECT_PATH,
  canCreateWebhardFolder,
  canDeleteWebhardItems,
  canMoveWebhardFolder,
  canOpenWebhardFolderContextMenu,
  getContextMenuSelectionCount,
  getDragFileIds,
  getWebhardItemClickSelectionAction,
  shouldRedirectWebhardAuthError,
  shouldHoldMainItemsUntilReady,
  shouldUseVirtualizedFileList,
} from '@/app/webhard/_lib/webhardMainContracts';
import { logger } from '@/lib/utils/logger';
import { socketManager } from '@/lib/socket/socket-manager';
import { LinkFileToContactModal } from '@/components/modals/LinkFileToContactModal';

const log = logger.createLogger('WebhardMain');

interface WebhardMainProps {
  userType: 'admin' | 'company';
  userId: string;
}

interface BatchDeleteFilesResponse {
  success?: boolean;
  processed?: number;
  filesDeleted?: number;
  deleted?: number;
  failed?: number;
  errors?: string[];
  error?: string;
  message?: string;
}

interface PendingDeleteSelection {
  files: { id: string; name: string }[];
  folders: string[];
}

interface CompanyRootDeleteBlockState {
  matches: CompanyRootFolderDeleteBlockedMatch[];
  remainingDelete?: {
    targets: DeleteTarget[];
    selection: PendingDeleteSelection;
  };
}

type WebhardFolderDeleteCandidate = Pick<
  WebhardFolderItemFolder,
  'id' | 'name' | 'parent_id' | 'company_id' | 'companies'
>;

function getBatchDeleteProcessedCount(result: BatchDeleteFilesResponse): number {
  return result.filesDeleted ?? result.processed ?? result.deleted ?? 0;
}

function getBatchDeleteErrorMessage(result: BatchDeleteFilesResponse): string {
  if (result.errors && result.errors.length > 0) {
    return result.errors.join(', ');
  }

  return result.error || result.message || 'Failed to delete files';
}

function assertBatchDeleteFilesResult(
  result: BatchDeleteFilesResponse,
  expectedFileCount: number
): void {
  const processedCount = getBatchDeleteProcessedCount(result);
  const failedCount = result.failed ?? 0;

  if (result.success === false || failedCount > 0) {
    throw new Error(getBatchDeleteErrorMessage(result));
  }

  if (processedCount < expectedFileCount) {
    throw new Error(`Deleted ${processedCount} of ${expectedFileCount} selected files`);
  }
}

function isCompanyRootFolder(
  folder: Pick<WebhardFolderDeleteCandidate, 'company_id' | 'parent_id'>
) {
  return folder.company_id !== undefined && folder.company_id !== null && folder.parent_id === null;
}

function toCompanyRootFolderMatchFromFolder(
  folder: Pick<WebhardFolderDeleteCandidate, 'id' | 'name' | 'company_id' | 'companies'>
): CompanyRootFolderDeleteBlockedMatch {
  return {
    folderId: folder.id,
    folderName: folder.name,
    companyId: folder.company_id ?? undefined,
    companyName:
      folder.companies?.company_name ??
      (folder.company_id !== undefined && folder.company_id !== null
        ? `업체 ID ${folder.company_id}`
        : undefined),
    redirectTo:
      folder.company_id !== undefined && folder.company_id !== null
        ? `/admin/companies/${folder.company_id}`
        : undefined,
  };
}

export function WebhardMain({ userType, userId }: WebhardMainProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // viewMode는 useWebhardLayoutStore에서 관리
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // DXF 미리보기 모달 상태
  const [dxfPreviewFile, setDxfPreviewFile] = useState<WebhardFile | null>(null);

  // 🚀 Selection Store (Zustand)
  const {
    selectedFiles,
    selectedFolders,
    lastClickedFileIndex,
    selectFile,
    toggleFile,
    selectRange,
    selectAll,
    clearSelection,
    removeFromSelection,
    addToSelection,
    setSelection,
    addToSelectionBulk,
    removeFromSelectionBulk,
    setLastClickedIndex,
    selectFolder,
    toggleFolder,
    selectAllFolders,
    isFolderSelected,
  } = useWebhardSelectionStore();

  // 🚀 Modal Store (Zustand)
  const { activeModal, openModal, closeModal, isModalOpen } = useWebhardModalStore();

  // 🚀 Layout Store (Zustand)
  const {
    viewMode,
    sidebarWidth,
    setSidebarWidth,
    isSidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebar,
    fileNameColWidth,
    dateColWidth,
    setColumnWidth,
    resizingColumn,
    startResizing,
    stopResizing,
  } = useWebhardLayoutStore();

  // 🚀 Navigation Store (Zustand)
  const { sortBy, sortOrder, isNewFilesMode, setSort, setNewFilesMode } =
    useWebhardNavigationStore();

  // 🚀 DragDrop Store (Zustand)
  // isDragSelecting, dragSelectStart, dragSelectEnd, startDragSelect, updateDragSelect, endDragSelect, getBoundingRect는 useWebhardDragSelection 훅에서 관리
  const {
    draggedFileId,
    dragOverFolderId,
    isExternalDragOver,
    startDrag,
    endDrag,
    setDragOver,
    setExternalDragOver,
  } = useWebhardDragDropStore();

  // 🚀 모든 뱃지 카운트를 한 번에 프리패칭 (페이지 진입 시)
  // 백그라운드에서 로드 - UI 블로킹 없음 (Next.js loading.tsx가 초기 로딩 처리)
  const badgeCompanyId = userType === 'company' ? userId : undefined;
  const canMoveFolders = canMoveWebhardFolder(userType);
  usePrefetchAllBadgeCounts({ companyId: badgeCompanyId });
  // draggedFileId, dragOverFolderId는 DragDrop Store에서 관리
  const [contextMenu, setContextMenu] = useState<{
    file: WebhardFile | null;
    folder: WebhardFolderItemFolder | null;
    x: number;
    y: number;
    selectedCount: number;
    mode: 'file' | 'folder' | 'empty-space';
  } | null>(null);

  // 새 폴더 생성 인라인 입력 상태
  const [isCreatingNewFolder, setIsCreatingNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const folderEditInputRef = useRef<HTMLInputElement>(null);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);

  // 공유 링크 상태
  const [shareLinkFile, setShareLinkFile] = useState<{
    path: string;
    name: string;
    companyId: number | null;
  } | null>(null);

  // editingFileId, editingFileName은 useFileRename 훅에서 관리
  // sidebarWidth, isSidebarCollapsed, fileNameColWidth, dateColWidth, resizingColumn은 Layout Store에서 관리
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false); // 모바일/태블릿 사이드바 상태
  // isExternalDragOver는 DragDrop Store에서 관리 (외부 파일 업로드 드래그 감지용)
  // sortBy, sortOrder, isNewFilesMode는 Navigation Store에서 관리
  // 모달 상태는 Modal Store에서 관리 (settings, search, trash, move, download, delete, moveProgress)
  // lastClickedFileIndex는 useWebhardSelectionStore에서 관리

  // 삭제 진행 상태 (모달은 Modal Store에서 관리)
  const [deleteItems, setDeleteItems] = useState<ProgressItem[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // 삭제 확인 모달 상태
  const [deleteTargets, setDeleteTargets] = useState<DeleteTarget[]>([]);
  const pendingDeleteRef = useRef<PendingDeleteSelection>({ files: [], folders: [] });
  const [companyRootDeleteBlock, setCompanyRootDeleteBlock] =
    useState<CompanyRootDeleteBlockState | null>(null);

  // 이동 진행 상태 (모달은 Modal Store에서 관리)
  const [moveItems, setMoveItems] = useState<ProgressItem[]>([]);
  const [isMoving, setIsMoving] = useState(false);

  // 폴더 드래그 앤 드롭 업로드 상태
  const [isFolderUploadOpen, setIsFolderUploadOpen] = useState(false);
  const [droppedFolderFiles, setDroppedFolderFiles] = useState<FileWithPath[]>([]);

  // 드래그 선택 상태는 useWebhardDragSelection 훅에서 관리

  // Track WebSocket connection status for adaptive polling fallback
  const [socketConnected, setSocketConnected] = useState(false);
  useEffect(() => {
    const onStatus = (status: import('@/lib/socket/socket-manager').ConnectionStatus) => {
      setSocketConnected(status === 'connected');
    };
    // Subscribe without opening a new connection — piggyback on the existing one
    const existing = socketManager.getSocket('');
    if (existing?.connected) setSocketConnected(true);
    socketManager.connect('', onStatus);
    return () => {
      socketManager.disconnect('', onStatus);
    };
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  // editInputRef는 useFileRename 훅에서 관리
  const fileListContainerRef = useRef<HTMLDivElement>(null); // 파일 목록 컨테이너 ref
  const headerContainerRef = useRef<HTMLDivElement>(null); // 헤더 컨테이너 ref (컬럼 리사이즈용)
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  // selectedFolderId를 ref로 추적 (stale closure 방지)
  const selectedFolderIdRef = useRef(selectedFolderId);
  useEffect(() => {
    selectedFolderIdRef.current = selectedFolderId;
  }, [selectedFolderId]);

  // 🚀 실시간 파일 업데이트 구독 (정밀한 캐시 무효화)
  useWebhardFileRealtime({
    currentFolderId: selectedFolderId,
    companyId: userType === 'company' ? userId : undefined,
    onNewFile: (file) => {
      log.debug('New file received:', file.name);
    },
    onFileDeleted: (fileId) => {
      // 삭제된 파일이 선택되어 있었다면 선택 해제
      removeFromSelection(fileId);
    },
  });

  // 🚀 실시간 폴더 업데이트 구독
  useWebhardFolderRealtime({
    companyId: userType === 'company' ? userId : undefined,
  });

  // ESC 키 핸들러는 editingFileId 사용 후 정의됨 (아래 참조)

  // 🚀 드래그 선택 훅
  const {
    isDragSelecting,
    justFinishedDragSelectRef,
    handleDragSelectStart: hookDragSelectStart,
    getBoundingRect,
  } = useWebhardDragSelection({
    containerRef: fileListContainerRef,
    files: [], // 훅 내부에서 DOM 쿼리로 파일 찾음
  });

  const ignoreFileHover = useCallback(() => {}, []);

  // 드래그 선택 시작 래퍼 (모달 체크)
  const handleDragSelectStart = useCallback(
    (e: React.MouseEvent) => {
      // 모달이 열려있으면 무시 (Modal Store 사용)
      if (activeModal !== null) return;
      // 훅의 핸들러 호출
      hookDragSelectStart(e as React.MouseEvent<HTMLDivElement>);
    },
    [activeModal, hookDragSelectStart]
  );

  // 드래그 선택 완료 시 마지막 클릭 인덱스 초기화
  const prevIsDragSelectingRef = useRef(isDragSelecting);
  useEffect(() => {
    // isDragSelecting이 true에서 false로 변경될 때
    if (prevIsDragSelectingRef.current && !isDragSelecting) {
      setLastClickedIndex(null);
    }
    prevIsDragSelectingRef.current = isDragSelecting;
  }, [isDragSelecting, setLastClickedIndex]);

  // URL searchParams 변경 시 selectedFolderId 동기화
  // - 초기 로드 및 검색 결과 클릭(router.push) 모두 처리
  // - selectedFolderIdRef와 비교하여 중복 업데이트 방지 (handleFolderSelect가 이미 처리한 경우)
  useEffect(() => {
    const folderIdFromUrl = searchParams.get('folderId') || null;
    if (folderIdFromUrl !== selectedFolderIdRef.current) {
      setSelectedFolderId(folderIdFromUrl);
      setNewFilesMode(false);
      clearSelection();
    }
  }, [searchParams, setNewFilesMode, clearSelection]);

  // 브라우저 뒤로가기/앞으로가기 처리
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const folderIdFromUrl = params.get('folderId') || null;
      if (folderIdFromUrl !== selectedFolderIdRef.current) {
        setSelectedFolderId(folderIdFromUrl);
        clearSelection();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [clearSelection]);

  // 폴더 프리페칭 함수 (마우스 호버 시 미리 데이터 로드)
  const prefetchFolder = useCallback(
    (folderId: string | null) => {
      const queryKey = queryKeys.webhard.files.list({
        folderId: folderId || undefined,
        companyId: userType === 'company' ? userId : undefined,
      });

      // 캐시에 데이터가 있으면 프리페칭 스킵
      const cached = queryClient.getQueryData(queryKey);
      if (cached) {
        return;
      }

      // 없으면 프리페칭
      queryClient.prefetchQuery({
        queryKey,
        queryFn: () =>
          fetchWebhardFiles({
            folderId: folderId || undefined,
            companyId: userType === 'company' ? userId : undefined,
            sortBy: 'date', // 기본값 고정 (클라이언트에서 재정렬)
            sortOrder: 'desc',
            limit: 50,
          }),
        staleTime: WEBHARD_CACHE_CONFIG.files.staleTime,
      });
    },
    [queryClient, userType, userId]
  );

  // 폴더 드래그 앤 드롭 처리: DataTransferItem에서 파일 목록 추출
  const processDroppedItems = useCallback(
    async (dataTransfer: DataTransfer): Promise<{ isFolder: boolean; files: FileWithPath[] }> => {
      const items = dataTransfer.items;
      const filesWithPaths: FileWithPath[] = [];
      let hasDirectory = false;

      // webkitGetAsEntry를 지원하는지 확인
      if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
        const entries: FileSystemEntry[] = [];

        // 모든 항목의 entry 수집
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry();
          if (entry) {
            entries.push(entry);
            if (entry.isDirectory) {
              hasDirectory = true;
            }
          }
        }

        // 폴더가 하나라도 있으면 폴더 업로드 모드
        if (hasDirectory) {
          // 재귀적으로 모든 파일 추출
          const readDirectory = async (
            dirEntry: FileSystemDirectoryEntry,
            path: string
          ): Promise<void> => {
            return new Promise((resolve, reject) => {
              const reader = dirEntry.createReader();
              const readEntries = () => {
                reader.readEntries(async (entries) => {
                  if (entries.length === 0) {
                    resolve();
                    return;
                  }
                  for (const entry of entries) {
                    const entryPath = path ? `${path}/${entry.name}` : entry.name;
                    if (entry.isFile) {
                      const fileEntry = entry as FileSystemFileEntry;
                      const file = await new Promise<File>((res, rej) => {
                        fileEntry.file(res, rej);
                      });
                      filesWithPaths.push({ file, relativePath: entryPath });
                    } else if (entry.isDirectory) {
                      await readDirectory(entry as FileSystemDirectoryEntry, entryPath);
                    }
                  }
                  readEntries(); // 계속 읽기 (100개씩 반환되는 경우 대비)
                }, reject);
              };
              readEntries();
            });
          };

          // 모든 entry 처리
          for (const entry of entries) {
            if (entry.isDirectory) {
              await readDirectory(entry as FileSystemDirectoryEntry, entry.name);
            } else if (entry.isFile) {
              const fileEntry = entry as FileSystemFileEntry;
              const file = await new Promise<File>((res, rej) => {
                fileEntry.file(res, rej);
              });
              filesWithPaths.push({ file, relativePath: entry.name });
            }
          }

          return { isFolder: true, files: filesWithPaths };
        }
      }

      // 폴더가 없으면 일반 파일 업로드
      return { isFolder: false, files: [] };
    },
    []
  );

  // 폴더 선택 시 즉시 상태 업데이트 + URL 변경 (메모이제이션)
  const handleFolderSelect = useCallback((folderId: string | null) => {
    // 새 파일 모드 해제 (폴더 선택 시 일반 모드로 전환)
    setNewFilesMode(false);

    // 🚀 폴더 변경 시 파일 선택 초기화
    clearSelection();

    // 🚀 즉시 로컬 상태 업데이트 (UI 즉시 반응)
    setSelectedFolderId(folderId);

    // URLSearchParams를 사용하되, 새로 생성하여 일관성 보장
    const params = new URLSearchParams();

    // folderId 먼저 추가
    if (folderId) {
      params.set('folderId', folderId);
    }

    // URL 생성 (파라미터 없으면 빈 문자열)
    const queryString = params.toString();
    const newUrl = queryString ? `/webhard?${queryString}` : '/webhard';

    // pushState로 URL만 변경 (Next.js 라우터 우회 → 즉시 반응)
    // React Query로 데이터를 관리하므로 Next.js 프리페칭 불필요
    window.history.pushState(null, '', newUrl);
  }, []);

  const handleFolderItemClick = useCallback(
    (e: React.MouseEvent, folderId: string) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'BUTTON' ||
        target.closest('button') ||
        target.closest('input')
      ) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        toggleFolder(folderId);
        return;
      }

      const selectionAction = getWebhardItemClickSelectionAction({
        itemType: 'folder',
        itemId: folderId,
        selectedFiles,
        selectedFolders,
      });

      if (selectionAction === 'clear') {
        clearSelection();
      } else if (selectionAction === 'select-folder') {
        selectFolder(folderId);
      } else if (selectionAction === 'add-folder' || selectionAction === 'remove-folder') {
        toggleFolder(folderId);
      }
    },
    [clearSelection, selectFolder, selectedFiles, selectedFolders, toggleFolder]
  );

  const {
    files,
    filesQueryKey,
    hasAuthError: hasFilesAuthError,
    isLoadingFiles,
    isLoadingNewFiles,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useWebhardFilesQuery({
    selectedFolderId,
    userType,
    userId,
    isNewFilesMode,
    sortBy,
    sortOrder,
    socketConnected,
  });

  const {
    allFolders,
    breadcrumbPath,
    hasAuthError: hasFoldersAuthError,
    isLoadingFolders,
    mainFolderIds,
    subFolders,
  } = useWebhardFoldersQuery({
    selectedFolderId,
    userType,
    userId,
    isNewFilesMode,
    sortBy,
    sortOrder,
  });
  const hasWebhardAuthError = hasFilesAuthError || hasFoldersAuthError;

  useEffect(() => {
    if (!shouldRedirectWebhardAuthError(hasWebhardAuthError)) return;

    router.replace(WEBHARD_SESSION_EXPIRED_REDIRECT_PATH);
  }, [hasWebhardAuthError, router]);

  // URL 쿼리 fileId → 파일 하이라이트 (task 22 contact-webhard-navigate)
  useWebhardFileIdHighlight(selectedFolderId, files);

  // 스켈레톤 표시 여부 결정 (캐시에 데이터가 있으면 스켈레톤 숨김)
  const shouldShowSkeleton = useMemo(() => {
    // 새 파일 모드와 일반 모드에 따라 다른 쿼리 키로 캐시 확인
    let cachedFiles: unknown;
    if (isNewFilesMode) {
      // 새 파일 모드: 별도 쿼리 키 사용 (무한 스크롤 데이터 구조)
      const newFilesQueryKey = queryKeys.webhard.newFiles(
        userType === 'company' ? userId : undefined
      );
      cachedFiles = queryClient.getQueryData(newFilesQueryKey);
    } else {
      // 일반 모드: filesQueryKey 사용으로 정확한 캐시 조회
      // 캐시에 데이터가 있으면 스켈레톤 표시 안 함 (프리페칭된 데이터 활용, 깜빡임 방지)
      cachedFiles = queryClient.getQueryData<{ files: WebhardFile[] }>(filesQueryKey);
    }

    return (
      !hasWebhardAuthError &&
      shouldHoldMainItemsUntilReady({
        isNewFilesMode,
        isLoadingFiles,
        isLoadingNewFiles,
        isLoadingFolders,
        hasCachedFiles: Boolean(cachedFiles),
      })
    );
  }, [
    hasWebhardAuthError,
    isLoadingFiles,
    isLoadingNewFiles,
    isLoadingFolders,
    isNewFilesMode,
    queryClient,
    filesQueryKey,
    userType,
    userId,
  ]);

  // 새 파일 판단 함수는 @/app/webhard/_lib에서 import (isFileNew)

  // 폴더 변경 시 파일 목록 자동 새로고침 (React Query가 자동으로 처리)

  // 파일 드래그 시작 (선택된 파일들 포함)
  const handleDragStart = useCallback(
    (e: React.DragEvent, fileId: string) => {
      startDrag(fileId);
      e.dataTransfer.effectAllowed = 'move';

      // 드래그하는 파일이 선택 목록에 있으면 선택된 모든 파일을 이동 (캐싱된 배열 사용)
      // 선택 목록에 없으면 해당 파일만 이동
      const fileIdsToMove = getDragFileIds(fileId, selectedFiles);

      log.debug('DragStart fileIds:', fileIdsToMove);

      // JSON으로 여러 파일 ID 전달
      e.dataTransfer.setData('application/json', JSON.stringify(fileIdsToMove));
      e.dataTransfer.setData('text/plain', fileId); // 단일 파일 ID도 호환성 위해 유지
    },
    [startDrag, selectedFiles]
  );

  // 파일 드래그 종료
  const handleDragEnd = () => {
    endDrag();
  };

  // 폴더 핸들을 Zustand store에서 가져오기
  const { folderHandle, permissionStatus, requestPermission, restoreFolderHandle, isHandleLoaded } =
    useWebhardFolder();

  // 웹하드 설정 (React Query 캐싱 - 중복 API 호출 방지)
  const { settings: webhardSettings } = useWebhardSettings();
  const notificationSettings = {
    notifyOnDownloadComplete: webhardSettings.notifyOnDownloadComplete,
    notifyOnUploadComplete: webhardSettings.notifyOnUploadComplete,
    notifyOnError: webhardSettings.notifyOnError,
  };

  // 🚀 파일 업로드 훅
  const { isUploading, uploadFiles: handleFileUpload } = useFileUpload({
    selectedFolderId,
    userType,
    userId,
    notificationSettings,
    fileInputRef,
  });

  const { companyNameForLink, linkModalOpen, linkPromptFile, setLinkModalOpen, setLinkPromptFile } =
    useWebhardUploadPrompt({
      files,
      isUploading,
      userType,
      userId,
    });

  // 🚀 파일 일괄 다운로드 훅
  const { isDownloading, downloadItems, downloadFiles } = useFileBatchDownload({
    filesQueryKey,
    notificationSettings,
    folderHandleOptions: {
      folderHandle,
      permissionStatus,
      requestPermission,
    },
    openModal: openModal as (modal: string, data?: Record<string, unknown>) => void,
    clearSelection,
  });

  // 선택된 파일들 일괄 다운로드 래퍼
  const handleBatchDownload = useCallback(() => {
    if (selectedFiles.size === 0) return;
    const selectedFileObjects = files.filter((f) => selectedFiles.has(f.id));
    downloadFiles(selectedFileObjects);
  }, [selectedFiles, files, downloadFiles]);

  // 🚀 파일 이름 변경 훅
  const {
    editingFileId,
    editingFileName,
    startRename,
    finishRename,
    cancelRename,
    setEditingFileName,
    editInputRef,
  } = useFileRename({
    filesQueryKey,
    files,
    notificationSettings,
  });

  // 파일 이름 수정 시작 래퍼 (컨텍스트 메뉴 닫기 포함)
  const handleStartRename = useCallback(
    (file: WebhardFile) => {
      setContextMenu(null);
      startRename(file);
    },
    [startRename]
  );

  // 파일 이름 수정 완료 래퍼
  const handleFinishRename = useCallback(
    (fileId: string) => {
      finishRename(fileId);
    },
    [finishRename]
  );

  // 파일 이름 수정 취소 래퍼
  const handleCancelRename = useCallback(() => {
    cancelRename();
  }, [cancelRename]);

  const showAdminDeleteRequest = useCallback(() => {
    showError('삭제 권한 없음', WEBHARD_FORBIDDEN_DELETE_MESSAGE);
  }, [showError]);

  const handleStartRenameFolder = useCallback((folder: WebhardFolderItemFolder) => {
    setContextMenu(null);
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
  }, []);

  const handleCancelRenameFolder = useCallback(() => {
    setEditingFolderId(null);
    setEditingFolderName('');
  }, []);

  const handleFinishRenameFolder = useCallback(
    async (folderId: string) => {
      const trimmedName = editingFolderName.trim();
      if (!trimmedName) {
        handleCancelRenameFolder();
        return;
      }

      try {
        const response = await fetch(`/api/webhard/folders/${folderId}/rename`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmedName }),
        });

        if (!response.ok) {
          const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(errorData?.error || '폴더 이름 변경 중 오류가 발생했습니다.');
        }

        setEditingFolderId(null);
        setEditingFolderName('');
        await queryClient.invalidateQueries({ queryKey: queryKeys.webhard.folders.all() });
        success('성공', '폴더 이름이 변경되었습니다.');
      } catch (error) {
        showError(
          '오류',
          error instanceof Error ? error.message : '폴더 이름 변경 중 오류가 발생했습니다.'
        );
      }
    },
    [editingFolderName, handleCancelRenameFolder, queryClient, showError, success]
  );

  useEffect(() => {
    if (editingFolderId && folderEditInputRef.current) {
      folderEditInputRef.current.focus();
      folderEditInputRef.current.select();
    }
  }, [editingFolderId]);

  // ESC 키로 파일 선택 해제 (editingFileId 훅 이후에 정의)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC 키 && 선택된 파일이 있을 때 && 모달이 열려있지 않을 때
      if (
        e.key === 'Escape' &&
        (selectedFiles.size > 0 || selectedFolders.size > 0) &&
        activeModal === null && // Modal Store 사용
        !editingFileId
      ) {
        e.preventDefault();
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFiles.size, selectedFolders.size, activeModal, editingFileId, clearSelection]);

  // 컴포넌트 마운트 시 IndexedDB에서 폴더 핸들 복원
  useEffect(() => {
    if (!isHandleLoaded) {
      restoreFolderHandle();
    }
  }, [isHandleLoaded, restoreFolderHandle]);

  // 폴더 핸들로 파일 저장 (권한 확인 포함)
  const saveToFolder = useCallback(
    async (blob: Blob, filename: string): Promise<boolean> => {
      if (!folderHandle) return false;

      try {
        // 권한 확인 및 요청
        if (permissionStatus !== 'granted') {
          const granted = await requestPermission();
          if (!granted) {
            return false;
          }
        }

        const fileHandle = await folderHandle.getFileHandle(filename || 'download', {
          create: true,
        });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch (error) {
        log.error('Failed to save to folder:', error);
        return false;
      }
    },
    [folderHandle, permissionStatus, requestPermission]
  );

  // Signed URL을 통한 직접 다운로드 (서버 우회, 2-3배 빠름)
  const downloadViaSignedUrl = useCallback(
    async (url: string, filename: string): Promise<boolean> => {
      try {
        // folderHandle이 있으면 해당 폴더에 저장
        if (folderHandle) {
          const response = await fetch(url, { mode: 'cors' });
          if (!response.ok) throw new Error('Failed to fetch file');
          const blob = await response.blob();
          return await saveToFolder(blob, filename);
        }

        // folderHandle이 없으면 브라우저 기본 다운로드 (anchor 태그 사용)
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
      } catch (error) {
        log.error('Signed URL download failed:', error);
        return false;
      }
    },
    [folderHandle, saveToFolder]
  );

  // 파일 더블클릭 시 다운로드 (Signed URL 사용, 서버 우회로 2-3배 빠름)
  const handleFileDoubleClick = useCallback(
    async (file: WebhardFile) => {
      try {
        // Signed URL 모드로 다운로드 URL 요청 (서버 프록시 우회)
        const response = await fetch(`/api/webhard/download?fileId=${file.id}&mode=signedUrl`);
        if (!response.ok) {
          throw new Error('Failed to get download URL');
        }

        const { signedUrl, filename } = await response.json();
        const downloadFilename = filename || file.original_name || 'download';

        // Signed URL로 직접 다운로드 (folderHandle 여부는 내부에서 처리)
        const downloadSuccess = await downloadViaSignedUrl(signedUrl, downloadFilename);

        if (downloadSuccess) {
          // 다운로드 완료 알림 (설정에 따라)
          if (notificationSettings.notifyOnDownloadComplete) {
            success('다운로드 완료', `${file.original_name}이 저장되었습니다.`);
          }

          // 다운로드 완료 후 즉시 UI 업데이트 (Optimistic Update)
          // filesQueryKey를 사용하여 sortBy, sortOrder 포함한 정확한 캐시 키 사용
          queryClient.setQueryData(
            filesQueryKey,
            (oldData: { files: WebhardFile[] } | undefined) => {
              if (!oldData) return oldData;
              return {
                ...oldData,
                files: oldData.files.map((f) =>
                  f.id === file.id ? { ...f, is_downloaded: true } : f
                ),
              };
            }
          );

          // 파일이 실제로 속한 폴더의 캐시도 업데이트 (새 파일 모드에서 다운로드 시)
          const fileFolderQueryKey = queryKeys.webhard.files.list({
            folderId: file.folder_id || undefined,
            companyId: userType === 'company' ? userId : undefined,
          });
          queryClient.setQueryData(
            fileFolderQueryKey,
            (oldData: { files: WebhardFile[] } | undefined) => {
              if (!oldData) return oldData;
              return {
                ...oldData,
                files: oldData.files.map((f) =>
                  f.id === file.id ? { ...f, is_downloaded: true } : f
                ),
              };
            }
          );

          // 새 파일 목록에서도 즉시 제거 (Optimistic Update)
          queryClient.setQueryData(
            queryKeys.webhard.newFiles(userType === 'company' ? userId : undefined),
            (oldData: { files: WebhardFile[]; total: number } | undefined) => {
              if (!oldData) return oldData;
              return {
                ...oldData,
                files: oldData.files.filter((f) => f.id !== file.id),
                total: Math.max(0, oldData.total - 1),
              };
            }
          );

          // 뱃지 캐시 무효화 및 즉시 refetch
          queryClient.invalidateQueries({
            queryKey: queryKeys.webhard.totalUndownloadedCount(),
            refetchType: 'active',
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.webhard.folders.batchUndownloadedCount(),
            exact: false,
            refetchType: 'active',
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.webhard.badgeCounts(),
            refetchType: 'active',
          });
        }
      } catch (_) {
        log.error('Download failed');
        // 오류 알림 (설정에 따라)
        if (notificationSettings.notifyOnError) {
          showError('오류', '파일 다운로드에 실패했습니다.');
        }
      }
    },
    [
      downloadViaSignedUrl,
      success,
      showError,
      queryClient,
      filesQueryKey,
      notificationSettings,
      userType,
      userId,
    ]
  );

  const handleFilePreview = useCallback((file: WebhardFile) => {
    setContextMenu(null);
    setDxfPreviewFile(file);
  }, []);

  // 우클릭 메뉴 표시 (다중 선택 지원)
  const handleContextMenu = (e: React.MouseEvent, file: WebhardFile) => {
    e.preventDefault();
    e.stopPropagation();

    // 우클릭한 파일이 이미 선택된 상태인지 확인
    const isFileSelected = selectedFiles.has(file.id);
    const selectedCount = getContextMenuSelectionCount({
      isFileSelected,
      selectedFileCount: selectedFiles.size,
    });

    if (isFileSelected && selectedCount > 1) {
      // 다중 선택 상태에서 선택된 파일 우클릭 → 다중 선택 메뉴
      setContextMenu({
        file: null, // 다중 선택 시 특정 파일 없음
        folder: null,
        x: e.clientX,
        y: e.clientY,
        selectedCount,
        mode: 'file',
      });
    } else {
      // 단일 파일 우클릭 또는 선택되지 않은 파일 우클릭
      // 선택되지 않은 파일 우클릭 시 해당 파일만 선택
      if (!isFileSelected) {
        selectFile(
          file.id,
          files.findIndex((f) => f.id === file.id)
        );
      }
      setContextMenu({
        file,
        folder: null,
        x: e.clientX,
        y: e.clientY,
        selectedCount,
        mode: 'file',
      });
    }
  };

  const handleFolderContextMenu = (e: React.MouseEvent, folder: WebhardFolderItemFolder) => {
    e.preventDefault();
    e.stopPropagation();

    if (!canOpenWebhardFolderContextMenu(userType)) {
      return;
    }

    const isSelected = selectedFolders.has(folder.id);
    const selectedCount =
      isSelected && selectedFiles.size + selectedFolders.size > 1
        ? selectedFiles.size + selectedFolders.size
        : 1;

    if (!isSelected) {
      clearSelection();
      toggleFolder(folder.id);
    }

    setContextMenu({
      file: null,
      folder,
      x: e.clientX,
      y: e.clientY,
      selectedCount,
      mode: 'folder',
    });
  };

  // 빈 공간 우클릭 메뉴 표시
  const handleEmptySpaceContextMenu = (e: React.MouseEvent) => {
    // 파일/폴더 아이템 위에서는 무시 (handleContextMenu가 처리)
    const target = e.target as HTMLElement;
    if (target.closest('[data-file-item]') || target.closest('[data-folder-item]')) {
      return;
    }
    e.preventDefault();
    if (!canCreateWebhardFolder(userType)) {
      return;
    }
    setContextMenu({
      file: null,
      folder: null,
      x: e.clientX,
      y: e.clientY,
      selectedCount: 0,
      mode: 'empty-space',
    });
  };

  // 새 폴더 생성 핸들러
  const handleCreateNewFolder = async () => {
    if (!canCreateWebhardFolder(userType)) {
      setIsCreatingNewFolder(false);
      setNewFolderName('');
      showError('권한 없음', '폴더 생성은 관리자만 가능합니다.');
      return;
    }

    const trimmedName = newFolderName.trim();
    if (!trimmedName) {
      setIsCreatingNewFolder(false);
      setNewFolderName('');
      return;
    }
    try {
      const { createFolder } = await import('@/lib/api/webhard-api-client');
      await createFolder(trimmedName, selectedFolderId || undefined);
      queryClient.invalidateQueries({ queryKey: queryKeys.webhard.folders.all() });
      success(`'${trimmedName}' 폴더가 생성되었습니다.`);
    } catch {
      showError('폴더 생성에 실패했습니다.');
    } finally {
      setIsCreatingNewFolder(false);
      setNewFolderName('');
    }
  };

  // 우클릭 메뉴 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  // 파일 삭제 (단일 파일 - 확인 모달 표시 후 삭제)
  const handleDeleteFile = (fileId: string) => {
    if (!canDeleteWebhardItems(userType)) {
      setContextMenu(null);
      showAdminDeleteRequest();
      return;
    }

    const fileToDelete = files.find((f) => f.id === fileId);
    if (!fileToDelete) {
      setContextMenu(null);
      return;
    }

    setContextMenu(null);
    setDeleteTargets([{ id: fileId, name: fileToDelete.original_name, type: 'file' }]);
    pendingDeleteRef.current = {
      files: [{ id: fileId, name: fileToDelete.original_name }],
      folders: [],
    };
    openModal('deleteConfirm');
  };

  const handleDeleteFolderRequest = useCallback(
    (folderId: string) => {
      if (!canDeleteWebhardItems(userType)) {
        setContextMenu(null);
        showAdminDeleteRequest();
        return;
      }

      const folderToDelete =
        allFolders.find((folder) => folder.id === folderId) ||
        subFolders.find((folder) => folder.id === folderId);
      setContextMenu(null);

      if (folderToDelete && isCompanyRootFolder(folderToDelete)) {
        setCompanyRootDeleteBlock({
          matches: [toCompanyRootFolderMatchFromFolder(folderToDelete)],
        });
        return;
      }

      setDeleteTargets([
        {
          id: folderId,
          name: folderToDelete?.name || folderId,
          type: 'folder',
        },
      ]);
      pendingDeleteRef.current = {
        files: [],
        folders: [folderId],
      };
      openModal('deleteConfirm');
    },
    [allFolders, openModal, showAdminDeleteRequest, subFolders, userType]
  );

  // 전체 선택/해제 (파일 + 폴더)
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      selectAll(files.map((file) => file.id));
      selectAllFolders(subFolders.map((f) => f.id));
    } else {
      clearSelection();
    }
  };

  // 파일 클릭 선택 핸들러 (Shift 범위 선택 지원)
  const handleFileClick = useCallback(
    (e: React.MouseEvent, file: WebhardFile, index: number) => {
      // 체크박스나 버튼 클릭은 무시 (이벤트 버블링 방지)
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'BUTTON' ||
        target.closest('button') ||
        target.closest('input')
      ) {
        return;
      }

      if (e.shiftKey && lastClickedFileIndex !== null) {
        // Shift+클릭: 범위 선택 (기존 선택에 추가)
        const start = Math.min(lastClickedFileIndex, index);
        const end = Math.max(lastClickedFileIndex, index);
        const rangeFileIds = files.slice(start, end + 1).map((f) => f.id);
        addToSelectionBulk(rangeFileIds);
      } else if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd+클릭: 토글 선택
        toggleFile(file.id, index);
      } else {
        const selectionAction = getWebhardItemClickSelectionAction({
          itemType: 'file',
          itemId: file.id,
          selectedFiles,
          selectedFolders,
        });

        if (selectionAction === 'clear') {
          clearSelection();
        } else if (selectionAction === 'select-file') {
          selectFile(file.id, index);
        } else if (selectionAction === 'add-file') {
          addToSelection(file.id);
          setLastClickedIndex(index);
        } else if (selectionAction === 'remove-file') {
          removeFromSelection(file.id);
          setLastClickedIndex(index);
        }
      }
    },
    [
      files,
      lastClickedFileIndex,
      addToSelectionBulk,
      toggleFile,
      selectedFolders,
      selectedFiles,
      clearSelection,
      selectFile,
      addToSelection,
      removeFromSelection,
      setLastClickedIndex,
    ]
  );

  // 컬럼 리사이즈 핸들러
  const handleColumnResizeStart = useCallback(
    (column: 'fileName' | 'date') => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startResizing(column);
    },
    [startResizing]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingColumn || !headerContainerRef.current) return;

      const containerRect = headerContainerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const mouseX = e.clientX - containerRect.left;

      // 체크박스 고정 너비 (40px)
      const checkboxWidth = 40;
      const availableWidth = containerWidth - checkboxWidth;
      const relativeX = mouseX - checkboxWidth;

      // 업로더 컬럼 최소 너비 (버튼 2개 + 이름 = 약 15%)
      const minUploaderWidth = 15;

      if (resizingColumn === 'fileName') {
        // 파일명 컬럼 리사이즈
        const newWidth = (relativeX / availableWidth) * 100;
        // 최소 25%, 최대값은 업로더 최소 너비 확보
        const maxFilenameWidth = 100 - dateColWidth - minUploaderWidth;
        const clampedWidth = Math.max(25, Math.min(maxFilenameWidth, newWidth));
        setColumnWidth('fileName', clampedWidth);
      } else if (resizingColumn === 'date') {
        // 업로드날짜 컬럼 리사이즈 (파일명 뒤에서 시작)
        const fileNameEndX = (fileNameColWidth / 100) * availableWidth;
        const newWidth = ((relativeX - fileNameEndX) / availableWidth) * 100;
        // 최소 10%, 최대값은 업로더 최소 너비 확보
        const maxDateWidth = 100 - fileNameColWidth - minUploaderWidth;
        const clampedWidth = Math.max(10, Math.min(maxDateWidth, newWidth));
        setColumnWidth('date', clampedWidth);
      }
    };

    const handleMouseUp = () => {
      stopResizing();
    };

    if (resizingColumn) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingColumn, fileNameColWidth]);

  // 파일 이동 핸들러 (메모이제이션) - Server Action 사용
  const handleMoveFile = useCallback(
    async (fileId: string, targetFolderId: string | null) => {
      // 이전 데이터 저장 (롤백용)
      const previousData = queryClient.getQueryData<{ files: WebhardFile[] }>(filesQueryKey);

      try {
        // Optimistic Update: 현재 폴더 목록에서 즉시 제거
        queryClient.setQueryData(filesQueryKey, (oldData: { files: WebhardFile[] } | undefined) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            files: oldData.files.filter((f) => f.id !== fileId),
          };
        });

        // Server Action 호출 (단일 파일도 배치로 처리)
        const result = await batchMoveFiles([fileId], targetFolderId);

        if (!result.success) {
          throw new Error(result.errors?.[0] || 'Failed to move file');
        }

        // 모든 파일 목록 캐시를 무효화하여 다음 방문 시 새로 fetch하도록 함
        queryClient.invalidateQueries({
          queryKey: queryKeys.webhard.files.list(),
          refetchType: 'none',
        });

        // 대상 폴더의 캐시도 무효화
        if (targetFolderId) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.webhard.files.list({
              folderId: targetFolderId,
            }),
            refetchType: 'none',
          });
        } else {
          queryClient.invalidateQueries({
            queryKey: queryKeys.webhard.files.list({
              folderId: undefined,
            }),
            refetchType: 'none',
          });
        }
      } catch (err) {
        // 롤백: 이전 데이터로 복원
        if (previousData) {
          queryClient.setQueryData(filesQueryKey, previousData);
        }

        if (notificationSettings.notifyOnError) {
          showError(
            '오류',
            err instanceof Error ? err.message : '파일 이동 중 오류가 발생했습니다.'
          );
        }
      }
    },
    [queryClient, showError, filesQueryKey, notificationSettings]
  );

  // 공유 링크 생성 핸들러
  const handleCreateShareLink = useCallback(
    (file: WebhardFile) => {
      setShareLinkFile({
        path: file.path,
        name: file.original_name,
        companyId: file.company_id,
      });
      openModal('shareLink');
    },
    [openModal]
  );

  // 공유 링크 모달 닫기
  const handleCloseShareLinkModal = useCallback(() => {
    setShareLinkFile(null);
    closeModal();
  }, [closeModal]);

  // 파일들 일괄 이동 (드래그앤드롭용 - Server Action 사용)
  const handleBatchMove = useCallback(
    async (fileIds: string[], targetFolderId: string | null) => {
      log.debug('BatchMove called with fileIds:', fileIds, 'targetFolderId:', targetFolderId);
      if (fileIds.length === 0) return;

      // 이전 데이터 저장 (롤백용)
      const previousData = queryClient.getQueryData<{ files: WebhardFile[] }>(filesQueryKey);

      // 파일 정보 가져오기 (UI 표시용)
      const filesToMove = files
        .filter((f) => fileIds.includes(f.id))
        .map((f) => ({ id: f.id, name: f.original_name }));

      // 캐시에서 찾지 못한 파일은 ID로 대체
      const foundIds = new Set(filesToMove.map((f) => f.id));
      fileIds.forEach((id) => {
        if (!foundIds.has(id)) {
          filesToMove.push({ id, name: id });
        }
      });

      if (filesToMove.length === 0) return;

      // 드래그 상태 초기화 (DOM 제거 전에 호출해야 dragend 이벤트 누락 방지)
      endDrag();

      // 프로그레스 모달 없이 빠른 이동 처리 (Optimistic Update만 사용)
      // Optimistic Update: 현재 폴더 목록에서 즉시 제거
      const fileIdSet = new Set(fileIds);
      queryClient.setQueryData(filesQueryKey, (oldData: { files: WebhardFile[] } | undefined) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          files: oldData.files.filter((f) => !fileIdSet.has(f.id)),
        };
      });

      // 선택 목록에서도 제거
      removeFromSelectionBulk(fileIds);

      // NestJS API 비동기 실행 (UI 블로킹 없음)
      log.debug('BatchMove calling batchMoveFiles...');
      batchMoveFiles(fileIds, targetFolderId)
        .then((result) => {
          log.debug('BatchMove result:', result);
          if (!result.success || result.failed > 0) {
            // 롤백: 이전 데이터로 복원
            if (previousData) {
              queryClient.setQueryData(filesQueryKey, previousData);
            }
            if (notificationSettings.notifyOnError) {
              const errorMsg = result.errors?.join(', ') || '파일 이동 실패';
              showError('오류', errorMsg);
            }
          }
          // 캐시 무효화 (백그라운드)
          invalidateAfterMove(queryClient, {
            folderId: selectedFolderId,
            targetFolderId,
            companyId: userType === 'company' ? userId : undefined,
          });
        })
        .catch((err) => {
          log.error('BatchMove error:', err);
          // 롤백: 이전 데이터로 복원
          if (previousData) {
            queryClient.setQueryData(filesQueryKey, previousData);
          }
          if (notificationSettings.notifyOnError) {
            showError('오류', err instanceof Error ? err.message : '파일 이동 실패');
          }
        });
    },
    [
      queryClient,
      filesQueryKey,
      files,
      showError,
      notificationSettings,
      selectedFolderId,
      userType,
      userId,
      endDrag,
    ]
  );

  // 폴더 이동 (드래그앤드롭용 - NestJS API 사용 + Optimistic Update)
  const handleFolderDrop = useCallback(
    async (folderId: string, targetFolderId: string | null) => {
      if (!canMoveWebhardFolder(userType)) {
        showError('권한 없음', '폴더 이동은 관리자만 가능합니다.');
        return;
      }

      // 폴더 목록 쿼리 키
      const foldersQueryKey = queryKeys.webhard.folders.page(
        selectedFolderId,
        userType === 'company' ? userId : undefined
      );

      // 이전 데이터 저장 (롤백용)
      const previousData = queryClient.getQueryData<{ folders: WebhardFolder[] }>(foldersQueryKey);

      // Optimistic Update: 즉시 UI 반영
      queryClient.setQueryData(
        foldersQueryKey,
        (oldData: { folders: WebhardFolder[] } | undefined) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            folders: oldData.folders.map((folder) =>
              folder.id === folderId ? { ...folder, parent_id: targetFolderId } : folder
            ),
          };
        }
      );

      try {
        const response = await fetch(`/api/webhard/folders/${folderId}/move`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentId: targetFolderId }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || '폴더 이동 실패');
        }

        // 응답에서 변경된 폴더 정보 반영 (이름 충돌 시 자동 변경됨)
        const updatedFolder = await response.json();
        queryClient.setQueryData(
          foldersQueryKey,
          (oldData: { folders: WebhardFolder[] } | undefined) => {
            if (!oldData) return oldData;
            return {
              ...oldData,
              folders: oldData.folders.map((folder) =>
                folder.id === folderId
                  ? { ...folder, parent_id: updatedFolder.parent_id, name: updatedFolder.name }
                  : folder
              ),
            };
          }
        );
        invalidateAfterFolderMove(queryClient);
        // 토스트 제거: 빠른 이동 UX를 위해 별도 알림 없음
      } catch (err) {
        // 롤백: 이전 데이터로 복원
        if (previousData) {
          queryClient.setQueryData(foldersQueryKey, previousData);
        }
        showError('오류', err instanceof Error ? err.message : '폴더 이동에 실패했습니다.');
      }
    },
    [queryClient, selectedFolderId, showError, userType, userId]
  );

  const isFolderDescendantOf = useCallback(
    (folderId: string, potentialAncestorId: string): boolean => {
      let currentId: string | null = folderId;
      while (currentId) {
        if (currentId === potentialAncestorId) return true;
        const currentFolder = allFolders.find((folder) => folder.id === currentId);
        currentId = currentFolder?.parent_id ?? null;
      }
      return false;
    },
    [allFolders]
  );

  const handleFolderDragStart = useCallback(
    (e: React.DragEvent, folderId: string) => {
      e.stopPropagation();
      if (!canMoveWebhardFolder(userType)) {
        e.preventDefault();
        showError('권한 없음', '폴더 이동은 관리자만 가능합니다.');
        return;
      }
      setDraggingFolderId(folderId);
      e.dataTransfer.setData(WEBHARD_FOLDER_DRAG_MIME, folderId);
      e.dataTransfer.effectAllowed = 'move';
    },
    [showError, userType]
  );

  const handleFolderDragEnd = useCallback(() => {
    setDraggingFolderId(null);
    setDragOver(null);
  }, [setDragOver]);

  const moveFolderToTarget = useCallback(
    (folderId: string, targetFolderId: string | null) => {
      setDraggingFolderId(null);
      setDragOver(null);

      if (!canMoveWebhardFolder(userType)) {
        showError('권한 없음', '폴더 이동은 관리자만 가능합니다.');
        return;
      }

      if (folderId === targetFolderId) {
        showError('오류', '같은 위치로 이동할 수 없습니다.');
        return;
      }

      if (targetFolderId && isFolderDescendantOf(targetFolderId, folderId)) {
        showError('오류', '하위 폴더로 이동할 수 없습니다.');
        return;
      }

      const sourceFolder = allFolders.find((folder) => folder.id === folderId);
      if (sourceFolder?.parent_id === targetFolderId) {
        showError('오류', '이미 해당 위치에 있습니다.');
        return;
      }

      handleFolderDrop(folderId, targetFolderId);
    },
    [allFolders, handleFolderDrop, isFolderDescendantOf, setDragOver, showError, userType]
  );

  // 새 파일 전체 확인 처리 (N 뱃지 제거)
  const handleMarkAllDownloaded = useCallback(async () => {
    // 선택된 파일이 있으면 선택된 파일만, 없으면 현재 폴더 전체
    const hasSelection = selectedFiles.size > 0;
    const targetFileIds = hasSelection ? Array.from(selectedFiles) : undefined;

    try {
      const response = await fetch('/api/webhard/files/mark-all-downloaded', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId: hasSelection ? undefined : selectedFolderId,
          fileIds: targetFileIds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '파일 확인 처리에 실패했습니다.');
      }

      // 캐시 업데이트 - 파일 목록에서 is_downloaded = true로 변경
      queryClient.setQueryData(filesQueryKey, (oldData: { files: WebhardFile[] } | undefined) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          files: oldData.files.map((f) =>
            targetFileIds
              ? targetFileIds.includes(f.id)
                ? { ...f, is_downloaded: true }
                : f
              : { ...f, is_downloaded: true }
          ),
        };
      });

      // 새 파일 목록 캐시도 업데이트 (새 파일 모드에서 즉시 반영)
      queryClient.setQueryData(
        queryKeys.webhard.newFiles(badgeCompanyId),
        (oldData: { files: WebhardFile[]; total: number } | undefined) => {
          if (!oldData) return oldData;
          const updatedFiles = targetFileIds
            ? oldData.files.filter((f) => !targetFileIds.includes(f.id))
            : []; // 전체 확인 시 모두 제거
          return {
            ...oldData,
            files: updatedFiles,
            total: updatedFiles.length,
          };
        }
      );

      // toast 즉시 표시 (await 없이)
      success('확인 완료', data.message || `${data.updatedCount}개 파일을 확인 처리했습니다.`);

      // 뱃지 카운트는 서버 집계가 self/parent/root 전파를 보장하므로 refetch로 동기화
      queryClient.invalidateQueries({
        queryKey: queryKeys.webhard.badgeCounts(),
        refetchType: 'active',
      });

      // 선택 해제
      if (hasSelection) {
        clearSelection();
      }
    } catch (err) {
      showError('오류', err instanceof Error ? err.message : '확인 처리 중 오류가 발생했습니다.');
    }
  }, [
    selectedFiles,
    selectedFolderId,
    queryClient,
    filesQueryKey,
    badgeCompanyId,
    success,
    showError,
    clearSelection,
  ]);

  // 선택된 파일+폴더 일괄 삭제 (확인 모달 표시)
  const handleBatchDelete = useCallback(() => {
    const hasFiles = selectedFiles.size > 0;
    const hasFolders = selectedFolders.size > 0;
    if (!hasFiles && !hasFolders) return;

    if (!canDeleteWebhardItems(userType)) {
      setContextMenu(null);
      showAdminDeleteRequest();
      return;
    }

    // 삭제 대상 목록 구성
    const targets: DeleteTarget[] = [];
    const filesToDelete: { id: string; name: string }[] = [];
    const folderIds: string[] = [];
    const selectedFolderEntries = Array.from(selectedFolders)
      .map<WebhardFolderDeleteCandidate | undefined>(
        (folderId) =>
          subFolders.find((folder) => folder.id === folderId) ||
          allFolders.find((folder) => folder.id === folderId)
      )
      .filter((folder): folder is WebhardFolderDeleteCandidate => folder !== undefined);

    if (hasFiles) {
      const matchedFiles = files
        .filter((f) => selectedFiles.has(f.id))
        .map((f) => ({ id: f.id, name: f.original_name }));
      matchedFiles.forEach((f) => {
        targets.push({ id: f.id, name: f.name, type: 'file' });
        filesToDelete.push(f);
      });
    }

    if (hasFolders) {
      selectedFolderEntries.forEach((folder) => {
        targets.push({
          id: folder.id,
          name: folder.name,
          type: 'folder',
        });
        folderIds.push(folder.id);
      });

      const matchedKnownFolderIds = new Set(selectedFolderEntries.map((folder) => folder.id));
      Array.from(selectedFolders)
        .filter((folderId) => !matchedKnownFolderIds.has(folderId))
        .forEach((folderId) => {
          targets.push({
            id: folderId,
            name: folderId,
            type: 'folder',
          });
          folderIds.push(folderId);
        });
    }

    const protectedFolders = selectedFolderEntries.filter(isCompanyRootFolder);
    if (protectedFolders.length > 0) {
      const protectedFolderIds = new Set(protectedFolders.map((folder) => folder.id));
      const remainingFolderIds = folderIds.filter((folderId) => !protectedFolderIds.has(folderId));
      const remainingTargets = targets.filter(
        (target) => target.type !== 'folder' || !protectedFolderIds.has(target.id)
      );
      setCompanyRootDeleteBlock({
        matches: protectedFolders.map(toCompanyRootFolderMatchFromFolder),
        remainingDelete:
          remainingTargets.length > 0
            ? {
                targets: remainingTargets,
                selection: {
                  files: filesToDelete,
                  folders: remainingFolderIds,
                },
              }
            : undefined,
      });
      return;
    }

    setDeleteTargets(targets);
    pendingDeleteRef.current = { files: filesToDelete, folders: folderIds };
    openModal('deleteConfirm');
  }, [
    selectedFiles,
    selectedFolders,
    files,
    subFolders,
    allFolders,
    openModal,
    showAdminDeleteRequest,
    userType,
  ]);

  const handleDeleteExcludingMatchedFolders = useCallback(() => {
    const remainingDelete = companyRootDeleteBlock?.remainingDelete;
    if (!remainingDelete) {
      return;
    }

    setDeleteTargets(remainingDelete.targets);
    pendingDeleteRef.current = remainingDelete.selection;
    setCompanyRootDeleteBlock(null);
    openModal('deleteConfirm');
  }, [companyRootDeleteBlock, openModal]);

  // 삭제 확인 모달에서 확인 버튼 클릭 시 실행
  const executeConfirmedDelete = useCallback(
    async (
      onProgress: (percent: number) => void
    ): Promise<{
      success: boolean;
      message?: string;
    }> => {
      const { files: filesToDelete, folders: folderIds } = pendingDeleteRef.current;
      let totalSuccess = 0;
      let totalErrors = 0;
      const errorMessages: string[] = [];

      const hasFiles = filesToDelete.length > 0;
      const hasFolders = folderIds.length > 0;

      if ((hasFiles || hasFolders) && !canDeleteWebhardItems(userType)) {
        onProgress(100);
        return { success: false, message: WEBHARD_FORBIDDEN_DELETE_MESSAGE };
      }

      const fileWeight = hasFiles && hasFolders ? 50 : hasFiles ? 100 : 0;
      const folderWeight = hasFiles && hasFolders ? 50 : hasFolders ? 100 : 0;

      onProgress(5);

      // 파일 삭제
      if (hasFiles) {
        const previousData = queryClient.getQueryData<{ files: WebhardFile[] }>(filesQueryKey);
        const fileIdsToDelete = new Set(filesToDelete.map((f) => f.id));

        // Optimistic Update
        queryClient.setQueryData(filesQueryKey, (oldData: { files: WebhardFile[] } | undefined) => {
          if (!oldData) return oldData;
          return { ...oldData, files: oldData.files.filter((f) => !fileIdsToDelete.has(f.id)) };
        });

        const newFilesQueryKey = queryKeys.webhard.newFiles(
          userType === 'company' ? userId : undefined
        );
        queryClient.setQueryData(
          newFilesQueryKey,
          (oldData: { files: WebhardFile[]; total: number } | undefined) => {
            if (!oldData) return oldData;
            const removedCount = oldData.files.filter((f) => fileIdsToDelete.has(f.id)).length;
            return {
              ...oldData,
              files: oldData.files.filter((f) => !fileIdsToDelete.has(f.id)),
              total: Math.max(0, oldData.total - removedCount),
            };
          }
        );

        removeFromSelectionBulk(Array.from(fileIdsToDelete));
        onProgress(Math.round(fileWeight * 0.2));

        try {
          if (filesToDelete.length > 1) {
            const response = await fetch('/api/webhard/files/batch/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileIds: filesToDelete.map((f) => f.id) }),
            });
            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Failed to delete files');
            }
            const result = (await response.json()) as BatchDeleteFilesResponse;
            assertBatchDeleteFilesResult(result, filesToDelete.length);
            totalSuccess += getBatchDeleteProcessedCount(result);
          } else {
            const response = await fetch(`/api/webhard/files/${filesToDelete[0].id}/delete`, {
              method: 'DELETE',
            });
            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Failed to delete file');
            }
            totalSuccess += 1;
          }
        } catch (err) {
          totalErrors += filesToDelete.length;
          errorMessages.push(err instanceof Error ? err.message : '파일 삭제 실패');
          if (previousData) {
            queryClient.setQueryData(filesQueryKey, previousData);
          }
        }

        invalidateAfterDelete(queryClient, {
          folderId: selectedFolderId,
          companyId: userType === 'company' ? userId : undefined,
        });

        onProgress(fileWeight);
      }

      // 폴더 삭제
      if (hasFolders) {
        onProgress(fileWeight + Math.round(folderWeight * 0.2));

        const result = await batchSoftDeleteFolders(folderIds);
        if (result.success) {
          totalSuccess += result.foldersDeleted || 0;
          queryClient.invalidateQueries({ queryKey: queryKeys.webhard.folders.all() });
          invalidateStorageUsage(queryClient);
        } else {
          if (
            result.code === COMPANY_ROOT_FOLDER_DELETE_BLOCKED_CODE &&
            (result.redirectTo || result.companyId !== undefined)
          ) {
            closeModal();
            setCompanyRootDeleteBlock({
              matches: [
                toCompanyRootFolderDeleteBlockedMatch({
                  code: result.code,
                  message: result.errors?.[0],
                  companyId: result.companyId,
                  companyName: result.companyName,
                  folderName: result.folderName,
                  redirectTo: result.redirectTo,
                }),
              ],
            });
          }
          totalErrors += folderIds.length;
          errorMessages.push(result.errors?.[0] || '폴더 삭제 실패');
        }

        onProgress(fileWeight + folderWeight);
      }

      clearSelection();
      onProgress(100);

      if (totalErrors > 0) {
        return { success: false, message: errorMessages.join(', ') };
      }
      return { success: true };
    },
    [
      queryClient,
      filesQueryKey,
      selectedFolderId,
      userType,
      userId,
      clearSelection,
      closeModal,
      removeFromSelectionBulk,
    ]
  );

  // 정렬 핸들러
  const handleSort = (column: SortBy) => {
    if (sortBy === column) {
      // 같은 컬럼 클릭 시 정렬 순서 토글
      setSort(column, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // 다른 컬럼 클릭 시 해당 컬럼으로 정렬
      // 업로더는 ㄱㄴㄷ 순(오름차순) 기본, 나머지는 내림차순 기본
      setSort(column, column === 'uploader' ? 'asc' : 'desc');
    }
  };

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      {/* 웹하드 전용 네비게이션 */}
      <WebhardNav
        userType={userType}
        userId={userId}
        onMobileSidebarOpen={() => setIsMobileSidebarOpen(true)}
        onFileUpload={handleFileUpload}
        isUploading={isUploading}
        selectedFolderId={selectedFolderId}
        onFolderNavigate={handleFolderSelect}
        onCreateFolder={() => {
          setIsCreatingNewFolder(true);
          setNewFolderName('');
        }}
        onFolderUploadComplete={() => {
          // 폴더 업로드 완료 후 후속 캐시 갱신은 화면 완료 상태를 막지 않는다.
          void Promise.all([
            queryClient.invalidateQueries({
              queryKey: queryKeys.webhard.files.list({
                folderId: selectedFolderId || undefined,
                companyId: userType === 'company' ? userId : undefined,
              }),
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.webhard.folders.all(),
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.webhard.totalUndownloadedCount(),
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.webhard.folders.batchUndownloadedCount(),
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.webhard.badgeCounts(),
            }),
          ]).catch((error) => {
            log.warn(
              `Post-folder-upload cache refresh failed: ${
                error instanceof Error ? error.message : 'Unknown error'
              }`
            );
          });
        }}
      />

      {/* 메인 콘텐츠 영역 */}
      <div className="flex flex-1 relative min-h-0 overflow-hidden">
        {/* 모바일/태블릿 오버레이 배경 (lg 미만에서만 표시) */}
        {isMobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-50 lg:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        {/* 사이드바 - 폴더 트리 (데스크톱: lg 이상) */}
        <div
          className="hidden lg:flex relative transition-[width] duration-150 ease-out"
          style={{ width: isSidebarCollapsed ? 0 : sidebarWidth }}
        >
          {!isSidebarCollapsed && (
            <WebhardSidebar
              userType={userType}
              userId={userId}
              selectedFolderId={selectedFolderId}
              isNewFilesMode={isNewFilesMode}
              onFolderSelect={handleFolderSelect}
              onNewFilesMode={() => setNewFilesMode(true)}
              onFileDrop={handleMoveFile}
              onFilesDrop={handleBatchMove}
              onFolderDrop={handleFolderDrop}
              onFolderHover={prefetchFolder}
              onOpenTrash={() => openModal('trash')}
            />
          )}
        </div>

        {/* 모바일/태블릿 사이드바 (lg 미만에서만 표시) */}
        <WebhardSidebar
          isMobile
          isOpen={isMobileSidebarOpen}
          onClose={() => setIsMobileSidebarOpen(false)}
          userType={userType}
          userId={userId}
          selectedFolderId={selectedFolderId}
          isNewFilesMode={isNewFilesMode}
          onFolderSelect={handleFolderSelect}
          onNewFilesMode={() => setNewFilesMode(true)}
          onFileDrop={handleMoveFile}
          onFilesDrop={handleBatchMove}
          onFolderDrop={handleFolderDrop}
          onFolderHover={prefetchFolder}
          onOpenTrash={() => openModal('trash')}
        />

        {/* 리사이저 바 (토글 기능 포함) - 항상 표시 */}
        <SidebarResizer
          isSidebarCollapsed={isSidebarCollapsed}
          sidebarWidth={sidebarWidth}
          onWidthChange={setSidebarWidth}
          onToggle={() => {
            if (isSidebarCollapsed) {
              setSidebarCollapsed(false);
              setSidebarWidth(256);
            } else {
              setSidebarCollapsed(true);
              setSidebarWidth(0);
            }
          }}
          onCollapsedChange={setSidebarCollapsed}
          minWidth={0}
          maxWidth={600}
          collapseThreshold={0}
        />

        {/* 메인 영역 */}
        <main className="flex-1 flex flex-col min-w-0 lg:ml-4 min-h-0 overflow-hidden">
          {/* Breadcrumbs + 액션 버튼 (고정 헤더) */}
          <div
            className={`flex-shrink-0 px-4 py-3 flex items-center justify-between border-b ${BORDER_COLOR.lightMedium}/50 ${BG_COLOR.darker}`}
          >
            {/* 왼쪽: Breadcrumb */}
            <WebhardBreadcrumb
              breadcrumbPath={breadcrumbPath}
              selectedFolderId={selectedFolderId}
              isNewFilesMode={isNewFilesMode}
              onFolderSelect={handleFolderSelect}
            />

            {/* 오른쪽: 파일 액션 버튼 (항상 표시) */}
            <WebhardToolbar
              selectedCount={selectedFiles.size + selectedFolders.size}
              hasFolderSelected={selectedFolders.size > 0}
              onMarkAllDownloaded={handleMarkAllDownloaded}
              onDownload={handleBatchDownload}
              onMove={() => openModal('move')}
              onDelete={handleBatchDelete}
              canDelete={canDeleteWebhardItems(userType)}
              isDownloading={isDownloading}
              isDeleting={isDeleting}
              isMoving={isMoving}
              className="ml-4"
            />
          </div>

          {/* 파일 목록 영역 (드래그 앤 드롭 지원, 스크롤 가능) */}
          <div
            ref={fileListContainerRef}
            data-testid="webhard-file-dropzone"
            className={`flex-1 overflow-y-auto px-4 pt-4 pb-4 relative transition-colors duration-200 min-h-0 ${
              isExternalDragOver
                ? `${BG_COLOR.brandLight} border-2 border-dashed ${BORDER_COLOR.brand}`
                : ''
            } ${isDragSelecting ? 'select-none' : ''}`}
            onMouseDown={handleDragSelectStart}
            onContextMenu={handleEmptySpaceContextMenu}
            onClick={(e) => {
              // 드래그 선택 직후면 클릭 이벤트 무시 (선택 해제 방지)
              if (justFinishedDragSelectRef.current) {
                return;
              }

              // 빈 영역 클릭 시 선택 해제 (파일/폴더 요소가 아닌 경우에만)
              const target = e.target as HTMLElement;
              const isFileOrFolder =
                target.closest('[data-file-item]') ||
                target.closest('[data-folder-item]') ||
                target.closest('input[type="checkbox"]') ||
                target.closest('button');
              if (!isFileOrFolder && (selectedFiles.size > 0 || selectedFolders.size > 0)) {
                clearSelection();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (draggedFileId || draggingFolderId) return;
              setExternalDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (draggedFileId || draggingFolderId) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX;
              const y = e.clientY;
              if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                setExternalDragOver(false);
              }
            }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const droppedFolderId = e.dataTransfer.getData(WEBHARD_FOLDER_DRAG_MIME);
              if (droppedFolderId) {
                setExternalDragOver(false);
                moveFolderToTarget(droppedFolderId, selectedFolderId);
                return;
              }
              if (draggedFileId) return;
              setExternalDragOver(false);

              // 폴더/파일 구분 처리
              try {
                const result = await processDroppedItems(e.dataTransfer);

                if (result.isFolder && result.files.length > 0) {
                  // 폴더 드롭: FolderUploadModal 열기
                  setDroppedFolderFiles(result.files);
                  setIsFolderUploadOpen(true);
                } else {
                  // 일반 파일 드롭: 기존 로직
                  const droppedFiles = e.dataTransfer.files;
                  if (droppedFiles && droppedFiles.length > 0) {
                    handleFileUpload(droppedFiles);
                  }
                }
              } catch (error) {
                log.error('드래그 앤 드롭 처리 중 오류:', error);
                // 폴백: 일반 파일 업로드로 처리
                const droppedFiles = e.dataTransfer.files;
                if (droppedFiles && droppedFiles.length > 0) {
                  handleFileUpload(droppedFiles);
                }
              }
            }}
          >
            {/* 외부 파일 드래그 오버 시 표시되는 업로드 오버레이 (내부 파일 드래그 시에는 표시하지 않음) */}
            {isExternalDragOver && (
              <div
                className={`absolute inset-0 flex items-center justify-center ${BG_COLOR.orangeOverlay} backdrop-blur-sm z-50 pointer-events-none`}
              >
                <div className="text-center">
                  <FaUpload className={`text-4xl ${TEXT_COLOR.brand} mx-auto mb-2`} />
                  <p className={`text-lg font-semibold ${TEXT_COLOR.brand}`}>
                    파일 또는 폴더를 여기에 놓으세요
                  </p>
                  <p className={`text-sm ${TEXT_COLOR.secondary} mt-1`}>
                    여러 파일이나 폴더를 동시에 업로드할 수 있습니다
                  </p>
                </div>
              </div>
            )}

            {/* 드래그 선택 박스 */}
            <WebhardDragSelection
              isDragSelecting={isDragSelecting}
              boundingRect={getBoundingRect()}
            />

            <BatchCountProvider folderIds={mainFolderIds} companyId={badgeCompanyId}>
              {viewMode === 'list' ? (
                <div className="space-y-2">
                  {/* 리스트 뷰 헤더 */}
                  <WebhardColumnHeader
                    containerRef={headerContainerRef}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    fileNameColWidth={fileNameColWidth}
                    dateColWidth={dateColWidth}
                    filesCount={files.length}
                    totalItemCount={files.length + subFolders.length}
                    selectedCount={selectedFiles.size + selectedFolders.size}
                    isNewFilesMode={isNewFilesMode}
                    onSort={handleSort}
                    onSelectAll={handleSelectAll}
                    onColumnResizeStart={handleColumnResizeStart}
                  />

                  {/* 새 폴더 생성 인라인 입력 */}
                  {isCreatingNewFolder && (
                    <div
                      className={`flex items-center gap-2 px-4 py-2 ${BG_COLOR.info} border ${BORDER_COLOR.infoMedium} rounded-md mx-1 mb-1`}
                    >
                      <FaFolderPlus className="text-blue-500 text-sm flex-shrink-0" />
                      <input
                        ref={newFolderInputRef}
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCreateNewFolder();
                          } else if (e.key === 'Escape') {
                            setIsCreatingNewFolder(false);
                            setNewFolderName('');
                          }
                        }}
                        onBlur={handleCreateNewFolder}
                        placeholder="새 폴더 이름"
                        className={`flex-1 text-sm ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500`}
                        autoFocus
                      />
                    </div>
                  )}

                  {/* 하위 폴더 목록 */}
                  {!shouldShowSkeleton && subFolders.length > 0 && (
                    <>
                      {subFolders.map((folder) => (
                        <WebhardFolderItem
                          key={folder.id}
                          folder={folder}
                          isDragOver={dragOverFolderId === folder.id}
                          viewMode="list"
                          isSelected={isFolderSelected(folder.id)}
                          isEditing={editingFolderId === folder.id}
                          editingFolderName={editingFolderName}
                          editInputRef={folderEditInputRef}
                          onCheckboxChange={(folderId, checked) => toggleFolder(folderId)}
                          onClick={(e) => handleFolderItemClick(e, folder.id)}
                          onDoubleClick={() => handleFolderSelect(folder.id)}
                          onContextMenu={handleFolderContextMenu}
                          onMouseEnter={() => prefetchFolder(folder.id)}
                          onFolderDragStart={canMoveFolders ? handleFolderDragStart : undefined}
                          onFolderDragEnd={canMoveFolders ? handleFolderDragEnd : undefined}
                          onDragOver={() => setDragOver(folder.id)}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={(fileIds) => handleBatchMove(fileIds, folder.id)}
                          onFolderDrop={
                            canMoveFolders
                              ? (droppedFolderId) => moveFolderToTarget(droppedFolderId, folder.id)
                              : undefined
                          }
                          fileNameColWidth={fileNameColWidth}
                          dateColWidth={dateColWidth}
                          onEditChange={setEditingFolderName}
                          onEditBlur={() => handleFinishRenameFolder(folder.id)}
                          onEditKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleFinishRenameFolder(folder.id);
                            } else if (e.key === 'Escape') {
                              handleCancelRenameFolder();
                            }
                          }}
                        />
                      ))}
                    </>
                  )}

                  {/* 파일 목록 */}
                  {shouldShowSkeleton ? (
                    <div className="flex items-center justify-center py-12">
                      <InlineLoading text="파일 목록을 불러오는 중..." />
                    </div>
                  ) : hasWebhardAuthError ? (
                    <div className="flex items-center justify-center py-12">
                      <InlineLoading text="로그인 화면으로 이동 중..." />
                    </div>
                  ) : files.length === 0 && subFolders.length === 0 ? (
                    <WebhardEmptyState isNewFilesMode={isNewFilesMode} />
                  ) : shouldUseVirtualizedFileList(files.length) || hasNextPage ? (
                    <WebhardProvider
                      stateValue={{
                        files,
                        selectedFiles,
                        editingFileId,
                        editingFileName,
                        draggedFileId,
                        isDragSelecting,
                        isNewFilesMode,
                      }}
                      actionsValue={{
                        onDragStart: handleDragStart,
                        onDragEnd: handleDragEnd,
                        onFileClick: handleFileClick,
                        onFileDoubleClick: handleFileDoubleClick,
                        onContextMenu: handleContextMenu,
                        onMouseEnter: ignoreFileHover,
                        onMouseMove: ignoreFileHover,
                        onMouseLeave: ignoreFileHover,
                        onCheckboxChange: (fileId, checked) => {
                          if (checked) {
                            addToSelection(fileId);
                          } else {
                            removeFromSelection(fileId);
                          }
                          const index = files.findIndex((f) => f.id === fileId);
                          if (index !== -1) {
                            setLastClickedIndex(index);
                          }
                        },
                        onEditChange: setEditingFileName,
                        onEditBlur: handleFinishRename,
                        onEditKeyDown: (e, fileId) => {
                          if (e.key === 'Enter') {
                            handleFinishRename(fileId);
                          } else if (e.key === 'Escape') {
                            handleCancelRename();
                          }
                        },
                        onDownload: handleFileDoubleClick,
                        onDelete: canDeleteWebhardItems(userType) ? handleDeleteFile : undefined,
                        onFolderNavigate: handleFolderSelect,
                        isFileNew: isFileNew,
                        canPreviewFile: () => false,
                        editInputRef: editInputRef,
                      }}
                      layoutValue={{
                        fileNameColWidth,
                        dateColWidth,
                      }}
                    >
                      <VirtualizedFileList
                        hasNextPage={hasNextPage}
                        isFetchingNextPage={isFetchingNextPage}
                        onLoadMore={hasNextPage ? () => fetchNextPage() : undefined}
                      />
                    </WebhardProvider>
                  ) : (
                    <div className="space-y-2">
                      {files.map((file, index) => (
                        <WebhardFileItem
                          key={file.id}
                          file={file}
                          index={index}
                          isSelected={selectedFiles.has(file.id)}
                          isEditing={editingFileId === file.id}
                          editingFileName={editingFileName}
                          editInputRef={editInputRef}
                          isDragging={draggedFileId === file.id}
                          isDragSelecting={isDragSelecting}
                          isNewFilesMode={isNewFilesMode}
                          isNew={isFileNew(file)}
                          canPreview={false}
                          fileNameColWidth={fileNameColWidth}
                          dateColWidth={dateColWidth}
                          onDragStart={(e) => handleDragStart(e, file.id)}
                          onDragEnd={handleDragEnd}
                          onClick={(e) => handleFileClick(e, file, index)}
                          onDoubleClick={() => handleFileDoubleClick(file)}
                          onContextMenu={(e) => handleContextMenu(e, file)}
                          onMouseEnter={ignoreFileHover}
                          onMouseMove={ignoreFileHover}
                          onMouseLeave={ignoreFileHover}
                          onCheckboxChange={(checked) => {
                            if (checked) {
                              addToSelection(file.id);
                            } else {
                              removeFromSelection(file.id);
                            }
                            setLastClickedIndex(index);
                          }}
                          onEditChange={setEditingFileName}
                          onEditBlur={() => handleFinishRename(file.id)}
                          onEditKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleFinishRename(file.id);
                            } else if (e.key === 'Escape') {
                              handleCancelRename();
                            }
                          }}
                          onDownload={() => handleFileDoubleClick(file)}
                          onDelete={
                            canDeleteWebhardItems(userType)
                              ? () => handleDeleteFile(file.id)
                              : undefined
                          }
                          canDelete={canDeleteWebhardItems(userType)}
                          onFolderNavigate={handleFolderSelect}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {/* 새 폴더 생성 인라인 입력 (그리드 뷰) */}
                  {isCreatingNewFolder && (
                    <div
                      className={`flex flex-col items-center gap-1 p-3 ${BG_COLOR.info} border ${BORDER_COLOR.infoMedium} rounded-lg`}
                    >
                      <FaFolderPlus className="text-blue-500 text-2xl" />
                      <input
                        ref={newFolderInputRef}
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCreateNewFolder();
                          } else if (e.key === 'Escape') {
                            setIsCreatingNewFolder(false);
                            setNewFolderName('');
                          }
                        }}
                        onBlur={handleCreateNewFolder}
                        placeholder="새 폴더 이름"
                        className={`w-full text-xs text-center ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500`}
                        autoFocus
                      />
                    </div>
                  )}

                  {/* 하위 폴더 목록 (그리드 뷰) */}
                  {!shouldShowSkeleton &&
                    subFolders.length > 0 &&
                    subFolders.map((folder) => (
                      <WebhardFolderItem
                        key={folder.id}
                        folder={folder}
                        isDragOver={dragOverFolderId === folder.id}
                        viewMode="grid"
                        isSelected={isFolderSelected(folder.id)}
                        isEditing={editingFolderId === folder.id}
                        editingFolderName={editingFolderName}
                        editInputRef={folderEditInputRef}
                        onCheckboxChange={(folderId, checked) => toggleFolder(folderId)}
                        onClick={(e) => handleFolderItemClick(e, folder.id)}
                        onDoubleClick={() => handleFolderSelect(folder.id)}
                        onContextMenu={handleFolderContextMenu}
                        onMouseEnter={() => prefetchFolder(folder.id)}
                        onFolderDragStart={canMoveFolders ? handleFolderDragStart : undefined}
                        onFolderDragEnd={canMoveFolders ? handleFolderDragEnd : undefined}
                        onDragOver={() => setDragOver(folder.id)}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={(fileIds) => handleBatchMove(fileIds, folder.id)}
                        onFolderDrop={
                          canMoveFolders
                            ? (droppedFolderId) => moveFolderToTarget(droppedFolderId, folder.id)
                            : undefined
                        }
                        fileNameColWidth={fileNameColWidth}
                        dateColWidth={dateColWidth}
                        onEditChange={setEditingFolderName}
                        onEditBlur={() => handleFinishRenameFolder(folder.id)}
                        onEditKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleFinishRenameFolder(folder.id);
                          } else if (e.key === 'Escape') {
                            handleCancelRenameFolder();
                          }
                        }}
                      />
                    ))}

                  {/* 파일 목록 (그리드 뷰) - 즉시 전환을 위해 AnimatePresence 제거 */}
                  {shouldShowSkeleton ? (
                    <div className="flex items-center justify-center py-12 col-span-full">
                      <InlineLoading text="파일 목록을 불러오는 중..." />
                    </div>
                  ) : hasWebhardAuthError ? (
                    <div className="flex items-center justify-center py-12 col-span-full">
                      <InlineLoading text="로그인 화면으로 이동 중..." />
                    </div>
                  ) : files.length === 0 && subFolders.length === 0 ? (
                    <WebhardEmptyState isNewFilesMode={isNewFilesMode} gridMode />
                  ) : (
                    <>
                      {files.map((file, index) => (
                        <div
                          key={file.id}
                          data-file-item
                          data-file-id={file.id}
                          onClick={(e) => handleFileClick(e, file, index)}
                          onDoubleClick={() => handleFileDoubleClick(file)}
                          onContextMenu={(e) => handleContextMenu(e, file)}
                          className={`${BG_COLOR.card} border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${
                            selectedFiles.has(file.id)
                              ? `${BORDER_COLOR.brand} ring-1 ring-brand ${BG_COLOR.brandLight}`
                              : BORDER_COLOR.default
                          }`}
                        >
                          <div className="flex flex-col items-center gap-2 relative">
                            <div className="relative">
                              <span
                                className="text-3xl inline-flex items-center justify-center w-10 h-10"
                                title={file.mime_type}
                              >
                                {getFileIcon(file.mime_type, file.original_name, 'lg')}
                              </span>
                              {isFileNew(file) && (
                                <div className="absolute -top-1 -right-2">
                                  <Badge count="N" size="sm" />
                                </div>
                              )}
                            </div>
                            {editingFileId === file.id ? (
                              <input
                                ref={editInputRef}
                                type="text"
                                value={editingFileName}
                                onChange={(e) => setEditingFileName(e.target.value)}
                                onBlur={() => handleFinishRename(file.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleFinishRename(file.id);
                                  } else if (e.key === 'Escape') {
                                    handleCancelRename();
                                  }
                                }}
                                className={`w-full px-2 py-1 text-xs border ${BORDER_COLOR.brand} rounded ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:outline-none focus:ring-2 focus:ring-brand text-center`}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <div
                                className={`text-sm ${TEXT_COLOR.secondary} truncate w-full text-center`}
                                title={file.original_name}
                              >
                                {file.original_name}
                              </div>
                            )}
                            <div className={`text-xs ${TEXT_COLOR.muted}`}>
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFileDoubleClick(file);
                                }}
                                className={`p-2 ${BG_COLOR.hoverMuted} rounded transition-colors`}
                                title="다운로드"
                              >
                                <FaDownload className={`text-sm ${TEXT_COLOR.secondary}`} />
                              </button>
                              {canDeleteWebhardItems(userType) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteFile(file.id);
                                  }}
                                  className={`p-2 ${BG_COLOR.hoverErrorLight} rounded transition-colors`}
                                  title="삭제"
                                >
                                  <FaTrash className={`text-sm ${TEXT_COLOR.error}`} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </BatchCountProvider>
          </div>

          {/* 하단 바 - 선택된 파일 정보 */}
          <div
            className={`flex-shrink-0 ${BG_COLOR.card} border-t ${BORDER_COLOR.default} px-4 py-2 pb-20 lg:pb-2`}
          >
            <div className={`text-xs ${TEXT_COLOR.secondary}`}>
              선택: {selectedFiles.size + selectedFolders.size}개 (파일 {selectedFiles.size} + 폴더{' '}
              {selectedFolders.size}) / 전체: {files.length + subFolders.length}개
            </div>
          </div>
        </main>

        {/* 우클릭 컨텍스트 메뉴 (다중 선택 지원) */}
        {contextMenu && (
          <WebhardContextMenu
            contextMenuRef={contextMenuRef}
            mode={contextMenu.mode}
            file={contextMenu.file || undefined}
            folder={contextMenu.folder || undefined}
            selectedCount={contextMenu.selectedCount}
            selectedFileIds={Array.from(selectedFiles)}
            x={contextMenu.x}
            y={contextMenu.y}
            onDownload={handleFileDoubleClick}
            onPreview={
              contextMenu.mode === 'file' && contextMenu.file && canPreview(contextMenu.file)
                ? handleFilePreview
                : undefined
            }
            onBatchDownload={handleBatchDownload}
            onRename={handleStartRename}
            onRenameFolder={handleStartRenameFolder}
            onDelete={canDeleteWebhardItems(userType) ? handleDeleteFile : undefined}
            onDeleteFolder={canDeleteWebhardItems(userType) ? handleDeleteFolderRequest : undefined}
            onBatchDelete={canDeleteWebhardItems(userType) ? handleBatchDelete : undefined}
            onMove={contextMenu.mode === 'file' ? () => openModal('move') : undefined}
            onCreateShareLink={handleCreateShareLink}
            onCreateFolder={
              canCreateWebhardFolder(userType)
                ? () => {
                    setIsCreatingNewFolder(true);
                    setNewFolderName('');
                  }
                : undefined
            }
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>

      {/* 모바일 하단 네비게이션 */}
      <WebhardMobileNav
        userType={userType}
        onSettingsClick={() => openModal('settings')}
        onSearchClick={() => openModal('search')}
        onFolderClick={() => setIsMobileSidebarOpen(true)}
      />

      {/* 폴더 드래그 앤 드롭 업로드 모달 */}
      <FolderUploadModal
        isOpen={isFolderUploadOpen}
        onClose={() => {
          setIsFolderUploadOpen(false);
          setDroppedFolderFiles([]);
        }}
        targetFolderId={selectedFolderId}
        onUploadComplete={() => {
          // 캐시 무효화
          queryClient.invalidateQueries({ queryKey: queryKeys.webhard.files.all() });
          queryClient.invalidateQueries({ queryKey: queryKeys.webhard.folders.all() });
          invalidateBadgeCounts(queryClient);
          setIsFolderUploadOpen(false);
          setDroppedFolderFiles([]);
        }}
        userType={userType}
        initialFiles={droppedFolderFiles}
      />

      {/* 모달 컨테이너 */}
      <ModalContainer
        isModalOpen={isModalOpen}
        closeModal={handleCloseShareLinkModal}
        userType={userType}
        currentFolderId={selectedFolderId}
        selectedFileIds={Array.from(selectedFiles)}
        onMoveFiles={handleBatchMove}
        downloadItems={downloadItems}
        isDownloading={isDownloading}
        deleteItems={deleteItems}
        isDeleting={isDeleting}
        moveItems={moveItems}
        isMoving={isMoving}
        shareLinkFilePath={shareLinkFile?.path}
        shareLinkFileName={shareLinkFile?.name}
        shareLinkCompanyId={shareLinkFile?.companyId}
        deleteTargets={deleteTargets}
        onConfirmDelete={executeConfirmedDelete}
      />

      <CompanyRootFolderDeleteBlockedModal
        isOpen={companyRootDeleteBlock !== null}
        matches={companyRootDeleteBlock?.matches ?? []}
        canDeleteExcludingMatched={Boolean(companyRootDeleteBlock?.remainingDelete)}
        onClose={() => setCompanyRootDeleteBlock(null)}
        onGoToCompany={(match) => {
          setCompanyRootDeleteBlock(null);
          router.push(match.redirectTo ?? '/admin/companies');
        }}
        onDeleteExcludingMatched={handleDeleteExcludingMatchedFolders}
      />

      {/* DXF 미리보기 모달 */}
      {dxfPreviewFile && (
        <DxfPreviewModal
          fileId={dxfPreviewFile.id}
          filename={dxfPreviewFile.original_name}
          isOpen={!!dxfPreviewFile}
          onClose={() => setDxfPreviewFile(null)}
          onDownload={() => handleFileDoubleClick(dxfPreviewFile)}
        />
      )}

      {/* Method B: 업로드 후 문의 연결 프롬프트 (거래처 사용자 전용) */}
      {linkPromptFile && !linkModalOpen && (
        <div
          className={`fixed bottom-4 right-4 z-40 max-w-sm ${BG_COLOR.card} rounded-lg shadow-xl border ${BORDER_COLOR.default} p-4`}
        >
          <p className={`text-sm font-medium ${TEXT_COLOR.primary} mb-1`}>문의 연결</p>
          <p className={`text-xs ${TEXT_COLOR.secondary} mb-3`}>
            <span className="font-medium">{linkPromptFile.name}</span> 파일과 관련된 문의가 있나요?
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setLinkPromptFile(null)}
              className={`px-3 py-1.5 text-xs font-medium rounded border ${BORDER_COLOR.default} ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted} transition-colors`}
            >
              건너뛰기
            </button>
            <button
              type="button"
              onClick={() => setLinkModalOpen(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded ${BG_COLOR.brand} ${BG_COLOR.brandHover} text-white transition-colors`}
            >
              연결하기
            </button>
          </div>
        </div>
      )}
      {linkModalOpen && linkPromptFile && companyNameForLink && (
        <LinkFileToContactModal
          isOpen={linkModalOpen}
          onClose={() => {
            setLinkModalOpen(false);
            setLinkPromptFile(null);
          }}
          fileId={linkPromptFile.id}
          fileName={linkPromptFile.name}
          companyName={companyNameForLink}
        />
      )}
    </div>
  );
}
