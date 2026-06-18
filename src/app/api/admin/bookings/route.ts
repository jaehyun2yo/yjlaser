import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { serverGetBookings } from '@/lib/api/nestjs-server-client';

const apiLogger = logger.createLogger('ADMIN_BOOKINGS_API');

/**
 * GET /api/admin/bookings
 * 관리자용 예약 목록 조회 (모든 예약)
 */
export async function GET(request: NextRequest) {
  try {
    // 관리자 권한 검사
    const guardResult = await requireAdmin();
    if (!guardResult.authorized) {
      return guardResult.response;
    }

    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const status = searchParams.get('status') || undefined;

    const data = await serverGetBookings({ date, startDate, endDate, status });

    return NextResponse.json({ bookings: data || [] });
  } catch (error) {
    apiLogger.error('Unexpected error', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
