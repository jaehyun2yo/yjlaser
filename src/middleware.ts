import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Worker 경로 IP 기반 접근 제어 미들웨어
 *
 * - 서브도메인 라우팅은 next.config.ts rewrites에서 처리
 * - /worker/login 은 IP 제한 없이 접근 허용 (로그인 시 서버에서 IP 검증)
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /worker/* 경로에 대한 클라이언트 IP 헤더 주입 (API에서 IP 검증에 사용)
  if (
    pathname.startsWith('/worker') ||
    pathname.startsWith('/api/erp') ||
    pathname.startsWith('/api/worker')
  ) {
    const response = NextResponse.next();

    // 클라이언트 IP 추출 (Vercel 환경)
    const clientIp = getClientIp(request);
    if (clientIp) {
      response.headers.set('x-client-ip', clientIp);
    }

    return response;
  }

  return NextResponse.next();
}

/**
 * 클라이언트 IP 추출
 * Vercel: x-forwarded-for, x-real-ip
 * 개발환경: 127.0.0.1 fallback
 */
function getClientIp(request: NextRequest): string {
  // Vercel에서 제공하는 헤더 (가장 신뢰할 수 있음)
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    // 첫 번째 IP가 클라이언트 IP (나머지는 프록시)
    const firstIp = xForwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) return xRealIp;

  // 개발환경 fallback
  return '127.0.0.1';
}

export const config = {
  matcher: [
    // worker 경로 + API (IP 헤더 주입)
    '/worker/:path*',
    '/api/erp/:path*',
    '/api/worker/:path*',
  ],
};
