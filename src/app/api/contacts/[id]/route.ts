import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse, AuthenticationError } from '@/lib/utils/errors';
import { serverGetContact, serverDeleteContact } from '@/lib/api/nestjs-server-client';
import {
  requireAdminSession,
  requireCompanyRecordAccess,
  requireSessionUser,
} from '@/app/api/_lib/route-authorization';

const contactApiLogger = logger.createLogger('CONTACT_API');

/**
 * GET /api/contacts/[id]
 * 문의 상세 정보를 조회합니다.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSessionUser();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const contact = await serverGetContact(id);

    if (!contact) {
      return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 });
    }

    const accessError = await requireCompanyRecordAccess(auth.user, contact);
    if (accessError) return accessError;

    return NextResponse.json(contact);
  } catch (error) {
    contactApiLogger.error('Exception in GET contact', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}

/**
 * DELETE /api/contacts/[id]
 * 문의를 삭제합니다.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminSession();
    if (!auth.ok) {
      const errorResponse = toApiErrorResponse(new AuthenticationError());
      return auth.response.status === 401
        ? NextResponse.json(errorResponse.body, { status: errorResponse.status })
        : auth.response;
    }

    const { id } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const isPermanent = body.permanent === true;

    // NestJS API로 삭제 (visit_bookings 삭제는 DB CASCADE 또는 NestJS 서비스에서 처리)
    const result = await serverDeleteContact(id, isPermanent);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    contactApiLogger.error('Exception in DELETE contact', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
