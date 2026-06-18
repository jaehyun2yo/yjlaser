/**
 * useWebhardDragSelection
 * 드래그 선택 로직 (마우스로 사각형 영역 선택)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useWebhardSelectionStore, useWebhardDragDropStore } from '@/store/webhard';
import type { WebhardFile } from '@/types/webhard';

interface UseWebhardDragSelectionProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  files: WebhardFile[];
}

export function useWebhardDragSelection({
  containerRef,
  files,
}: UseWebhardDragSelectionProps) {
  const { selectedFiles, setSelection, clearSelection } = useWebhardSelectionStore();
  const {
    isDragSelecting,
    dragSelectStart,
    dragSelectEnd,
    startDragSelect,
    updateDragSelect,
    endDragSelect,
    getBoundingRect,
  } = useWebhardDragDropStore();

  // 드래그 시작 시점의 선택 상태 저장 (Ctrl 키 지원)
  const [initialSelection, setInitialSelection] = useState<Set<string>>(new Set());

  // RAF 최적화
  const rafIdRef = useRef<number | null>(null);
  const pendingEndRef = useRef<{ x: number; y: number } | null>(null);

  // 드래그 후 클릭 무시용 플래그
  const justFinishedDragSelectRef = useRef(false);

  /**
   * 요소가 선택 박스 안에 있는지 확인
   */
  const isElementInSelectionBox = useCallback(
    (element: HTMLElement): boolean => {
      const box = getBoundingRect();
      if (!box || !containerRef.current) return false;

      const containerRect = containerRef.current.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const scrollLeft = containerRef.current.scrollLeft;
      const scrollTop = containerRef.current.scrollTop;

      // 요소의 컨테이너 기준 상대 좌표 (스크롤 포함)
      const elementRelative = {
        left: elementRect.left - containerRect.left + scrollLeft,
        top: elementRect.top - containerRect.top + scrollTop,
        right: elementRect.right - containerRect.left + scrollLeft,
        bottom: elementRect.bottom - containerRect.top + scrollTop,
      };

      // 겹침 확인 (AABB collision)
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
   * 선택 박스에 포함된 파일 업데이트
   */
  const updateSelection = useCallback(() => {
    if (!containerRef.current || !isDragSelecting) return;

    const fileElements = containerRef.current.querySelectorAll('[data-file-item]');
    const newSelected = new Set(initialSelection);

    fileElements.forEach((element) => {
      if (isElementInSelectionBox(element as HTMLElement)) {
        const fileId = element.getAttribute('data-file-id');
        if (fileId) {
          newSelected.add(fileId);
        }
      }
    });

    setSelection(newSelected);
  }, [containerRef, isDragSelecting, initialSelection, isElementInSelectionBox, setSelection]);

  // 드래그 선택 중 선택 영역 업데이트
  useEffect(() => {
    if (isDragSelecting) {
      updateSelection();
    }
  }, [isDragSelecting, dragSelectEnd, updateSelection]);

  /**
   * 드래그 시작
   */
  const handleDragSelectStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // 파일/폴더 요소 클릭 시 무시
      const target = e.target as HTMLElement;
      const isInteractiveElement =
        target.closest('[data-file-item]') ||
        target.closest('[data-folder-item]') ||
        target.closest('input[type="checkbox"]') ||
        target.closest('button') ||
        target.closest('a');

      if (isInteractiveElement) return;

      // 왼쪽 마우스 버튼만
      if (e.button !== 0) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + container.scrollLeft;
      const y = e.clientY - rect.top + container.scrollTop;

      startDragSelect(x, y);

      // Ctrl/Cmd 키를 누르고 있으면 기존 선택 유지
      if (e.ctrlKey || e.metaKey) {
        setInitialSelection(new Set(selectedFiles));
      } else {
        setInitialSelection(new Set());
        clearSelection();
      }

      e.preventDefault();
    },
    [containerRef, selectedFiles, clearSelection, startDragSelect]
  );

  /**
   * 드래그 중 (마우스 이동) 및 종료 이벤트 처리
   */
  useEffect(() => {
    if (!isDragSelecting) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + container.scrollLeft;
      const y = e.clientY - rect.top + container.scrollTop;

      // RAF로 최적화
      pendingEndRef.current = { x, y };

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          if (pendingEndRef.current) {
            updateDragSelect(pendingEndRef.current.x, pendingEndRef.current.y);
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

      // 드래그 완료 후 클릭 무시 플래그 설정
      const box = getBoundingRect();
      if (box && (box.width > 5 || box.height > 5)) {
        justFinishedDragSelectRef.current = true;
        setTimeout(() => {
          justFinishedDragSelectRef.current = false;
        }, 100);
      }

      endDragSelect();
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
  }, [isDragSelecting, containerRef, updateDragSelect, endDragSelect, getBoundingRect]);

  /**
   * 선택 박스 스타일 계산
   */
  const getSelectionBoxStyle = useCallback((): React.CSSProperties | null => {
    const box = getBoundingRect();
    if (!isDragSelecting || !box) return null;

    return {
      position: 'absolute',
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      border: '1px solid #3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      pointerEvents: 'none',
      zIndex: 50,
    };
  }, [isDragSelecting, getBoundingRect]);

  return {
    isDragSelecting,
    dragSelectStart,
    dragSelectEnd,
    justFinishedDragSelectRef,
    handleDragSelectStart,
    getSelectionBoxStyle,
    getBoundingRect,
  };
}
