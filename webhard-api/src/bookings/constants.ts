/**
 * 방문 예약 공용 상수.
 *
 * - MAX_CAPACITY: 타임슬롯당 동시 예약 정원 (현재 2).
 *   `getAvailableSlots` 응답에 노출되어 프론트 슬롯 UI 가 동일 값을 참조한다.
 */
export const VisitBookingConstants = {
  MAX_CAPACITY: 2,
} as const;
