'use client';

/**
 * WebhardSidebar
 * 웹하드 사이드바 컴포넌트
 * - 데스크톱/모바일 반응형
 * - 폴더 트리
 * - 휴지통 버튼
 * - 용량 표시
 */

import { useRouter } from 'next/navigation';
import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { FaFolder, FaTrash, FaTimes, FaStar, FaPlus } from 'react-icons/fa';
import { useQueryClient } from '@tanstack/react-query';
import { FolderTree, FolderTreeRef } from './FolderTree';
import { WebhardBadge } from '@/components/WebhardBadge';
import { Badge } from '@/components/Badge';
import { StorageUsage } from './presentational';
import { WEBHARD_CACHE_CONFIG } from '@/app/webhard/_lib/cacheHelpers';
import { useFolderUndownloadedCounts } from '@/lib/hooks/useUndownloadedCount';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

// ============ Types ============
interface WebhardSidebarProps {
  /** 사용자 타입 */
  userType: 'admin' | 'company';
  /** 사용자 ID */
  userId: string;
  /** 선택된 폴더 ID */
  selectedFolderId: string | null;
  /** 새 파일 모드 여부 */
  isNewFilesMode: boolean;
  /** 모바일 사이드바 여부 */
  isMobile?: boolean;
  /** 모바일 사이드바 열림 여부 */
  isOpen?: boolean;
  /** 사이드바 닫기 핸들러 (모바일) */
  onClose?: () => void;
  /** 폴더 선택 핸들러 */
  onFolderSelect: (folderId: string | null) => void;
  /** 새 파일 모드 활성화 핸들러 */
  onNewFilesMode: () => void;
  /** 파일 드롭 핸들러 (단일) */
  onFileDrop?: (fileId: string, targetFolderId: string | null) => void;
  /** 파일 드롭 핸들러 (일괄) */
  onFilesDrop?: (fileIds: string[], targetFolderId: string | null) => void;
  /** 폴더 드롭 핸들러 (폴더 이동) */
  onFolderDrop?: (folderId: string, targetFolderId: string | null) => void;
  /** 폴더 호버 핸들러 (프리페칭) */
  onFolderHover?: (folderId: string | null) => void;
  /** 휴지통 열기 핸들러 */
  onOpenTrash?: () => void;
}

// ============ Drop Handler ============
function handleDrop(
  e: React.DragEvent<HTMLDivElement>,
  targetFolderId: string | null,
  onFilesDrop?: (fileIds: string[], targetFolderId: string | null) => void
) {
  e.preventDefault();
  e.stopPropagation();
  // JSON으로 여러 파일 ID 받기 (선택된 파일들 일괄 이동)
  const jsonData = e.dataTransfer.getData('application/json');
  if (jsonData) {
    try {
      const fileIds: string[] = JSON.parse(jsonData);
      if (fileIds.length > 0) {
        onFilesDrop?.(fileIds, targetFolderId);
      }
    } catch {
      const fileId = e.dataTransfer.getData('text/plain');
      if (fileId) onFilesDrop?.([fileId], targetFolderId);
    }
  } else {
    const fileId = e.dataTransfer.getData('text/plain');
    if (fileId) onFilesDrop?.([fileId], targetFolderId);
  }
}

// ============ Sidebar Content ============
interface SidebarContentProps extends Omit<WebhardSidebarProps, 'isMobile' | 'isOpen'> {
  onItemClick?: () => void;
}

