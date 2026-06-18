'use client';

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  createContext,
  useContext,
  useCallback,
  memo,
  forwardRef,
  useImperativeHandle,
  type CSSProperties,
} from 'react';
import { useRouter } from 'next/navigation';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FaFolder,
  FaFolderOpen,
  FaChevronRight,
  FaPlus,
  FaEdit,
  FaTrash,
  FaEllipsisV,
} from 'react-icons/fa';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useToast } from '@/hooks/useToast';
import { useFolderUndownloadedCounts } from '@/lib/hooks/useUndownloadedCount';
import {
  WEBHARD_FORBIDDEN_DELETE_MESSAGE,
  WEBHARD_FOLDER_DRAG_MIME,
  canCreateWebhardFolder,
  canDeleteWebhardItems,
  canMoveWebhardFolder,
  canOpenWebhardFolderContextMenu,
} from '@/app/webhard/_lib/webhardMainContracts';
import { WEBHARD_CACHE_CONFIG } from '@/app/webhard/_lib';
import { formatInquiryFolderDisplayName } from '@/app/webhard/_lib/formatInquiryFolderDisplayName';
import { Badge } from '@/components/Badge';
import {
  COMPANY_ROOT_FOLDER_DELETE_BLOCKED_CODE,
  CompanyRootFolderDeleteBlockedModal,
  type CompanyRootFolderDeleteBlockedMatch,
  type CompanyRootFolderDeleteBlockedPayload,
  toCompanyRootFolderDeleteBlockedMatch,
} from '@/app/webhard/components/CompanyRootFolderDeleteBlockedModal';
import { cn } from '@/lib/utils';
import { FOLDER_TREE, BADGE_STYLES, TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';
import { logger } from '@/lib/utils/logger';

const folderTreeLogger = logger.createLogger('FolderTree');
const FOLDER_TREE_ITEM_SIZE = 44;

interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  company_id: number | null; // null이면 관리자 전용 폴더
  created_by: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  has_children?: boolean; // 지연 로딩용: 하위 폴더 존재 여부
}

interface FolderTreeProps {
  userType: 'admin' | 'company';
  userId: string;
  selectedFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
  onFileDrop?: (fileId: string, folderId: string | null) => void;
  onFilesDrop?: (fileIds: string[], folderId: string | null) => void; // 일괄 이동용
  onFolderDrop?: (folderId: string, targetFolderId: string | null) => void; // 폴더 이동용
  onFolderHover?: (folderId: string | null) => void; // 프리페칭용
  isNewFilesMode?: boolean; // 새 파일 모드 (선택 표시 해제)
}

// 외부에서 접근 가능한 메서드 정의
export interface FolderTreeRef {
  triggerCreateFolder: (parentId: string | null) => void;
}

// 배치 카운트 Context (N+1 쿼리 방지)
export const BatchCountContext = createContext<Record<string, number>>({});

// 배치 카운트 Provider - WebhardMain에서 사용
// 통합 훅(useFolderUndownloadedCounts)을 사용하여 실시간 업데이트 지원
export function BatchCountProvider({
  children,
  folderIds,
  companyId,
}: {
  children: React.ReactNode;
  folderIds: string[];
  companyId?: string | number;
}) {
  const { counts: batchCounts } = useFolderUndownloadedCounts(folderIds, { companyId });

  return <BatchCountContext.Provider value={batchCounts}>{children}</BatchCountContext.Provider>;
}

// 뱃지를 표시하는 컴포넌트 (배치 데이터 사용) - memo로 최적화
export const FolderBadge = memo(function FolderBadge({ folderId }: { folderId: string }) {
  const batchCounts = useContext(BatchCountContext);
  const count = batchCounts[folderId] || 0;

  return <Badge count={count} variant="default" size="sm" />;
});

