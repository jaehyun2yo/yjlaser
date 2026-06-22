'use client';

import type {
  OperationHeartbeat,
  OperationHeartbeatSummary,
} from '@/app/(admin)/admin/integration/_lib/types';
import { BADGE, TEXT_COLOR } from '@/lib/styles';

interface WorkerHeartbeatPanelProps {
  heartbeats?: OperationHeartbeat[];
  summary?: OperationHeartbeatSummary;
  isLoading?: boolean;
  isError?: boolean;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusBadge(status: OperationHeartbeat['status']): string {
  if (status === 'online') return BADGE.success;
  if (status === 'late') return BADGE.warning;
  return BADGE.error;
}

export function WorkerHeartbeatPanel({
  heartbeats,
  summary,
  isLoading = false,
  isError = false,
}: WorkerHeartbeatPanelProps) {
  if (isLoading) {
    return <p className={`px-4 py-6 text-sm ${TEXT_COLOR.secondary}`}>로딩 중...</p>;
  }

  if (isError) {
    return <p className={`px-4 py-6 text-sm ${TEXT_COLOR.error}`}>heartbeat 조회 실패</p>;
  }

  if (!heartbeats || heartbeats.length === 0) {
    return (
      <p className={`px-4 py-6 text-sm ${TEXT_COLOR.secondary}`}>등록된 heartbeat가 없습니다.</p>
    );
  }

  return (
    <div className="divide-y divide-border">
      <div className="grid grid-cols-3 gap-3 px-4 py-3 text-xs">
        <div>
          <p className={TEXT_COLOR.muted}>online</p>
          <p className={`mt-1 font-semibold ${TEXT_COLOR.primary}`}>{summary?.online ?? 0}</p>
        </div>
        <div>
          <p className={TEXT_COLOR.muted}>late</p>
          <p className={`mt-1 font-semibold ${TEXT_COLOR.primary}`}>{summary?.late ?? 0}</p>
        </div>
        <div>
          <p className={TEXT_COLOR.muted}>offline</p>
          <p className={`mt-1 font-semibold ${TEXT_COLOR.primary}`}>{summary?.offline ?? 0}</p>
        </div>
      </div>

      {heartbeats.map((heartbeat) => (
        <div key={heartbeat.heartbeat_id} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={getStatusBadge(heartbeat.status)}>{heartbeat.status}</span>
            <span className={`font-mono text-xs ${TEXT_COLOR.primary}`}>
              {heartbeat.program_type}
            </span>
          </div>
          <div className="mt-2 grid gap-1 text-xs">
            <div className="grid grid-cols-[88px_1fr] gap-3">
              <span className={TEXT_COLOR.muted}>instance</span>
              <span className={`truncate font-mono ${TEXT_COLOR.secondary}`}>
                {heartbeat.instance_name}
              </span>
            </div>
            <div className="grid grid-cols-[88px_1fr] gap-3">
              <span className={TEXT_COLOR.muted}>lastSeen</span>
              <span className={TEXT_COLOR.secondary}>
                {formatDateTime(heartbeat.last_seen_at)} · {heartbeat.lag_seconds}s
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
