import { NextRequest, NextResponse } from 'next/server';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse } from '@/lib/utils/errors';
import {
  serverGetContact,
  serverGetDrawingRevisionDownloadUrl,
  serverGetDrawingRevisionInfo,
} from '@/lib/api/nestjs-server-client';
import { requireCompanyRecordAccess, requireSessionUser } from '@/app/api/_lib/route-authorization';
import { buildContactDownloadFilename } from '@/lib/utils/contactDownloadFilename';

const log = logger.createLogger('DRAWING_REVISION_DOWNLOAD_API');

/**
 * GET /api/drawing-revisions/[revisionId]/download?fileIndex=0
 * 도면 파일 다운로드 URL 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ revisionId: string }> }
) {
  try {
    const auth = await requireSessionUser();
    const workerSession = auth.ok ? null : await getErpWorkerSession();
    if (!auth.ok && !workerSession) {
      return auth.response;
    }
    const authMode = auth.ok ? 'session' : 'workerSession';

    const { revisionId } = await params;
    const { searchParams } = request.nextUrl;
    const fileIndexParam = searchParams.get('fileIndex');
    const fileIndex = fileIndexParam !== null ? parseInt(fileIndexParam, 10) : 0;
    const revision = await serverGetDrawingRevisionInfo(revisionId, { authMode });
    if (!revision) {
      return NextResponse.json({ error: '도면 수정 이력을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (auth.ok) {
      const accessError = await requireCompanyRecordAccess(auth.user, {
        companyName: revision.companyName,
      });
      if (accessError) return accessError;

      if (auth.user.userType === 'company' && !revision.isPublic) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
      }
    }

    const result = await serverGetDrawingRevisionDownloadUrl(revisionId, fileIndex, { authMode });

    if (!result) {
      return NextResponse.json({ error: '다운로드 URL을 생성할 수 없습니다.' }, { status: 404 });
    }

    const contact = await serverGetContact(revision.contactId);

    return NextResponse.json({
      ...result,
      url:
        result.provider === 'GOOGLE_DRIVE' && result.fileId
          ? `/api/drawing-revisions/${encodeURIComponent(revisionId)}/stream?fileIndex=${fileIndex}`
          : result.url,
      fileName: buildContactDownloadFilename({
        inquiryNumber:
          contact && typeof contact.inquiry_number === 'string' ? contact.inquiry_number : null,
        workNumber: contact && typeof contact.work_number === 'string' ? contact.work_number : null,
        companyName: revision.companyName,
        fileName: result.fileName,
      }),
    });
  } catch (error) {
    log.error('Exception in GET drawing-revision download', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
