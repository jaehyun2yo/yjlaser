/**
 * @jest-environment jsdom
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNotifications, useUnreadNotificationCount } from '@/hooks/useNotifications';
import type { ReactNode } from 'react';

// fetch 모의
global.fetch = jest.fn();

// React Query wrapper 생성
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryWrapper';
  return Wrapper;
};

describe('useNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useNotifications hook', () => {
    it('알림 목록을 가져와야 함', async () => {
      const mockNotifications = [
        {
          id: '1',
          type: 'new_contact',
          title: '새 문의',
          message: '새로운 문의가 접수되었습니다.',
          metadata: {},
          is_read: false,
          read_at: null,
          created_at: new Date().toISOString(),
        },
      ];

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ notifications: mockNotifications }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ count: 1 }),
        });

      const { result } = renderHook(() => useNotifications(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].title).toBe('새 문의');
    });

    it('읽지 않은 알림 개수를 가져와야 함', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ notifications: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ count: 5 }),
        });

      const { result } = renderHook(() => useNotifications(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.unreadCount).toBe(5);
    });

    it('API 오류 시 에러를 처리해야 함', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: '서버 오류' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ count: 0 }),
        });

      const { result } = renderHook(() => useNotifications(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
    });

    it('enabled=false일 때 쿼리를 실행하지 않아야 함', () => {
      const { result } = renderHook(() => useNotifications({ enabled: false }), {
        wrapper: createWrapper(),
      });

      expect(result.current.notifications).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('카테고리 옵션을 알림 목록과 개수 API에 전달해야 함', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ notifications: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ count: 2 }),
        });

      const { result } = renderHook(() => useNotifications({ category: 'webhard', limit: 5 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        '/api/notifications?category=webhard&limit=5'
      );
      expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/notifications/count?category=webhard');
    });
  });

  describe('useUnreadNotificationCount hook', () => {
    it('읽지 않은 알림 개수만 가져와야 함', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: 10 }),
      });

      const { result } = renderHook(() => useUnreadNotificationCount(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.count).toBe(10);
    });

    it('enabled=false일 때 쿼리를 실행하지 않아야 함', () => {
      const { result } = renderHook(() => useUnreadNotificationCount(false), {
        wrapper: createWrapper(),
      });

      expect(result.current.count).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
