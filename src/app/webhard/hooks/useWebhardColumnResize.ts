/**
 * useWebhardColumnResize
 * 컬럼 리사이즈 로직 (파일명, 날짜 컬럼 너비 조절)
 */

import { useEffect, useCallback } from 'react';
import { useWebhardLayoutStore } from '@/store/webhard';

interface UseWebhardColumnResizeProps {
  headerContainerRef: React.RefObject<HTMLDivElement | null>;
}

export function useWebhardColumnResize({ headerContainerRef }: UseWebhardColumnResizeProps) {
  const {
    fileNameColWidth,
    dateColWidth,
    setColumnWidth,
    resizingColumn,
    startResizing,
    stopResizing,
  } = useWebhardLayoutStore();

  /**
   * 컬럼 리사이즈 시작
   */
  const handleColumnResizeStart = useCallback(
    (column: 'fileName' | 'date') => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startResizing(column);
    },
    [startResizing]
  );

  /**
   * 컬럼 리사이즈 마우스 이동/종료 이벤트 처리
   */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingColumn || !headerContainerRef.current) return;

      const containerRect = headerContainerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const mouseX = e.clientX - containerRect.left;

      // 체크박스 고정 너비 (40px)
      const checkboxWidth = 40;
      const availableWidth = containerWidth - checkboxWidth;
      const relativeX = mouseX - checkboxWidth;

      // 업로더 컬럼 최소 너비 (버튼 2개 + 이름 = 약 15%)
      const minUploaderWidth = 15;

      if (resizingColumn === 'fileName') {
        // 파일명 컬럼 리사이즈
        const newWidth = (relativeX / availableWidth) * 100;
        // 최소 25%, 최대값은 업로더 최소 너비 확보
        const maxFilenameWidth = 100 - dateColWidth - minUploaderWidth;
        const clampedWidth = Math.max(25, Math.min(maxFilenameWidth, newWidth));
        setColumnWidth('fileName', clampedWidth);
      } else if (resizingColumn === 'date') {
        // 업로드날짜 컬럼 리사이즈 (파일명 뒤에서 시작)
        const fileNameEndX = (fileNameColWidth / 100) * availableWidth;
        const newWidth = ((relativeX - fileNameEndX) / availableWidth) * 100;
        // 최소 10%, 최대값은 업로더 최소 너비 확보
        const maxDateWidth = 100 - fileNameColWidth - minUploaderWidth;
        const clampedWidth = Math.max(10, Math.min(maxDateWidth, newWidth));
        setColumnWidth('date', clampedWidth);
      }
    };

    const handleMouseUp = () => {
      stopResizing();
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
    setColumnWidth,
    stopResizing,
  ]);

  return {
    fileNameColWidth,
    dateColWidth,
    resizingColumn,
    handleColumnResizeStart,
  };
}
