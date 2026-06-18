/**
 * useWebhardSelectionStore 테스트
 * TDD: 테스트 먼저 작성
 */
import { act, renderHook } from '@testing-library/react';

// 스토어는 아직 구현되지 않음 - TDD
import { useWebhardSelectionStore } from '@/store/webhard/useWebhardSelectionStore';

describe('useWebhardSelectionStore', () => {
  // 각 테스트 전에 스토어 초기화
  beforeEach(() => {
    const { result } = renderHook(() => useWebhardSelectionStore());
    act(() => {
      result.current.clearSelection();
    });
  });

  describe('초기 상태', () => {
    it('selectedFiles가 빈 Set이어야 한다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());
      expect(result.current.selectedFiles.size).toBe(0);
    });

    it('lastClickedFileIndex가 null이어야 한다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());
      expect(result.current.lastClickedFileIndex).toBeNull();
    });
  });

  describe('selectFile', () => {
    it('파일을 선택하면 selectedFiles에 추가된다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.selectFile('file-1', 0);
      });

      expect(result.current.selectedFiles.has('file-1')).toBe(true);
      expect(result.current.selectedFiles.size).toBe(1);
    });

    it('파일 선택 시 lastClickedFileIndex가 업데이트된다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.selectFile('file-1', 5);
      });

      expect(result.current.lastClickedFileIndex).toBe(5);
    });

    it('새 파일 선택 시 기존 선택이 초기화된다 (단일 선택 모드)', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.selectFile('file-1', 0);
        result.current.selectFile('file-2', 1);
      });

      expect(result.current.selectedFiles.size).toBe(1);
      expect(result.current.selectedFiles.has('file-2')).toBe(true);
      expect(result.current.selectedFiles.has('file-1')).toBe(false);
    });
  });

  describe('toggleFile (Ctrl+Click)', () => {
    it('선택되지 않은 파일을 토글하면 선택된다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.toggleFile('file-1', 0);
      });

      expect(result.current.selectedFiles.has('file-1')).toBe(true);
    });

    it('이미 선택된 파일을 토글하면 선택 해제된다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.toggleFile('file-1', 0);
        result.current.toggleFile('file-1', 0);
      });

      expect(result.current.selectedFiles.has('file-1')).toBe(false);
    });

    it('여러 파일을 토글로 다중 선택할 수 있다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.toggleFile('file-1', 0);
        result.current.toggleFile('file-2', 1);
        result.current.toggleFile('file-3', 2);
      });

      expect(result.current.selectedFiles.size).toBe(3);
    });
  });

  describe('selectRange (Shift+Click)', () => {
    const mockFiles = [
      { id: 'file-0' },
      { id: 'file-1' },
      { id: 'file-2' },
      { id: 'file-3' },
      { id: 'file-4' },
    ];

    it('범위 내 모든 파일이 선택된다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.selectFile('file-1', 1);
        result.current.selectRange(1, 3, mockFiles);
      });

      expect(result.current.selectedFiles.size).toBe(3);
      expect(result.current.selectedFiles.has('file-1')).toBe(true);
      expect(result.current.selectedFiles.has('file-2')).toBe(true);
      expect(result.current.selectedFiles.has('file-3')).toBe(true);
    });

    it('역방향 범위 선택도 동작한다 (endIndex < startIndex)', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.selectFile('file-3', 3);
        result.current.selectRange(3, 1, mockFiles);
      });

      expect(result.current.selectedFiles.size).toBe(3);
      expect(result.current.selectedFiles.has('file-1')).toBe(true);
      expect(result.current.selectedFiles.has('file-2')).toBe(true);
      expect(result.current.selectedFiles.has('file-3')).toBe(true);
    });

    it('lastClickedFileIndex가 없으면 단일 선택처럼 동작한다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.selectRange(null, 2, mockFiles);
      });

      expect(result.current.selectedFiles.size).toBe(1);
      expect(result.current.selectedFiles.has('file-2')).toBe(true);
    });
  });

  describe('selectAll', () => {
    it('모든 파일 ID가 선택된다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());
      const fileIds = ['file-1', 'file-2', 'file-3'];

      act(() => {
        result.current.selectAll(fileIds);
      });

      expect(result.current.selectedFiles.size).toBe(3);
      fileIds.forEach((id) => {
        expect(result.current.selectedFiles.has(id)).toBe(true);
      });
    });

    it('빈 배열을 전달하면 선택이 초기화된다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.selectFile('file-1', 0);
        result.current.selectAll([]);
      });

      expect(result.current.selectedFiles.size).toBe(0);
    });
  });

  describe('selectFolder', () => {
    it('폴더를 선택하면 파일 선택을 비우고 해당 폴더만 선택한다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.selectFile('file-1', 0);
        result.current.selectFolder('folder-1');
      });

      expect(result.current.selectedFiles.size).toBe(0);
      expect(result.current.selectedFolders.size).toBe(1);
      expect(result.current.selectedFolders.has('folder-1')).toBe(true);
      expect(result.current.lastClickedFileIndex).toBeNull();
    });
  });

  describe('clearSelection', () => {
    it('모든 선택이 초기화된다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.selectAll(['file-1', 'file-2', 'file-3']);
        result.current.clearSelection();
      });

      expect(result.current.selectedFiles.size).toBe(0);
      expect(result.current.lastClickedFileIndex).toBeNull();
    });
  });

  describe('isSelected', () => {
    it('선택된 파일은 true를 반환한다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.selectFile('file-1', 0);
      });

      expect(result.current.isSelected('file-1')).toBe(true);
    });

    it('선택되지 않은 파일은 false를 반환한다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      expect(result.current.isSelected('file-1')).toBe(false);
    });
  });

  describe('selectedCount (via selectedFiles.size)', () => {
    it('선택된 파일 수를 반환한다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.selectAll(['file-1', 'file-2', 'file-3']);
      });

      // Zustand에서는 getter 대신 직접 상태 접근
      expect(result.current.selectedFiles.size).toBe(3);
    });
  });

  describe('setSelection', () => {
    it('선택을 주어진 Set으로 교체한다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());
      const newSelection = new Set(['file-1', 'file-2']);

      act(() => {
        result.current.selectFile('file-3', 2); // 기존 선택
        result.current.setSelection(newSelection);
      });

      expect(result.current.selectedFiles.size).toBe(2);
      expect(result.current.selectedFiles.has('file-1')).toBe(true);
      expect(result.current.selectedFiles.has('file-2')).toBe(true);
      expect(result.current.selectedFiles.has('file-3')).toBe(false);
    });

    it('빈 Set을 전달하면 선택이 초기화된다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.selectFile('file-1', 0);
        result.current.setSelection(new Set());
      });

      expect(result.current.selectedFiles.size).toBe(0);
    });
  });

  describe('addToSelectionBulk', () => {
    it('여러 파일을 기존 선택에 추가한다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.selectFile('file-1', 0);
        result.current.addToSelectionBulk(['file-2', 'file-3']);
      });

      expect(result.current.selectedFiles.size).toBe(3);
      expect(result.current.selectedFiles.has('file-1')).toBe(true);
      expect(result.current.selectedFiles.has('file-2')).toBe(true);
      expect(result.current.selectedFiles.has('file-3')).toBe(true);
    });

    it('이미 선택된 파일을 추가해도 중복되지 않는다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.selectFile('file-1', 0);
        result.current.addToSelectionBulk(['file-1', 'file-2']);
      });

      expect(result.current.selectedFiles.size).toBe(2);
    });
  });

  describe('removeFromSelectionBulk', () => {
    it('여러 파일을 선택에서 제거한다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.selectAll(['file-1', 'file-2', 'file-3', 'file-4']);
        result.current.removeFromSelectionBulk(['file-2', 'file-3']);
      });

      expect(result.current.selectedFiles.size).toBe(2);
      expect(result.current.selectedFiles.has('file-1')).toBe(true);
      expect(result.current.selectedFiles.has('file-4')).toBe(true);
      expect(result.current.selectedFiles.has('file-2')).toBe(false);
      expect(result.current.selectedFiles.has('file-3')).toBe(false);
    });

    it('선택되지 않은 파일을 제거해도 오류가 발생하지 않는다', () => {
      const { result } = renderHook(() => useWebhardSelectionStore());

      act(() => {
        result.current.selectFile('file-1', 0);
        result.current.removeFromSelectionBulk(['file-2', 'file-3']);
      });

      expect(result.current.selectedFiles.size).toBe(1);
      expect(result.current.selectedFiles.has('file-1')).toBe(true);
    });
  });
});
