import { NextRequest, NextResponse } from 'next/server';
import { verifyAndGetUser } from '@/lib/auth/session';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse } from '@/lib/utils/errors';
import { nestjsFetch } from '@/lib/api/nestjs-server-client';

const log = logger.createLogger('COMPANY_DRAWING_API');

/**
 * POST /api/contacts/[id]/company-drawing
 * 거래처 도면 업로드 — NestJS 프록시
 * 거래처 세션 인증 후 NestJS /contacts/:id/company-drawing 으로 전달
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isValid, user } = await verifyAndGetUser();
    if (!isValid || !user || user.userType !== 'company') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // nestjsFetch forwards session cookies — NestJS resolves companyName from session
    // companyName placeholder required by DTO validation; NestJS overrides for company users
    const result = await nestjsFetch<Record<string, unknown>>(`/contacts/${id}/company-drawing`, {
      method: 'POST',
      body: {
        ...body,
        companyName: body.companyName || `company-${user.userId}`,
      },
    });

    if (!result.ok) {
      return NextResponse.json(result.data, { status: result.status });
    }

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    log.error('Exception in POST company-drawing', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
