import { NextRequest, NextResponse } from 'next/server';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse } from '@/lib/utils/errors';
import { serverGetContact, serverGetFileDownloadUrl } from '@/lib/api/nestjs-server-client';
import { requireCompanyRecordAccess, requireSessionUser } from '@/app/api/_lib/route-authorization';
import { proxyWebhardFileStream } from '@/app/api/_lib/webhard-file-stream';

const log = logger.createLogger('CONTACT_FILE_STREAM_API');

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = request.nextUrl;
    const type = searchParams.get('type');
    const indexParam = searchParams.get('index');

    if (!type) {
      return NextResponse.json({ error: 'type 파라미터가 필요합니다.' }, { status: 400 });
    }

    const auth = await requireSessionUser();
    const workerSession = auth.ok ? null : await getErpWorkerSession();
    if (!auth.ok && !workerSession) return auth.response;

    const contact = await serverGetContact(id);
    if (!contact) {
      return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (auth.ok) {
      const accessError = await requireCompanyRecordAccess(auth.user, contact);
      if (accessError) return accessError;
    } else if (type !== 'delivery_proof') {
      return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
    }

    const index = indexParam !== null ? parseInt(indexParam, 10) : undefined;
    const result = await serverGetFileDownloadUrl(id, type, index);
    if (result?.provider !== 'GOOGLE_DRIVE' || !result.fileId) {
      return NextResponse.json({ error: 'Drive 파일 스트림을 생성할 수 없습니다.' }, { status: 404 });
    }

    return proxyWebhardFileStream(request, result.fileId);
  } catch (error) {
    log.error('Exception in GET contact file stream', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
