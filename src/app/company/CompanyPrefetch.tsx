'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';

/**
 * 기업 레이아웃에서 자주 사용하는 데이터를 백그라운드에서 프리페치
 * - 웹하드 폴더 및 루트 파일 목록
 * - 레이아웃 마운트 시 한 번만 실행
 */
export function CompanyPrefetch() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // 웹하드 데이터 프리페치
    const prefetchWebhardData = async () => {
      await Promise.all([
        // 폴더 목록 프리페치
        queryClient.prefetchQuery({
          queryKey: queryKeys.webhard.folders.all(),
          queryFn: async () => {
            const response = await fetch('/api/webhard/folders');
            if (!response.ok) throw new Error('Failed to prefetch folders');
            return response.json();
          },
          staleTime: 60 * 1000, // 60초 (폴더는 자주 변경되지 않음)
        }),
        // 루트 파일 목록 프리페치
        queryClient.prefetchQuery({
          queryKey: queryKeys.webhard.files.list({}),
          queryFn: async () => {
            const response = await fetch('/api/webhard/files');
            if (!response.ok) throw new Error('Failed to prefetch files');
            return response.json();
          },
          staleTime: 30 * 1000, // 30초
        }),
      ]);
    };

    // 약간의 지연 후 프리페치 (초기 렌더링 우선)
    const timer = setTimeout(prefetchWebhardData, 100);

    return () => clearTimeout(timer);
  }, [queryClient]);

  // 렌더링 없음 (백그라운드 작업만)
  return null;
}
