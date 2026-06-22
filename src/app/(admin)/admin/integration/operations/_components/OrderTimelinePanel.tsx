'use client';

import type { OrderTimelineResponse } from '@/app/(admin)/admin/integration/_lib/types';
import { BADGE, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

interface OrderTimelinePanelProps {
  orderId?: string | null;
  timeline?: OrderTimelineResponse;
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

function getSourceLabel(sourceModel: string): string {
  return sourceModel === 'job_event' ? 'JobEvent' : 'OrderEvent';
}

export function OrderTimelinePanel({
  orderId,
  timeline,
  isLoading = false,
  isError = false,
}: OrderTimelinePanelProps) {
  if (isLoading) {
    return <p className={`px-4 py-6 text-sm ${TEXT_COLOR.secondary}`}>로딩 중...</p>;
  }

  if (!orderId) {
    return <p className={`px-4 py-6 text-sm ${TEXT_COLOR.secondary}`}>연결된 주문이 없습니다.</p>;
  }

  if (isError) {
    return <p className={`px-4 py-6 text-sm ${TEXT_COLOR.error}`}>타임라인 조회 실패</p>;
  }

  if (!timeline || timeline.events.length === 0) {
    return <p className={`px-4 py-6 text-sm ${TEXT_COLOR.secondary}`}>표시할 이벤트가 없습니다.</p>;
  }

  return (
    <div className="divide-y divide-border">
      <div className={`grid grid-cols-[88px_1fr] gap-3 px-4 py-3 ${BORDER_COLOR.default}`}>
        <span className={`text-xs ${TEXT_COLOR.muted}`}>order</span>
        <div className="min-w-0">
          <p className={`truncate text-xs font-mono ${TEXT_COLOR.primary}`}>{timeline.order_id}</p>
          <p className={`mt-1 truncate text-xs ${TEXT_COLOR.secondary}`}>{timeline.company_name}</p>
        </div>
      </div>

      {timeline.events.map((event) => (
        <div key={event.timeline_id} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={event.source_model === 'job_event' ? BADGE.info : BADGE.gray}>
              {getSourceLabel(event.source_model)}
            </span>
            <span className={`font-mono text-xs ${TEXT_COLOR.primary}`}>{event.event_type}</span>
          </div>
          <div className="mt-2 grid gap-1 text-xs">
            <div className="grid grid-cols-[88px_1fr] gap-3">
              <span className={TEXT_COLOR.muted}>source</span>
              <span className={`truncate font-mono ${TEXT_COLOR.secondary}`}>
                {event.source_worker ?? event.source}
              </span>
            </div>
            <div className="grid grid-cols-[88px_1fr] gap-3">
              <span className={TEXT_COLOR.muted}>state</span>
              <span className={`truncate ${TEXT_COLOR.secondary}`}>
                {event.result ?? event.to_status ?? '-'} / {event.state_apply_status ?? '-'}
              </span>
            </div>
            <div className="grid grid-cols-[88px_1fr] gap-3">
              <span className={TEXT_COLOR.muted}>occurredAt</span>
              <span className={TEXT_COLOR.secondary}>{formatDateTime(event.occurred_at)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
