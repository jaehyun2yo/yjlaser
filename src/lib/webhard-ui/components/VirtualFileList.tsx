'use client';

/**
 * VirtualFileList
 * Virtual scrolling file list component
 * Uses @tanstack/react-virtual for efficient rendering
 *
 * Note: Requires @tanstack/react-virtual as a peer dependency
 */

import { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { FileDTO } from '@/lib/webhard-ui/types';
import { TEXT_COLOR } from '@/lib/styles';

// ============ Types ============

export interface VirtualFileListProps<T extends FileDTO> {
  /** Files to display */
  files: T[];
  /** Selected file IDs */
  selectedIds: Set<string> | string[];
  /** File item render function */
  renderFileItem: (props: FileItemRenderProps<T>) => React.ReactNode;
  /** Empty state component */
  emptyState?: React.ReactNode;
  /** Item height in pixels */
  itemHeight?: number;
  /** Overscan count (items to render outside viewport) */
  overscan?: number;
  /** Container height */
  containerHeight?: string;
  /** Additional class name */
  className?: string;
}

export interface FileItemRenderProps<T extends FileDTO> {
  /** File data */
  file: T;
  /** Index in list */
  index: number;
  /** Is selected */
  isSelected: boolean;
  /** Virtual item style */
  style: React.CSSProperties;
}

// ============ Component ============

/**
 * VirtualFileList component
 * Provides virtual scrolling for large file lists
 */
export function VirtualFileList<T extends FileDTO>({
  files,
  selectedIds,
  renderFileItem,
  emptyState,
  itemHeight = 48,
  overscan = 10,
  containerHeight = 'calc(100vh - 280px)',
  className = '',
}: VirtualFileListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Convert selectedIds to Set for faster lookup
  const selectedSet = useMemo(() => {
    if (selectedIds instanceof Set) return selectedIds;
    return new Set(selectedIds);
  }, [selectedIds]);

  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Empty state
  if (files.length === 0) {
    return (
      <div className={className}>
        {emptyState || <div className={`text-center py-12 ${TEXT_COLOR.secondary}`}>No files</div>}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight, contain: 'strict' }}
    >
      <div
        style={{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const file = files[virtualItem.index];
          const isSelected = selectedSet.has(file.id);

          const style: React.CSSProperties = {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: `${virtualItem.size}px`,
            transform: `translateY(${virtualItem.start}px)`,
          };

          return renderFileItem({
            file,
            index: virtualItem.index,
            isSelected,
            style,
          });
        })}
      </div>
    </div>
  );
}

// ============ Grid Variant ============

export interface VirtualFileGridProps<T extends FileDTO> {
  /** Files to display */
  files: T[];
  /** Selected file IDs */
  selectedIds: Set<string> | string[];
  /** File item render function */
  renderFileItem: (props: FileItemRenderProps<T>) => React.ReactNode;
  /** Empty state component */
  emptyState?: React.ReactNode;
  /** Number of columns */
  columns?: number;
  /** Row height in pixels */
  rowHeight?: number;
  /** Overscan count */
  overscan?: number;
  /** Container height */
  containerHeight?: string;
  /** Additional class name */
  className?: string;
}

/**
 * VirtualFileGrid component
 * Provides virtual scrolling for grid layout
 */
export function VirtualFileGrid<T extends FileDTO>({
  files,
  selectedIds,
  renderFileItem,
  emptyState,
  columns = 4,
  rowHeight = 200,
  overscan = 3,
  containerHeight = 'calc(100vh - 280px)',
  className = '',
}: VirtualFileGridProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Convert selectedIds to Set for faster lookup
  const selectedSet = useMemo(() => {
    if (selectedIds instanceof Set) return selectedIds;
    return new Set(selectedIds);
  }, [selectedIds]);

  const rowCount = Math.ceil(files.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Empty state
  if (files.length === 0) {
    return (
      <div className={className}>
        {emptyState || <div className={`text-center py-12 ${TEXT_COLOR.secondary}`}>No files</div>}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight, contain: 'strict' }}
    >
      <div
        style={{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowFiles = files.slice(startIndex, startIndex + columns);

          return (
            <div
              key={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className={`grid gap-4 p-2 h-full`}
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              >
                {rowFiles.map((file, colIndex) => {
                  const globalIndex = startIndex + colIndex;
                  const isSelected = selectedSet.has(file.id);

                  return renderFileItem({
                    file,
                    index: globalIndex,
                    isSelected,
                    style: {},
                  });
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default VirtualFileList;
