import { verifySession, getSessionUser } from '@/lib/auth/session';
import { NextRequest, NextResponse } from 'next/server';
import { nestjsFetch } from '@/lib/api/nestjs-server-client';

// 납품업체 수정
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params;
    const deliveryCompanyId = parseInt(id, 10);

    if (isNaN(deliveryCompanyId)) {
      return NextResponse.json({ error: '유효하지 않은 납품업체 ID입니다.' }, { status: 400 });
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

    // 납품업체 수정 (NestJS API)
    const response = await nestjsFetch<Record<string, unknown>>(
      `/delivery-companies/${deliveryCompanyId}`,
      {
        method: 'PATCH',
        body: {
          companyId: Number(user.userId),
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
        },
        useApiKey: true,
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: '납품업체를 찾을 수 없습니다.' }, { status: 404 });
      }
      if (response.status === 403) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
      }
      return NextResponse.json({ error: '납품업체 수정에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deliveryCompany: response.data,
    });
  } catch (_error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// 납품업체 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const deliveryCompanyId = parseInt(id, 10);

    if (isNaN(deliveryCompanyId)) {
      return NextResponse.json({ error: '유효하지 않은 납품업체 ID입니다.' }, { status: 400 });
    }

    // 납품업체 삭제 (NestJS API)
    const response = await nestjsFetch(
      `/delivery-companies/${deliveryCompanyId}?companyId=${user.userId}`,
      {
        method: 'DELETE',
        useApiKey: true,
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: '납품업체를 찾을 수 없습니다.' }, { status: 404 });
      }
      if (response.status === 403) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
      }
      return NextResponse.json({ error: '납품업체 삭제에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
