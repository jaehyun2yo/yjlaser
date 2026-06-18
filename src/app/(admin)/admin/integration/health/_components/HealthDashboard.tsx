'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Server, Database, MemoryStick, Clock, AlertTriangle } from 'lucide-react';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { BG_COLOR, TEXT_COLOR, BORDER_COLOR, TYPOGRAPHY } from '@/lib/styles';
import { Button } from '@/components/ui/button';

interface HealthData {
  api: {
    status: 'ok' | 'degraded' | 'down' | 'error';
    responseTime?: number;
    error?: string;
  };
  status?: string;
  timestamp?: string;
  /** Uptime in seconds (from process.uptime()) */
  uptime?: number;
  database?: {
    ok: boolean;
    /** DB query response time in ms */
    responseTime: number;
    error?: string;
  };
  memory?: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
}

type HealthStatus = 'ok' | 'degraded' | 'down' | 'error';

function getStatusColor(status: HealthStatus): string {
  switch (status) {
    case 'ok':
      return 'bg-green-500';
    case 'degraded':
      return 'bg-yellow-500';
    case 'down':
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}

function getStatusLabel(status: HealthStatus): string {
  switch (status) {
    case 'ok':
      return '정상';
    case 'degraded':
      return '성능 저하';
    case 'down':
      return '연결 불가';
    case 'error':
      return '오류';
    default:
      return '알 수 없음';
  }
}

function formatUptime(uptimeSeconds: number): string {
  const seconds = Math.floor(uptimeSeconds);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const remainingHours = hours % 24;
  const remainingMinutes = minutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}일`);
  if (remainingHours > 0) parts.push(`${remainingHours}시간`);
  if (remainingMinutes > 0) parts.push(`${remainingMinutes}분`);

  return parts.length > 0 ? parts.join(' ') : '1분 미만';
}

function formatTimestamp(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return timestamp;
  }
}

function StatusIndicator({ status }: { status: HealthStatus }) {
  return (
    <span className="relative flex h-3 w-3">
      <span
        className={`animate-ping absolute inline-flex h-full w-full rounded-full ${getStatusColor(status)} opacity-75`}
      />
      <span className={`relative inline-flex rounded-full h-3 w-3 ${getStatusColor(status)}`} />
    </span>
  );
}

interface CardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  status?: HealthStatus;
}

function StatusCard({ title, icon, children, status }: CardProps) {
  return (
    <div className={`${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-xl p-5 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={TEXT_COLOR.muted}>{icon}</span>
          <h3 className={`${TYPOGRAPHY.label.base} ${TEXT_COLOR.primary}`}>{title}</h3>
        </div>
        {status && <StatusIndicator status={status} />}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${TYPOGRAPHY.body.small} ${TEXT_COLOR.muted}`}>{label}</span>
      <span className={`${TYPOGRAPHY.label.small} ${TEXT_COLOR.secondary}`}>{value}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className={`h-8 w-56 ${BG_COLOR.medium} rounded animate-pulse`} />
        <div className={`h-9 w-24 ${BG_COLOR.medium} rounded animate-pulse`} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-xl p-5 space-y-3`}
          >
            <div className={`h-5 w-24 ${BG_COLOR.medium} rounded animate-pulse`} />
            <div className="space-y-2">
              <div className={`h-4 w-full ${BG_COLOR.medium} rounded animate-pulse`} />
              <div className={`h-4 w-3/4 ${BG_COLOR.medium} rounded animate-pulse`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HealthDashboard() {
  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery<HealthData>({
    queryKey: queryKeys.integration.health(),
    queryFn: async () => {
      const res = await fetch('/api/admin/health');
      if (!res.ok) throw new Error('Health check failed');
      return res.json() as Promise<HealthData>;
    },
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className={`${TYPOGRAPHY.h5} ${TEXT_COLOR.primary}`}>시스템 상태 모니터링</h2>
          <Button size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" />
            새로고침
          </Button>
        </div>
        <div
          className={`${BG_COLOR.error} border ${BORDER_COLOR.error} rounded-xl p-6 flex items-center gap-3`}
        >
          <AlertTriangle className={`w-5 h-5 ${TEXT_COLOR.error}`} />
          <div>
            <p className={`${TYPOGRAPHY.label.base} ${TEXT_COLOR.error}`}>
              서버에 연결할 수 없습니다
            </p>
            <p className={`${TYPOGRAPHY.body.small} ${TEXT_COLOR.muted} mt-1`}>
              API 서버가 응답하지 않거나 네트워크에 문제가 있을 수 있습니다.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const apiStatus: HealthStatus = data.api?.status ?? 'down';
  const dbOk = data.database?.ok ?? false;
  const dbStatus: HealthStatus = dbOk ? 'ok' : 'error';
  const overallStatus: HealthStatus =
    apiStatus === 'ok' && dbOk ? 'ok' : apiStatus === 'down' ? 'down' : 'degraded';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className={`${TYPOGRAPHY.h5} ${TEXT_COLOR.primary}`}>시스템 상태 모니터링</h2>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              overallStatus === 'ok'
                ? `${BG_COLOR.success} ${TEXT_COLOR.successDark}`
                : overallStatus === 'degraded'
                  ? `${BG_COLOR.warning} ${TEXT_COLOR.yellowDark}`
                  : `${BG_COLOR.error} ${TEXT_COLOR.errorDark}`
            }`}
          >
            <StatusIndicator status={overallStatus} />
            {getStatusLabel(overallStatus)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {dataUpdatedAt > 0 && (
            <span className={`${TYPOGRAPHY.body.small} ${TEXT_COLOR.muted}`}>
              마지막 업데이트: {formatTimestamp(new Date(dataUpdatedAt).toISOString())}
            </span>
          )}
          <Button
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>
      </div>

      {/* Status Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* API Server Card */}
        <StatusCard title="API 서버" icon={<Server className="w-4 h-4" />} status={apiStatus}>
          <MetricRow label="상태" value={getStatusLabel(apiStatus)} />
          {data.api?.responseTime != null && (
            <MetricRow label="응답 시간" value={`${data.api.responseTime}ms`} />
          )}
          {data.uptime != null && <MetricRow label="가동 시간" value={formatUptime(data.uptime)} />}
          {data.api?.error && (
            <p className={`${TYPOGRAPHY.body.small} ${TEXT_COLOR.error} mt-1`}>{data.api.error}</p>
          )}
        </StatusCard>

        {/* Database Card */}
        <StatusCard title="데이터베이스" icon={<Database className="w-4 h-4" />} status={dbStatus}>
          <MetricRow label="연결 상태" value={dbOk ? '연결됨' : '연결 실패'} />
          {data.database?.responseTime != null && (
            <MetricRow label="쿼리 시간" value={`${data.database.responseTime}ms`} />
          )}
          {data.database?.error && (
            <p className={`${TYPOGRAPHY.body.small} ${TEXT_COLOR.error} mt-1`}>
              {data.database.error}
            </p>
          )}
        </StatusCard>

        {/* Memory Card */}
        <StatusCard
          title="메모리"
          icon={<MemoryStick className="w-4 h-4" />}
          status={data.memory ? 'ok' : 'down'}
        >
          {data.memory ? (
            <>
              <MetricRow label="RSS" value={`${data.memory.rss} MB`} />
              <MetricRow label="Heap 사용" value={`${data.memory.heapUsed} MB`} />
              <MetricRow label="Heap 전체" value={`${data.memory.heapTotal} MB`} />
              {/* Memory usage bar */}
              <div className="mt-1">
                <div className={`w-full ${BG_COLOR.light} rounded-full h-2`}>
                  <div
                    className={`h-2 rounded-full transition-all ${
                      data.memory.heapUsed / data.memory.heapTotal > 0.85
                        ? 'bg-red-500'
                        : data.memory.heapUsed / data.memory.heapTotal > 0.7
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{
                      width: `${Math.min((data.memory.heapUsed / data.memory.heapTotal) * 100, 100)}%`,
                    }}
                  />
                </div>
                <p className={`${TYPOGRAPHY.body.small} ${TEXT_COLOR.muted} mt-1 text-right`}>
                  {Math.round((data.memory.heapUsed / data.memory.heapTotal) * 100)}% 사용
                </p>
              </div>
            </>
          ) : (
            <p className={`${TYPOGRAPHY.body.small} ${TEXT_COLOR.muted}`}>데이터 없음</p>
          )}
        </StatusCard>

        {/* Uptime Card */}
        <StatusCard
          title="가동 시간"
          icon={<Clock className="w-4 h-4" />}
          status={data.uptime != null ? 'ok' : 'down'}
        >
          {data.uptime != null ? (
            <>
              <div className="text-center py-2">
                <p className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>
                  {formatUptime(data.uptime)}
                </p>
                <p className={`${TYPOGRAPHY.body.small} ${TEXT_COLOR.muted} mt-1`}>연속 가동 중</p>
              </div>
              {data.timestamp && (
                <MetricRow label="서버 시간" value={formatTimestamp(data.timestamp)} />
              )}
            </>
          ) : (
            <p className={`${TYPOGRAPHY.body.small} ${TEXT_COLOR.muted}`}>데이터 없음</p>
          )}
        </StatusCard>
      </div>
    </div>
  );
}