export const FolderTree = forwardRef<FolderTreeRef, FolderTreeProps>(function FolderTree(
  {
    userType,
    userId,
    selectedFolderId,
    onFolderSelect,
    onFileDrop,
    onFilesDrop,
    onFolderDrop,
    onFolderHover,
    isNewFilesMode = false,
  },
  ref
) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    folderId: string | null; // null = 빈 공간 우클릭 (루트 폴더 생성)
    x: number;
    y: number;
  } | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState<string>('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  // 대용량 삭제 확인 모달 상태
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    folderId: string;
    folderName: string;
    subFolderCount: number;
    fileCount: number;
  } | null>(null);
  const [companyRootDeleteBlock, setCompanyRootDeleteBlock] = useState<{
    matches: CompanyRootFolderDeleteBlockedMatch[];
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // 드래그 중인 폴더 ID
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const router = useRouter();
  const canMoveFolders = canMoveWebhardFolder(userType);
  const canOpenFolderMenu = canOpenWebhardFolderContextMenu(userType);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const handleCompanyRootFolderDeleteBlocked = useCallback(
    (payload: CompanyRootFolderDeleteBlockedPayload): boolean => {
      if (payload.code !== COMPANY_ROOT_FOLDER_DELETE_BLOCKED_CODE) {
        return false;
      }

      setCompanyRootDeleteBlock({
        matches: [toCompanyRootFolderDeleteBlockedMatch(payload)],
      });
      return true;
    },
    []
  );

  // 외부에서 폴더 생성 트리거 가능하도록 ref 노출
  useImperativeHandle(
    ref,
    () => ({
      triggerCreateFolder: (parentId: string | null) => {
        if (!canCreateWebhardFolder(userType)) {
          showError('권한 없음', '폴더 생성은 관리자만 가능합니다.');
          return;
        }
        setIsCreatingFolder(true);
        setNewFolderParentId(parentId);
      },
    }),
    [showError, userType]
  );

  // 폴더 children 로딩 상태 추적
  const [loadedParents, setLoadedParents] = useState<Set<string>>(new Set());
  const [lazyFolders, setLazyFolders] = useState<Map<string, Folder[]>>(new Map());

  // 루트 폴더 목록 조회 (초기 로드: children API로 루트만)
  const {
    data: rootFoldersData,
    isLoading: isRootLoading,
    isError: isRootError,
  } = useQuery({
    queryKey: queryKeys.webhard.folders.children(null),
    queryFn: async () => {
      const response = await fetch(
        `/api/webhard/folders/children${userType === 'company' ? `?companyId=${userId}` : ''}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch root folders');
      }
      return response.json() as Promise<Folder[]>;
    },
  });

  const isLoading = isRootLoading;
  const isError = isRootError;
  const folders = useMemo(() => {
    const byId = new Map<string, Folder>();
    (rootFoldersData || []).forEach((folder) => byId.set(folder.id, folder));
    lazyFolders.forEach((children) => {
      children.forEach((folder) => byId.set(folder.id, folder));
    });
    return Array.from(byId.values());
  }, [rootFoldersData, lazyFolders]);

  // 폴더 children 동적 로딩
  const loadChildren = useCallback(
    async (parentId: string) => {
      if (loadedParents.has(parentId)) return;

      try {
        const queryKey = queryKeys.webhard.folders.children(parentId);
        const children = await queryClient.fetchQuery({
          queryKey,
          queryFn: async () => {
            const params = new URLSearchParams({ parentId });
            if (userType === 'company') params.set('companyId', userId);
            const response = await fetch(`/api/webhard/folders/children?${params}`);
            if (!response.ok) {
              throw new Error('Failed to fetch child folders');
            }
            return response.json() as Promise<Folder[]>;
          },
          staleTime: WEBHARD_CACHE_CONFIG.folders.staleTime,
          gcTime: WEBHARD_CACHE_CONFIG.folders.gcTime,
        });

        setLazyFolders((prev) => {
          const next = new Map(prev);
          next.set(parentId, children);
          return next;
        });
        setLoadedParents((prev) => new Set(prev).add(parentId));
      } catch (error) {
        folderTreeLogger.warn('Failed to load child folders', {
          parentId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [loadedParents, userType, userId, queryClient]
  );

  // 모든 폴더 ID 추출 (배치 카운트 쿼리용)
  const folderIds = useMemo(() => folders.map((f) => f.id), [folders]);

  // 배치로 모든 폴더의 undownloaded count 조회 (통합 훅 사용)
  // 실시간 업데이트 + React Query 캐시 자동 관리
  const { counts: batchCounts } = useFolderUndownloadedCounts(folderIds, {
    companyId: userType === 'company' ? userId : undefined,
  });

  // 선택된 폴더의 부모 폴더들을 자동으로 확장
  useEffect(() => {
    if (!selectedFolderId) return;

    let isActive = true;

    const expandAncestors = async () => {
      const data = await queryClient.fetchQuery({
        queryKey: queryKeys.webhard.folders.ancestors(selectedFolderId),
        queryFn: async () => {
          const response = await fetch(`/api/webhard/folders/${selectedFolderId}/ancestors`);
          if (!response.ok) {
            throw new Error('Failed to fetch folder ancestors');
          }
          return response.json() as Promise<{
            ancestors: Array<{ id: string; parent_id: string | null }>;
            current: { id: string; parent_id: string | null };
          }>;
        },
        staleTime: WEBHARD_CACHE_CONFIG.folders.staleTime,
        gcTime: WEBHARD_CACHE_CONFIG.folders.gcTime,
      });
      if (!isActive) return;

      const parentIds = data.ancestors.map((folder) => folder.id);
      if (parentIds.length > 0) {
        setExpandedFolders((prev) => {
          const newSet = new Set(prev);
          parentIds.forEach((id) => newSet.add(id));
          return newSet;
        });
        await Promise.all(parentIds.map((id) => loadChildren(id)));
      }
    };

    expandAncestors().catch((error) => {
      folderTreeLogger.warn('Failed to expand selected folder ancestors', {
        selectedFolderId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    return () => {
      isActive = false;
    };
  }, [selectedFolderId, loadChildren, queryClient]);

  // 로드된 폴더 내 선택 변경은 이미 가진 parent chain으로 즉시 반영
  useEffect(() => {
    if (!selectedFolderId || folders.length === 0) return;

    // 선택된 폴더의 모든 부모 폴더 찾기
    const findParentFolders = (folderId: string, parents: Set<string> = new Set()): Set<string> => {
      const folder = folders.find((f) => f.id === folderId);
      if (folder && folder.parent_id) {
        parents.add(folder.parent_id);
        return findParentFolders(folder.parent_id, parents);
      }
      return parents;
    };

    const parentIds = findParentFolders(selectedFolderId);
    if (parentIds.size > 0) {
      setExpandedFolders((prev) => {
        const newSet = new Set(prev);
        parentIds.forEach((id) => newSet.add(id));
        return newSet;
      });
    }
  }, [selectedFolderId, folders]);

  // 컨텍스트 메뉴 닫기
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

  // 새 폴더 input에 포커스
  useEffect(() => {
    if (isCreatingFolder && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [isCreatingFolder]);

  // 수정 input에 포커스
  useEffect(() => {
    if (editingFolderId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingFolderId]);

  // 새 폴더 생성
  const handleCreateFolder = async () => {
    if (!canCreateWebhardFolder(userType)) {
      setIsCreatingFolder(false);
      setNewFolderName('');
      setNewFolderParentId(null);
      showError('권한 없음', '폴더 생성은 관리자만 가능합니다.');
      return;
    }

    if (!newFolderName.trim()) {
      showError('오류', '폴더 이름을 입력해주세요.');
      newFolderInputRef.current?.focus();
      return;
    }

    // 회사 ID 결정
    let targetCompanyId: number | null = null;

    if (userType === 'company') {
      // 회사 사용자는 자신의 ID 사용
      targetCompanyId = Number(userId);
      if (isNaN(targetCompanyId) || targetCompanyId <= 0) {
        showError('오류', '폴더를 생성할 회사를 선택해주세요.');
        return;
      }
    } else {
      // 관리자는 부모 폴더의 company_id 상속 또는 null (관리자 전용 폴더)
      if (newFolderParentId) {
        // 부모 폴더가 있으면 해당 폴더의 company_id 상속
        const parentFolder = folders.find((f) => f.id === newFolderParentId);
        targetCompanyId = parentFolder?.company_id ?? null;
      }
      // 부모가 없으면 관리자 전용 폴더 (company_id = null)
    }

    try {
      const response = await fetch('/api/webhard/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentId: newFolderParentId,
          companyId: targetCompanyId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create folder');
      }

      success('성공', '폴더가 생성되었습니다.');
      setIsCreatingFolder(false);
      setNewFolderName('');
      setNewFolderParentId(null);

      // 폴더 목록 새로고침
      queryClient.invalidateQueries({ queryKey: queryKeys.webhard.folders.all() });
    } catch (err) {
      showError('오류', err instanceof Error ? err.message : '폴더 생성 중 오류가 발생했습니다.');
    }
  };

  // 폴더 이름 변경
  const handleRenameFolder = async (folderId: string) => {
    if (!editingFolderName.trim()) {
      setEditingFolderId(null);
      setEditingFolderName('');
      return;
    }

    try {
      const response = await fetch(`/api/webhard/folders/${folderId}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingFolderName.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to rename folder');
      }

      success('성공', '폴더 이름이 변경되었습니다.');
      setEditingFolderId(null);
      setEditingFolderName('');

      // 폴더 목록 새로고침
      queryClient.invalidateQueries({ queryKey: queryKeys.webhard.folders.all() });
    } catch (err) {
      showError(
        '오류',
        err instanceof Error ? err.message : '폴더 이름 변경 중 오류가 발생했습니다.'
      );
    }
  };

  // 폴더 삭제 - 하위 항목이 있으면 확인 모달 표시
  const handleDeleteFolder = async (folderId: string) => {
    setContextMenu(null);
    if (!canDeleteWebhardItems(userType)) {
      showError('삭제 권한 없음', WEBHARD_FORBIDDEN_DELETE_MESSAGE);
      return;
    }

    try {
      // 먼저 일반 삭제 시도
      const response = await fetch(`/api/webhard/folders/${folderId}/delete`, {
        method: 'DELETE',
      });

      const data = (await response.json()) as CompanyRootFolderDeleteBlockedPayload;

      if (!response.ok) {
        if (handleCompanyRootFolderDeleteBlocked(data)) {
          return;
        }

        // 하위 폴더나 파일이 있는 경우
        if (data.hasSubfolders || data.hasFiles) {
          // 삭제 통계 조회
          const statsResponse = await fetch(`/api/webhard/folders/${folderId}/delete`);
          const stats = await statsResponse.json();

          // 확인 모달 표시
          setDeleteConfirmModal({
            folderId,
            folderName: stats.folderName || '선택한 폴더',
            subFolderCount: stats.subFolderCount || 0,
            fileCount: stats.fileCount || 0,
          });
          return;
        }
        throw new Error(data.message || data.error || 'Failed to delete folder');
      }

      success('성공', '폴더가 삭제되었습니다.');
      queryClient.invalidateQueries({ queryKey: queryKeys.webhard.folders.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.webhard.files.list() });
    } catch (err) {
      showError('오류', err instanceof Error ? err.message : '폴더 삭제 중 오류가 발생했습니다.');
    }
  };

  // 대용량 폴더 삭제 실행 (재귀적 삭제)
  const handleBulkDeleteFolder = async () => {
    if (!deleteConfirmModal) return;
    if (!canDeleteWebhardItems(userType)) {
      setDeleteConfirmModal(null);
      showError('삭제 권한 없음', WEBHARD_FORBIDDEN_DELETE_MESSAGE);
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(
        `/api/webhard/folders/${deleteConfirmModal.folderId}/delete?recursive=true`,
        { method: 'DELETE' }
      );

      const data = (await response.json()) as CompanyRootFolderDeleteBlockedPayload & {
        foldersDeleted?: number;
        filesDeleted?: number;
      };

      if (!response.ok) {
        if (handleCompanyRootFolderDeleteBlocked(data)) {
          return;
        }
        throw new Error(data.message || data.error || 'Failed to delete folder');
      }

      success(
        '삭제 완료',
        `폴더 ${data.foldersDeleted}개, 파일 ${data.filesDeleted}개가 삭제되었습니다.`
      );
      setDeleteConfirmModal(null);

      // 폴더 및 파일 목록 새로고침
      queryClient.invalidateQueries({ queryKey: queryKeys.webhard.folders.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.webhard.files.list() });
    } catch (err) {
      showError('오류', err instanceof Error ? err.message : '폴더 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  // 폴더 트리 구조 생성 (메모이제이션)
  const foldersByParent = useMemo(() => {
    const map = new Map<string | null, Folder[]>();
    folders.forEach((folder) => {
      const parentId = folder.parent_id;
      if (!map.has(parentId)) {
        map.set(parentId, []);
      }
      map.get(parentId)!.push(folder);
    });
    // 각 그룹 정렬
    map.forEach((children) => {
      children.sort((a, b) => a.name.localeCompare(b.name));
    });
    return map;
  }, [folders]);

  const buildFolderTree = useCallback(
    (parentId: string | null = null): Folder[] => {
      return foldersByParent.get(parentId) || [];
    },
    [foldersByParent]
  );

  // 하위 폴더 전체 개수를 재귀적으로 계산 (UI 잘림 방지)
  const getTotalDescendantCount = useCallback(
    (folderId: string): number => {
      const children = foldersByParent.get(folderId) || [];
      let count = children.length;
      for (const child of children) {
        count += getTotalDescendantCount(child.id);
      }
      return count;
    },
    [foldersByParent]
  );

  // 🚀 가상화를 위한 평면화된 폴더 목록 생성
  // 펼쳐진 폴더만 표시하고 트리 구조를 1차원 배열로 변환
  const flattenedFolders = useMemo(() => {
    const result: Array<{ folder: Folder; level: number; hasChildren: boolean }> = [];

    const flatten = (parentId: string | null, level: number) => {
      const children = foldersByParent.get(parentId) || [];
      children.forEach((folder) => {
        const folderChildren = foldersByParent.get(folder.id) || [];
        const hasChildren = folder.has_children === true || folderChildren.length > 0;
        result.push({ folder, level, hasChildren });

        // 펼쳐진 폴더의 하위 폴더도 추가
        if (expandedFolders.has(folder.id)) {
          flatten(folder.id, level + 1);
        }
      });
    };

    flatten(null, 0);
    return result;
  }, [foldersByParent, expandedFolders]);

  // 🚀 가상화 컨테이너 ref
  const virtualContainerRef = useRef<HTMLDivElement>(null);

  // 🚀 가상화 설정 (폴더 아이템 높이: 44px, overscan: 10)
  const virtualizer = useVirtualizer({
    count: flattenedFolders.length,
    getScrollElement: () => virtualContainerRef.current,
    estimateSize: () => FOLDER_TREE_ITEM_SIZE,
    overscan: 10,
  });

  // 폴더 토글 (useCallback으로 안정적인 참조) + 지연 로딩
  const toggleFolder = useCallback(
    (folderId: string) => {
      setExpandedFolders((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(folderId)) {
          newSet.delete(folderId);
        } else {
          newSet.add(folderId);
          // 펼칠 때 children 동적 로드
          loadChildren(folderId);
        }
        return newSet;
      });
    },
    [loadChildren]
  );

  // 폴더가 다른 폴더의 자손인지 확인 (순환 참조 방지)
  const isDescendantOf = useCallback(
    (folderId: string, potentialAncestorId: string): boolean => {
      let currentId: string | null = folderId;
      while (currentId) {
        if (currentId === potentialAncestorId) return true;
        const folder = folders.find((f) => f.id === currentId);
        currentId = folder?.parent_id || null;
      }
      return false;
    },
    [folders]
  );

  // 폴더 드래그 시작 핸들러
  const handleFolderDragStart = (e: React.DragEvent, folderId: string) => {
    e.stopPropagation();
    if (!canMoveFolders) {
      e.preventDefault();
      showError('권한 없음', '폴더 이동은 관리자만 가능합니다.');
      return;
    }
    setDraggingFolderId(folderId);
    e.dataTransfer.setData(WEBHARD_FOLDER_DRAG_MIME, folderId);
    e.dataTransfer.effectAllowed = 'move';
  };

  // 폴더 드래그 종료 핸들러
  const handleFolderDragEnd = () => {
    setDraggingFolderId(null);
    setDragOverFolderId(null);
  };

  // 드래그 오버 핸들러
  const handleDragOver = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();

    // 자기 자신 위로 드롭 방지
    if (draggingFolderId && folderId === draggingFolderId) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }

    // 자신의 자손 폴더로 드롭 방지 (순환 참조 방지)
    if (draggingFolderId && folderId && isDescendantOf(folderId, draggingFolderId)) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }

    setDragOverFolderId(folderId);
  };

  // 드래그 리브 핸들러
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);
  };

  // 드롭 핸들러 (파일 및 폴더 이동 지원)
  const handleDrop = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);

    // 1. 폴더 이동 처리
    const droppedFolderId = e.dataTransfer.getData(WEBHARD_FOLDER_DRAG_MIME);
    if (droppedFolderId) {
      setDraggingFolderId(null);

      if (!canMoveFolders) {
        showError('권한 없음', '폴더 이동은 관리자만 가능합니다.');
        return;
      }

      // 자기 자신으로 이동 방지
      if (droppedFolderId === targetFolderId) {
        showError('같은 위치로 이동할 수 없습니다.');
        return;
      }

      // 순환 참조 방지
      if (targetFolderId && isDescendantOf(targetFolderId, droppedFolderId)) {
        showError('하위 폴더로 이동할 수 없습니다.');
        return;
      }

      // 이미 같은 부모인지 확인
      const folder = folders.find((f) => f.id === droppedFolderId);
      if (folder?.parent_id === targetFolderId) {
        showError('이미 해당 위치에 있습니다.');
        return;
      }

      // 폴더 이동 실행
      if (onFolderDrop) {
        onFolderDrop(droppedFolderId, targetFolderId);
      }
      return;
    }

    // 2. 파일 이동 처리 (기존 로직)
    // JSON으로 여러 파일 ID 받기 (선택된 파일들 일괄 이동)
    const jsonData = e.dataTransfer.getData('application/json');
    if (jsonData) {
      try {
        const fileIds: string[] = JSON.parse(jsonData);
        if (fileIds.length > 0) {
          // onFilesDrop이 있으면 일괄 이동 (최적화), 없으면 개별 이동
          if (onFilesDrop) {
            onFilesDrop(fileIds, targetFolderId);
          } else if (onFileDrop) {
            fileIds.forEach((fileId) => onFileDrop(fileId, targetFolderId));
          }
          return;
        }
      } catch {
        // JSON 파싱 실패 시 단일 파일 이동 시도
      }
    }

    // fallback: 단일 파일 이동
    const fileId = e.dataTransfer.getData('text/plain');
    if (fileId) {
      if (onFilesDrop) {
        onFilesDrop([fileId], targetFolderId);
      } else if (onFileDrop) {
        onFileDrop(fileId, targetFolderId);
      }
    }
  };

  if (isLoading) {
    return <div className={`text-sm ${TEXT_COLOR.muted} py-4`}>폴더 로딩 중...</div>;
  }

  if (isError) {
    return (
      <div className={`text-sm ${TEXT_COLOR.error} py-4 space-y-2`}>
        <p>서버 오류로 폴더를 불러올 수 없습니다.</p>
        <p className={`text-xs ${TEXT_COLOR.secondary}`}>관리자에게 문의하십시오.</p>
      </div>
    );
  }

  // 🚀 가상화된 폴더 아이템 렌더링 함수
  const renderVirtualFolderItem = (
    { folder, level, hasChildren }: { folder: Folder; level: number; hasChildren: boolean },
    style: CSSProperties
  ) => {
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = !isNewFilesMode && selectedFolderId === folder.id;
    const isDragOver = dragOverFolderId === folder.id;
    const isEditing = editingFolderId === folder.id;
    const displayFolderName = formatInquiryFolderDisplayName(folder.name);

    return (
      <div key={folder.id} style={style} className="flex items-center">
        <div
          data-folder-item
          data-folder-id={folder.id}
          className={cn(
            FOLDER_TREE.item.base,
            isSelected && FOLDER_TREE.item.selected,
            isDragOver && FOLDER_TREE.item.dragOver,
            !isSelected && !isDragOver && FOLDER_TREE.item.default,
            'w-full'
          )}
          style={{ paddingLeft: `${level * 14 + 8}px` }}
          onClick={() => {
            if (hasChildren) {
              toggleFolder(folder.id);
            }
            onFolderSelect(folder.id);
          }}
          onMouseEnter={() => onFolderHover?.(folder.id)}
          draggable={!isEditing && canMoveFolders}
          onDragStart={canMoveFolders ? (e) => handleFolderDragStart(e, folder.id) : undefined}
          onDragEnd={canMoveFolders ? handleFolderDragEnd : undefined}
          onDragOver={(e) => handleDragOver(e, folder.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, folder.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!canOpenFolderMenu) return;
            setContextMenu({ folderId: folder.id, x: e.clientX, y: e.clientY });
          }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(folder.id);
              }}
              className={cn(
                FOLDER_TREE.chevron.base,
                isExpanded ? FOLDER_TREE.chevron.expanded : FOLDER_TREE.chevron.collapsed
              )}
            >
              <FaChevronRight className="text-sm" />
            </button>
          ) : (
            <span className="w-4" />
          )}
          {isExpanded ? (
            <FaFolderOpen
              className={cn(
                FOLDER_TREE.icon.base,
                isSelected ? FOLDER_TREE.icon.selected : FOLDER_TREE.icon.default
              )}
            />
          ) : (
            <FaFolder
              className={cn(
                FOLDER_TREE.icon.base,
                isSelected ? FOLDER_TREE.icon.selected : FOLDER_TREE.icon.default
              )}
            />
          )}
          {isEditing ? (
            <input
              ref={editInputRef}
              type="text"
              value={editingFolderName}
              onChange={(e) => setEditingFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRenameFolder(folder.id);
                } else if (e.key === 'Escape') {
                  setEditingFolderId(null);
                  setEditingFolderName('');
                }
              }}
              onBlur={() => handleRenameFolder(folder.id)}
              className={`text-sm flex-1 px-1.5 py-0.5 rounded border ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary}`}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="flex-1 flex items-center gap-1.5">
              <span
                className={cn(
                  FOLDER_TREE.name.base,
                  isSelected ? FOLDER_TREE.name.selected : FOLDER_TREE.name.default
                )}
              >
                {displayFolderName}
              </span>
              <div
                className={cn(
                  FOLDER_TREE.badge.wrapper,
                  isSelected && BADGE_STYLES.selectedWrapper
                )}
              >
                <FolderBadge folderId={folder.id} />
              </div>
            </div>
          )}
          {!isEditing && canOpenFolderMenu && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setContextMenu({ folderId: folder.id, x: e.clientX, y: e.clientY });
              }}
              className={FOLDER_TREE.menuButton}
              title="폴더 옵션"
            >
              <FaEllipsisV className="text-sm" />
            </button>
          )}
        </div>

        {/* 새 폴더 생성 입력 (해당 폴더의 하위로 생성 시) */}
        {isCreatingFolder && newFolderParentId === folder.id && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg animate-in fade-in slide-in-from-top-1 duration-200"
            style={{ paddingLeft: `${(level + 1) * 14 + 8}px` }}
          >
            <span className="w-4" />
            <FaFolder className={`text-sm flex-shrink-0 ${TEXT_COLOR.brand}`} />
            <input
              ref={newFolderInputRef}
              type="text"
              placeholder="폴더 이름"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateFolder();
                } else if (e.key === 'Escape') {
                  setIsCreatingFolder(false);
                  setNewFolderName('');
                  setNewFolderParentId(null);
                }
              }}
              onBlur={() => {
                if (newFolderName.trim()) {
                  handleCreateFolder();
                }
              }}
              className={`text-sm flex-1 px-2 py-1 rounded-md border ${BORDER_COLOR.brand} focus:outline-none focus:ring-2 focus:ring-brand/50 ${BG_COLOR.card} ${TEXT_COLOR.primary} transition-shadow duration-150`}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <BatchCountContext.Provider value={batchCounts}>
      {/* 🚀 가상화된 폴더 목록 */}
      {flattenedFolders.length === 0 ? (
        <div className={`text-sm ${TEXT_COLOR.muted} py-4`}>폴더가 없습니다</div>
      ) : (
        <div ref={virtualContainerRef} className="flex-1 min-h-[100px] overflow-auto">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const item = flattenedFolders[virtualItem.index];
              return renderVirtualFolderItem(item, {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              });
            })}
          </div>

          {/* 루트 레벨 새 폴더 생성 입력 */}
          {isCreatingFolder && newFolderParentId === null && (
            <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg animate-in fade-in slide-in-from-top-1 duration-200">
              <span className="w-4" />
              <FaFolder className={`text-sm flex-shrink-0 ${TEXT_COLOR.brand}`} />
              <input
                ref={newFolderInputRef}
                type="text"
                placeholder="폴더 이름"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateFolder();
                  } else if (e.key === 'Escape') {
                    setIsCreatingFolder(false);
                    setNewFolderName('');
                    setNewFolderParentId(null);
                  }
                }}
                onBlur={() => {
                  if (newFolderName.trim()) {
                    handleCreateFolder();
                  } else {
                    setIsCreatingFolder(false);
                    setNewFolderName('');
                    setNewFolderParentId(null);
                  }
                }}
                className={`flex-1 px-2 py-1 text-sm rounded-md border ${BORDER_COLOR.brand} focus:outline-none focus:ring-2 focus:ring-brand/50 ${BG_COLOR.card} ${TEXT_COLOR.primary} transition-shadow duration-150`}
                autoFocus
              />
            </div>
          )}
        </div>
      )}

      {/* 컨텍스트 메뉴 (가상화된 트리 외부에서 렌더링) */}
      {contextMenu !== null &&
        canOpenFolderMenu &&
        contextMenu.folderId !== null &&
        (() => {
          const contextFolder = folders.find((f) => f.id === contextMenu.folderId);
          if (!contextFolder) return null;
          return (
            <div
              ref={contextMenuRef}
              className={`fixed ${BG_COLOR.card} rounded-lg shadow-lg z-50 text-sm border ${BORDER_COLOR.default}`}
              style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 새 폴더 생성 (관리자만) */}
              {userType === 'admin' && (
                <button
                  onClick={() => {
                    setIsCreatingFolder(true);
                    setNewFolderParentId(contextFolder.id);
                    setContextMenu(null);
                  }}
                  className={`w-full text-left px-3 py-2.5 ${BG_COLOR.hoverMuted} flex items-center gap-2 ${TEXT_COLOR.primary}`}
                >
                  <FaPlus className="text-sm" /> 새 폴더 생성
                </button>
              )}
              <button
                onClick={() => {
                  setEditingFolderId(contextFolder.id);
                  setEditingFolderName(contextFolder.name);
                  setContextMenu(null);
                }}
                className={`w-full text-left px-3 py-2.5 ${BG_COLOR.hoverMuted} flex items-center gap-2 ${TEXT_COLOR.primary}`}
              >
                <FaEdit className="text-sm" /> 이름 변경
              </button>
              <button
                onClick={() => {
                  handleDeleteFolder(contextFolder.id);
                }}
                className={`w-full text-left px-3 py-2.5 ${BG_COLOR.hoverMuted} flex items-center gap-2 ${TEXT_COLOR.error}`}
              >
                <FaTrash className="text-sm" /> 삭제
              </button>
            </div>
          );
        })()}

      {/* 대용량 폴더 삭제 확인 모달 */}
      {deleteConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !isDeleting && setDeleteConfirmModal(null)}
          />
          <div
            className={`relative ${BG_COLOR.card} rounded-lg shadow-xl p-6 max-w-md w-full mx-4 z-10`}
          >
            <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-4`}>폴더 삭제 확인</h3>
            <div className={`${TEXT_COLOR.secondary} mb-6`}>
              <p className="mb-3">
                <span className={`font-medium ${TEXT_COLOR.primary}`}>
                  &quot;{deleteConfirmModal.folderName}&quot;
                </span>{' '}
                폴더를 삭제하시겠습니까?
              </p>
              <div
                className={`${BG_COLOR.warning} border ${BORDER_COLOR.warning} rounded-lg p-3 text-sm`}
              >
                <p className={`font-medium ${TEXT_COLOR.warning} mb-1`}>
                  ⚠️ 이 폴더에는 다음 항목이 포함되어 있습니다:
                </p>
                <ul className={`list-disc list-inside ${TEXT_COLOR.warningStrong} space-y-1`}>
                  {deleteConfirmModal.subFolderCount > 0 && (
                    <li>하위 폴더 {deleteConfirmModal.subFolderCount}개</li>
                  )}
                  {deleteConfirmModal.fileCount > 0 && (
                    <li>파일 {deleteConfirmModal.fileCount}개</li>
                  )}
                </ul>
                <p className={`mt-2 ${TEXT_COLOR.warning}`}>
                  모든 하위 폴더와 파일이 함께 삭제됩니다.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmModal(null)}
                disabled={isDeleting}
                className={`px-4 py-2 ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted} rounded-lg transition-colors disabled:opacity-50`}
              >
                취소
              </button>
              <button
                onClick={handleBulkDeleteFolder}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    삭제 중...
                  </>
                ) : (
                  <>
                    <FaTrash className="text-sm" />
                    전체 삭제
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <CompanyRootFolderDeleteBlockedModal
        isOpen={companyRootDeleteBlock !== null}
        matches={companyRootDeleteBlock?.matches ?? []}
        onClose={() => setCompanyRootDeleteBlock(null)}
        onGoToCompany={(match) => {
          setCompanyRootDeleteBlock(null);
          router.push(match.redirectTo ?? '/admin/companies');
        }}
      />
    </BatchCountContext.Provider>
  );
});
