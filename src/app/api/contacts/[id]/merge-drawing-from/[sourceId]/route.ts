import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse } from '@/lib/utils/errors';
import { serverMergeDrawingFrom } from '@/lib/api/nestjs-server-client';
import { requireAdminSession } from '@/app/api/_lib/route-authorization';

const log = logger.createLogger('MERGE_DRAWING_API');

/**
 * POST /api/contacts/[id]/merge-drawing-from/[sourceId]
 * 관리자 전용 — sourceId의 도면을 id 문의로 병합
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  try {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { id, sourceId } = await params;
    const result = await serverMergeDrawingFrom(id, sourceId);

    return NextResponse.json(result);
  } catch (error) {
    log.error('Exception in POST merge-drawing-from', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
