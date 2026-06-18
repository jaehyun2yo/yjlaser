/**
 * @jest-environment jsdom
 *
 * 방문 예약 슬롯 UI 로딩 상태 및 자리수 표시 (task 23 phase 7 — booking-slot-ux,
 * hotfix v2 R2 갱신).
 *
 * - 로딩 중(`loading=true` + availability 미도착): 스켈레톤 렌더, 모든 슬롯 disabled
 * - 가용(`count < maxCapacity` + `available=true`): 빈 자리도 `(count/maxCapacity)`
 *   항상 표시. 1 자리만 남으면 `text-orange-500 font-semibold` 강조 (R2)
 * - 마감(`count >= maxCapacity`): "예약 마감 (count/maxCapacity)" 표시 + disabled
 * - 불가(`available=false, count=0`): "예약 불가" 표시 + disabled
 * - fetch 실패(모든 슬롯 fallback): "예약 마감" 표시
 * - 날짜 변경 → availability 초기화 → 다시 로딩 상태
 */

import { render, screen, fireEvent } from '@testing-library/react';
import {
  BookingSlotList,
  BOOKING_SLOT_HOURS,
  buildTimeSlotLabel,
} from '@/app/contact/_components/BookingSlotList';
import type { SlotAvailability } from '@/lib/types/booking';

const FIRST_SLOT = buildTimeSlotLabel(BOOKING_SLOT_HOURS[0]);

function makeAvailability(
  overrides: Partial<SlotAvailability> = {}
): Record<string, SlotAvailability> {
  const map: Record<string, SlotAvailability> = {};
  for (const hour of BOOKING_SLOT_HOURS) {
    map[buildTimeSlotLabel(hour)] = {
      count: 0,
      maxCapacity: 2,
      available: true,
      ...overrides,
    };
  }
  return map;
}

