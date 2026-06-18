import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/adminGuard';
import { checkWebhardRateLimit } from '@/lib/auth/rateLimit';
import { isValidUUID } from '@/lib/utils/webhardValidation';

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('fileId');

  if (!fileId) {
    return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
  }

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

  try {
    const downloadResponse = await fetch(`${NESTJS_API_URL}/api/v1/files/${fileId}/download`, {
      headers: {
        'Content-Type': 'application/json',
        Cookie: request.headers.get('cookie') || '',
      },
    });

    if (!downloadResponse.ok) {
      const error = (await downloadResponse.json().catch(() => null)) as { error?: string } | null;
      return NextResponse.json(
        { error: error?.error || 'DXF preview URL lookup failed' },
        { status: downloadResponse.status }
      );
    }

    const downloadData = (await downloadResponse.json()) as { url?: string };
    if (!downloadData.url) {
      return NextResponse.json({ error: 'DXF preview URL missing' }, { status: 502 });
    }

    const dxfResponse = await fetch(downloadData.url);
    if (!dxfResponse.ok) {
      return NextResponse.json(
        { error: 'DXF preview download failed' },
        { status: dxfResponse.status }
      );
    }

    const dxfText = await dxfResponse.text();
    return new NextResponse(dxfText, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'DXF preview failed' }, { status: 502 });
  }
}
