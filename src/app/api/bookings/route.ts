import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import {
  serverGetBookings,
  serverCreateBooking,
  serverGetContact,
} from '@/lib/api/nestjs-server-client';
import {
  getRecordCompanyName,
  getSessionCompanyName,
  requireCompanyRecordAccess,
  requireSessionUser,
} from '@/app/api/_lib/route-authorization';

const apiLogger = logger.createLogger('BOOKINGS_API');

/**
 * GET /api/bookings
 * 예약 목록 조회 (NestJS API 경유)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (!auth.ok) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date') || undefined;
    let companyName = searchParams.get('companyName') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    if (auth.user.userType === 'company') {
      const sessionCompanyName = await getSessionCompanyName(auth.user);
      if (!sessionCompanyName) {
        return NextResponse.json({ error: '업체 정보를 찾을 수 없습니다.' }, { status: 404 });
      }
      companyName = sessionCompanyName;
    }

    const bookings = await serverGetBookings({
      date,
      companyName,
      startDate,
      endDate,
    });

    return NextResponse.json({ bookings });
  } catch (error) {
    apiLogger.error('Unexpected error', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

/**
 * POST /api/bookings
 * 새 예약 생성 (NestJS API 경유)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { visitDate, visitTimeSlot, companyName, contactId, notes } = body;

    if (
      typeof visitDate !== 'string' ||
      typeof visitTimeSlot !== 'string' ||
      typeof companyName !== 'string' ||
      !visitDate.trim() ||
      !visitTimeSlot.trim() ||
      !companyName.trim()
    ) {
      return NextResponse.json(
        { error: 'visitDate, visitTimeSlot, companyName은 필수입니다.' },
        { status: 400 }
      );
    }

    const normalizedCompanyName = companyName.trim();

    if (auth.user.userType === 'company') {
      const sessionCompanyName = await getSessionCompanyName(auth.user);
      if (!sessionCompanyName) {
        return NextResponse.json({ error: '업체 정보를 찾을 수 없습니다.' }, { status: 404 });
      }
      if (normalizedCompanyName !== sessionCompanyName) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
      }
    }

    if (contactId) {
      const contact = await serverGetContact(String(contactId));
      if (!contact) {
        return NextResponse.json({ error: '문의 정보를 찾을 수 없습니다.' }, { status: 404 });
      }

      const accessError = await requireCompanyRecordAccess(auth.user, contact);
      if (accessError) return accessError;

      const contactCompanyName = getRecordCompanyName(contact);
      if (!contactCompanyName || contactCompanyName !== normalizedCompanyName) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
      }
    }

    const result = await serverCreateBooking({
      visitDate,
      visitTimeSlot,
      companyName: normalizedCompanyName,
      contactId: contactId || null,
      notes: notes || null,
      createdBy: 'company',
    });

    if (!result.success) {
      apiLogger.error('Error creating booking', result.error);
      return NextResponse.json(
        { error: result.error || '예약 생성 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ booking: result.booking }, { status: 201 });
  } catch (error) {
    apiLogger.error('Unexpected error', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
