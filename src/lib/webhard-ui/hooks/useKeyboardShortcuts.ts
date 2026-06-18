'use client';

/**
 * useKeyboardShortcuts
 * Keyboard shortcuts logic (ESC to deselect, Delete to delete, etc.)
 */

import { useEffect } from 'react';

interface UseKeyboardShortcutsOptions {
  /** Whether keyboard shortcuts are enabled */
  enabled?: boolean;
  /** Whether a modal is open (disables shortcuts) */
  isModalOpen?: boolean;
  /** Whether editing mode is active (disables shortcuts) */
  isEditing?: boolean;
  /** Number of selected items */
  selectedCount: number;
  /** Clear selection callback */
  onClearSelection?: () => void;
  /** Delete callback */
  onDelete?: () => void;
  /** Select all callback */
  onSelectAll?: () => void;
  /** Escape callback */
  onEscape?: () => void;
}

export function useKeyboardShortcuts({
  enabled = true,
  isModalOpen = false,
  isEditing = false,
  selectedCount,
  onClearSelection,
  onDelete,
  onSelectAll,
  onEscape,
}: UseKeyboardShortcutsOptions): void {
  /**
   * Keyboard event handler
   */
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if modal is open or editing
      if (isModalOpen || isEditing) return;

      // Ignore if inside input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case 'Escape':
          // ESC key: clear selection or custom escape handler
          e.preventDefault();
          if (onEscape) {
            onEscape();
          } else if (selectedCount > 0 && onClearSelection) {
            onClearSelection();
          }
          break;

        case 'Delete':
        case 'Backspace':
          // Delete/Backspace key: delete selected items
          if (selectedCount > 0 && onDelete) {
            e.preventDefault();
            onDelete();
          }
          break;

        case 'a':
        case 'A':
          // Ctrl/Cmd + A: select all
          if ((e.ctrlKey || e.metaKey) && onSelectAll) {
            e.preventDefault();
            onSelectAll();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enabled,
    selectedCount,
    isModalOpen,
    isEditing,
    onClearSelection,
    onDelete,
    onSelectAll,
    onEscape,
  ]);
}
