import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { logger } from '@/lib/utils/logger';
import {
  serverGetContactCount,
  serverGetFeedbackStatusCounts,
} from '@/lib/api/nestjs-server-client';

const badgeLogger = logger.createLogger('ADMIN_BADGE');

export interface AdminBadgeResponse {
  newContactCount: number;
  pendingFeedbackCount: number;
}

/**
 * GET /api/admin/badge
 * 관리자 뱃지 카운트 조회 (신규 문의사항 + 대기 중인 불편사항)
 *
 * Query params:
 *   type: 'contacts' | 'feedback' | 'both' (default: 'both')
 */
export async function GET(request: NextRequest) {
  try {
    const guardResult = await requireAdmin();
    if (!guardResult.authorized) {
      return guardResult.response;
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'both';

    let newContactCount = 0;
    let pendingFeedbackCount = 0;

    const queries: Promise<void>[] = [];

    if (type === 'contacts' || type === 'both') {
      queries.push(
        (async () => {
          try {
            newContactCount = await serverGetContactCount({ status: 'new' });
          } catch (error) {
            badgeLogger.error('Error fetching new contact count', error);
          }
        })()
      );
    }

    if (type === 'feedback' || type === 'both') {
      queries.push(
        (async () => {
          try {
            const counts = await serverGetFeedbackStatusCounts();
            pendingFeedbackCount = counts.pending ?? 0;
          } catch (error) {
            badgeLogger.error('Error fetching pending feedback count', error);
          }
        })()
      );
    }

    await Promise.all(queries);

    const response: AdminBadgeResponse = {
      newContactCount,
      pendingFeedbackCount,
    };

    return NextResponse.json(response);
  } catch (error) {
    badgeLogger.error('Exception in GET admin badge', error);
    return NextResponse.json(
      { error: '뱃지 카운트 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
