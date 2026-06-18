import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/auth/adminGuard';

/**
 * GET /api/debug/backend-health
 * Vercel 서버리스 함수에서 Railway 백엔드 연결 상태를 진단합니다.
 * 관리자 세션 쿠키 필수.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const auth = await requireAdmin();
  if (!auth.authorized) {
    return auth.response;
  }

  const cookieStore = await cookies();
  const apiUrl = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
  const apiKey = process.env.MIGRATION_API_KEY || '';

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      NEXT_PUBLIC_WEBHARD_API_URL: apiUrl,
      MIGRATION_API_KEY_SET: !!apiKey,
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_REGION: process.env.VERCEL_REGION || '(unknown)',
    },
    checks: {},
  };

  // Check 1: Health endpoint (no auth)
  try {
    const start = Date.now();
    const res = await fetch(`${apiUrl}/api/v1/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const elapsed = Date.now() - start;
    const body = await res.text();
    (results.checks as Record<string, unknown>).health = {
      status: res.status,
      ok: res.ok,
      elapsed_ms: elapsed,
      body: body.substring(0, 200),
    };
  } catch (error) {
    (results.checks as Record<string, unknown>).health = {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // Check 2: Contacts with API key auth
  try {
    const start = Date.now();
    const res = await fetch(`${apiUrl}/api/v1/contacts?status=all&limit=1`, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
      signal: AbortSignal.timeout(10000),
    });
    const elapsed = Date.now() - start;
    const body = await res.json().catch(() => res.text());
    (results.checks as Record<string, unknown>).contacts_api_key = {
      status: res.status,
      ok: res.ok,
      elapsed_ms: elapsed,
      totalCount:
        typeof body === 'object' && body !== null
          ? (body as Record<string, unknown>).totalCount
          : undefined,
      error: !res.ok ? body : undefined,
    };
  } catch (error) {
    (results.checks as Record<string, unknown>).contacts_api_key = {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // Check 3: Contacts with forwarded session cookie
  try {
    const start = Date.now();
    const allCookies = cookieStore.getAll();
    const cookieHeader = allCookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const res = await fetch(`${apiUrl}/api/v1/contacts?status=all&limit=1`, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      signal: AbortSignal.timeout(10000),
    });
    const elapsed = Date.now() - start;
    (results.checks as Record<string, unknown>).contacts_session = {
      status: res.status,
      ok: res.ok,
      elapsed_ms: elapsed,
      cookies_forwarded: allCookies.map((c) => c.name),
    };
  } catch (error) {
    (results.checks as Record<string, unknown>).contacts_session = {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return NextResponse.json(results);
}
