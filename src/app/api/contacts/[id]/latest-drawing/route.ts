import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse } from '@/lib/utils/errors';
import { serverGetContact, serverGetLatestDrawing } from '@/lib/api/nestjs-server-client';
import { requireCompanyRecordAccess, requireSessionUser } from '@/app/api/_lib/route-authorization';

const log = logger.createLogger('LATEST_DRAWING_API');

/**
 * GET /api/contacts/[id]/latest-drawing
 * 현재 공정 단계 기준 최신 도면 조회
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

    const result = await serverGetLatestDrawing(id, { authMode: 'session' });

    return NextResponse.json(result);
  } catch (error) {
    log.error('Exception in GET latest-drawing', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
