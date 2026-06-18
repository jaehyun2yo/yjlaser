/**
 * useWebhardSidebarResize
 * 사이드바 리사이즈 로직 (폴더 트리 영역 너비 조절)
 */

import { useState, useEffect, useCallback } from 'react';
import { useWebhardLayoutStore } from '@/store/webhard';

interface UseWebhardSidebarResizeResult {
  sidebarWidth: number;
  isSidebarCollapsed: boolean;
  isSidebarResizing: boolean;
  isMobileSidebarOpen: boolean;
  handleSidebarResizeStart: () => void;
  toggleSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
}

export function useWebhardSidebarResize(): UseWebhardSidebarResizeResult {
  const {
    sidebarWidth,
    setSidebarWidth,
    isSidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebar,
  } = useWebhardLayoutStore();

  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  /**
   * 사이드바 리사이즈 시작
   */
  const handleSidebarResizeStart = useCallback(() => {
    setIsSidebarResizing(true);
  }, []);

  /**
   * 사이드바 리사이즈 마우스 이동/종료 이벤트 처리
   */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isSidebarResizing) return;

      const newWidth = e.clientX;
      // 최소 너비 0px (완전히 닫기), 최대 너비 600px
      const clampedWidth = Math.max(0, Math.min(600, newWidth));
      setSidebarWidth(clampedWidth);

      // 너비가 0이 되면 닫힌 상태로 설정
      if (clampedWidth === 0) {
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
  }, [isSidebarResizing, setSidebarWidth, setSidebarCollapsed]);

  return {
    sidebarWidth,
    isSidebarCollapsed,
    isSidebarResizing,
    isMobileSidebarOpen,
    handleSidebarResizeStart,
    toggleSidebar,
    setMobileSidebarOpen,
  };
}
