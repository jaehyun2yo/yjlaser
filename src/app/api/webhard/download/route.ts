import { NextRequest, NextResponse } from 'next/server';
import { getSearchParams, parseBody } from '@/lib/api/webhard-proxy';
import { validateFileIds, isValidUUID } from '@/lib/utils/webhardValidation';
import { requireAuth } from '@/lib/auth/adminGuard';
import { checkWebhardRateLimit } from '@/lib/auth/rateLimit';

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';

export async function GET(request: NextRequest) {
  const searchParams = getSearchParams(request);
  const fileId = searchParams.get('fileId');

  if (!fileId) {
    return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
  }

  // 🔒 UUID 형식 검증
  if (!isValidUUID(fileId)) {
    return NextResponse.json({ error: '유효하지 않은 파일 ID 형식입니다.' }, { status: 400 });
  }

  // 🔒 인증 + Rate Limiting
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
    // NestJS에서 다운로드 URL 가져오기
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
    // 프론트엔드 기대: { signedUrl, filename }
    const data = await response.json();

    const signedUrl =
      data.provider === 'google_drive' ? `/api/webhard/files/${fileId}/download/stream` : data.url;

    return NextResponse.json({
      signedUrl,
      filename:
        data.fileName || data.originalName || (data.key ? data.key.split('/').pop() : undefined),
      expiresAt: data.expiresAt,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get download URL' }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  // 🔐 인증 검사 (입력값 검증보다 먼저!)
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

  // Batch download - returns download URLs for multiple files
  const body = await parseBody<{ fileIds: string[] }>(request);

  // 🔒 입력값 검증 (배열 크기 제한 및 UUID 형식 검증)
  const validation = validateFileIds(body?.fileIds);
  if (!validation.valid) {
    return validation.response!;
  }

  const validatedFileIds = validation.data!;

  // Get download URLs for each file
  const results = await Promise.all(
    validatedFileIds.map(async (fileId) => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000'}/api/v1/files/${fileId}/download`,
        {
          headers: {
            Cookie: request.headers.get('cookie') || '',
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        return {
          ...data,
          url:
            data.provider === 'google_drive'
              ? `/api/webhard/files/${fileId}/download/stream`
              : data.url,
        };
      }
      return null;
    })
  );

  return NextResponse.json({ downloads: results.filter(Boolean) });
}
