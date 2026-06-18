import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse } from '@/lib/utils/errors';
import { serverGetContact, serverGetFileDownloadUrl } from '@/lib/api/nestjs-server-client';
import { requireCompanyRecordAccess, requireSessionUser } from '@/app/api/_lib/route-authorization';
import { buildContactDownloadFilename } from '@/lib/utils/contactDownloadFilename';

const log = logger.createLogger('FILE_DOWNLOAD_API');

/**
 * GET /api/contacts/[id]/file-download?type=attachment|drawing|revision_request|reference_photo|revision_request_history&index=0
 * 파일 타입별 presigned download URL 반환
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

    const { searchParams } = request.nextUrl;
    const type = searchParams.get('type');
    const indexParam = searchParams.get('index');

    if (!type) {
      return NextResponse.json({ error: 'type 파라미터가 필요합니다.' }, { status: 400 });
    }

    const index = indexParam !== null ? parseInt(indexParam, 10) : undefined;
    const result = await serverGetFileDownloadUrl(id, type, index);

    if (!result) {
      return NextResponse.json({ error: '다운로드 URL을 생성할 수 없습니다.' }, { status: 404 });
    }

    const url =
      result.provider === 'GOOGLE_DRIVE' && result.fileId
        ? `/api/contacts/${encodeURIComponent(id)}/file-stream?${buildFileStreamQuery(type, index)}`
        : result.url;

    return NextResponse.json({
      ...result,
      url,
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
    log.error('Exception in GET file-download', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}

function buildFileStreamQuery(type: string, index: number | undefined): string {
  const params = new URLSearchParams({ type });
  if (index !== undefined) params.set('index', String(index));
  return params.toString();
}
