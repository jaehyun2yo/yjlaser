/**
 * @jest-environment node
 *
 * `/api/bookings/available` Next.js proxy route 의 maxCapacity 전파 검증 (task 23 phase 7).
 *
 * - NestJS 응답의 `maxCapacity` 가 route 응답의 `maxBookings` 필드에 그대로 전파되어야 한다.
 * - NestJS 구버전이 `maxCapacity` 를 누락하면 `maxBookings: 2` fallback 이 적용된다.
 * - `bookingCount < maxCapacity` 기준으로 `isAvailable` / `availableSlots` 가 재계산된다.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/api/nestjs-server-client', () => ({
  serverGetAvailableSlots: jest.fn(),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    createLogger: () => ({
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { serverGetAvailableSlots } from '@/lib/api/nestjs-server-client';
import { GET } from '@/app/api/bookings/available/route';

const mockedGetAvailableSlots = serverGetAvailableSlots as jest.MockedFunction<
  typeof serverGetAvailableSlots
>;

function makeRequest(date: string, timeSlot: string) {
  const url = new URL(
    `http://localhost:3000/api/bookings/available?date=${encodeURIComponent(
      date
    )}&timeSlot=${encodeURIComponent(timeSlot)}`
  );
  return new NextRequest(url);
}

describe('GET /api/bookings/available — maxCapacity propagation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('NestJS 가 maxCapacity=3 을 반환하면 maxBookings=3 으로 전파한다', async () => {
    mockedGetAvailableSlots.mockResolvedValue({
      date: '2026-05-01',
      slotCounts: { '9:00~10:00': 1 },
      maxCapacity: 3,
    });

    const response = await GET(makeRequest('2026-05-01', '9:00~10:00'));
    const body = await response.json();

    expect(body.maxBookings).toBe(3);
    expect(body.bookingCount).toBe(1);
    expect(body.availableSlots).toBe(2);
    expect(body.isAvailable).toBe(true);
  });

  it('NestJS 응답에 maxCapacity 가 없으면 maxBookings=2 fallback 을 사용한다', async () => {
    mockedGetAvailableSlots.mockResolvedValue({
      date: '2026-05-01',
      slotCounts: { '9:00~10:00': 1 },
    });

    const response = await GET(makeRequest('2026-05-01', '9:00~10:00'));
    const body = await response.json();

    expect(body.maxBookings).toBe(2);
    expect(body.bookingCount).toBe(1);
    expect(body.availableSlots).toBe(1);
    expect(body.isAvailable).toBe(true);
  });

  it('bookingCount 가 maxCapacity 이상이면 isAvailable=false', async () => {
    mockedGetAvailableSlots.mockResolvedValue({
      date: '2026-05-01',
      slotCounts: { '9:00~10:00': 2 },
      maxCapacity: 2,
    });

    const response = await GET(makeRequest('2026-05-01', '9:00~10:00'));
    const body = await response.json();

    expect(body.bookingCount).toBe(2);
    expect(body.availableSlots).toBe(0);
    expect(body.isAvailable).toBe(false);
    expect(body.maxBookings).toBe(2);
  });

  it('date/timeSlot 파라미터가 없으면 400 반환', async () => {
    const url = new URL('http://localhost:3000/api/bookings/available');
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(400);
  });
});
