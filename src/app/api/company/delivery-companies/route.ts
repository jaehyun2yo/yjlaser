import { verifySession, getSessionUser } from '@/lib/auth/session';
import { NextRequest, NextResponse } from 'next/server';
import {
  serverGetDeliveryCompanies,
  serverCreateDeliveryCompany,
} from '@/lib/api/nestjs-server-client';

// 납품업체 목록 조회
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

    // 납품업체 목록 조회 (NestJS API)
    const deliveryCompanies = await serverGetDeliveryCompanies(Number(user.userId));

    return NextResponse.json({ deliveryCompanies: deliveryCompanies || [] });
  } catch (_error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// 납품업체 추가
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { name, phone, address } = body;

    // 필수 필드 검증
    if (!name || !phone || !address) {
      return NextResponse.json(
        { error: '납품업체명, 연락처, 주소를 모두 입력해주세요.' },
        { status: 400 }
      );
    }

    // 납품업체 추가 (NestJS API)
    const result = await serverCreateDeliveryCompany({
      companyId: Number(user.userId),
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || '납품업체 추가에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
