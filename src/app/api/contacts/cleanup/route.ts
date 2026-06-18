import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { serverCleanupContacts } from '@/lib/api/nestjs-server-client';
import { requireAdminSession } from '@/app/api/_lib/route-authorization';

const cleanupLogger = logger.createLogger('CLEANUP');

/**
 * POST /api/contacts/cleanup
 * 10일 이상 된 삭제된 문의사항을 영구 삭제합니다.
 */
export async function POST(request: NextRequest) {
  try {
    // 자동 정리 작업은 전용 Bearer key를 허용하고, 일반 호출은 admin session을 요구한다.
    const authHeader = request.headers.get('authorization');
    const apiKey = process.env.CLEANUP_API_KEY;

    if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
      const auth = await requireAdminSession();
      if (!auth.ok) return auth.response;
    }

    const result = await serverCleanupContacts();

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    cleanupLogger.info(`Permanently deleted ${result.deletedCount} contacts`);

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
      message:
        result.deletedCount > 0
          ? `${result.deletedCount}개의 문의사항이 영구 삭제되었습니다.`
          : '삭제할 문의사항이 없습니다.',
    });
  } catch (error) {
    cleanupLogger.error('Exception in cleanup', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
