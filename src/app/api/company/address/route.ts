import { verifySession, getSessionUser } from '@/lib/auth/session';
import { NextResponse } from 'next/server';
import { serverGetCompany } from '@/lib/api/nestjs-server-client';

export async function GET() {
  try {
    // 세션 확인
    const isAuthenticated = await verifySession();
    if (!isAuthenticated) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const user = await getSessionUser();
    if (!user?.userId || user?.userType !== 'company') {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    // 업체 정보 가져오기 (NestJS API)
    const company = await serverGetCompany(Number(user.userId));

    if (!company) {
      return NextResponse.json({ error: '업체 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ address: company.business_address });
  } catch (_error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
