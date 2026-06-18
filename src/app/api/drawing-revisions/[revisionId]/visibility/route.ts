import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse } from '@/lib/utils/errors';
import { serverUpdateDrawingRevisionVisibility } from '@/lib/api/nestjs-server-client';
import { requireAdminSession } from '@/app/api/_lib/route-authorization';

const log = logger.createLogger('DRAWING_REVISION_VISIBILITY_API');

/**
 * PATCH /api/drawing-revisions/[revisionId]/visibility
 * 도면 수정 공개 여부 변경
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ revisionId: string }> }
) {
  try {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { revisionId } = await params;
    const body = await request.json();
    const { isPublic } = body as { isPublic: boolean };

    if (typeof isPublic !== 'boolean') {
      return NextResponse.json({ error: 'isPublic (boolean) 필드가 필요합니다.' }, { status: 400 });
    }

    const result = await serverUpdateDrawingRevisionVisibility(revisionId, isPublic);

    return NextResponse.json(result);
  } catch (error) {
    log.error('Exception in PATCH drawing-revision visibility', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
