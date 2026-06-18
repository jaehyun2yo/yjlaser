import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { nestjsFetch } from '@/lib/api/nestjs-server-client';

export async function POST(_request: NextRequest) {
  try {
    const guardResult = await requireAdmin();
    if (!guardResult.authorized) {
      return guardResult.response;
    }

    // 50개의 테스트 문의 생성
    const testContacts = [];
    for (let i = 0; i < 50; i++) {
      const timestamp = Date.now() + i;
      testContacts.push({
        companyName: `테스트 업체 ${i + 1}`,
        name: `테스트 사용자 ${i + 1}`,
        position: '테스트 직책',
        phone: `010-${String(1000 + i).slice(-4)}-${String(5000 + i).slice(-4)}`,
        email: `test${i + 1}@example.com`,
        contactType: 'inquiry',
        status: 'received',
        inquiryTitle: `테스트 문의사항 ${i + 1}`,
      });
    }

    // 개별 생성 (NestJS API)
    let createdCount = 0;
    for (const contact of testContacts) {
      const response = await nestjsFetch<Record<string, unknown>>('/contacts', {
        method: 'POST',
        body: contact,
        useApiKey: true,
      });
      if (response.ok) createdCount++;
    }

    revalidatePath('/admin/contacts');

    return NextResponse.json({
      success: true,
      count: createdCount,
      message: `${createdCount}개의 테스트 문의사항이 생성되었습니다.`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
