import { verifySession, getSessionUser } from '@/lib/auth/session';
import { serverGetCompanyNames } from '@/lib/api/nestjs-server-client';
import { NextResponse } from 'next/server';

/**
 * GET /api/companies
 * 관리자용 업체 목록 조회 API (NestJS API 경유)
 * 웹하드 폴더 업로드 시 업체 선택용
 */
export async function GET() {
  try {
    // 세션 확인
    const isAuthenticated = await verifySession();
    if (!isAuthenticated) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
    }

    const user = await getSessionUser();
    if (!user?.userId || user?.userType !== 'admin') {
      return NextResponse.json(
        { success: false, error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    // NestJS API 경유로 업체명 목록 조회
    const companies = await serverGetCompanyNames();

    return NextResponse.json({
      success: true,
      data: companies || [],
    });
  } catch {
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
