import { NextResponse } from 'next/server';
import { verifyAndGetUser } from '@/lib/auth/session';
import { updateActiveSession } from '@/lib/api/activeSessions';
import { serverGetCompany } from '@/lib/api/nestjs-server-client';

/**
 * 세션 하트비트 API
 * 클라이언트에서 주기적으로 호출하여 접속 상태를 유지
 */
export async function POST() {
  try {
    const { isValid, user } = await verifyAndGetUser();

    if (!isValid || !user) {
      return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });
    }

    // 업체 유저인 경우 회사 정보 가져오기 (NestJS API)
    let companyName: string | null = null;

    if (user.userType === 'company') {
      const company = await serverGetCompany(Number(user.userId));
      companyName = company?.company_name || null;
    }

    // 세션 업데이트
    const success = await updateActiveSession(
      user.userType,
      user.userType === 'admin' ? 0 : Number(user.userId),
      user.userType === 'admin' ? 'admin' : String(user.userId),
      companyName
    );

    return NextResponse.json({ success });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
