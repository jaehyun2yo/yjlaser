'use client';

/**
 * DragSelection
 * Drag selection box overlay component
 * - Shows selection area during mouse drag
 */

import { memo } from 'react';
import type { BoundingRect } from '@/lib/webhard-ui/types';

export interface DragSelectionProps {
  /** Is drag selecting */
  isDragSelecting: boolean;
  /** Selection box bounding rect (null if not rendered) */
  boundingRect: BoundingRect | null;
  /** Border color class */
  borderColorClass?: string;
  /** Background color class */
  bgColorClass?: string;
  /** Additional class name */
  className?: string;
}

/**
 * DragSelection component
 */
export const DragSelection = memo(function DragSelection({
  isDragSelecting,
  boundingRect,
  borderColorClass = 'border-orange-500',
  bgColorClass = 'bg-orange-500/10',
  className = '',
}: DragSelectionProps) {
  // Don't render if not drag selecting or no bounding rect
  if (!isDragSelecting || !boundingRect) {
    return null;
  }

  return (
    <div
      className={`absolute border-2 ${borderColorClass} ${bgColorClass} pointer-events-none z-40 ${className}`}
      style={{
        left: `${boundingRect.left}px`,
        top: `${boundingRect.top}px`,
        width: `${boundingRect.width}px`,
        height: `${boundingRect.height}px`,
      }}
    />
  );
});

export default DragSelection;
