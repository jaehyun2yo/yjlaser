import { NextRequest, NextResponse } from 'next/server';
import { verifySession, getSessionUser } from '@/lib/auth/session';
import { logger } from '@/lib/utils/logger';

const perfLogger = logger.createLogger('WEBHARD_PERFORMANCE');

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';

/**
 * GET /api/webhard/performance
 * 웹하드 성능 메트릭 조회 (관리자 전용)
 * NestJS 백엔드 성능 메트릭 + 활동 로그 조합하여 반환
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

    const cookieHeader = request.headers.get('cookie') || '';

    // NestJS 성능 메트릭 + 활동 데이터 병렬 조회
    const [nestjsResult, activityResult] = await Promise.allSettled([
      fetchNestJSMetrics(cookieHeader),
      fetchActivityMetrics(),
    ]);

    const nestjsMetrics =
      nestjsResult.status === 'fulfilled' ? nestjsResult.value : getDefaultNestJSMetrics();
    const activityMetrics =
      activityResult.status === 'fulfilled' ? activityResult.value : getDefaultActivityMetrics();

    // API 응답 시간 측정
    const apiLatency = await measureApiLatency(cookieHeader);

    const metrics = {
      ...nestjsMetrics,
      ...activityMetrics,
      apiLatency,
    };

    return NextResponse.json({ metrics });
  } catch (error) {
    perfLogger.error('Performance metrics error', error);
    return NextResponse.json({ error: 'Failed to fetch performance metrics' }, { status: 500 });
  }
}

async function fetchNestJSMetrics(cookieHeader: string) {
  const url = `${NESTJS_API_URL}/api/v1/storage/performance`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
  });

  if (!response.ok) {
    throw new Error(`NestJS API error: ${response.status}`);
  }

  return response.json();
}

function getDefaultNestJSMetrics() {
  return {
    totalFiles: 0,
    totalFolders: 0,
    totalSize: 0,
    totalCompanies: 0,
    newFilesLast24h: 0,
    undownloadedFiles: 0,
    maxFolderDepth: 0,
    avgFolderDepth: 0,
    fileSizeDistribution: { small: 0, medium: 0, large: 0, xlarge: 0 },
  };
}

async function fetchActivityMetrics() {
  const { nestjsFetch: fetchNestJS } = await import('@/lib/api/nestjs-server-client');
  const oneDayAgoDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const oneDayAgo = oneDayAgoDate.toISOString();

  // 24시간 활동 요약 조회 (NestJS API)
  const response = await fetchNestJS<{
    logs: { action: string; created_at?: string }[];
    total: number;
  }>(`/activity-logs?limit=10000&startDate=${encodeURIComponent(oneDayAgo)}`, { useApiKey: true });

  if (!response.ok) {
    perfLogger.error('Failed to fetch activity logs', { status: response.status });
    return getDefaultActivityMetrics();
  }

  const activities = (response.data.logs || []).filter((log) => {
    if (!log.created_at) {
      perfLogger.warn('Activity log missing created_at in performance aggregation', {
        action: log.action,
      });
      return false;
    }

    const createdAt = new Date(log.created_at);
    if (Number.isNaN(createdAt.getTime())) {
      perfLogger.warn('Activity log has invalid created_at in performance aggregation', {
        action: log.action,
      });
      return false;
    }

    return createdAt >= oneDayAgoDate;
  });

  // 활동 집계
  const actionCounts: Record<string, number> = {};
  let downloadsLast24h = 0;
  let uploadsLast24h = 0;

  for (const log of activities || []) {
    const action = log.action;
    actionCounts[action] = (actionCounts[action] || 0) + 1;
    if (action === 'DOWNLOAD') downloadsLast24h++;
    if (action === 'UPLOAD') uploadsLast24h++;
  }

  const recentActivities = Object.entries(actionCounts)
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count);

  return {
    downloadsLast24h,
    uploadsLast24h,
    recentActivities,
  };
}

function getDefaultActivityMetrics() {
  return {
    downloadsLast24h: 0,
    uploadsLast24h: 0,
    recentActivities: [],
  };
}

async function measureApiLatency(cookieHeader: string) {
  const baseUrl = `${NESTJS_API_URL}/api/v1`;
  const headers = { 'Content-Type': 'application/json', Cookie: cookieHeader };

  const measure = async (endpoint: string): Promise<number> => {
    const start = Date.now();
    try {
      await fetch(`${baseUrl}${endpoint}`, { headers });
    } catch {
      // 연결 실패 시 높은 지연 반환
    }
    return Date.now() - start;
  };

  const [filesListMs, foldersListMs, searchMs, undownloadedCountMs] = await Promise.all([
    measure('/files?limit=1'),
    measure('/folders?limit=1'),
    measure('/files?search=test&limit=1'),
    measure('/files?isDownloaded=false&limit=1'),
  ]);

  return { filesListMs, foldersListMs, searchMs, undownloadedCountMs };
}
