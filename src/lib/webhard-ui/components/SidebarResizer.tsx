'use client';

/**
 * SidebarResizer
 * Sidebar resize bar component
 * - Drag to adjust width
 * - Click to toggle
 */

import { useCallback, useState } from 'react';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

export interface SidebarResizerProps {
  /** Sidebar collapsed state */
  isSidebarCollapsed: boolean;
  /** Current sidebar width */
  sidebarWidth: number;
  /** Width change handler */
  onWidthChange: (width: number) => void;
  /** Toggle handler */
  onToggle: () => void;
  /** Collapsed state change handler */
  onCollapsedChange: (collapsed: boolean) => void;
  /** Minimum width */
  minWidth?: number;
  /** Maximum width */
  maxWidth?: number;
  /** Collapse threshold */
  collapseThreshold?: number;
  /** Additional class name */
  className?: string;
  /** Expand icon */
  expandIcon?: React.ReactNode;
  /** Collapse icon */
  collapseIcon?: React.ReactNode;
}

/**
 * Default chevron right icon
 */
const DefaultExpandIcon = () => (
  <svg className="w-2.5 h-2.5 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
    <path
      fillRule="evenodd"
      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
      clipRule="evenodd"
    />
  </svg>
);

/**
 * Default chevron left icon
 */
const DefaultCollapseIcon = ({ isDragging }: { isDragging: boolean }) => (
  <svg
    className={`w-2.5 h-2.5 transition-colors duration-200 ${isDragging ? 'text-orange-500' : `${TEXT_COLOR.muted} group-hover:text-orange-500`}`}
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
      clipRule="evenodd"
    />
  </svg>
);

/**
 * SidebarResizer component
 */
export function SidebarResizer({
  isSidebarCollapsed,
  sidebarWidth,
  onWidthChange,
  onToggle,
  onCollapsedChange,
  minWidth = 180,
  maxWidth = 400,
  collapseThreshold = 100,
  className = '',
  expandIcon,
  collapseIcon,
}: SidebarResizerProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Store drag start point
      const startX = e.clientX;
      let dragging = false;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragging) {
          // Consider it a drag if moved more than 5px
          if (Math.abs(moveEvent.clientX - startX) > 5) {
            dragging = true;
            setIsDragging(true);
          }
        }

        if (dragging) {
          const newWidth = moveEvent.clientX;
          const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
          onWidthChange(clampedWidth);

          // Collapse if width is below threshold
          if (newWidth < collapseThreshold) {
            onCollapsedChange(true);
          } else {
            onCollapsedChange(false);
          }
        }
      };

      const handleMouseUp = () => {
        if (!dragging) {
          // Just clicked without dragging -> toggle
          onToggle();
        }
        setIsDragging(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [minWidth, maxWidth, collapseThreshold, onWidthChange, onCollapsedChange, onToggle]
  );

  const ExpandIcon = expandIcon || <DefaultExpandIcon />;
  const CollapseIcon = collapseIcon || <DefaultCollapseIcon isDragging={isDragging} />;

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`hidden lg:flex absolute top-0 bottom-0 z-20 items-center justify-center group ${
        isDragging ? 'cursor-grabbing' : 'cursor-col-resize'
      } ${isSidebarCollapsed ? 'w-8 ml-0' : 'w-4 -ml-2'} ${className}`}
      style={{ left: isSidebarCollapsed ? '0px' : `${sidebarWidth}px` }}
      title={
        isSidebarCollapsed ? 'Click: Open sidebar' : 'Click: Close sidebar | Drag: Adjust width'
      }
    >
      {/* Resize hint line (only when expanded) */}
      {!isSidebarCollapsed && (
        <div
          className={`absolute top-0 bottom-0 w-[2px] rounded-full transition-all duration-200 ${
            isDragging
              ? 'bg-orange-500 shadow-[0_0_8px_rgba(237,108,0,0.5)]'
              : `${BG_COLOR.muted} group-hover:bg-orange-500/70`
          }`}
        />
      )}

      {/* Toggle button */}
      <div
        className={`relative w-6 h-8 flex items-center justify-center rounded-full border transition-all duration-200 ${
          isSidebarCollapsed
            ? `${BG_COLOR.card} border-orange-500 shadow-md hover:shadow-lg hover:scale-105`
            : isDragging
              ? `${BG_COLOR.card} border-orange-500 shadow-lg shadow-orange-500/20 scale-110`
              : `${BG_COLOR.card} ${BORDER_COLOR.default} shadow-md hover:shadow-lg hover:border-orange-500/50 hover:scale-105`
        }`}
      >
        {isSidebarCollapsed ? ExpandIcon : CollapseIcon}
      </div>
    </div>
  );
}

export default SidebarResizer;
