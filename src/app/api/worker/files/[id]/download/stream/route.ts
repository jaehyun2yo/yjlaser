import { NextRequest, NextResponse } from 'next/server';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import { toByteStringHeaderValue } from '@/lib/api/headerEncoding';
import { isValidUUID } from '@/lib/utils/webhardValidation';
import { buildWorkerSessionHeaders } from '@/app/api/worker/_lib/workerSessionHeaders';

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getErpWorkerSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id: fileId } = await params;
  if (!isValidUUID(fileId)) {
    return NextResponse.json({ error: '유효하지 않은 파일 ID 형식입니다.' }, { status: 400 });
  }

  const response = await fetch(`${NESTJS_API_URL}/api/v1/files/${fileId}/download/stream`, {
    headers: buildWorkerSessionHeaders(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Download failed' }));
    return NextResponse.json(error, { status: response.status });
  }

  const headers = new Headers();
  const contentType = response.headers.get('content-type');
  const contentLength = response.headers.get('content-length');
  const contentDisposition = toByteStringHeaderValue(response.headers.get('content-disposition'));
  if (contentType) headers.set('Content-Type', contentType);
  if (contentLength) headers.set('Content-Length', contentLength);
  if (contentDisposition) headers.set('Content-Disposition', contentDisposition);

  return new NextResponse(response.body, {
    status: response.status,
    headers,
  });
}
