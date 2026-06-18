import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse } from '@/lib/utils/errors';
import { serverCreateDrawingRevision } from '@/lib/api/nestjs-server-client';
import { requireAdminSession } from '@/app/api/_lib/route-authorization';

const log = logger.createLogger('DRAWING_REVISIONS_API');

/**
 * POST /api/contacts/[id]/drawing-revisions
 * 도면 수정 등록 (관리자 모달 전용)
 *
 * 조회는 통합 타임라인(/api/contacts/[id]/timeline)에서 처리한다 — 별도 GET 라우트 없음.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();

    const revision = await serverCreateDrawingRevision(id, body);

    return NextResponse.json(revision, { status: 201 });
  } catch (error) {
    log.error('Exception in POST drawing-revisions', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
