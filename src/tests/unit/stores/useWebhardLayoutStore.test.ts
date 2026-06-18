/**
 * useWebhardLayoutStore 테스트
 * TDD: 테스트 먼저 작성
 */
import { act, renderHook } from '@testing-library/react';

// 스토어는 아직 구현되지 않음 - TDD
import { useWebhardLayoutStore } from '@/store/webhard/useWebhardLayoutStore';

describe('useWebhardLayoutStore', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useWebhardLayoutStore());
    act(() => {
      result.current.resetLayout();
    });
  });

  describe('초기 상태', () => {
    it('viewMode가 list여야 한다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());
      expect(result.current.viewMode).toBe('list');
    });

    it('sidebarWidth가 256이어야 한다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());
      expect(result.current.sidebarWidth).toBe(256);
    });

    it('isSidebarCollapsed가 false여야 한다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());
      expect(result.current.isSidebarCollapsed).toBe(false);
    });

    it('fileNameColWidth가 75 (퍼센트)여야 한다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());
      expect(result.current.fileNameColWidth).toBe(75);
    });

    it('dateColWidth가 10 (퍼센트)여야 한다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());
      expect(result.current.dateColWidth).toBe(10);
    });

    it('resizingColumn이 null이어야 한다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());
      expect(result.current.resizingColumn).toBeNull();
    });
  });

  describe('setViewMode', () => {
    it('viewMode를 grid로 변경할 수 있다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());

      act(() => {
        result.current.setViewMode('grid');
      });

      expect(result.current.viewMode).toBe('grid');
    });

    it('viewMode를 list로 변경할 수 있다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());

      act(() => {
        result.current.setViewMode('grid');
        result.current.setViewMode('list');
      });

      expect(result.current.viewMode).toBe('list');
    });
  });

  describe('setSidebarWidth', () => {
    it('사이드바 너비를 변경할 수 있다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());

      act(() => {
        result.current.setSidebarWidth(350);
      });

      expect(result.current.sidebarWidth).toBe(350);
    });

    it('최소 너비(200) 미만으로 설정하면 최소값으로 고정된다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());

      act(() => {
        result.current.setSidebarWidth(100);
      });

      expect(result.current.sidebarWidth).toBe(200);
    });

    it('최대 너비(500)를 초과하면 최대값으로 고정된다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());

      act(() => {
        result.current.setSidebarWidth(600);
      });

      expect(result.current.sidebarWidth).toBe(500);
    });
  });

  describe('toggleSidebar', () => {
    it('사이드바를 접을 수 있다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.isSidebarCollapsed).toBe(true);
    });

    it('접힌 사이드바를 펼 수 있다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());

      act(() => {
        result.current.toggleSidebar();
        result.current.toggleSidebar();
      });

      expect(result.current.isSidebarCollapsed).toBe(false);
    });
  });

  describe('setSidebarCollapsed', () => {
    it('사이드바를 직접 접을 수 있다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());

      act(() => {
        result.current.setSidebarCollapsed(true);
      });

      expect(result.current.isSidebarCollapsed).toBe(true);
    });

    it('사이드바를 직접 펼 수 있다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());

      act(() => {
        result.current.setSidebarCollapsed(true);
        result.current.setSidebarCollapsed(false);
      });

      expect(result.current.isSidebarCollapsed).toBe(false);
    });
  });

  describe('setColumnWidth', () => {
    it('파일명 컬럼 너비를 변경할 수 있다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());

      act(() => {
        result.current.setColumnWidth('fileName', 60);
      });

      expect(result.current.fileNameColWidth).toBe(60);
    });

    it('날짜 컬럼 너비를 변경할 수 있다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());

      act(() => {
        result.current.setColumnWidth('date', 15);
      });

      expect(result.current.dateColWidth).toBe(15);
    });

    it('최소 컬럼 너비(10%) 미만은 최소값으로 고정된다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());

      act(() => {
        result.current.setColumnWidth('fileName', 5);
      });

      expect(result.current.fileNameColWidth).toBe(10);
    });
  });

  describe('startResizing / stopResizing', () => {
    it('리사이징 시작 시 resizingColumn이 설정된다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());

      act(() => {
        result.current.startResizing('fileName');
      });

      expect(result.current.resizingColumn).toBe('fileName');
    });

    it('리사이징 종료 시 resizingColumn이 null이 된다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());

      act(() => {
        result.current.startResizing('fileName');
        result.current.stopResizing();
      });

      expect(result.current.resizingColumn).toBeNull();
    });

    it('isResizing이 올바르게 계산된다 (via resizingColumn !== null)', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());

      // Zustand에서는 getter 대신 직접 상태 접근
      expect(result.current.resizingColumn !== null).toBe(false);

      act(() => {
        result.current.startResizing('fileName');
      });

      expect(result.current.resizingColumn !== null).toBe(true);
    });
  });

  describe('resetLayout', () => {
    it('모든 레이아웃 설정이 초기값으로 리셋된다', () => {
      const { result } = renderHook(() => useWebhardLayoutStore());

      act(() => {
        result.current.setViewMode('grid');
        result.current.setSidebarWidth(400);
        result.current.toggleSidebar();
        result.current.setColumnWidth('fileName', 50);
        result.current.resetLayout();
      });

      expect(result.current.viewMode).toBe('list');
      expect(result.current.sidebarWidth).toBe(256);
      expect(result.current.isSidebarCollapsed).toBe(false);
      expect(result.current.fileNameColWidth).toBe(75);
    });
  });
});
