'use client';

import { useState, useCallback, useMemo } from 'react';
import type { Notification, NotificationState, SearchResult, SearchState } from './types';

// ============================================
// Notification Hook
// ============================================

/**
 * 알림 상태 관리 훅
 * 실제 알림 내용은 추후 도입 예정 - 현재는 기본 구조만 제공
 */
export function useNotifications(): NotificationState & {
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  addNotification: (notification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) => void;
  removeNotification: (id: string) => void;
} {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading] = useState(false);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  const addNotification = useCallback(
    (notification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) => {
      const newNotification: Notification = {
        ...notification,
        id: crypto.randomUUID(),
        isRead: false,
        createdAt: new Date(),
      };
      setNotifications((prev) => [newNotification, ...prev]);
    },
    []
  );

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    addNotification,
    removeNotification,
  };
}

// ============================================
// Search Hook
// ============================================

interface UseSearchProps {
  companyName: string;
  contacts: Array<{
    id: number;
    inquiry_title?: string;
    name?: string;
    status?: string;
    created_at?: string;
  }>;
}

/**
 * 문의 내역 검색 훅
 */
export function useSearch({ companyName, contacts }: UseSearchProps): SearchState & {
  setQuery: (query: string) => void;
  openSearch: () => void;
  closeSearch: () => void;
  clearSearch: () => void;
} {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading] = useState(false);

  // 검색 결과 필터링
  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim()) return [];

    const lowerQuery = query.toLowerCase();

    return contacts
      .filter((contact) => {
        const title = contact.inquiry_title?.toLowerCase() || '';
        const name = contact.name?.toLowerCase() || '';
        const status = contact.status?.toLowerCase() || '';

        return (
          title.includes(lowerQuery) || name.includes(lowerQuery) || status.includes(lowerQuery)
        );
      })
      .map((contact) => ({
        id: String(contact.id),
        type: 'contact' as const,
        title: contact.inquiry_title || '제목 없음',
        subtitle: contact.name || companyName,
        status: contact.status,
        date: contact.created_at,
        link: `/company/dashboard?contact=${contact.id}`,
      }))
      .slice(0, 10); // 최대 10개 결과
  }, [query, contacts, companyName]);

  const openSearch = useCallback(() => setIsOpen(true), []);
  const closeSearch = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);
  const clearSearch = useCallback(() => setQuery(''), []);

  return {
    query,
    results,
    isLoading,
    isOpen,
    setQuery,
    openSearch,
    closeSearch,
    clearSearch,
  };
}

// ============================================
// Search Modal State Hook
// ============================================

/**
 * 검색 모달 상태만 관리하는 간단한 훅
 */
export function useSearchModal() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return { isOpen, open, close, toggle };
}
