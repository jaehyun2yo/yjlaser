import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { revalidatePath } from 'next/cache';
import {
  serverGetBooking,
  serverUpdateBooking,
  serverUpdateContact,
  serverGetAvailableSlots,
  serverGetContact,
} from '@/lib/api/nestjs-server-client';
import {
  getRecordCompanyName,
  requireCompanyRecordAccess,
  requireSessionUser,
} from '@/app/api/_lib/route-authorization';

const apiLogger = logger.createLogger('BOOKINGS_API');

type AuthenticatedUser = Extract<
  Awaited<ReturnType<typeof requireSessionUser>>,
  { ok: true }
>['user'];

async function requireLinkedContactAccess(
  user: AuthenticatedUser,
  contactId: string,
  bookingCompanyName: string | null
): Promise<NextResponse | null> {
  const contact = await serverGetContact(contactId);
  if (!contact) {
    return NextResponse.json({ error: '문의 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const contactAccessError = await requireCompanyRecordAccess(user, contact);
  if (contactAccessError) return contactAccessError;

  const contactCompanyName = getRecordCompanyName(contact);
  if (!bookingCompanyName || !contactCompanyName || bookingCompanyName !== contactCompanyName) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  return null;
}

/**
 * PUT /api/bookings/[id]
 * 업체용 예약 수정 (NestJS API 경유)
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSessionUser();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { visitDate, visitTimeSlot } = body;

    if (!visitDate || !visitTimeSlot) {
      return NextResponse.json(
        { error: 'visitDate와 visitTimeSlot은 필수입니다.' },
        { status: 400 }
      );
    }

    // 기존 예약 조회
    const existingBooking = await serverGetBooking(Number(id));

    if (!existingBooking) {
      return NextResponse.json({ error: '예약을 찾을 수 없습니다.' }, { status: 404 });
    }

    const accessError = await requireCompanyRecordAccess(auth.user, existingBooking);
    if (accessError) return accessError;

    const bookingCompanyName = getRecordCompanyName(existingBooking);
    const contactId = existingBooking.contact_id as string | null;
    if (contactId) {
      const linkedContactError = await requireLinkedContactAccess(
        auth.user,
        contactId,
        bookingCompanyName
      );
      if (linkedContactError) return linkedContactError;
    }

    const isVisitScheduleChanged =
      existingBooking.visit_date !== visitDate || existingBooking.visit_time_slot !== visitTimeSlot;

    // 날짜나 시간이 변경되는 경우 예약 가능 여부 확인
    if (isVisitScheduleChanged) {
      const slotsResult = await serverGetAvailableSlots(visitDate);
      const maxCapacity = slotsResult.maxCapacity ?? 2;
      const currentCount = slotsResult.slotCounts[visitTimeSlot] || 0;

      // 현재 예약이 같은 슬롯에 있으면 -1 해야 함
      const adjustedCount =
        existingBooking.visit_date === visitDate &&
        existingBooking.visit_time_slot === visitTimeSlot
          ? currentCount - 1
          : currentCount;

      if (adjustedCount >= maxCapacity) {
        return NextResponse.json(
          { error: `해당 시간대는 이미 예약이 가득 찼습니다. (최대 ${maxCapacity}건)` },
          { status: 400 }
        );
      }
    }

    // 예약 수정
    const updateResult = await serverUpdateBooking(Number(id), {
      visitDate,
      visitTimeSlot,
    });

    if (!updateResult.success) {
      apiLogger.error('Error updating booking', updateResult.error);
      return NextResponse.json({ error: '예약 수정 중 오류가 발생했습니다.' }, { status: 500 });
    }

    // contact_id가 있고 실제로 예약이 변경된 경우에만 contacts 테이블 업데이트
    if (contactId && isVisitScheduleChanged) {
      const contactResult = await serverUpdateContact(contactId, {
        visitDate,
        visitTimeSlot,
      });

      if (!contactResult.success) {
        apiLogger.error('Error updating contact visit schedule', { error: contactResult.error });
      } else {
        apiLogger.info('Contact visit schedule updated successfully', {
          contactId,
          visitDate,
          visitTimeSlot,
        });
      }
    }

    // 페이지 캐시 무효화
    revalidatePath('/company/dashboard');
    if (contactId) {
      revalidatePath(`/admin/contacts/${contactId}`);
    }

    return NextResponse.json({ booking: updateResult.booking });
  } catch (error) {
    apiLogger.error('Unexpected error', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

/**
 * DELETE /api/bookings/[id]
 * 업체용 예약 취소 (배송 정보 포함, NestJS API 경유)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSessionUser();
    if (!auth.ok) return auth.response;

    const { id } = await params;

    // body 파싱
    let body: Record<string, unknown> = {};
    try {
      const contentType = request.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        body = await request.json();
      }
    } catch (e) {
      apiLogger.warn('Request body is empty or invalid', e);
    }

    const { deliveryMethod, deliveryName, deliveryPhone, deliveryAddress } = body;

    // 기존 예약 조회
    const existingBooking = await serverGetBooking(Number(id));

    if (!existingBooking) {
      return NextResponse.json({ error: '예약을 찾을 수 없습니다.' }, { status: 404 });
    }

    const accessError = await requireCompanyRecordAccess(auth.user, existingBooking);
    if (accessError) return accessError;

    const bookingCompanyName = getRecordCompanyName(existingBooking);
    const contactId = existingBooking.contact_id as string | null;
    if (contactId) {
      const linkedContactError = await requireLinkedContactAccess(
        auth.user,
        contactId,
        bookingCompanyName
      );
      if (linkedContactError) return linkedContactError;
    }

    // 예약 취소
    const updateData: Record<string, unknown> = { status: 'cancelled' };

    if (
      deliveryMethod &&
      deliveryName &&
      deliveryPhone &&
      deliveryAddress &&
      typeof deliveryMethod === 'string' &&
      typeof deliveryName === 'string' &&
      typeof deliveryPhone === 'string' &&
      typeof deliveryAddress === 'string'
    ) {
      updateData.deliveryMethod = deliveryMethod;
      updateData.deliveryName = deliveryName;
      updateData.deliveryPhone = deliveryPhone;
      updateData.deliveryAddress = deliveryAddress;

      if (contactId) {
        const deliveryType =
          deliveryMethod === 'delivery' ? 'parcel' : deliveryMethod === 'quick' ? 'quick' : null;

        const contactUpdatePayload: Record<string, unknown> = {
          receiptMethod: 'delivery',
          deliveryMethod,
        };

        if (deliveryType) {
          contactUpdatePayload.deliveryType = deliveryType;
        }
        contactUpdatePayload.deliveryAddress = deliveryAddress;
        contactUpdatePayload.deliveryName = deliveryName;
        contactUpdatePayload.deliveryPhone = deliveryPhone;

        const contactResult = await serverUpdateContact(contactId, contactUpdatePayload);

        if (!contactResult.success) {
          apiLogger.error('Error updating contact delivery info', { error: contactResult.error });
        }
      }
    }

    const updateResult = await serverUpdateBooking(Number(id), updateData);

    if (!updateResult.success) {
      apiLogger.error('Error cancelling booking', updateResult.error);
      return NextResponse.json({ error: '예약 취소 중 오류가 발생했습니다.' }, { status: 500 });
    }

    // 페이지 캐시 무효화
    revalidatePath('/company/dashboard');
    if (contactId) {
      revalidatePath(`/admin/contacts/${contactId}`);
    }

    return NextResponse.json({ booking: updateResult.booking });
  } catch (error) {
    apiLogger.error('Unexpected error', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
