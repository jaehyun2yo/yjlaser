/**
 * 방문 예약 관련 타입 정의.
 *
 * 슬롯 UI 로딩 상태 도입과 함께 `maxCapacity` 를 상태에 포함하여 서버 응답 단일 소스를 유지한다
 * (2026-04-24 task 23 phase 7).
 */

/** ContactForm `bookingAvailability` state 의 슬롯별 엔트리. */
export interface SlotAvailability {
  count: number;
  maxCapacity: number;
  available: boolean;
}

/** Next.js route `/api/bookings/available` 응답 shape (슬롯별). */
export interface SlotAvailabilityApiResponse {
  date: string;
  timeSlot: string;
  bookingCount: number;
  availableSlots: number;
  isAvailable: boolean;
  maxBookings: number;
}
