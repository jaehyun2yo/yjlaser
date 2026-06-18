'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useNotificationRealtime } from '@/lib/hooks/useNotificationRealtime';

/**
 * 관리자 레이아웃에서 자주 사용하는 데이터를 백그라운드에서 프리페치
 * - 문의 목록 (기본 탭: all만 프리페치)
 * - 브라우저 유휴 시점에 실행하여 메인 페이지 로딩에 영향 최소화
 * - 실시간 알림 구독 활성화
 */
export function AdminPrefetch() {
  const queryClient = useQueryClient();

  // 실시간 알림 구독 활성화
  useNotificationRealtime();

  useEffect(() => {
    const prefetch = async () => {
      // 연락처: 기본 탭(all)만 프리페치 (나머지는 탭 클릭 시 로드)
      await queryClient.prefetchInfiniteQuery({
        queryKey: queryKeys.contacts.list({ status: 'all', search: '' }),
        queryFn: async ({ pageParam = 1 }) => {
          const params = new URLSearchParams({
            status: 'all',
            page: String(pageParam),
          });
          const response = await fetch(`/api/admin/contacts?${params}`);
          if (!response.ok) throw new Error('Failed to prefetch contacts');
          return response.json();
        },
        initialPageParam: 1,
        staleTime: 10 * 60 * 1000, // 10분
      });
    };

    // requestIdleCallback으로 브라우저 유휴 시점에 실행
    if ('requestIdleCallback' in window) {
      const idleId = requestIdleCallback(() => prefetch());
      return () => cancelIdleCallback(idleId);
    } else {
      const timer = setTimeout(prefetch, 5000);
      return () => clearTimeout(timer);
    }
  }, [queryClient]);

  // 렌더링 없음 (백그라운드 작업만)
  return null;
}
