'use client';

/**
 * WebhardFolderItem
 * 웹하드 폴더 아이템 (리스트/그리드 뷰 공용)
 * - 폴더 정보 표시 (아이콘, 이름, 뱃지)
 * - 드래그 앤 드롭 타겟
 * - 리스트/그리드 뷰 지원
 */
import { memo, useCallback } from 'react';
import { FaFolder } from 'react-icons/fa';
import { FolderBadge } from './FolderTree';
import { useWebhardHighlightStore } from '@/store/webhard/useWebhardHighlightStore';
import {
  WEBHARD_FOLDER_DRAG_MIME,
  getFolderDisplayDate,
  getFolderUploaderDisplayName,
} from '@/app/webhard/_lib/webhardMainContracts';
import { formatInquiryFolderDisplayName } from '@/app/webhard/_lib/formatInquiryFolderDisplayName';
import { logger } from '@/lib/utils/logger';
import { BADGE_STYLES, WEBHARD_STYLES } from '@/lib/styles/webhard';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

const log = logger.createLogger('WebhardFolderItem');

export interface WebhardFolderItemFolder {
  id: string;
  name: string;
  parent_id: string | null;
  company_id?: number | null;
  created_at?: string;
  updated_at?: string;
  latest_file_created_at?: string | null;
  latest_file_uploader_display_name?: string | null;
  companies?: {
    company_name: string;
  } | null;
}

export interface WebhardFolderItemProps {
  /** 폴더 데이터 */
  folder: WebhardFolderItemFolder;
  /** 드래그 오버 상태 */
  isDragOver: boolean;
  /** 뷰 모드 */
  viewMode: 'list' | 'grid';
  /** 선택 상태 */
  isSelected?: boolean;
  /** 이름 변경 입력 상태 */
  isEditing?: boolean;
  /** 이름 변경 입력값 */
  editingFolderName?: string;
  /** 이름 변경 input ref */
  editInputRef?: React.RefObject<HTMLInputElement | null>;
  /** 체크박스 변경 핸들러 */
  onCheckboxChange?: (folderId: string, checked: boolean) => void;
  /** 클릭 핸들러 */
  onClick: (e: React.MouseEvent) => void;
  /** 더블클릭 핸들러 */
  onDoubleClick?: () => void;
  /** 우클릭 핸들러 */
  onContextMenu?: (e: React.MouseEvent, folder: WebhardFolderItemFolder) => void;
  /** 마우스 진입 핸들러 */
  onMouseEnter: () => void;
  /** 폴더 드래그 시작 핸들러 */
  onFolderDragStart?: (e: React.DragEvent, folderId: string) => void;
  /** 폴더 드래그 종료 핸들러 */
  onFolderDragEnd?: () => void;
  /** 드래그 오버 핸들러 */
  onDragOver?: () => void;
  /** 드래그 떠남 핸들러 */
  onDragLeave?: () => void;
  /** 드롭 핸들러 (파일 ID 배열) */
  onDrop: (fileIds: string[]) => void;
  /** 폴더 드롭 핸들러 */
  onFolderDrop?: (folderId: string) => void;
  /** 파일명 컬럼 너비 (%) */
  fileNameColWidth?: number;
  /** 날짜 컬럼 너비 (%) */
  dateColWidth?: number;
  /** 이름 변경 입력값 변경 */
  onEditChange?: (value: string) => void;
  /** 이름 변경 완료 */
  onEditBlur?: () => void;
  /** 이름 변경 키 처리 */
  onEditKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * 웹하드 폴더 아이템 컴포넌트
 * 리스트/그리드 뷰에서 폴더를 표시하고 드래그 앤 드롭 타겟 역할
 */
export const WebhardFolderItem = memo(function WebhardFolderItem({
  folder,
  isDragOver,
  viewMode,
  isSelected = false,
  isEditing = false,
  editingFolderName = '',
  editInputRef,
  onCheckboxChange,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMouseEnter,
  onFolderDragStart,
  onFolderDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onFolderDrop,
  fileNameColWidth = 50,
  dateColWidth = 15,
  onEditChange,
  onEditBlur,
  onEditKeyDown,
}: WebhardFolderItemProps) {
  // 드래그 오버 핸들러
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDragOver?.();
    },
    [onDragOver]
  );

