import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse } from '@/lib/utils/errors';
import {
  serverGetContact,
  serverGetContactTimeline,
  serverGetContactTimelineForSession,
} from '@/lib/api/nestjs-server-client';
import { requireCompanyRecordAccess, requireSessionUser } from '@/app/api/_lib/route-authorization';

const log = logger.createLogger('CONTACT_TIMELINE_API');

/**
 * GET /api/contacts/[id]/timeline
 * 문의 타임라인 조회
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

    const timeline =
      auth.user.userType === 'company'
        ? await serverGetContactTimelineForSession(id)
        : await serverGetContactTimeline(id);

    return NextResponse.json({ timeline });
  } catch (error) {
    log.error('Exception in GET timeline', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
