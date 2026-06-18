'use client';

/**
 * useDragSelection
 * Drag selection logic (select items by drawing a rectangle with mouse)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { BoundingRect } from '@/lib/webhard-ui/types';

interface UseDragSelectionOptions {
  /** Container element ref */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Data attribute name to identify selectable items (default: 'data-file-id') */
  itemAttribute?: string;
  /** Currently selected IDs */
  selectedIds: Set<string>;
  /** Selection setter */
  setSelection: (ids: Set<string>) => void;
  /** Clear selection */
  clearSelection: () => void;
}

interface UseDragSelectionReturn {
  /** Whether drag selection is in progress */
  isDragSelecting: boolean;
  /** Bounding rect of selection box */
  boundingRect: BoundingRect | null;
  /** Mouse down handler to start drag selection */
  handleDragSelectStart: (e: React.MouseEvent) => void;
  /** Flag to prevent click after drag selection */
  justFinishedDragSelectRef: React.MutableRefObject<boolean>;
}

export function useDragSelection({
  containerRef,
  itemAttribute = 'data-file-id',
  selectedIds,
  setSelection,
  clearSelection,
}: UseDragSelectionOptions): UseDragSelectionReturn {
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);

  // Initial selection when drag started (for Ctrl key support)
  const [initialSelection, setInitialSelection] = useState<Set<string>>(new Set());

  // RAF optimization
  const rafIdRef = useRef<number | null>(null);
  const pendingEndRef = useRef<{ x: number; y: number } | null>(null);

  // Flag to prevent click after drag selection
  const justFinishedDragSelectRef = useRef(false);

  /**
   * Calculate bounding rect from drag start and end points
   */
  const getBoundingRect = useCallback((): BoundingRect | null => {
    if (!dragStart || !dragEnd) return null;

    const left = Math.min(dragStart.x, dragEnd.x);
    const top = Math.min(dragStart.y, dragEnd.y);
    const right = Math.max(dragStart.x, dragEnd.x);
    const bottom = Math.max(dragStart.y, dragEnd.y);

    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    };
  }, [dragStart, dragEnd]);

  /**
   * Check if an element is inside the selection box
   */
  const isElementInSelectionBox = useCallback(
    (element: HTMLElement): boolean => {
      const box = getBoundingRect();
      if (!box || !containerRef.current) return false;

      const containerRect = containerRef.current.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const scrollLeft = containerRef.current.scrollLeft;
      const scrollTop = containerRef.current.scrollTop;

      // Element's position relative to container (including scroll)
      const elementRelative = {
        left: elementRect.left - containerRect.left + scrollLeft,
        top: elementRect.top - containerRect.top + scrollTop,
        right: elementRect.right - containerRect.left + scrollLeft,
        bottom: elementRect.bottom - containerRect.top + scrollTop,
      };

      // AABB collision detection
      return !(
        elementRelative.right < box.left ||
        elementRelative.left > box.left + box.width ||
        elementRelative.bottom < box.top ||
        elementRelative.top > box.top + box.height
      );
    },
    [containerRef, getBoundingRect]
  );

  /**
   * Update selection based on items inside selection box
   */
  const updateSelection = useCallback(() => {
    if (!containerRef.current || !isDragSelecting) return;

    const itemElements = containerRef.current.querySelectorAll(`[${itemAttribute}]`);
    const newSelected = new Set(initialSelection);

    itemElements.forEach((element) => {
      if (isElementInSelectionBox(element as HTMLElement)) {
        const itemId = element.getAttribute(itemAttribute);
        if (itemId) {
          newSelected.add(itemId);
        }
      }
    });

    setSelection(newSelected);
  }, [containerRef, isDragSelecting, initialSelection, isElementInSelectionBox, setSelection, itemAttribute]);

  // Update selection when drag changes
  useEffect(() => {
    if (isDragSelecting) {
      updateSelection();
    }
  }, [isDragSelecting, dragEnd, updateSelection]);

  /**
   * Start drag selection
   */
  const handleDragSelectStart = useCallback(
    (e: React.MouseEvent) => {
      // Ignore clicks on interactive elements
      const target = e.target as HTMLElement;
      const isInteractiveElement =
        target.closest(`[${itemAttribute}]`) ||
        target.closest('[data-folder-item]') ||
        target.closest('input[type="checkbox"]') ||
        target.closest('button') ||
        target.closest('a');

      if (isInteractiveElement) return;

      // Only left mouse button
      if (e.button !== 0) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + container.scrollLeft;
      const y = e.clientY - rect.top + container.scrollTop;

      setDragStart({ x, y });
      setDragEnd({ x, y });
      setIsDragSelecting(true);

      // Ctrl/Cmd key: keep existing selection
      if (e.ctrlKey || e.metaKey) {
        setInitialSelection(new Set(selectedIds));
      } else {
        setInitialSelection(new Set());
        clearSelection();
      }

      e.preventDefault();
    },
    [containerRef, selectedIds, clearSelection, itemAttribute]
  );

  /**
   * Handle mouse move and mouse up events during drag selection
   */
  useEffect(() => {
    if (!isDragSelecting) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + container.scrollLeft;
      const y = e.clientY - rect.top + container.scrollTop;

      // RAF optimization
      pendingEndRef.current = { x, y };

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          if (pendingEndRef.current) {
            setDragEnd(pendingEndRef.current);
          }
          rafIdRef.current = null;
        });
      }
    };

    const handleMouseUp = () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingEndRef.current = null;

      // Set flag to prevent click after drag
      const box = getBoundingRect();
      if (box && (box.width > 5 || box.height > 5)) {
        justFinishedDragSelectRef.current = true;
        setTimeout(() => {
          justFinishedDragSelectRef.current = false;
        }, 100);
      }

      setIsDragSelecting(false);
      setDragStart(null);
      setDragEnd(null);
      setInitialSelection(new Set());
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isDragSelecting, containerRef, getBoundingRect]);

  return {
    isDragSelecting,
    boundingRect: getBoundingRect(),
    handleDragSelectStart,
    justFinishedDragSelectRef,
  };
}
