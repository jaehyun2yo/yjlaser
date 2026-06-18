import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse } from '@/lib/utils/errors';
import { serverGetContact, serverGetDrawingDownloadUrl } from '@/lib/api/nestjs-server-client';
import { requireCompanyRecordAccess, requireSessionUser } from '@/app/api/_lib/route-authorization';

const log = logger.createLogger('DRAWING_DOWNLOAD_API');

/**
 * GET /api/contacts/[id]/drawing-download
 * 첨부파일 presigned download URL 반환
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

    const result = await serverGetDrawingDownloadUrl(id);

    if (!result) {
      return NextResponse.json({ error: '다운로드 URL을 생성할 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({
      ...result,
      url:
        result.provider === 'GOOGLE_DRIVE' && result.fileId
          ? `/api/contacts/${encodeURIComponent(id)}/file-stream?type=drawing`
          : result.url,
    });
  } catch (error) {
    log.error('Exception in GET drawing-download', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
