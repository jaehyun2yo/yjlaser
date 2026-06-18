import { useState, useEffect, useCallback, useRef } from 'react';
import type { Contact, Booking } from '@/app/company/dashboard/types';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('useUnreadTracker');

interface UnreadTrackerOptions {
  initialContacts: Contact[];
  initialBookings: Booking[];
  storageKey?: string; // localStorage 키
}

/**
 * 읽지 않은 변경사항 추적 훅
 * localStorage를 사용하여 마지막 읽은 시간 저장
 */
export function useUnreadTracker({
  initialContacts,
  initialBookings,
  storageKey = 'company-dashboard-last-read',
}: UnreadTrackerOptions) {
  const [unreadCount, setUnreadCount] = useState(0);
  const lastReadAtRef = useRef<Date | null>(null);
  const initialDataRef = useRef<{
    contacts: Map<string, { status: string; updated_at: string }>;
    bookings: Map<number, { status: string; updated_at: string }>;
  }>({
    contacts: new Map(),
    bookings: new Map(),
  });

  // localStorage에서 마지막 읽은 시간 불러오기
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const lastRead = localStorage.getItem(storageKey);
      if (lastRead) {
        lastReadAtRef.current = new Date(lastRead);
      } else {
        // 처음 방문 시 현재 시간을 마지막 읽은 시간으로 설정
        lastReadAtRef.current = new Date();
        localStorage.setItem(storageKey, lastReadAtRef.current.toISOString());
      }
    } catch (error) {
      log.error('Error reading from localStorage:', error);
      lastReadAtRef.current = new Date();
    }
  }, [storageKey]);

  // 초기 데이터 저장
  useEffect(() => {
    initialDataRef.current.contacts = new Map(
      initialContacts.map((contact) => [
        contact.id,
        { status: contact.status, updated_at: contact.created_at },
      ])
    );
    initialDataRef.current.bookings = new Map(
      initialBookings.map((booking) => [
        booking.id,
        { status: booking.status, updated_at: booking.created_at },
      ])
    );
  }, [initialContacts, initialBookings]);

  // 읽지 않은 변경사항 계산
  const calculateUnread = useCallback((currentContacts: Contact[], currentBookings: Booking[]) => {
    if (!lastReadAtRef.current) return 0;

    const unreadIds = new Set<string | number>();
    const lastRead = lastReadAtRef.current;

    // 문의사항 확인
    currentContacts.forEach((contact) => {
      const initial = initialDataRef.current.contacts.get(contact.id);
      const contactUpdatedAt = new Date(contact.created_at);

      // 새로운 문의 또는 업데이트된 문의
      if (!initial) {
        // 초기 데이터에 없으면 새로운 것
        if (contactUpdatedAt > lastRead) {
          unreadIds.add(contact.id);
        }
      } else {
        // 상태가 변경되었거나 업데이트 시간이 마지막 읽은 시간 이후
        if (contact.status !== initial.status || contactUpdatedAt > lastRead) {
          unreadIds.add(contact.id);
        }
      }
    });

    // 예약 확인
    currentBookings.forEach((booking) => {
      const initial = initialDataRef.current.bookings.get(booking.id);
      const bookingCreatedAt = new Date(booking.created_at);

      // 새로운 예약 또는 업데이트된 예약
      if (!initial) {
        if (bookingCreatedAt > lastRead) {
          unreadIds.add(booking.id);
        }
      } else {
        if (booking.status !== initial.status || bookingCreatedAt > lastRead) {
          unreadIds.add(booking.id);
        }
      }
    });

    return unreadIds.size;
  }, []);

  // 알림 개수 업데이트
  const updateUnreadCount = useCallback(
    (contacts: Contact[], bookings: Booking[]) => {
      const count = calculateUnread(contacts, bookings);
      setUnreadCount(count);
    },
    [calculateUnread]
  );

  // 모든 알림을 읽음 처리
  const markAllAsRead = useCallback(() => {
    const now = new Date();
    lastReadAtRef.current = now;

    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, now.toISOString());
      }
    } catch (error) {
      log.error('Error saving to localStorage:', error);
    }

    setUnreadCount(0);
  }, [storageKey]);

  return {
    unreadCount,
    updateUnreadCount,
    markAllAsRead,
  };
}