  // 드래그 떠남 핸들러
  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDragLeave?.();
    },
    [onDragLeave]
  );

  // 드롭 핸들러
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      log.debug('Folder drop', { folder: folder.name, types: e.dataTransfer.types });

      const transferTypes = Array.from(e.dataTransfer.types || []);
      const droppedFolderId = transferTypes.includes(WEBHARD_FOLDER_DRAG_MIME)
        ? e.dataTransfer.getData(WEBHARD_FOLDER_DRAG_MIME)
        : '';
      if (droppedFolderId) {
        onFolderDrop?.(droppedFolderId);
        return;
      }

      // JSON으로 여러 파일 ID 받기 (선택된 파일들 일괄 이동)
      const jsonData = e.dataTransfer.getData('application/json');

      if (jsonData) {
        try {
          const fileIds: string[] = JSON.parse(jsonData);
          log.debug('Parsed file IDs from JSON', { fileIds });
          if (fileIds.length > 0) {
            onDrop(fileIds);
          }
        } catch {
          // JSON 파싱 실패 시 단일 파일 이동 시도
          const fileId = e.dataTransfer.getData('text/plain');
          log.debug('Fallback to plain text fileId', { fileId });
          if (fileId) onDrop([fileId]);
        }
      } else {
        const fileId = e.dataTransfer.getData('text/plain');
        log.debug('Using plain text fileId', { fileId });
        if (fileId) onDrop([fileId]);
      }
    },
    [onDrop, onFolderDrop, folder.name]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!onFolderDragStart) {
        e.preventDefault();
        return;
      }
      onFolderDragStart(e, folder.id);
    },
    [folder.id, onFolderDragStart]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      onContextMenu?.(e, folder);
    },
    [folder, onContextMenu]
  );

  // 검색 결과 하이라이트 상태
  const { highlightedId, highlightType } = useWebhardHighlightStore();
  const isHighlighted = highlightedId === folder.id && highlightType === 'folder';

  // 드래그 오버 스타일
  const dragOverClass = isDragOver ? `${BG_COLOR.brandLight} border-2 ${BORDER_COLOR.brand}` : '';

  // 검색 결과 하이라이트 스타일 (3초간 강조)
  const highlightClass = isHighlighted ? `ring-2 ring-blue-500 ${BG_COLOR.info} animate-pulse` : '';

  // 선택 스타일
  const selectedClass = isSelected ? `${BORDER_COLOR.brand} ${BG_COLOR.brandLight}` : '';
  const displayFolderName = formatInquiryFolderDisplayName(folder.name);

  const folderName = isEditing ? (
    <input
      ref={editInputRef}
      type="text"
      value={editingFolderName}
      onChange={(e) => onEditChange?.(e.target.value)}
      onBlur={onEditBlur}
      onKeyDown={onEditKeyDown}
      className={`w-full px-2 py-1 text-sm border ${BORDER_COLOR.brand} rounded ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:outline-none focus:ring-2 focus:ring-brand`}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      autoFocus
    />
  ) : (
    <span className={`text-sm ${TEXT_COLOR.primary} truncate`} title={displayFolderName}>
      {displayFolderName}
    </span>
  );

  const displayDate = getFolderDisplayDate({
    created_at: folder.created_at ?? folder.updated_at ?? '',
    latest_file_created_at: folder.latest_file_created_at,
  });
  const parsedDisplayDate = new Date(displayDate);
  const folderDisplayDate = Number.isNaN(parsedDisplayDate.getTime())
    ? '-'
    : parsedDisplayDate.toLocaleDateString('ko-KR');
  const folderUploader = getFolderUploaderDisplayName({
    latest_file_uploader_display_name: folder.latest_file_uploader_display_name,
    companies: folder.companies,
  });

  if (viewMode === 'list') {
    return (
      <div
        data-folder-item
        data-folder-id={folder.id}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={onMouseEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        draggable={Boolean(onFolderDragStart)}
        onDragStart={handleDragStart}
        onDragEnd={onFolderDragEnd}
        className={`flex items-center px-4 py-3 border ${BORDER_COLOR.default} rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer ${dragOverClass} ${highlightClass} ${selectedClass}`}
      >
        {/* 체크박스 (고정 40px) */}
        <div className="w-10 shrink-0">
          <input
            type="checkbox"
            className="rounded"
            checked={isSelected}
            onChange={(e) => onCheckboxChange?.(folder.id, e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          />
        </div>
        {/* 폴더명 */}
        <div
          className="flex items-center gap-2 min-w-0"
          style={{ width: `calc(${fileNameColWidth}% - 40px)` }}
        >
          <FaFolder className={`${TEXT_COLOR.brand} text-sm shrink-0`} />
          {folderName}
          <div className={isSelected ? BADGE_STYLES.selectedWrapper : BADGE_STYLES.wrapper}>
            <FolderBadge folderId={folder.id} />
          </div>
        </div>
        <div
          className={`shrink-0 ${WEBHARD_STYLES.fileMeta} pl-3 pr-3 z-10`}
          style={{ width: `${dateColWidth}%`, minWidth: '110px' }}
        >
          {folderDisplayDate}
        </div>
        <div className="flex-1 min-w-[80px] flex items-center gap-1 pl-4 z-10">
          <span
            className={`${WEBHARD_STYLES.fileMeta} truncate flex-1 min-w-0`}
            title={folderUploader}
          >
            {folderUploader}
          </span>
        </div>
      </div>
    );
  }

  // Grid view
  return (
    <div
      data-folder-item
      data-folder-id={folder.id}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={onMouseEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      draggable={Boolean(onFolderDragStart)}
      onDragStart={handleDragStart}
      onDragEnd={onFolderDragEnd}
      className={`${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer relative ${dragOverClass} ${highlightClass} ${selectedClass}`}
    >
      {/* 좌상단 체크박스 오버레이 */}
      <div className="absolute top-2 left-2 z-10">
        <input
          type="checkbox"
          className="rounded"
          checked={isSelected}
          onChange={(e) => onCheckboxChange?.(folder.id, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="flex flex-col items-center gap-2 relative w-full">
        <FaFolder className={`text-3xl ${TEXT_COLOR.brand}`} />
        <div className="flex items-center gap-1 justify-center w-full">
          {isEditing ? folderName : <div className="truncate">{folderName}</div>}
          <div className={isSelected ? BADGE_STYLES.selectedWrapper : BADGE_STYLES.wrapper}>
            <FolderBadge folderId={folder.id} />
          </div>
        </div>
      </div>
    </div>
  );
});

export default WebhardFolderItem;
