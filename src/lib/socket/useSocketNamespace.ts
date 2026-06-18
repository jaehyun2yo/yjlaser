'use client';

/**
 * Socket.IO 네임스페이스 연결 훅
 * NestJS Gateway의 네임스페이스에 연결하고 이벤트를 구독합니다.
 */
import { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { socketManager } from '@/lib/socket/socket-manager';
import type { ConnectionStatus } from '@/lib/socket/socket-manager';

interface UseSocketNamespaceOptions {
  /** Socket.IO 네임스페이스 (e.g., 'contacts', 'bookings') */
  namespace: string;
  /** 구독할 이벤트와 핸들러 목록 */
  events?: Record<string, (data: Record<string, unknown>) => void>;
  /** 활성화 여부 (기본값: true) */
  enabled?: boolean;
}

/**
 * Socket.IO 네임스페이스에 연결하는 React 훅
 *
 * @example
 * ```tsx
 * useSocketNamespace({
 *   namespace: 'contacts',
 *   events: {
 *     'contact:created': (data) => queryClient.invalidateQueries(...),
 *     'contact:updated': (data) => queryClient.invalidateQueries(...),
 *   },
 * });
 * ```
 */
export function useSocketNamespace({
  namespace,
  events = {},
  enabled = true,
}: UseSocketNamespaceOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const eventsRef = useRef(events);
  const toastShownRef = useRef(false);

  // events ref를 최신 상태로 유지
  eventsRef.current = events;

  useEffect(() => {
    if (!enabled) return;

    const statusCb = (s: ConnectionStatus) => {
      setStatus(s);

      // reconnect_failed: 모든 재연결 시도 실패 — 사용자에게 안내
      if (s === 'reconnect_failed' && !toastShownRef.current) {
        toastShownRef.current = true;
        toast.warning('실시간 연결이 끊어졌습니다. 데이터는 자동 갱신되지만 지연될 수 있습니다.', {
          duration: 10000,
          action: {
            label: '재연결',
            onClick: () => socketManager.reconnect(namespace),
          },
        });
      }

      // 재연결 성공 시 토스트 상태 리셋
      if (s === 'connected') {
        toastShownRef.current = false;
      }
    };

    const socket = socketManager.connect(namespace, statusCb);
    socketRef.current = socket;

    // 이벤트 핸들러 등록 — dynamic dispatch로 stale closure 방지
    const eventNames = Object.keys(eventsRef.current);
    const handlers = new Map<string, (data: Record<string, unknown>) => void>();
    for (const eventName of eventNames) {
      const handler = (data: Record<string, unknown>) => {
        eventsRef.current[eventName]?.(data);
      };
      handlers.set(eventName, handler);
      socket.on(eventName, handler as (...args: unknown[]) => void);
    }

    return () => {
      for (const [eventName, handler] of handlers) {
        socket.off(eventName, handler as (...args: unknown[]) => void);
      }
      socketManager.disconnect(namespace, statusCb);
      socketRef.current = null;
    };
  }, [namespace, enabled]);

  return {
    socket: socketRef.current,
    status,
  };
}
