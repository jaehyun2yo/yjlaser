import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { requireAdmin } from '@/lib/auth/adminGuard';
import {
  serverGetBooking,
  serverGetAvailableSlots,
  serverUpdateBooking,
  serverDeleteBooking,
} from '@/lib/api/nestjs-server-client';

const apiLogger = logger.createLogger('ADMIN_BOOKINGS_API');

const BOOKING_STATUS_VALUES = ['pending', 'confirmed', 'cancelled'] as const;
type BookingStatus = (typeof BOOKING_STATUS_VALUES)[number];

function isValidStatus(value: unknown): value is BookingStatus {
  return typeof value === 'string' && (BOOKING_STATUS_VALUES as readonly string[]).includes(value);
}

/**
 * PATCH /api/admin/bookings/[id]
 * 예약 수정 — 승인/취소 (status)·일자·시간·관리자 메모 변경
 *
 * admin 세션이 유일한 권한 게이트. 검증 후 INTEGRATION_API_KEY 로 NestJS 호출.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guardResult = await requireAdmin();
    if (!guardResult.authorized) {
      return guardResult.response;
    }

    const { id } = await params;
    const bookingId = parseInt(id, 10);
    if (Number.isNaN(bookingId)) {
      return NextResponse.json({ error: '유효하지 않은 예약 ID 입니다.' }, { status: 400 });
    }

    const body = await request.json();
    const { visitDate, visitTimeSlot, companyName, status, notes, adminNote } = body;

    if (status !== undefined && !isValidStatus(status)) {
      return NextResponse.json(
        { error: `status 는 ${BOOKING_STATUS_VALUES.join(' | ')} 중 하나여야 합니다.` },
        { status: 400 }
      );
    }

    if (visitDate && visitTimeSlot) {
      const [existingBooking, slotsInfo] = await Promise.all([
        serverGetBooking(bookingId),
        serverGetAvailableSlots(visitDate),
      ]);

      if (
        existingBooking &&
        (existingBooking.visit_date !== visitDate ||
          existingBooking.visit_time_slot !== visitTimeSlot)
      ) {
        const slotCount = slotsInfo.slotCounts[visitTimeSlot] || 0;
        const maxCapacity = slotsInfo.maxCapacity ?? 2;
        if (slotCount >= maxCapacity) {
          return NextResponse.json(
            { error: `해당 시간대는 이미 예약이 가득 찼습니다. (최대 ${maxCapacity}건)` },
            { status: 400 }
          );
        }
      }
    }

    const updateData: Record<string, unknown> = {};
    if (visitDate) updateData.visitDate = visitDate;
    if (visitTimeSlot) updateData.visitTimeSlot = visitTimeSlot;
    if (companyName) updateData.companyName = companyName;
    if (status) updateData.status = status;
    if (adminNote !== undefined) updateData.adminNote = adminNote;
    else if (notes !== undefined) updateData.notes = notes;

    const result = await serverUpdateBooking(bookingId, updateData);

    if (!result.success) {
      apiLogger.error('Error updating booking', { error: result.error });
      return NextResponse.json({ error: '예약 수정 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ booking: result.booking });
  } catch (error) {
    apiLogger.error('Unexpected error', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/bookings/[id]
 * 예약 삭제 (hard delete). 취소는 PATCH status='cancelled' 를 우선 사용.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guardResult = await requireAdmin();
    if (!guardResult.authorized) {
      return guardResult.response;
    }

    const { id } = await params;
    const bookingId = parseInt(id, 10);
    if (Number.isNaN(bookingId)) {
      return NextResponse.json({ error: '유효하지 않은 예약 ID 입니다.' }, { status: 400 });
    }

    const result = await serverDeleteBooking(bookingId);

    if (!result.success) {
      apiLogger.error('Error deleting booking', { error: result.error });
      return NextResponse.json({ error: '예약 삭제 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    apiLogger.error('Unexpected error', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
