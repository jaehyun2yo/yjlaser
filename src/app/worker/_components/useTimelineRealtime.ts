'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSocketNamespace } from '@/lib/socket/useSocketNamespace';
import { queryKeys } from '@/lib/react-query/queryKeys';

/**
 * 카드 레벨 타임라인 실시간 구독 훅.
 * expanded=true 인 카드에만 소켓 리스너를 등록하여 다른 작업자의 도면 업로드를
 * 즉시 반영한다. 닫힌 카드 N+1 구독을 방지하기 위해 enabled=expanded.
 */
export function useTimelineRealtime(contactId: string, expanded: boolean): void {
  const queryClient = useQueryClient();

  useSocketNamespace({
    namespace: 'contacts',
    enabled: expanded,
    events: {
      'contact:drawing_revision_added': (data) => {
        const incomingId = (data as { contactId?: string | number }).contactId;
        if (String(incomingId ?? '') !== String(contactId)) return;
        queryClient.invalidateQueries({
          queryKey: queryKeys.contacts.timeline(contactId),
          refetchType: 'all',
        });
      },
    },
  });
}
