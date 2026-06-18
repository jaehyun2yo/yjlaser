import { NextRequest, NextResponse } from 'next/server';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import { serverGetContact, serverGetContactLatestDrawingUrl } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse } from '@/lib/utils/errors';
import { requireCompanyRecordAccess, requireSessionUser } from '@/app/api/_lib/route-authorization';
import { buildContactDownloadFilename } from '@/lib/utils/contactDownloadFilename';

const log = logger.createLogger('LATEST_DRAWING_DOWNLOAD_API');

/**
 * GET /api/contacts/[id]/latest-drawing/download
 * 최신 도면 다운로드 URL (리비전 우선, 없으면 원본 fallback)
 * - admin 세션 또는 worker 세션 허용
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requireSessionUser();
    const workerSession = auth.ok ? null : await getErpWorkerSession();
    if (!auth.ok && !workerSession) return auth.response;
    const authMode = auth.ok ? 'session' : 'workerSession';

    const contact = await serverGetContact(id);
    if (!contact) {
      return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (auth.ok) {
      const accessError = await requireCompanyRecordAccess(auth.user, contact);
      if (accessError) return accessError;
    }

    const result = await serverGetContactLatestDrawingUrl(id, { authMode });
    if (!result) {
      return NextResponse.json({ error: '도면이 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({
      ...result,
      url:
        result.provider === 'GOOGLE_DRIVE' && result.fileId
          ? `/api/contacts/${encodeURIComponent(id)}/file-stream?type=drawing`
          : result.url,
      fileName: buildContactDownloadFilename({
        inquiryNumber: typeof contact.inquiry_number === 'string' ? contact.inquiry_number : null,
        workNumber: typeof contact.work_number === 'string' ? contact.work_number : null,
        companyName:
          typeof contact.company_name === 'string'
            ? contact.company_name
            : typeof contact.companyName === 'string'
              ? contact.companyName
              : null,
        fileName: result.fileName,
      }),
    });
  } catch (error) {
    log.error('Exception in GET latest-drawing/download', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
