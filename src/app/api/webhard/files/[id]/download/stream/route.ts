import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/adminGuard';
import { checkWebhardRateLimit } from '@/lib/auth/rateLimit';
import { toByteStringHeaderValue } from '@/lib/api/headerEncoding';
import { isValidUUID } from '@/lib/utils/webhardValidation';

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: fileId } = await params;

  if (!isValidUUID(fileId)) {
    return NextResponse.json({ error: '유효하지 않은 파일 ID 형식입니다.' }, { status: 400 });
  }

  const [authResult, rateLimitResult] = await Promise.all([
    requireAuth(),
    checkWebhardRateLimit(request),
  ]);

  if (!authResult.authorized) {
    return authResult.response!;
  }

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      { status: 429 }
    );
  }

  const response = await fetch(`${NESTJS_API_URL}/api/v1/files/${fileId}/download/stream`, {
    headers: {
      Cookie: request.headers.get('cookie') || '',
    },
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
