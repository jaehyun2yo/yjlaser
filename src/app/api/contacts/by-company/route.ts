import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse } from '@/lib/utils/errors';
import { serverGetContactsByCompany } from '@/lib/api/nestjs-server-client';
import {
  getCompanyScopedNameForRequest,
  requireSessionUser,
} from '@/app/api/_lib/route-authorization';

const log = logger.createLogger('CONTACTS_BY_COMPANY_API');

/**
 * GET /api/contacts/by-company?companyName=...
 * 업체별 문의 목록 조회 (관리자 전용)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSessionUser();
    if (!auth.ok) return auth.response;

    const { searchParams } = request.nextUrl;
    const companyNameResult = await getCompanyScopedNameForRequest(
      auth.user,
      searchParams.get('companyName')
    );
    if (!companyNameResult.ok) return companyNameResult.response;

    const contacts = await serverGetContactsByCompany(companyNameResult.companyName);

    return NextResponse.json(contacts);
  } catch (error) {
    log.error('Exception in GET contacts/by-company', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
