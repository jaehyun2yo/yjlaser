import { NextRequest, NextResponse } from 'next/server';
import { verifyAndGetUser } from '@/lib/auth/session';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse } from '@/lib/utils/errors';
import { nestjsFetch } from '@/lib/api/nestjs-server-client';

const log = logger.createLogger('LINK_WEBHARD_FILE_API');

/**
 * POST /api/contacts/[id]/link-webhard-file
 * 웹하드 파일 → 문의 연결 — NestJS 프록시
 * 거래처 세션 인증 후 NestJS /contacts/:id/link-webhard-file 으로 전달
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isValid, user } = await verifyAndGetUser();
    if (!isValid || !user || user.userType !== 'company') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const result = await nestjsFetch<Record<string, unknown>>(`/contacts/${id}/link-webhard-file`, {
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
    log.error('Exception in POST link-webhard-file', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
