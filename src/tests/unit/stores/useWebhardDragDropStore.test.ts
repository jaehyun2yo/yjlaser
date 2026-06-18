/**
 * useWebhardDragDropStore 테스트
 * TDD: 테스트 먼저 작성
 */
import { act, renderHook } from '@testing-library/react';

// 스토어는 아직 구현되지 않음 - TDD
import { useWebhardDragDropStore } from '@/store/webhard/useWebhardDragDropStore';

describe('useWebhardDragDropStore', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useWebhardDragDropStore());
    act(() => {
      result.current.resetDrag();
    });
  });

  describe('초기 상태', () => {
    it('draggedFileId가 null이어야 한다', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());
      expect(result.current.draggedFileId).toBeNull();
    });

    it('dragOverFolderId가 null이어야 한다', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());
      expect(result.current.dragOverFolderId).toBeNull();
    });

    it('isDragOver가 false여야 한다', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());
      expect(result.current.isDragOver).toBe(false);
    });

    it('isDragSelecting이 false여야 한다', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());
      expect(result.current.isDragSelecting).toBe(false);
    });

    it('dragSelectStart가 null이어야 한다', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());
      expect(result.current.dragSelectStart).toBeNull();
    });

    it('dragSelectEnd가 null이어야 한다', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());
      expect(result.current.dragSelectEnd).toBeNull();
    });
  });

  describe('파일 드래그', () => {
    it('드래그 시작 시 draggedFileId가 설정된다', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());

      act(() => {
        result.current.startDrag('file-1');
      });

      expect(result.current.draggedFileId).toBe('file-1');
    });

    it('드래그 중 isDragging이 true가 된다 (via draggedFileId !== null)', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());

      act(() => {
        result.current.startDrag('file-1');
      });

      // Zustand에서는 getter 대신 직접 상태 접근
      expect(result.current.draggedFileId !== null).toBe(true);
    });

    it('endDrag 호출 시 draggedFileId가 초기화된다', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());

      act(() => {
        result.current.startDrag('file-1');
        result.current.endDrag();
      });

      expect(result.current.draggedFileId).toBeNull();
      expect(result.current.draggedFileId !== null).toBe(false);
    });
  });

  describe('폴더 드롭 타겟', () => {
    it('폴더 위에 드래그하면 dragOverFolderId가 설정된다', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());

      act(() => {
        result.current.setDragOver('folder-1');
      });

      expect(result.current.dragOverFolderId).toBe('folder-1');
      expect(result.current.isDragOver).toBe(true);
    });

    it('null로 설정하면 드래그 오버 상태가 해제된다', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());

      act(() => {
        result.current.setDragOver('folder-1');
        result.current.setDragOver(null);
      });

      expect(result.current.dragOverFolderId).toBeNull();
      expect(result.current.isDragOver).toBe(false);
    });
  });

  describe('드래그 선택 (박스 선택)', () => {
    it('드래그 선택 시작', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());

      act(() => {
        result.current.startDragSelect(100, 200);
      });

      expect(result.current.isDragSelecting).toBe(true);
      expect(result.current.dragSelectStart).toEqual({ x: 100, y: 200 });
    });

    it('드래그 선택 업데이트', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());

      act(() => {
        result.current.startDragSelect(100, 200);
        result.current.updateDragSelect(300, 400);
      });

      expect(result.current.dragSelectEnd).toEqual({ x: 300, y: 400 });
    });

    it('드래그 선택 종료', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());

      act(() => {
        result.current.startDragSelect(100, 200);
        result.current.updateDragSelect(300, 400);
        result.current.endDragSelect();
      });

      expect(result.current.isDragSelecting).toBe(false);
      expect(result.current.dragSelectStart).toBeNull();
      expect(result.current.dragSelectEnd).toBeNull();
    });

    it('선택 영역 계산 (getBoundingRect)', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());

      act(() => {
        result.current.startDragSelect(100, 200);
        result.current.updateDragSelect(300, 100);
      });

      const rect = result.current.getBoundingRect();

      // 좌상단 좌표가 항상 작은 값이어야 함
      expect(rect).toEqual({
        left: 100,
        top: 100,
        right: 300,
        bottom: 200,
        width: 200,
        height: 100,
      });
    });

    it('선택 영역이 없으면 getBoundingRect가 null을 반환', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());

      expect(result.current.getBoundingRect()).toBeNull();
    });
  });

  describe('resetDrag', () => {
    it('모든 드래그 상태가 초기화된다', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());

      act(() => {
        result.current.startDrag('file-1');
        result.current.setDragOver('folder-1');
        result.current.startDragSelect(100, 200);
        result.current.updateDragSelect(300, 400);
        result.current.resetDrag();
      });

      expect(result.current.draggedFileId).toBeNull();
      expect(result.current.dragOverFolderId).toBeNull();
      expect(result.current.isDragOver).toBe(false);
      expect(result.current.isDragSelecting).toBe(false);
      expect(result.current.dragSelectStart).toBeNull();
      expect(result.current.dragSelectEnd).toBeNull();
    });
  });

  describe('외부 파일 드래그 (업로드용)', () => {
    it('외부 파일 드래그 시 isDragOver가 true가 된다', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());

      act(() => {
        result.current.setExternalDragOver(true);
      });

      expect(result.current.isDragOver).toBe(true);
    });

    it('외부 파일 드래그 종료', () => {
      const { result } = renderHook(() => useWebhardDragDropStore());

      act(() => {
        result.current.setExternalDragOver(true);
        result.current.setExternalDragOver(false);
      });

      expect(result.current.isDragOver).toBe(false);
    });
  });
});
