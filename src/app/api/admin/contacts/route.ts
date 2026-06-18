import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse } from '@/lib/utils/errors';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { serverGetContacts, serverGetContactStatusCounts } from '@/lib/api/nestjs-server-client';

const adminContactsLogger = logger.createLogger('ADMIN_CONTACTS');

export async function GET(request: NextRequest) {
  try {
    // 관리자 권한 검사
    const guardResult = await requireAdmin();
    if (!guardResult.authorized) {
      return guardResult.response;
    }

    const searchParams = request.nextUrl.searchParams;
    const statusFilter = searchParams.get('status') || 'all';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const searchQuery = searchParams.get('search') || '';
    const processStages = searchParams.get('processStages') || undefined;
    const workCategory = searchParams.get('workCategory') || undefined;
    const inquiryTypeFilter = searchParams.get('inquiry_type') || undefined;

    // NestJS API로 목록 조회
    const [contactsResult, statusCounts] = await Promise.all([
      serverGetContacts({
        status: statusFilter,
        page,
        limit: 20,
        search: searchQuery || undefined,
        processStages,
        workCategory,
        inquiryType: inquiryTypeFilter,
      }),
      // 첫 페이지 요청 시에만 statusCounts 가져오기
      page === 1 ? serverGetContactStatusCounts(searchQuery || undefined) : Promise.resolve(null),
    ]);

    // statusCounts 변환 (공정 단계 기반 상태값)
    let formattedStatusCounts = null;
    if (statusCounts) {
      formattedStatusCounts = {
        all: Number(statusCounts.all_count) || 0,
        received: Number(statusCounts.received_count) || 0,
        drawing: Number(statusCounts.drawing_count) || 0,
        confirmed: Number(statusCounts.confirmed_count) || 0,
        production: Number(statusCounts.production_count) || 0,
        cutting: Number(statusCounts.cutting_count) || 0,
        finishing: Number(statusCounts.finishing_count) || 0,
        delivered: Number(statusCounts.delivered_count) || 0,
        on_hold: Number(statusCounts.on_hold_count) || 0,
      };
    }

    return NextResponse.json({
      contacts: contactsResult.contacts,
      totalCount: contactsResult.totalCount,
      hasMore: contactsResult.hasMore,
      ...(formattedStatusCounts && { statusCounts: formattedStatusCounts }),
    });
  } catch (error) {
    adminContactsLogger.error('Exception in GET admin contacts', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
