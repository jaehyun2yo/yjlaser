'use client';

/**
 * WebhardColumnHeader
 * 웹하드 리스트 뷰 컬럼 헤더
 * - 전체 선택 체크박스
 * - 파일명/업로드날짜/업로더 컬럼
 * - 정렬 기능
 * - 컬럼 리사이즈 핸들
 */
import { memo } from 'react';
import { FaSort, FaSortUp, FaSortDown } from 'react-icons/fa';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

export type SortBy = 'name' | 'date' | 'size' | 'uploader';
export type SortOrder = 'asc' | 'desc';

export interface WebhardColumnHeaderProps {
  /** 현재 정렬 기준 */
  sortBy: SortBy;
  /** 정렬 순서 */
  sortOrder: SortOrder;
  /** 파일명 컬럼 너비 (%) */
  fileNameColWidth: number;
  /** 날짜 컬럼 너비 (%) */
  dateColWidth: number;
  /** 전체 파일 수 */
  filesCount: number;
  /** 전체 항목 수 (파일 + 폴더) */
  totalItemCount?: number;
  /** 선택된 파일 수 */
  selectedCount: number;
  /** 새 파일 모드 여부 (경로 컬럼 표시) */
  isNewFilesMode?: boolean;
  /** 정렬 핸들러 */
  onSort: (column: SortBy) => void;
  /** 전체 선택 핸들러 */
  onSelectAll: (checked: boolean) => void;
  /** 컬럼 리사이즈 시작 핸들러 */
  onColumnResizeStart: (column: 'fileName' | 'date') => (e: React.MouseEvent) => void;
  /** 추가 클래스명 */
  className?: string;
  /** ref for the container */
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * 웹하드 컬럼 헤더 컴포넌트
 */
export const WebhardColumnHeader = memo(function WebhardColumnHeader({
  sortBy,
  sortOrder,
  fileNameColWidth,
  dateColWidth,
  filesCount,
  totalItemCount,
  selectedCount,
  isNewFilesMode = false,
  onSort,
  onSelectAll,
  onColumnResizeStart,
  className = '',
  containerRef,
}: WebhardColumnHeaderProps) {
  // 정렬 아이콘 렌더링
  const renderSortIcon = (column: SortBy) => {
    if (sortBy !== column) {
      return <FaSort className="text-gray-400 text-xs ml-1" />;
    }
    return sortOrder === 'asc' ? (
      <FaSortUp className="text-brand text-xs ml-1" />
    ) : (
      <FaSortDown className="text-brand text-xs ml-1" />
    );
  };

  // 전체 선택 체크 상태 (파일 + 폴더)
  const total = totalItemCount ?? filesCount;
  const isAllSelected = total > 0 && selectedCount === total;

  return (
    <div
      ref={containerRef}
      className={`flex items-center px-4 py-2 text-xs ${TEXT_COLOR.secondary} border-b ${BORDER_COLOR.default} select-none ${className}`}
    >
      {/* 체크박스 (고정 40px) */}
      <div className="w-10 flex-shrink-0">
        <input
          type="checkbox"
          aria-label="전체 파일 및 폴더 선택"
          className="rounded"
          checked={isAllSelected}
          onChange={(e) => onSelectAll(e.target.checked)}
        />
      </div>

      {/* 파일명 (가변 너비) */}
      <div
        className="flex items-center relative"
        style={{ width: `calc(${fileNameColWidth}% - 40px)` }}
      >
        <button
          type="button"
          onClick={() => onSort('name')}
          className="flex items-center hover:text-brand transition-colors"
          aria-label="파일명으로 정렬"
          aria-pressed={sortBy === 'name'}
        >
          파일명
          {renderSortIcon('name')}
        </button>
        {/* 리사이즈 핸들 */}
        <div
          className="absolute -right-1 top-0 bottom-0 w-2 cursor-col-resize hover:bg-brand/30 group flex items-center justify-center z-10"
          onMouseDown={onColumnResizeStart('fileName')}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`w-px h-4 ${BG_COLOR.strong} group-hover:bg-brand`} />
        </div>
      </div>

      {/* 업로드날짜 (가변 너비) */}
      <div
        className="flex items-center whitespace-nowrap pl-3 pr-3 relative"
        style={{ width: `${dateColWidth}%`, minWidth: '110px' }}
      >
        <button
          type="button"
          onClick={() => onSort('date')}
          className="flex items-center hover:text-brand transition-colors"
          aria-label={isNewFilesMode ? '경로로 정렬' : '업로드 날짜로 정렬'}
          aria-pressed={sortBy === 'date'}
        >
          {isNewFilesMode ? '경로' : '업로드날짜'}
          {renderSortIcon('date')}
        </button>
        {/* 리사이즈 핸들 */}
        <div
          className="absolute -right-1 top-0 bottom-0 w-2 cursor-col-resize hover:bg-brand/30 group flex items-center justify-center z-10"
          onMouseDown={onColumnResizeStart('date')}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`w-px h-4 ${BG_COLOR.strong} group-hover:bg-brand`} />
        </div>
      </div>

      {/* 업로더 (나머지 공간, 최소 15%) */}
      <div className="flex-1 min-w-[80px] flex items-center whitespace-nowrap pl-4">
        <button
          type="button"
          onClick={() => onSort('uploader')}
          className="flex items-center hover:text-brand transition-colors"
          aria-label="업로더로 정렬"
          aria-pressed={sortBy === 'uploader'}
        >
          업로더
          {renderSortIcon('uploader')}
        </button>
      </div>
    </div>
  );
});

export default WebhardColumnHeader;
