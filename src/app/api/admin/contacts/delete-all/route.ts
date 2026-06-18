import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { serverDeleteAllContacts } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('DELETE_ALL_CONTACTS');

export async function DELETE(_request: NextRequest) {
  try {
    const guardResult = await requireAdmin();
    if (!guardResult.authorized) {
      return guardResult.response;
    }

    log.warn('Admin requested deletion of ALL contacts');

    const result = await serverDeleteAllContacts();

    revalidatePath('/admin/contacts');

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
      message:
        result.deletedCount > 0
          ? `${result.deletedCount}개의 모든 문의가 삭제되었습니다.`
          : '삭제할 문의가 없습니다.',
    });
  } catch (error) {
    log.error('Failed to delete all contacts', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
