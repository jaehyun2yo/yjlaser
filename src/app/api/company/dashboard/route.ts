import { NextRequest, NextResponse } from 'next/server';
import { verifySession, getSessionUser } from '@/lib/auth/session';
import { logger } from '@/lib/utils/logger';
import {
  serverGetContactsByCompany,
  serverGetCompany,
  serverGetBookings,
} from '@/lib/api/nestjs-server-client';

const dashboardApiLogger = logger.createLogger('COMPANY_DASHBOARD_API');

async function fetchBookings(companyName: string): Promise<unknown[]> {
  return await serverGetBookings({
    companyName,
    status: 'confirmed',
  });
}

/**
 * GET /api/company/dashboard
 * 거래처 대시보드 데이터 새로고침 (문의사항 + 예약)
 */
export async function GET(request: NextRequest) {
  try {
    const isAuthenticated = await verifySession();
    if (!isAuthenticated) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const user = await getSessionUser();
    if (!user?.userId || user?.userType !== 'company') {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const companyId = Number(user.userId);
    if (!Number.isSafeInteger(companyId) || companyId <= 0) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'all';

    // 업체 정보 가져오기 (NestJS API)
    const companyData = await serverGetCompany(companyId);

    if (!companyData) {
      dashboardApiLogger.error('Company not found', { userId: user.userId });
      return NextResponse.json({ error: '업체 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const companyName = companyData.company_name;
    const responseBody: { contacts?: unknown[]; bookings?: unknown[] } = {};

    if (type === 'contacts') {
      responseBody.contacts = await serverGetContactsByCompany(companyName);
    } else if (type === 'bookings') {
      responseBody.bookings = await fetchBookings(companyName);
    } else {
      // type === 'all'
      const [contacts, bookings] = await Promise.all([
        serverGetContactsByCompany(companyName),
        fetchBookings(companyName),
      ]);
      responseBody.contacts = contacts;
      responseBody.bookings = bookings;
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    dashboardApiLogger.error('Exception in GET company dashboard', error);
    return NextResponse.json(
      { error: '대시보드 데이터 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
