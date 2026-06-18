'use client';

/**
 * ColumnHeader
 * List view column header
 * - Select all checkbox
 * - File name / Date / Uploader columns
 * - Sort functionality
 * - Column resize handles
 */

import { memo } from 'react';
import type { SortBy, SortOrder } from '@/lib/webhard-ui/types';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

export interface ColumnConfig {
  /** Column key */
  key: SortBy;
  /** Column label */
  label: string;
  /** Column width (%) - only for resizable columns */
  width?: number;
  /** Whether column is resizable */
  resizable?: boolean;
  /** Whether column is sortable */
  sortable?: boolean;
  /** Flex grow (for flexible width columns) */
  flexGrow?: boolean;
  /** Minimum width (%) */
  minWidth?: number;
}

export interface ColumnHeaderProps {
  /** Columns configuration */
  columns: ColumnConfig[];
  /** Current sort by */
  sortBy: SortBy;
  /** Sort order */
  sortOrder: SortOrder;
  /** Total items count */
  itemsCount: number;
  /** Selected items count */
  selectedCount: number;
  /** Sort handler */
  onSort: (column: SortBy) => void;
  /** Select all handler */
  onSelectAll: (checked: boolean) => void;
  /** Column resize start handler */
  onColumnResizeStart?: (column: SortBy) => (e: React.MouseEvent) => void;
  /** Additional class name */
  className?: string;
  /** Container ref */
  containerRef?: React.RefObject<HTMLDivElement | null>;
  /** Checkbox column width (px) */
  checkboxWidth?: number;
}

/**
 * Sort icons
 */
const SortIcon = ({ active, direction }: { active: boolean; direction: SortOrder }) => {
  if (!active) {
    return (
      <svg className="w-3 h-3 text-gray-400 ml-1" fill="currentColor" viewBox="0 0 20 20">
        <path d="M5 12a1 1 0 102 0V6.414l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L5 6.414V12zM15 8a1 1 0 10-2 0v5.586l-1.293-1.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L15 13.586V8z" />
      </svg>
    );
  }

  if (direction === 'asc') {
    return (
      <svg className="w-3 h-3 text-orange-500 ml-1" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return (
    <svg className="w-3 h-3 text-orange-500 ml-1" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
};

/**
 * Resize handle component
 */
const ResizeHandle = ({
  onClick,
  onMouseDown,
}: {
  onClick: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
}) => (
  <div
    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-orange-500/30 group flex items-center justify-center"
    onMouseDown={onMouseDown}
    onClick={onClick}
  >
    <div className={`w-0.5 h-4 ${BG_COLOR.muted} group-hover:bg-orange-500`} />
  </div>
);

/**
 * ColumnHeader component
 */
export const ColumnHeader = memo(function ColumnHeader({
  columns,
  sortBy,
  sortOrder,
  itemsCount,
  selectedCount,
  onSort,
  onSelectAll,
  onColumnResizeStart,
  className = '',
  containerRef,
  checkboxWidth = 40,
}: ColumnHeaderProps) {
  const isAllSelected = itemsCount > 0 && selectedCount === itemsCount;

  return (
    <div
      ref={containerRef}
      className={`flex items-center px-4 py-2 text-xs ${TEXT_COLOR.secondary} border-b ${BORDER_COLOR.default} select-none ${className}`}
    >
      {/* Checkbox (fixed width) */}
      <div className="flex-shrink-0" style={{ width: checkboxWidth }}>
        <input
          type="checkbox"
          className="rounded"
          checked={isAllSelected}
          onChange={(e) => onSelectAll(e.target.checked)}
        />
      </div>

      {/* Columns */}
      {columns.map((column, index) => {
        const isActive = sortBy === column.key;
        const isLastColumn = index === columns.length - 1;

        return (
          <div
            key={column.key}
            className={`flex items-center ${column.sortable ? 'cursor-pointer hover:text-orange-500' : ''} transition-colors relative whitespace-nowrap ${index > 0 ? 'pl-2' : ''}`}
            style={{
              width: column.width ? `${column.width}%` : undefined,
              flex: column.flexGrow ? '1 1 auto' : undefined,
              minWidth: column.minWidth ? `${column.minWidth}%` : undefined,
            }}
            onClick={column.sortable ? () => onSort(column.key) : undefined}
          >
            {column.label}
            {column.sortable && <SortIcon active={isActive} direction={sortOrder} />}

            {/* Resize handle (not for last column) */}
            {column.resizable && !isLastColumn && onColumnResizeStart && (
              <ResizeHandle
                onClick={(e) => e.stopPropagation()}
                onMouseDown={onColumnResizeStart(column.key)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});

export default ColumnHeader;
