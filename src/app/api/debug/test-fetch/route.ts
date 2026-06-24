import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/adminGuard';

export async function GET(_request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }

  const auth = await requireAdmin();
  if (!auth.authorized) {
    return auth.response ?? NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const filename =
    new URL(_request.url).searchParams.get('filename')?.trim() || 'debug-test-file.dxf';

  const baseUrl = 'https://yjlaser.net/webhard/';
  const originalPath = `${baseUrl}${filename}`;

  // Variations to try
  const variations = [
    { name: 'Original (encoded)', url: new URL(originalPath).href },
    { name: 'Fully Encoded Filename', url: baseUrl + encodeURIComponent(filename) },
    { name: 'Encoded Spaces Only', url: baseUrl + filename.replace(/ /g, '%20') },
  ];

  const results = [];

  for (const v of variations) {
    try {
      const res = await fetch(v.url, { method: 'HEAD' });
      results.push({
        name: v.name,
        url: v.url,
        status: res.status,
        statusText: res.statusText,
      });
    } catch (e) {
      results.push({
        name: v.name,
        url: v.url,
        error: String(e),
      });
    }
  }

  return NextResponse.json({ results });
}
