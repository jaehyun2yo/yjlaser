import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/adminGuard';
import { checkWebhardRateLimit } from '@/lib/auth/rateLimit';
import { isValidUUID } from '@/lib/utils/webhardValidation';

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: fileId } = await params;

  // UUID 형식 검증
  if (!isValidUUID(fileId)) {
    return NextResponse.json({ error: '유효하지 않은 파일 ID 형식입니다.' }, { status: 400 });
  }

  // 인증 + Rate Limiting
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

  try {
    const response = await fetch(`${NESTJS_API_URL}/api/v1/files/${fileId}/download`, {
      headers: {
        'Content-Type': 'application/json',
        Cookie: request.headers.get('cookie') || '',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Download failed' }));
      return NextResponse.json(error, { status: response.status });
    }

    // NestJS 응답: { url, key, expiresAt }
    const data = await response.json();

    return NextResponse.json({
      url:
        data.provider === 'google_drive'
          ? `/api/webhard/files/${fileId}/download/stream`
          : data.url,
      key: data.key,
      expiresAt: data.expiresAt,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get download URL' }, { status: 502 });
  }
}
