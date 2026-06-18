'use client';

/**
 * useColumnResize
 * Column resize logic (adjust file name and date column widths)
 */

import { useEffect, useCallback, useState } from 'react';

interface UseColumnResizeOptions {
  /** Header container ref */
  headerContainerRef: React.RefObject<HTMLElement | null>;
  /** Initial file name column width (%) */
  initialFileNameWidth?: number;
  /** Initial date column width (%) */
  initialDateWidth?: number;
  /** Minimum file name column width (%) */
  minFileNameWidth?: number;
  /** Minimum date column width (%) */
  minDateWidth?: number;
  /** Minimum uploader column width (%) */
  minUploaderWidth?: number;
  /** Checkbox column width (px) */
  checkboxWidth?: number;
  /** Width change callback */
  onWidthChange?: (column: 'fileName' | 'date', width: number) => void;
}

interface UseColumnResizeReturn {
  /** File name column width (%) */
  fileNameColWidth: number;
  /** Date column width (%) */
  dateColWidth: number;
  /** Currently resizing column */
  resizingColumn: 'fileName' | 'date' | null;
  /** Column resize start handler */
  handleColumnResizeStart: (column: 'fileName' | 'date') => (e: React.MouseEvent) => void;
}

export function useColumnResize({
  headerContainerRef,
  initialFileNameWidth = 50,
  initialDateWidth = 20,
  minFileNameWidth = 25,
  minDateWidth = 10,
  minUploaderWidth = 15,
  checkboxWidth = 40,
  onWidthChange,
}: UseColumnResizeOptions): UseColumnResizeReturn {
  const [fileNameColWidth, setFileNameColWidth] = useState(initialFileNameWidth);
  const [dateColWidth, setDateColWidth] = useState(initialDateWidth);
  const [resizingColumn, setResizingColumn] = useState<'fileName' | 'date' | null>(null);

  /**
   * Column resize start
   */
  const handleColumnResizeStart = useCallback(
    (column: 'fileName' | 'date') => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setResizingColumn(column);
    },
    []
  );

  /**
   * Column resize mouse move/end event handling
   */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingColumn || !headerContainerRef.current) return;

      const containerRect = headerContainerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const mouseX = e.clientX - containerRect.left;

      const availableWidth = containerWidth - checkboxWidth;
      const relativeX = mouseX - checkboxWidth;

      if (resizingColumn === 'fileName') {
        // File name column resize
        const newWidth = (relativeX / availableWidth) * 100;
        const maxFilenameWidth = 100 - dateColWidth - minUploaderWidth;
        const clampedWidth = Math.max(minFileNameWidth, Math.min(maxFilenameWidth, newWidth));
        setFileNameColWidth(clampedWidth);
        onWidthChange?.('fileName', clampedWidth);
      } else if (resizingColumn === 'date') {
        // Date column resize (starts after file name)
        const fileNameEndX = (fileNameColWidth / 100) * availableWidth;
        const newWidth = ((relativeX - fileNameEndX) / availableWidth) * 100;
        const maxDateWidth = 100 - fileNameColWidth - minUploaderWidth;
        const clampedWidth = Math.max(minDateWidth, Math.min(maxDateWidth, newWidth));
        setDateColWidth(clampedWidth);
        onWidthChange?.('date', clampedWidth);
      }
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
    };

    if (resizingColumn) {
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
  }, [
    resizingColumn,
    fileNameColWidth,
    dateColWidth,
    headerContainerRef,
    checkboxWidth,
    minFileNameWidth,
    minDateWidth,
    minUploaderWidth,
    onWidthChange,
  ]);

  return {
    fileNameColWidth,
    dateColWidth,
    resizingColumn,
    handleColumnResizeStart,
  };
}
