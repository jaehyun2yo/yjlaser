import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { logger } from '@/lib/utils/logger';
import { serverCompleteLaserOnlyContact } from '@/lib/api/nestjs-server-client';

const completeLaserLogger = logger.createLogger('COMPLETE_LASER_API');

/**
 * POST /api/admin/contacts/[id]/complete-laser
 * 레이저 전용 문의 완료 처리
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guardResult = await requireAdmin();
    if (!guardResult.authorized) {
      return guardResult.response;
    }

    const { id } = await params;

    const result = await serverCompleteLaserOnlyContact(id, {
      actorType: 'admin',
      actorName: 'admin',
    });

    if (!result.success) {
      completeLaserLogger.error('레이저 전용 완료 처리 실패:', { error: result.error });
      return NextResponse.json({ error: result.error || 'Update failed' }, { status: 500 });
    }

    completeLaserLogger.info(`Contact ${id} 레이저 전용 완료 처리 완료`);

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    completeLaserLogger.error('complete-laser API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
