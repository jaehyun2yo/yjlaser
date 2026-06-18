import { NextRequest, NextResponse } from 'next/server';
import { verifySession, getSessionUser } from '@/lib/auth/session';
import { logger } from '@/lib/utils/logger';
import { sanitizeForwardedCookieHeader } from '@/lib/api/headerEncoding';

const backupApiLogger = logger.createLogger('BACKUP_PROXY_API');

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
const API_PREFIX = '/api/v1';

const ALLOWED_PATHS = new Set([
  'settings',
  'eligible',
  'status',
  'execute',
  'history',
  'browse-directories',
]);

async function verifyAdmin(): Promise<NextResponse | null> {
  const isAuthenticated = await verifySession();
  if (!isAuthenticated) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const user = await getSessionUser();
  if (!user || user.userType !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  return null;
}

function validatePath(pathSegments: string[]): string | NextResponse {
  if (pathSegments.some((seg) => seg.includes('..'))) {
    return NextResponse.json({ error: '잘못된 경로입니다.' }, { status: 400 });
  }

  const endpoint = pathSegments.join('/');
  if (!ALLOWED_PATHS.has(endpoint)) {
    return NextResponse.json({ error: '허용되지 않은 경로입니다.' }, { status: 400 });
  }

  return endpoint;
}

async function proxyToNestJS(
  request: NextRequest,
  endpoint: string,
  method: string,
  searchParams: URLSearchParams,
  body?: unknown
): Promise<NextResponse> {
  const query = searchParams.toString();
  const url = `${NESTJS_API_URL}${API_PREFIX}/backup/${endpoint}${query ? `?${query}` : ''}`;
  const rawCookieHeader = request.headers.get('cookie') || '';
  const cookieHeader = sanitizeForwardedCookieHeader(rawCookieHeader);
  const csrfToken = rawCookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('csrf-token='))
    ?.split('=')[1];

  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    cache: 'no-store',
  };

  if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);
  const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
  const data = await response.json().catch(() => ({}));
  const nextResponse = NextResponse.json(data, { status: response.status });

  for (const cookie of setCookieHeaders) {
    nextResponse.headers.append('Set-Cookie', cookie);
  }

  return nextResponse;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const authError = await verifyAdmin();
    if (authError) return authError;

    const { path } = await params;
    const pathResult = validatePath(path);
    if (pathResult instanceof NextResponse) return pathResult;

    return await proxyToNestJS(request, pathResult, 'GET', request.nextUrl.searchParams);
  } catch (error) {
    backupApiLogger.error('GET backup proxy error', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const authError = await verifyAdmin();
    if (authError) return authError;

    const { path } = await params;
    const pathResult = validatePath(path);
    if (pathResult instanceof NextResponse) return pathResult;

    const body = await request.json().catch(() => undefined);
    return await proxyToNestJS(request, pathResult, 'POST', request.nextUrl.searchParams, body);
  } catch (error) {
    backupApiLogger.error('POST backup proxy error', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const authError = await verifyAdmin();
    if (authError) return authError;

    const { path } = await params;
    const pathResult = validatePath(path);
    if (pathResult instanceof NextResponse) return pathResult;

    const body = await request.json().catch(() => undefined);
    return await proxyToNestJS(request, pathResult, 'PUT', request.nextUrl.searchParams, body);
  } catch (error) {
    backupApiLogger.error('PUT backup proxy error', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
