'use client';

import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocketNamespace } from '@/lib/socket/useSocketNamespace';
import { queryKeys } from '@/lib/react-query/queryKeys';

/**
 * 알림 실시간 구독 훅 (Socket.IO 기반)
 * notifications 네임스페이스의 이벤트를 감지하여 캐시 무효화
 */
export function useNotificationRealtime() {
  const queryClient = useQueryClient();

  const events = useMemo(
    () => ({
      'notification:created': () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.count(),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.list(),
        });
      },
      'notification:updated': () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.count(),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.list(),
        });
      },
      'notification:all_read': () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.count(),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.list(),
        });
      },
    }),
    [queryClient]
  );

  useSocketNamespace({
    namespace: 'notifications',
    events,
  });
}
