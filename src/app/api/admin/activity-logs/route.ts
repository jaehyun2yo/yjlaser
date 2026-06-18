import { NextRequest, NextResponse } from 'next/server';
import { verifySession, getSessionUser } from '@/lib/auth/session';
import { logger } from '@/lib/utils/logger';
import { nestjsFetch } from '@/lib/api/nestjs-server-client';

const apiLogger = logger.createLogger('ADMIN_ACTIVITY_LOGS_API');

/**
 * GET /api/admin/activity-logs
 * 활동 로그 조회 (관리자 전용)
 */
export async function GET(request: NextRequest) {
  try {
    const isAuthenticated = await verifySession();
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getSessionUser();
    if (!user || user.userType !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit')) || 10));
    const actionFilter = searchParams.get('action');
    const actorFilter = searchParams.get('actor');

    // NestJS API로 활동 로그 조회
    const queryParams = new URLSearchParams();
    queryParams.set('page', String(page));
    queryParams.set('limit', String(limit));
    if (actionFilter) queryParams.set('action', actionFilter);
    if (actorFilter) queryParams.set('actor', actorFilter);

    const response = await nestjsFetch<{
      logs: Record<string, unknown>[];
      total: number;
      totalPages: number;
      page: number;
      limit: number;
    }>(`/activity-logs?${queryParams.toString()}`, { useApiKey: true });

    if (!response.ok) {
      apiLogger.error('Failed to fetch activity logs', { status: response.status });
      return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }

    const { logs, total, totalPages } = response.data;

    apiLogger.info('Activity logs fetched', { page, limit, total });

    return NextResponse.json({
      logs: logs || [],
      total,
      totalPages,
      page,
      limit,
    });
  } catch (error) {
    apiLogger.error('Exception in GET', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
