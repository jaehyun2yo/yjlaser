import { verifySession, getSessionUser } from '@/lib/auth/session';
import { logger } from '@/lib/utils/logger';
import { NextRequest, NextResponse } from 'next/server';
import { nestjsFetch } from '@/lib/api/nestjs-server-client';

const apiLogger = logger.createLogger('WEBHARD_LOGS_API');

export async function GET(request: NextRequest) {
  try {
    // 인증 확인
    const isAuthenticated = await verifySession();
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getSessionUser();
    if (!user || user.userType !== 'admin') {
      return NextResponse.json({ error: 'Only admins can view logs' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;

    // 쿼리 파라미터 파싱
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const action = searchParams.get('action');
    const companyId = searchParams.get('companyId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // NestJS API를 통해 활동 로그 조회
    const queryParams = new URLSearchParams();
    queryParams.set('page', String(page));
    queryParams.set('limit', String(limit));
    if (action) queryParams.set('action', action);
    if (companyId) queryParams.set('companyId', companyId);
    if (startDate) queryParams.set('startDate', startDate);
    if (endDate) queryParams.set('endDate', endDate);

    const response = await nestjsFetch<{
      logs: Record<string, unknown>[];
      total: number;
      totalPages: number;
      page: number;
      limit: number;
    }>(`/activity-logs?${queryParams.toString()}`, { useApiKey: true });

    if (!response.ok) {
      apiLogger.error('Error fetching logs', { status: response.status });
      return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }

    const { logs, total } = response.data;

    apiLogger.info('Logs fetched', {
      page,
      limit,
      total,
      filters: { action, companyId, startDate, endDate },
    });

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil((total || 0) / limit),
      },
    });
  } catch (error) {
    apiLogger.error('Exception in GET', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