describe('BookingSlotList', () => {
  it('loading=true 이고 availability 가 비어있으면 모든 슬롯이 disabled + 스켈레톤 렌더', () => {
    render(<BookingSlotList availability={{}} selected="" loading={true} onSelect={jest.fn()} />);

    for (const hour of BOOKING_SLOT_HOURS) {
      const timeSlot = buildTimeSlotLabel(hour);
      const button = screen.getByTestId(`booking-slot-${timeSlot}`);
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByTestId(`booking-slot-skeleton-${timeSlot}`)).toBeInTheDocument();
    }
  });

  it('가용 슬롯은 (count/maxCapacity) 자리수 표시 + 클릭 시 onSelect 호출', () => {
    const onSelect = jest.fn();
    const availability = makeAvailability({ count: 1, maxCapacity: 2, available: true });

    render(
      <BookingSlotList
        availability={availability}
        selected=""
        loading={false}
        onSelect={onSelect}
      />
    );

    // 모든 슬롯에 (1/2) 표시 — 8 개 슬롯이므로 정확히 8 회 등장
    expect(screen.getAllByText('(1/2)')).toHaveLength(BOOKING_SLOT_HOURS.length);

    const firstButton = screen.getByTestId(`booking-slot-${FIRST_SLOT}`);
    expect(firstButton).not.toBeDisabled();
    fireEvent.click(firstButton);
    expect(onSelect).toHaveBeenCalledWith(FIRST_SLOT);
  });

  it('count=0 이고 available=true 면 (0/maxCapacity) 빈 자리 자리수도 항상 표시 (hotfix v2 R2)', () => {
    // hotfix v2 (task 23 R2): 사용자가 정원을 즉시 인지하도록 빈 슬롯도 (0/2) 표시.
    // 직전 phase 7 정책("빈 슬롯=텍스트 미표시") 은 폐기.
    const availability = makeAvailability({ count: 0, maxCapacity: 2, available: true });

    render(
      <BookingSlotList
        availability={availability}
        selected=""
        loading={false}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getAllByText('(0/2)')).toHaveLength(BOOKING_SLOT_HOURS.length);
    expect(screen.queryByText(/예약 마감/)).not.toBeInTheDocument();
    expect(screen.queryByText('예약 불가')).not.toBeInTheDocument();

    // 0/2 는 강조 대상 아님 — text-orange-500 / font-semibold 미적용
    const firstSpan = screen.getAllByText('(0/2)')[0];
    expect(firstSpan.className).not.toContain('text-orange-500');
    expect(firstSpan.className).not.toContain('font-semibold');
  });

  it('1 자리만 남으면 자리수 텍스트에 주황색·굵은 글씨 강조 (hotfix v2 R2)', () => {
    const availability = makeAvailability({ count: 1, maxCapacity: 2, available: true });

    render(
      <BookingSlotList
        availability={availability}
        selected=""
        loading={false}
        onSelect={jest.fn()}
      />
    );

    const firstSpan = screen.getAllByText('(1/2)')[0];
    expect(firstSpan.className).toContain('text-orange-500');
    expect(firstSpan.className).toContain('font-semibold');
  });

  it('2 자리 이상 남으면 강조 클래스 미적용 (maxCapacity=3, count=1 → 2 자리 남음)', () => {
    const availability = makeAvailability({ count: 1, maxCapacity: 3, available: true });

    render(
      <BookingSlotList
        availability={availability}
        selected=""
        loading={false}
        onSelect={jest.fn()}
      />
    );

    const firstSpan = screen.getAllByText('(1/3)')[0];
    expect(firstSpan.className).not.toContain('text-orange-500');
    expect(firstSpan.className).not.toContain('font-semibold');
  });

  it('count >= maxCapacity 이면 "예약 마감 (count/maxCapacity)" 표시 + disabled', () => {
    const availability = makeAvailability({ count: 2, maxCapacity: 2, available: false });

    render(
      <BookingSlotList
        availability={availability}
        selected=""
        loading={false}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getAllByText('예약 마감 (2/2)')).toHaveLength(BOOKING_SLOT_HOURS.length);
    const firstButton = screen.getByTestId(`booking-slot-${FIRST_SLOT}`);
    expect(firstButton).toBeDisabled();
  });

  it('available=false 이고 count<maxCapacity 면 "예약 불가" 표시', () => {
    const availability = makeAvailability({ count: 0, maxCapacity: 2, available: false });

    render(
      <BookingSlotList
        availability={availability}
        selected=""
        loading={false}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getAllByText('예약 불가')).toHaveLength(BOOKING_SLOT_HOURS.length);
    const firstButton = screen.getByTestId(`booking-slot-${FIRST_SLOT}`);
    expect(firstButton).toBeDisabled();
  });

  it('maxCapacity=3 응답이 들어오면 자리수 표시에 3 이 사용된다 (하드코딩 제거 검증)', () => {
    const availability = makeAvailability({ count: 1, maxCapacity: 3, available: true });

    render(
      <BookingSlotList
        availability={availability}
        selected=""
        loading={false}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getAllByText('(1/3)')).toHaveLength(BOOKING_SLOT_HOURS.length);
  });

  it('선택된 슬롯을 다시 클릭하면 onSelect("") 로 선택 해제 신호를 보낸다', () => {
    const onSelect = jest.fn();
    const availability = makeAvailability({ count: 0, maxCapacity: 2, available: true });

    render(
      <BookingSlotList
        availability={availability}
        selected={FIRST_SLOT}
        loading={false}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByTestId(`booking-slot-${FIRST_SLOT}`));
    expect(onSelect).toHaveBeenCalledWith('');
  });

  it('loading=true 이어도 이미 availability 가 있는 슬롯은 정상 데이터로 렌더 (재fetch 중 일부 슬롯만 업데이트)', () => {
    // 한 슬롯만 기존 데이터 보유, 나머지는 로딩 중인 시나리오
    const partialAvailability: Record<string, SlotAvailability> = {
      [FIRST_SLOT]: { count: 1, maxCapacity: 2, available: true },
    };

    render(
      <BookingSlotList
        availability={partialAvailability}
        selected=""
        loading={true}
        onSelect={jest.fn()}
      />
    );

    // 첫 슬롯: 데이터 있음 → 자리수 표시, 스켈레톤 없음
    expect(screen.getByText('(1/2)')).toBeInTheDocument();
    expect(screen.queryByTestId(`booking-slot-skeleton-${FIRST_SLOT}`)).not.toBeInTheDocument();

    // 다른 슬롯: 로딩 중 → 스켈레톤 있음
    const secondSlot = buildTimeSlotLabel(BOOKING_SLOT_HOURS[1]);
    expect(screen.getByTestId(`booking-slot-skeleton-${secondSlot}`)).toBeInTheDocument();
  });
});
