/**
 * useWebhardNavigationStore 테스트
 * 정렬 및 새 파일 모드 관련 테스트
 *
 * Note: 폴더 네비게이션은 URL 기반으로 WebhardMain.tsx에서 처리
 */
import { act, renderHook } from '@testing-library/react';

import { useWebhardNavigationStore } from '@/store/webhard/useWebhardNavigationStore';

describe('useWebhardNavigationStore', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useWebhardNavigationStore());
    act(() => {
      result.current.reset();
    });
  });

  describe('초기 상태', () => {
    it('sortBy가 date여야 한다', () => {
      const { result } = renderHook(() => useWebhardNavigationStore());
      expect(result.current.sortBy).toBe('date');
    });

    it('sortOrder가 desc여야 한다', () => {
      const { result } = renderHook(() => useWebhardNavigationStore());
      expect(result.current.sortOrder).toBe('desc');
    });

    it('isNewFilesMode가 false여야 한다', () => {
      const { result } = renderHook(() => useWebhardNavigationStore());
      expect(result.current.isNewFilesMode).toBe(false);
    });
  });

  describe('setSort', () => {
    it('정렬 기준을 변경할 수 있다', () => {
      const { result } = renderHook(() => useWebhardNavigationStore());

      act(() => {
        result.current.setSort('name', 'asc');
      });

      expect(result.current.sortBy).toBe('name');
      expect(result.current.sortOrder).toBe('asc');
    });

    it('같은 컬럼으로 정렬하면 순서가 토글된다', () => {
      const { result } = renderHook(() => useWebhardNavigationStore());

      act(() => {
        result.current.setSort('name', 'asc');
        result.current.toggleSortOrder('name');
      });

      expect(result.current.sortOrder).toBe('desc');
    });

    it('다른 컬럼으로 toggleSortOrder하면 asc로 시작한다', () => {
      const { result } = renderHook(() => useWebhardNavigationStore());

      act(() => {
        result.current.setSort('name', 'desc');
        result.current.toggleSortOrder('date');
      });

      expect(result.current.sortBy).toBe('date');
      expect(result.current.sortOrder).toBe('asc');
    });
  });

  describe('toggleNewFilesMode', () => {
    it('새 파일 모드를 활성화할 수 있다', () => {
      const { result } = renderHook(() => useWebhardNavigationStore());

      act(() => {
        result.current.toggleNewFilesMode();
      });

      expect(result.current.isNewFilesMode).toBe(true);
    });

    it('새 파일 모드를 비활성화할 수 있다', () => {
      const { result } = renderHook(() => useWebhardNavigationStore());

      act(() => {
        result.current.toggleNewFilesMode();
        result.current.toggleNewFilesMode();
      });

      expect(result.current.isNewFilesMode).toBe(false);
    });

    it('setNewFilesMode로 직접 설정할 수 있다', () => {
      const { result } = renderHook(() => useWebhardNavigationStore());

      act(() => {
        result.current.setNewFilesMode(true);
      });

      expect(result.current.isNewFilesMode).toBe(true);

      act(() => {
        result.current.setNewFilesMode(false);
      });

      expect(result.current.isNewFilesMode).toBe(false);
    });
  });

  describe('reset', () => {
    it('모든 상태가 초기화된다', () => {
      const { result } = renderHook(() => useWebhardNavigationStore());

      act(() => {
        result.current.setSort('name', 'asc');
        result.current.toggleNewFilesMode();
        result.current.reset();
      });

      expect(result.current.sortBy).toBe('date');
      expect(result.current.sortOrder).toBe('desc');
      expect(result.current.isNewFilesMode).toBe(false);
    });
  });
});
