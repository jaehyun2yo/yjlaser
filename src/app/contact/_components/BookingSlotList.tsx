'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import type { SlotAvailability } from '@/lib/types/booking';

/** 방문 예약 폼의 시간 슬롯 리스트 (9~11, 13~17시, 12시 제외). */
export const BOOKING_SLOT_HOURS = [9, 10, 11, 13, 14, 15, 16, 17] as const;

export function buildTimeSlotLabel(startHour: number): string {
  return `${startHour}:00~${startHour + 1}:00`;
}

export interface BookingSlotListProps {
  availability: Record<string, SlotAvailability>;
  selected: string;
  loading: boolean;
  onSelect: (timeSlot: string) => void;
}

/**
 * 방문 예약 시간 슬롯 버튼 리스트 (presentational).
 *
 * 상태 흐름: 로딩(`loading && !availability[slot]`) → 마감(`count >= maxCapacity`)
 * → 가용(`(count/maxCapacity)`) → 불가(`!available`). 로딩 중에는 스켈레톤 + disabled.
 *
 * hotfix v2 (task 23 R2): 가용 슬롯은 빈 자리(0/maxCapacity) 도 자리수 텍스트를 항상
 * 표시하여 사용자가 정원을 즉시 인지하도록 한다. 1 자리만 남았을 때는 주황색·굵은
 * 글씨로 강조해 곧 마감될 것을 시각적으로 알린다. 직전 정책(phase 7) 의 "빈 슬롯=
 * 텍스트 미표시" 미니멀리즘은 폐기.
 */
export function BookingSlotList({
  availability,
  selected,
  loading,
  onSelect,
}: BookingSlotListProps) {
  return (
    <div className="flex flex-col gap-3">
      {BOOKING_SLOT_HOURS.map((startHour) => {
        const timeSlot = buildTimeSlotLabel(startHour);
        const slot = availability[timeSlot];
        const bookingCount = slot?.count ?? 0;
        const maxCapacity = slot?.maxCapacity ?? 2;
        // 로딩 중 기본값은 false — 응답 도착 전에 "가용" 으로 오표시되는 회귀 방지 (task 23 phase 7).
        const isAvailable = slot?.available ?? false;
        const isLoading = loading && !slot;
        const isFull = bookingCount >= maxCapacity;
        const isSelected = selected === timeSlot;
        const isDisabled = isLoading || isFull || !isAvailable;
        const remainingSlots = maxCapacity - bookingCount;
        const isAlmostFull = remainingSlots === 1;

        return (
          <button
            key={timeSlot}
            type="button"
            disabled={isDisabled}
            aria-busy={isLoading || undefined}
            data-testid={`booking-slot-${timeSlot}`}
            onClick={() => {
              if (isDisabled) return;
              onSelect(isSelected ? '' : timeSlot);
            }}
            className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 text-left focus:outline-none ${
              isDisabled
                ? `${BG_COLOR.grayDisabled} ${BORDER_COLOR.strong} ${TEXT_COLOR.disabled} cursor-not-allowed`
                : isSelected
                  ? 'bg-[#ED6C00] border-[#ED6C00] text-white'
                  : `${BG_COLOR.whiteDark} ${BORDER_COLOR.dark} ${TEXT_COLOR.secondary} ${BORDER_COLOR.hoverOrange} ${BG_COLOR.hoverPrimaryLight}`
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{timeSlot}</span>
              {isLoading ? (
                <span
                  data-testid={`booking-slot-skeleton-${timeSlot}`}
                  className="inline-block h-4 w-14 rounded bg-gray-200 animate-pulse"
                  aria-hidden="true"
                />
              ) : isFull ? (
                <span className="text-xs text-red-500">
                  예약 마감 ({bookingCount}/{maxCapacity})
                </span>
              ) : isAvailable ? (
                <span
                  className={`text-xs ${
                    isAlmostFull ? 'text-orange-500 font-semibold' : TEXT_COLOR.subtle
                  }`}
                >
                  ({bookingCount}/{maxCapacity})
                </span>
              ) : (
                <span className="text-xs text-red-500">예약 불가</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
