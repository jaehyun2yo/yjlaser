'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { NotificationCategory } from '@/lib/notifications/categories';

// 알림 타입 정의
export interface Notification {
  id: string;
  type: string;
  category: Exclude<NotificationCategory, 'all'>;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

interface NotificationsResponse {
  notifications: Notification[];
}

interface CountResponse {
  count: number;
}

interface UseNotificationsOptions {
  category?: NotificationCategory;
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

/**
 * 알림 목록 조회 API
 */
async function fetchNotifications(options: UseNotificationsOptions): Promise<Notification[]> {
  const params = new URLSearchParams();
  if (options.category && options.category !== 'all') params.set('category', options.category);
  if (options.unreadOnly) params.set('unread_only', 'true');
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));

  const response = await fetch(`/api/notifications?${params.toString()}`);
  if (!response.ok) {
    throw new Error('알림 조회 실패');
  }
  const data: NotificationsResponse = await response.json();
  return data.notifications;
}

/**
 * 읽지 않은 알림 개수 조회 API
 */
async function fetchNotificationCount(category: NotificationCategory = 'all'): Promise<number> {
  const params = new URLSearchParams();
  if (category !== 'all') params.set('category', category);
  const query = params.toString();
  const response = await fetch(`/api/notifications/count${query ? `?${query}` : ''}`);
  if (!response.ok) {
    throw new Error('알림 개수 조회 실패');
  }
  const data: CountResponse = await response.json();
  return data.count;
}

/**
 * 알림 읽음 처리 API
 */
async function markAsRead(notificationId: string): Promise<void> {
  const response = await fetch(`/api/notifications/${notificationId}/read`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('알림 읽음 처리 실패');
  }
}

/**
 * 모든 알림 읽음 처리 API
 */
async function markAllAsRead(): Promise<number> {
  const response = await fetch('/api/notifications/read-all', {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('전체 읽음 처리 실패');
  }
  const data = await response.json();
  return data.updatedCount;
}

/**
 * 알림 관련 기능을 제공하는 hook
 */
export function useNotifications(options: UseNotificationsOptions = {}) {
  const { category = 'all', unreadOnly = false, limit = 20, offset = 0, enabled = true } = options;
  const queryClient = useQueryClient();

  // 알림 목록 조회
  const {
    data: notifications = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.notifications.list({ category, unreadOnly, limit, offset }),
    queryFn: () => fetchNotifications({ category, unreadOnly, limit, offset }),
    staleTime: 30 * 1000, // 30초 - 실시간 구독과 함께 사용하여 최신성 보장
    refetchOnWindowFocus: true, // 탭 전환 시 최신 알림 조회
    enabled,
  });

  // 읽지 않은 알림 개수 조회
  const { data: unreadCount = 0 } = useQuery({
    queryKey: queryKeys.notifications.count(category),
    queryFn: () => fetchNotificationCount(category),
    staleTime: 30 * 1000, // 30초 - 알림 개수는 자주 확인이 필요
    refetchOnWindowFocus: true, // 탭 전환 시 최신 개수 조회
    enabled,
  });

  // 알림 읽음 처리
  const markReadMutation = useMutation({
    mutationFn: markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });

  // 모든 알림 읽음 처리
  const markAllReadMutation = useMutation({
    mutationFn: markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });

  return {
    // 데이터
    notifications,
    unreadCount,

    // 상태
    isLoading,
    error,

    // 액션
    refetch,
    markAsRead: markReadMutation.mutate,
    markAllAsRead: markAllReadMutation.mutate,

    // Mutation 상태
    isMarkingRead: markReadMutation.isPending,
    isMarkingAllRead: markAllReadMutation.isPending,
  };
}

/**
 * 읽지 않은 알림 개수만 조회하는 경량 hook
 * 헤더의 bell icon 뱃지 표시에 사용
 */
export function useUnreadNotificationCount(enabled = true, category: NotificationCategory = 'all') {
  const { data: count = 0, isLoading } = useQuery({
    queryKey: queryKeys.notifications.count(category),
    queryFn: () => fetchNotificationCount(category),
    staleTime: 30 * 1000, // 30초 - 헤더 뱃지는 자주 확인
    refetchOnWindowFocus: true, // 탭 전환 시 최신 개수 조회
    enabled,
  });

  return { count, isLoading };
}
