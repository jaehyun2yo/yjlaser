'use client';

/**
 * useContextMenu
 * Context menu (right-click menu) logic
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ContextMenuState } from '@/lib/webhard-ui/types';

interface UseContextMenuOptions<T = unknown> {
  /** Close callback */
  onClose?: () => void;
}

interface UseContextMenuReturn<T = unknown> {
  /** Context menu state */
  contextMenu: ContextMenuState<T> | null;
  /** Context menu ref (for click outside detection) */
  contextMenuRef: React.RefObject<HTMLDivElement | null>;
  /** Show context menu */
  handleContextMenu: (e: React.MouseEvent, item: T) => void;
  /** Close context menu */
  closeContextMenu: () => void;
  /** Check if context menu is open */
  isOpen: boolean;
}

export function useContextMenu<T = unknown>({
  onClose,
}: UseContextMenuOptions<T> = {}): UseContextMenuReturn<T> {
  const [contextMenu, setContextMenu] = useState<ContextMenuState<T> | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  /**
   * Show context menu
   */
  const handleContextMenu = useCallback((e: React.MouseEvent, item: T) => {
    e.preventDefault();
    e.stopPropagation();

    // Calculate position, ensuring menu stays within viewport
    const x = e.clientX;
    const y = e.clientY;

    setContextMenu({
      item,
      x,
      y,
    });
  }, []);

  /**
   * Close context menu
   */
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    onClose?.();
  }, [onClose]);

  /**
   * Close context menu when clicking outside
   */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu();
      }
    };

    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('contextmenu', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('contextmenu', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [contextMenu, closeContextMenu]);

  return {
    contextMenu,
    contextMenuRef,
    handleContextMenu,
    closeContextMenu,
    isOpen: contextMenu !== null,
  };
}
