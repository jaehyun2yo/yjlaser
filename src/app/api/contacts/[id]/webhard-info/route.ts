import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse } from '@/lib/utils/errors';
import { serverGetContact, serverGetWebhardInfo } from '@/lib/api/nestjs-server-client';
import { requireCompanyRecordAccess, requireSessionUser } from '@/app/api/_lib/route-authorization';

const log = logger.createLogger('WEBHARD_INFO_API');

/**
 * GET /api/contacts/[id]/webhard-info
 * 문의와 연결된 웹하드 폴더/파일 정보 반환
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

    const result = await serverGetWebhardInfo(id);

    if (!result) {
      return NextResponse.json({ error: '웹하드 정보를 조회할 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    log.error('Exception in GET webhard-info', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
