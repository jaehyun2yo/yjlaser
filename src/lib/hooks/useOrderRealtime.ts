'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { NESTJS_SOCKET_URL } from '@/lib/api/api-base';

interface UseOrderRealtimeOptions {
  orderId?: string;
  companyId?: number;
  rooms?: string[];
  enabled?: boolean;
}

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

interface OrderRealtimeEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export function useOrderRealtime(options: UseOrderRealtimeOptions = {}) {
  const { orderId, companyId, rooms = [], enabled = true } = options;
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastEvent, setLastEvent] = useState<OrderRealtimeEvent | null>(null);

  const invalidateOrderQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.integration.orders.all() });
    if (orderId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.integration.orders.all() });
    }
  }, [queryClient, orderId]);

  useEffect(() => {
    if (!enabled) return;

    const socket = io(`${NESTJS_SOCKET_URL}/integration`, {
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('connected');

      // Room 참가
      if (orderId) socket.emit('join', `order:${orderId}`);
      if (companyId) socket.emit('join', `company:${companyId}`);
      rooms.forEach((room) => socket.emit('join', room));
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
    });

    socket.on('reconnecting', () => {
      setStatus('reconnecting');
    });

    // 주문 상태 변경
    socket.on('order:status_changed', (data: Record<string, unknown>) => {
      setLastEvent({ type: 'order:status_changed', data, timestamp: new Date().toISOString() });
      invalidateOrderQueries();
      queryClient.invalidateQueries({ queryKey: queryKeys.integration.stats() });
    });

    // 주문 이벤트 생성
    socket.on('order:event_created', (data: Record<string, unknown>) => {
      setLastEvent({ type: 'order:event_created', data, timestamp: new Date().toISOString() });
      if (orderId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.integration.orders.all() });
      }
    });

    // 프로그램 상태
    socket.on('program:status', (data: Record<string, unknown>) => {
      setLastEvent({ type: 'program:status', data, timestamp: new Date().toISOString() });
      queryClient.invalidateQueries({ queryKey: queryKeys.integration.programs.all() });
    });

    // 재고 부족 알림
    socket.on('inventory:low_stock', (data: Record<string, unknown>) => {
      setLastEvent({ type: 'inventory:low_stock', data, timestamp: new Date().toISOString() });
      queryClient.invalidateQueries({ queryKey: queryKeys.integration.inventory.all() });
    });

    // 납품 상태 변경
    socket.on('delivery:status_changed', (data: Record<string, unknown>) => {
      setLastEvent({ type: 'delivery:status_changed', data, timestamp: new Date().toISOString() });
      queryClient.invalidateQueries({ queryKey: queryKeys.integration.deliveries.all() });
    });

    // 대시보드 새로고침
    socket.on('dashboard:refresh', () => {
      invalidateOrderQueries();
      queryClient.invalidateQueries({ queryKey: queryKeys.integration.all });
    });

    return () => {
      // Room 탈퇴
      if (orderId) socket.emit('leave', `order:${orderId}`);
      if (companyId) socket.emit('leave', `company:${companyId}`);
      rooms.forEach((room) => socket.emit('leave', room));

      socket.disconnect();
      socketRef.current = null;
      setStatus('disconnected');
    };
  }, [enabled, orderId, companyId, rooms.join(','), invalidateOrderQueries, queryClient]);

  return {
    status,
    lastEvent,
    socket: socketRef.current,
  };
}
