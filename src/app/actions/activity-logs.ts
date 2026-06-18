'use server';

import { nestjsFetch } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';

const activityLogsLogger = logger.createLogger('ACTIVITY_LOGS_ACTION');

export interface GetActivityLogsParams {
  page: number;
  limit: number;
  action?: string;
  actor?: string;
  startDate?: string;
  endDate?: string;
}

export interface ActivityLog {
  id: string;
  actor_type: 'admin' | 'company';
  actor_id: string;
  actor_name: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export async function getActivityLogs({
  page = 1,
  limit = 20,
  action,
  actor,
  startDate,
  endDate,
}: GetActivityLogsParams) {
  try {
    const queryParams = new URLSearchParams();
    queryParams.set('page', String(page));
    queryParams.set('limit', String(limit));
    if (action) queryParams.set('action', action);
    if (actor) queryParams.set('actor', actor);
    if (startDate) queryParams.set('startDate', `${startDate}T00:00:00`);
    if (endDate) queryParams.set('endDate', `${endDate}T23:59:59.999`);

    const response = await nestjsFetch<{
      logs: ActivityLog[];
      total: number;
      totalPages: number;
      page: number;
      limit: number;
    }>(`/activity-logs?${queryParams.toString()}`, { useApiKey: true });

    if (!response.ok) {
      activityLogsLogger.error('Error fetching activity logs', { status: response.status });
      return { data: [], count: 0, hasMore: false };
    }

    const offset = (page - 1) * limit;
    return {
      data: response.data.logs as ActivityLog[],
      count: response.data.total || 0,
      hasMore: (response.data.total || 0) > offset + limit,
    };
  } catch (error) {
    activityLogsLogger.error('Server action error', error);
    return { data: [], count: 0, hasMore: false };
  }
}
