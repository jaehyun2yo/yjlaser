// middleware.ts

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyBrowserSessionCookie, verifyWorkerSessionCookie } from '@/lib/auth/edge-session';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // /admin routes — require admin-session cookie
  if (pathname.startsWith('/admin')) {
    const sessionCookie = request.cookies.get('admin-session')?.value;
    const session = await verifyBrowserSessionCookie(sessionCookie, 'admin');
    if (!session) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  // /company routes — require company-session cookie
  if (pathname.startsWith('/company')) {
    const sessionCookie = request.cookies.get('company-session')?.value;
    const session = await verifyBrowserSessionCookie(sessionCookie, 'company');
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // /worker 경로 (로그인 페이지 제외)
  if (pathname.startsWith('/worker') && !pathname.startsWith('/worker/login')) {
    const erpSessionCookie = request.cookies.get('erp-session')?.value;
    const session = await verifyWorkerSessionCookie(erpSessionCookie);
    if (!session) {
      return NextResponse.redirect(new URL('/worker/login', request.url));
    }
  }

  return NextResponse.next();
}

// 보호 경로에서만 미들웨어 실행 (공개 페이지/정적 파일 제외)
export const config = {
  matcher: ['/admin/:path*', '/company/:path*', '/worker/:path*'],
};
