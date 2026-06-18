'use client';

/**
 * useSidebarResize
 * Sidebar resize logic (adjust folder tree area width)
 */

import { useState, useEffect, useCallback } from 'react';

interface UseSidebarResizeOptions {
  /** Initial sidebar width (px) */
  initialWidth?: number;
  /** Minimum sidebar width (px) */
  minWidth?: number;
  /** Maximum sidebar width (px) */
  maxWidth?: number;
  /** Collapse threshold (px) - width below this collapses the sidebar */
  collapseThreshold?: number;
  /** Width change callback */
  onWidthChange?: (width: number) => void;
  /** Collapse change callback */
  onCollapsedChange?: (collapsed: boolean) => void;
}

interface UseSidebarResizeReturn {
  /** Current sidebar width (px) */
  sidebarWidth: number;
  /** Whether sidebar is collapsed */
  isSidebarCollapsed: boolean;
  /** Whether resize is in progress */
  isSidebarResizing: boolean;
  /** Whether mobile sidebar is open */
  isMobileSidebarOpen: boolean;
  /** Start sidebar resize */
  handleSidebarResizeStart: () => void;
  /** Toggle sidebar (collapse/expand) */
  toggleSidebar: () => void;
  /** Set mobile sidebar open state */
  setMobileSidebarOpen: (open: boolean) => void;
  /** Set sidebar width directly */
  setSidebarWidth: (width: number) => void;
  /** Set sidebar collapsed state directly */
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export function useSidebarResize({
  initialWidth = 240,
  minWidth = 180,
  maxWidth = 600,
  collapseThreshold = 100,
  onWidthChange,
  onCollapsedChange,
}: UseSidebarResizeOptions = {}): UseSidebarResizeReturn {
  const [sidebarWidth, setSidebarWidthState] = useState(initialWidth);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Store previous width for toggle
  const [previousWidth, setPreviousWidth] = useState(initialWidth);

  /**
   * Set sidebar width
   */
  const setSidebarWidth = useCallback(
    (width: number) => {
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, width));
      setSidebarWidthState(clampedWidth);
      onWidthChange?.(clampedWidth);
    },
    [minWidth, maxWidth, onWidthChange]
  );

  /**
   * Set sidebar collapsed state
   */
  const setSidebarCollapsed = useCallback(
    (collapsed: boolean) => {
      setIsSidebarCollapsed(collapsed);
      onCollapsedChange?.(collapsed);
    },
    [onCollapsedChange]
  );

  /**
   * Start sidebar resize
   */
  const handleSidebarResizeStart = useCallback(() => {
    setIsSidebarResizing(true);
  }, []);

  /**
   * Toggle sidebar (collapse/expand)
   */
  const toggleSidebar = useCallback(() => {
    if (isSidebarCollapsed) {
      // Expand to previous width
      setSidebarWidth(previousWidth);
      setSidebarCollapsed(false);
    } else {
      // Collapse
      setPreviousWidth(sidebarWidth);
      setSidebarCollapsed(true);
    }
  }, [isSidebarCollapsed, sidebarWidth, previousWidth, setSidebarWidth, setSidebarCollapsed]);

  /**
   * Handle sidebar resize mouse move/end events
   */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isSidebarResizing) return;

      const newWidth = e.clientX;
      const clampedWidth = Math.max(0, Math.min(maxWidth, newWidth));
      setSidebarWidthState(clampedWidth);
      onWidthChange?.(clampedWidth);

      // Collapse if width is below threshold
      if (clampedWidth <= collapseThreshold) {
        setSidebarCollapsed(true);
      } else {
        setSidebarCollapsed(false);
      }
    };

    const handleMouseUp = () => {
      setIsSidebarResizing(false);
    };

    if (isSidebarResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isSidebarResizing, maxWidth, collapseThreshold, setSidebarCollapsed, onWidthChange]);

  return {
    sidebarWidth,
    isSidebarCollapsed,
    isSidebarResizing,
    isMobileSidebarOpen,
    handleSidebarResizeStart,
    toggleSidebar,
    setMobileSidebarOpen,
    setSidebarWidth,
    setSidebarCollapsed,
  };
}
