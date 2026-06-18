'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TimelineItem } from '@/lib/types/contact';
import { getContactTimeline } from '@/app/actions/contacts';
import { queryKeys } from '@/lib/react-query/queryKeys';

interface UseContactTimelineOptions {
  /** 외부에서 expanded 상태를 제어할 때 사용 (Admin 등) */
  externalExpanded?: boolean;
  /** SSR 에서 미리 조회해 둔 초기 타임라인. 상세 페이지 단독 접속 시 깜빡임 방지. */
  initialData?: TimelineItem[];
}

/**
 * 통합 타임라인 조회 훅 (React Query 기반)
 * 응답은 status_change + drawing_revision 인터리브 배열.
 * Worker, Admin, 거래처 포털에서 공통 사용.
 */
export function useContactTimeline(contactId: string, options?: UseContactTimelineOptions) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = options?.externalExpanded ?? internalExpanded;
  const toggle = useCallback(() => setInternalExpanded((prev) => !prev), []);

  const { data: entries = [], isLoading } = useQuery<TimelineItem[]>({
    queryKey: queryKeys.contacts.timeline(contactId),
    queryFn: async () => {
      const result = await getContactTimeline(contactId);
      return result.data;
    },
    enabled: expanded,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    initialData: options?.initialData,
  });

  return { expanded, toggle, entries, isLoading };
}

/** 프리페치 유틸리티 - 카드 hover/touch 시 호출 */
export function usePrefetchTimeline() {
  const queryClient = useQueryClient();
  return useCallback(
    (contactId: string) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.contacts.timeline(contactId),
        queryFn: async () => {
          const result = await getContactTimeline(contactId);
          return result.data;
        },
        staleTime: 5 * 60 * 1000,
      });
    },
    [queryClient]
  );
}
