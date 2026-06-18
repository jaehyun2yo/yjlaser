/**
 * useWebhardKeyboardShortcuts
 * 키보드 단축키 로직 (ESC 선택 해제, Delete 삭제 등)
 */

import { useEffect } from 'react';
import { useWebhardSelectionStore, useWebhardModalStore } from '@/store/webhard';

interface UseWebhardKeyboardShortcutsProps {
  editingFileId: string | null;
  onDelete?: () => void;
  onSelectAll?: () => void;
}

export function useWebhardKeyboardShortcuts({
  editingFileId,
  onDelete,
  onSelectAll,
}: UseWebhardKeyboardShortcutsProps): void {
  const { selectedFiles, clearSelection } = useWebhardSelectionStore();
  const { activeModal } = useWebhardModalStore();

  /**
   * 키보드 이벤트 핸들러
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 모달이 열려있거나 파일 이름 편집 중이면 무시
      if (activeModal !== null || editingFileId) return;

      // input, textarea 내에서는 무시
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case 'Escape':
          // ESC 키: 선택 해제
          if (selectedFiles.size > 0) {
            e.preventDefault();
            clearSelection();
          }
          break;

        case 'Delete':
        case 'Backspace':
          // Delete/Backspace 키: 선택된 파일 삭제
          if (selectedFiles.size > 0 && onDelete) {
            e.preventDefault();
            onDelete();
          }
          break;

        case 'a':
        case 'A':
          // Ctrl/Cmd + A: 전체 선택
          if ((e.ctrlKey || e.metaKey) && onSelectAll) {
            e.preventDefault();
            onSelectAll();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFiles.size, activeModal, editingFileId, clearSelection, onDelete, onSelectAll]);
}
