'use client';

/**
 * useSelection
 * File selection logic hook
 * - Single selection, multiple selection, range selection
 * - Shift+Click range selection
 * - Ctrl+Click toggle selection
 * - Select all / deselect all
 */

import { useState, useCallback } from 'react';

interface UseSelectionOptions<T extends { id: string }> {
  /** Item list (for index calculation) */
  items: T[];
  /** Selection change callback */
  onSelectionChange?: (selectedIds: Set<string>) => void;
}

interface UseSelectionReturn {
  /** Selected item ID Set */
  selectedIds: Set<string>;
  /** Last clicked item index */
  lastClickedIndex: number | null;

  /** Item click handler (handles Shift, Ctrl combinations) */
  handleItemClick: (item: { id: string }, index: number, event: React.MouseEvent) => void;
  /** Checkbox click handler */
  handleCheckboxClick: (itemId: string, index: number, event: React.MouseEvent) => void;
  /** Toggle select all */
  handleSelectAll: () => void;
  /** Clear selection */
  clearSelection: () => void;
  /** Set selection directly */
  setSelection: (ids: Set<string>) => void;

  /** Check if item is selected */
  isSelected: (itemId: string) => boolean;
  /** Check if all items are selected */
  isAllSelected: boolean;
  /** Check if some items are selected */
  isPartiallySelected: boolean;
  /** Selected item count */
  selectedCount: number;
}

export function useSelection<T extends { id: string }>({
  items,
  onSelectionChange,
}: UseSelectionOptions<T>): UseSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // Helper to update selection and notify
  const updateSelection = useCallback(
    (newSelection: Set<string>) => {
      setSelectedIds(newSelection);
      onSelectionChange?.(newSelection);
    },
    [onSelectionChange]
  );

  /**
   * Select a single item (replaces current selection)
   */
  const selectItem = useCallback(
    (itemId: string, index: number) => {
      const newSelection = new Set([itemId]);
      updateSelection(newSelection);
      setLastClickedIndex(index);
    },
    [updateSelection]
  );

  /**
   * Toggle an item's selection
   */
  const toggleItem = useCallback(
    (itemId: string, index: number) => {
      const newSelection = new Set(selectedIds);
      if (newSelection.has(itemId)) {
        newSelection.delete(itemId);
      } else {
        newSelection.add(itemId);
      }
      updateSelection(newSelection);
      setLastClickedIndex(index);
    },
    [selectedIds, updateSelection]
  );

  /**
   * Select a range of items
   */
  const selectRange = useCallback(
    (fromIndex: number, toIndex: number) => {
      const start = Math.min(fromIndex, toIndex);
      const end = Math.max(fromIndex, toIndex);
      const newSelection = new Set(selectedIds);

      for (let i = start; i <= end; i++) {
        if (items[i]) {
          newSelection.add(items[i].id);
        }
      }

      updateSelection(newSelection);
    },
    [items, selectedIds, updateSelection]
  );

  /**
   * Item click handler
   * - Normal click: single selection
   * - Shift+click: range selection
   * - Ctrl+click: toggle selection
   */
  const handleItemClick = useCallback(
    (item: { id: string }, index: number, event: React.MouseEvent) => {
      if (event.shiftKey && lastClickedIndex !== null) {
        // Shift+click: range selection
        selectRange(lastClickedIndex, index);
      } else if (event.ctrlKey || event.metaKey) {
        // Ctrl+click: toggle selection
        toggleItem(item.id, index);
      } else {
        // Normal click: single selection
        selectItem(item.id, index);
      }
    },
    [lastClickedIndex, selectItem, toggleItem, selectRange]
  );

  /**
   * Checkbox click handler
   * - Always toggle behavior (except Shift)
   */
  const handleCheckboxClick = useCallback(
    (itemId: string, index: number, event: React.MouseEvent) => {
      event.stopPropagation(); // Prevent item click event

      if (event.shiftKey && lastClickedIndex !== null) {
        // Shift+checkbox click: range selection
        selectRange(lastClickedIndex, index);
      } else {
        // Normal checkbox click: toggle
        toggleItem(itemId, index);
      }
    },
    [lastClickedIndex, toggleItem, selectRange]
  );

  /**
   * Toggle select all
   */
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === items.length && items.length > 0) {
      // All selected -> deselect all
      updateSelection(new Set());
    } else {
      // Some or none selected -> select all
      const allIds = new Set(items.map((item) => item.id));
      updateSelection(allIds);
    }
  }, [selectedIds.size, items, updateSelection]);

  /**
   * Clear selection
   */
  const clearSelection = useCallback(() => {
    updateSelection(new Set());
    setLastClickedIndex(null);
  }, [updateSelection]);

  /**
   * Set selection directly
   */
  const setSelection = useCallback(
    (ids: Set<string>) => {
      updateSelection(ids);
    },
    [updateSelection]
  );

  /**
   * Check if item is selected
   */
  const isSelected = useCallback(
    (itemId: string) => {
      return selectedIds.has(itemId);
    },
    [selectedIds]
  );

  // Computed values
  const selectedCount = selectedIds.size;
  const isAllSelected = selectedCount > 0 && selectedCount === items.length;
  const isPartiallySelected = selectedCount > 0 && selectedCount < items.length;

  return {
    selectedIds,
    lastClickedIndex,
    handleItemClick,
    handleCheckboxClick,
    handleSelectAll,
    clearSelection,
    setSelection,
    isSelected,
    isAllSelected,
    isPartiallySelected,
    selectedCount,
  };
}
