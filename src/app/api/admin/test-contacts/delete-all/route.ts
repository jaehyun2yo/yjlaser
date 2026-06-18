import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { serverDeleteTestContacts } from '@/lib/api/nestjs-server-client';

export async function DELETE(_request: NextRequest) {
  try {
    const guardResult = await requireAdmin();
    if (!guardResult.authorized) {
      return guardResult.response;
    }

    const result = await serverDeleteTestContacts('테스트 업체');

    revalidatePath('/admin/contacts');

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
      message:
        result.deletedCount > 0
          ? `${result.deletedCount}개의 테스트 문의가 삭제되었습니다.`
          : '삭제할 테스트 문의가 없습니다.',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
