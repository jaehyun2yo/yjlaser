import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { serverGetAvailableSlots } from '@/lib/api/nestjs-server-client';

const apiLogger = logger.createLogger('BOOKINGS_API');

/**
 * GET /api/bookings/available
 * 특정 날짜와 시간 슬롯의 예약 가능 여부 조회 (NestJS API 경유)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const timeSlot = searchParams.get('timeSlot');

    if (!date || !timeSlot) {
      return NextResponse.json(
        { error: 'date와 timeSlot 파라미터가 필요합니다.' },
        { status: 400 }
      );
    }

    const normalizedDate = date.trim();

    // NestJS API 경유로 예약 가능 슬롯 조회
    const result = await serverGetAvailableSlots(normalizedDate);

    // 구버전 NestJS 호환: maxCapacity 미포함 응답이면 fallback=2
    const maxCapacity = result.maxCapacity ?? 2;
    const bookingCount = result.slotCounts[timeSlot.trim()] || 0;
    const isAvailable = bookingCount < maxCapacity;
    const availableSlots = Math.max(0, maxCapacity - bookingCount);

    return NextResponse.json({
      date,
      timeSlot,
      bookingCount,
      availableSlots,
      isAvailable,
      maxBookings: maxCapacity,
    });
  } catch (error) {
    apiLogger.error('Unexpected error', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
