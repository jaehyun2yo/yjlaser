'use client';

/**
 * useFileSort
 * File sorting logic (client-side sorting)
 */

import { useState, useCallback } from 'react';
import type { SortBy, SortOrder, FileDTO } from '@/lib/webhard-ui/types';

interface UseFileSortOptions {
  /** Initial sort by */
  initialSortBy?: SortBy;
  /** Initial sort order */
  initialSortOrder?: SortOrder;
  /** Sort change callback */
  onSortChange?: (sortBy: SortBy, sortOrder: SortOrder) => void;
}

interface UseFileSortReturn {
  /** Current sort by */
  sortBy: SortBy;
  /** Current sort order */
  sortOrder: SortOrder;
  /** Set sort */
  setSort: (sortBy: SortBy, sortOrder?: SortOrder) => void;
  /** Toggle sort for a column */
  toggleSort: (column: SortBy) => void;
  /** Sort files */
  sortFiles: <T extends FileDTO>(files: T[]) => T[];
}

export function useFileSort({
  initialSortBy = 'date',
  initialSortOrder = 'desc',
  onSortChange,
}: UseFileSortOptions = {}): UseFileSortReturn {
  const [sortBy, setSortBy] = useState<SortBy>(initialSortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder);

  /**
   * Set sort
   */
  const setSort = useCallback(
    (newSortBy: SortBy, newSortOrder?: SortOrder) => {
      const order = newSortOrder ?? (sortBy === newSortBy && sortOrder === 'asc' ? 'desc' : 'asc');
      setSortBy(newSortBy);
      setSortOrder(order);
      onSortChange?.(newSortBy, order);
    },
    [sortBy, sortOrder, onSortChange]
  );

  /**
   * Toggle sort for a column
   */
  const toggleSort = useCallback(
    (column: SortBy) => {
      if (sortBy === column) {
        // Same column: toggle order
        const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
        setSortOrder(newOrder);
        onSortChange?.(column, newOrder);
      } else {
        // Different column: default to ascending
        setSortBy(column);
        setSortOrder('asc');
        onSortChange?.(column, 'asc');
      }
    },
    [sortBy, sortOrder, onSortChange]
  );

  /**
   * Sort files
   */
  const sortFiles = useCallback(
    <T extends FileDTO>(fileList: T[]): T[] => {
      return [...fileList].sort((a, b) => {
        let comparison = 0;

        switch (sortBy) {
          case 'name':
            comparison = a.original_name.localeCompare(b.original_name, 'ko');
            break;

          case 'date':
            comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            break;

          case 'size':
            comparison = a.size - b.size;
            break;

          case 'uploader':
            // Sort by company name (Korean alphabetical order)
            const uploaderA = a.companies?.company_name || '';
            const uploaderB = b.companies?.company_name || '';
            comparison = uploaderA.localeCompare(uploaderB, 'ko');
            break;

          default:
            comparison = 0;
        }

        return sortOrder === 'asc' ? comparison : -comparison;
      });
    },
    [sortBy, sortOrder]
  );

  return {
    sortBy,
    sortOrder,
    setSort,
    toggleSort,
    sortFiles,
  };
}

/**
 * Determine if a file is new (uploaded within 24 hours and not downloaded)
 */
export function isFileNew(file: FileDTO): boolean {
  // Already downloaded files are not new
  if (file.is_downloaded) return false;

  const fileDate = new Date(file.created_at);
  const nowDate = new Date();
  const hoursDiff = (nowDate.getTime() - fileDate.getTime()) / (1000 * 60 * 60);
  return hoursDiff < 24;
}
