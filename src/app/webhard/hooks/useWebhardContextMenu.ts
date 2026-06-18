/**
 * useWebhardContextMenu
 * 컨텍스트 메뉴(우클릭) 로직
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { WebhardFile } from '@/types/webhard';

interface ContextMenuState {
  file: WebhardFile;
  x: number;
  y: number;
}

interface UseWebhardContextMenuResult {
  contextMenu: ContextMenuState | null;
  contextMenuRef: React.RefObject<HTMLDivElement | null>;
  handleContextMenu: (e: React.MouseEvent, file: WebhardFile) => void;
  closeContextMenu: () => void;
}

export function useWebhardContextMenu(): UseWebhardContextMenuResult {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  /**
   * 컨텍스트 메뉴 표시
   */
  const handleContextMenu = useCallback((e: React.MouseEvent, file: WebhardFile) => {
    e.preventDefault();
    setContextMenu({
      file,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  /**
   * 컨텍스트 메뉴 닫기
   */
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  /**
   * 외부 클릭 시 컨텍스트 메뉴 닫기
   */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  return {
    contextMenu,
    contextMenuRef,
    handleContextMenu,
    closeContextMenu,
  };
}