function SidebarContent({
  userType,
  userId,
  selectedFolderId,
  isNewFilesMode,
  onFolderSelect,
  onNewFilesMode,
  onFileDrop,
  onFilesDrop,
  onFolderDrop,
  onFolderHover,
  onOpenTrash,
  onClose,
  onItemClick,
}: SidebarContentProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // FolderTree ref (외부에서 폴더 생성 트리거용)
  const folderTreeRef = useRef<FolderTreeRef>(null);

  // 루트 파일 미다운로드 수 (folderCounts['root'])
  const ROOT_FOLDER_IDS = useMemo(() => ['root'], []);
  const { counts: rootCounts } = useFolderUndownloadedCounts(ROOT_FOLDER_IDS, {
    companyId: userType === 'company' ? userId : undefined,
  });
  const rootFileCount = rootCounts['root'] ?? 0;

  // 새 파일 버튼 hover 시 prefetch (체감 로딩 시간 0ms)
  const prefetchNewFiles = useCallback(() => {
    const queryKey = queryKeys.webhard.newFiles(userType === 'company' ? userId : undefined);

    // 이미 캐시에 있으면 prefetch 스킵
    if (queryClient.getQueryData(queryKey)) return;

    queryClient.prefetchInfiniteQuery({
      queryKey,
      queryFn: async () => {
        const params = new URLSearchParams();
        if (userType === 'company') params.set('companyId', userId);
        params.set('page', '1');
        params.set('limit', '20');
        params.set('sortBy', 'date');
        params.set('sortOrder', 'desc');
        const response = await fetch(`/api/webhard/files/new?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch new files');
        const data = await response.json();
        return {
          files: data.files,
          total: data.total,
          page: 1,
          hasMore: data.hasMore ?? 20 < data.total,
        };
      },
      initialPageParam: 1,
      staleTime: WEBHARD_CACHE_CONFIG.newFiles.staleTime,
    });
  }, [queryClient, userType, userId]);

  // 사이드바 컨텍스트 메뉴 상태
  const [sidebarContextMenu, setSidebarContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // 컨텍스트 메뉴 외부 클릭 감지
  useEffect(() => {
    if (!sidebarContextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setSidebarContextMenu(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [sidebarContextMenu]);

  // 사이드바 우클릭 핸들러 (폴더 항목은 FolderTree에서 별도 처리)
  const handleSidebarContextMenu = (e: React.MouseEvent) => {
    // 관리자만 폴더 생성 가능
    if (userType !== 'admin') return;

    // 폴더 항목에서 우클릭한 경우 무시 (FolderTree에서 처리)
    if ((e.target as HTMLElement).closest('[data-folder-item]')) return;

    e.preventDefault();
    setSidebarContextMenu({ x: e.clientX, y: e.clientY });
  };

  // 폴더 생성 트리거
  const handleCreateFolder = () => {
    setSidebarContextMenu(null);
    folderTreeRef.current?.triggerCreateFolder(null);
  };

  return (
    <aside
      data-testid="webhard-sidebar"
      className={`w-full h-full flex flex-col ${BG_COLOR.card}`}
      onContextMenu={handleSidebarContextMenu}
    >
      {/* 헤더 + 버튼 영역 (고정) */}
      <div className="flex-shrink-0 p-4 pb-2">
        {/* 닫기 버튼 (모바일만) */}
        {onClose && (
          <div className="flex items-center justify-end mb-2">
            <button
              onClick={onClose}
              className={`p-2 ${BG_COLOR.hoverMuted} rounded-lg transition-colors`}
              aria-label="사이드바 닫기"
            >
              <FaTimes className={TEXT_COLOR.secondary} />
            </button>
          </div>
        )}

        {/* 전체 파일 버튼 */}
        <div className="space-y-1">
          <div
            onClick={() => {
              onFolderSelect(null);
              onItemClick?.();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => handleDrop(e, null, onFilesDrop)}
            className={`relative w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors cursor-pointer ${
              !isNewFilesMode && selectedFolderId === null
                ? `${BG_COLOR.brand} text-white`
                : `${BG_COLOR.muted} ${BG_COLOR.hoverMuted} ${TEXT_COLOR.primary}`
            }`}
          >
            <FaFolder className="text-xs" />
            <span>전체 파일</span>
            <WebhardBadge />
            {rootFileCount > 0 && <Badge count={rootFileCount} variant="default" size="sm" />}
          </div>

          {/* 새 파일 버튼 */}
          <div
            onClick={() => {
              onNewFilesMode();
              // URL에서 folderId 제거 (선택 해제)
              router.push('/webhard', { scroll: false });
              onItemClick?.();
            }}
            onMouseEnter={prefetchNewFiles}
            className={`relative w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors cursor-pointer ${
              isNewFilesMode
                ? `${BG_COLOR.brand} text-white`
                : `${BG_COLOR.muted} ${BG_COLOR.hoverMuted} ${TEXT_COLOR.primary}`
            }`}
          >
            <FaStar className={`text-xs ${isNewFilesMode ? 'text-white' : 'text-yellow-500'}`} />
            <span>새 파일</span>
            <WebhardBadge />
          </div>
        </div>
      </div>

      {/* 구분선 */}
      <div className={`mx-4 border-b ${BORDER_COLOR.default}`} />

      {/* 폴더 트리 영역 (스크롤은 FolderTree 내부 가상화 컨테이너에서 처리) */}
      <div className="flex-1 min-h-0 px-4 py-2 flex flex-col" data-folder-tree>
        <FolderTree
          ref={folderTreeRef}
          userType={userType}
          userId={userId}
          selectedFolderId={selectedFolderId}
          onFolderSelect={(folderId) => {
            onFolderSelect(folderId);
            onItemClick?.();
          }}
          onFileDrop={onFileDrop}
          onFilesDrop={onFilesDrop}
          onFolderDrop={onFolderDrop}
          onFolderHover={onFolderHover}
          isNewFilesMode={isNewFilesMode}
        />
      </div>

      {/* 하단 고정 영역 */}
      <div className="mt-auto">
        {/* 휴지통 버튼 (관리자만 표시) */}
        {userType === 'admin' && onOpenTrash && (
          <div className={`px-4 py-3 border-t ${BORDER_COLOR.default}`}>
            <button
              onClick={() => {
                onOpenTrash();
                onItemClick?.();
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${TEXT_COLOR.secondary} ${BG_COLOR.hoverError} ${TEXT_COLOR.hoverError} rounded-lg transition-colors`}
            >
              <FaTrash className="text-sm" />
              <span>휴지통</span>
            </button>
          </div>
        )}

        {/* 용량 표시 (하단 고정) */}
        <StorageUsage userType={userType} userId={userId} />
      </div>

      {/* 사이드바 컨텍스트 메뉴 (관리자만 - 폴더 헤더/버튼 영역 우클릭) */}
      {sidebarContextMenu && userType === 'admin' && (
        <div
          ref={contextMenuRef}
          className={`fixed ${BG_COLOR.card} rounded-lg shadow-lg z-50 text-sm border ${BORDER_COLOR.default}`}
          style={{ top: sidebarContextMenu.y, left: sidebarContextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleCreateFolder}
            className={`w-full text-left px-3 py-2.5 ${BG_COLOR.hoverMuted} flex items-center gap-2 ${TEXT_COLOR.primary} rounded-lg`}
          >
            <FaPlus className="text-sm" /> 새 폴더 생성
          </button>
        </div>
      )}
    </aside>
  );
}

// ============ Main Component ============
export function WebhardSidebar({
  isMobile = false,
  isOpen = false,
  onClose,
  ...props
}: WebhardSidebarProps) {
  if (isMobile) {
    // 모바일 사이드바 (슬라이드 패널)
    return (
      <div
        className={`fixed top-0 left-0 h-full border-r ${BORDER_COLOR.default} z-[60] transition-transform duration-300 lg:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: '280px' }}
      >
        <SidebarContent {...props} onClose={onClose} onItemClick={onClose} />
      </div>
    );
  }

  // 데스크톱 사이드바
  return (
    <div className={`w-full h-full border-r ${BORDER_COLOR.default} hidden lg:block`}>
      <SidebarContent {...props} />
    </div>
  );
}
