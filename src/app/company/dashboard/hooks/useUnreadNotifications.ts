import { useState, useEffect, useCallback, useRef } from 'react';
import type { Contact, Booking } from '@/app/company/dashboard/types';

interface UnreadNotifications {
  newContacts: number; // 새로운 문의 개수
  updatedContacts: number; // 상태가 변경된 문의 개수
  newBookings: number; // 새로운 예약 개수
  updatedBookings: number; // 변경된 예약 개수
  total: number; // 전체 알림 개수
}

interface UseUnreadNotificationsOptions {
  _companyName?: string; // Unused but kept for interface compatibility if needed
  initialContacts: Contact[];
  initialBookings: Booking[];
  lastReadAt?: Date; // 마지막으로 읽은 시간
}

/**
 * 읽지 않은 변경사항 추적 훅
 */
export function useUnreadNotifications({
  initialContacts,
  initialBookings,
  lastReadAt,
}: UseUnreadNotificationsOptions) {
  const [notifications, setNotifications] = useState<UnreadNotifications>({
    newContacts: 0,
    updatedContacts: 0,
    newBookings: 0,
    updatedBookings: 0,
    total: 0,
  });

  const lastReadAtRef = useRef<Date>(lastReadAt || new Date());
  const initialContactsRef = useRef<Map<string, { status: string; updated_at: string }>>(new Map());
  const initialBookingsRef = useRef<Map<number, { status: string; updated_at: string }>>(new Map());

  // 초기 데이터 저장
  useEffect(() => {
    initialContactsRef.current = new Map(
      initialContacts.map((contact) => [
        contact.id,
        { status: contact.status, updated_at: contact.created_at },
      ])
    );
    initialBookingsRef.current = new Map(
      initialBookings.map((booking) => [
        booking.id,
        { status: booking.status, updated_at: booking.created_at },
      ])
    );
  }, [initialContacts, initialBookings]);

  // 읽지 않은 변경사항 계산
  const calculateUnread = useCallback((currentContacts: Contact[], currentBookings: Booking[]) => {
    const newContacts: string[] = [];
    const updatedContacts: string[] = [];
    const newBookings: number[] = [];
    const updatedBookings: number[] = [];

    // 문의사항 확인
    currentContacts.forEach((contact) => {
      const initial = initialContactsRef.current.get(contact.id);
      const contactUpdatedAt = new Date(contact.created_at);

      // 새로운 문의 (초기 데이터에 없거나, 생성 시간이 마지막 읽은 시간 이후)
      if (!initial || contactUpdatedAt > lastReadAtRef.current) {
        if (!initial) {
          newContacts.push(contact.id);
        } else if (contact.status !== initial.status || contactUpdatedAt > lastReadAtRef.current) {
          updatedContacts.push(contact.id);
        }
      }
    });

    // 예약 확인
    currentBookings.forEach((booking) => {
      const initial = initialBookingsRef.current.get(booking.id);
      const bookingCreatedAt = new Date(booking.created_at);

      // 새로운 예약
      if (!initial || bookingCreatedAt > lastReadAtRef.current) {
        if (!initial) {
          newBookings.push(booking.id);
        } else if (booking.status !== initial.status) {
          updatedBookings.push(booking.id);
        }
      }
    });

    const total = new Set([...newContacts, ...updatedContacts, ...newBookings, ...updatedBookings])
      .size;

    return {
      newContacts: newContacts.length,
      updatedContacts: updatedContacts.length,
      newBookings: newBookings.length,
      updatedBookings: updatedBookings.length,
      total,
    };
  }, []);

  // 알림 개수 업데이트
  const updateNotifications = useCallback(
    (contacts: Contact[], bookings: Booking[]) => {
      const unread = calculateUnread(contacts, bookings);
      setNotifications(unread);
    },
    [calculateUnread]
  );

  // 모든 알림을 읽음 처리
  const markAllAsRead = useCallback(() => {
    lastReadAtRef.current = new Date();
    setNotifications({
      newContacts: 0,
      updatedContacts: 0,
      newBookings: 0,
      updatedBookings: 0,
      total: 0,
    });
  }, []);

  return {
    notifications,
    updateNotifications,
    markAllAsRead,
  };
}
