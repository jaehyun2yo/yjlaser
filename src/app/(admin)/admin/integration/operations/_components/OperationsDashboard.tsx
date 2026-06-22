'use client';

import { Activity, AlertTriangle, Clock3, Server } from 'lucide-react';
import {
  useOperationHeartbeats,
  useOperationFailures,
  useOrderTimeline,
} from '@/app/(admin)/admin/integration/_lib/hooks';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { OperationFailuresTable } from './OperationFailuresTable';
import { OrderTimelinePanel } from './OrderTimelinePanel';
import { WorkerHeartbeatPanel } from './WorkerHeartbeatPanel';

const summaryCards = [
  {
    label: '미해결 실패',
    value: '-',
    icon: AlertTriangle,
    iconClassName: 'text-red-500',
  },
  {
    label: '지연 Worker',
    value: '-',
    icon: Clock3,
    iconClassName: 'text-amber-500',
  },
  {
    label: '오프라인',
    value: '-',
    icon: Server,
    iconClassName: 'text-gray-500',
  },
  {
    label: '최근 이벤트',
    value: '-',
    icon: Activity,
    iconClassName: 'text-blue-500',
  },
];

export function OperationsDashboard() {
  const failuresQuery = useOperationFailures(20);
  const heartbeatsQuery = useOperationHeartbeats();
  const timelineOrderId =
    failuresQuery.data?.items.find((failure) => Boolean(failure.order_id))?.order_id ?? null;
  const timelineQuery = useOrderTimeline(timelineOrderId);
  const unresolvedFailureCount = failuresQuery.data
    ? `${failuresQuery.data.items.length}${failuresQuery.data.has_more ? '+' : ''}`
    : undefined;

  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          const value =
            card.label === '미해결 실패' && unresolvedFailureCount !== undefined
              ? String(unresolvedFailureCount)
              : card.label === '지연 Worker' && heartbeatsQuery.data
                ? String(heartbeatsQuery.data.summary.late)
                : card.label === '오프라인' && heartbeatsQuery.data
                  ? String(heartbeatsQuery.data.summary.offline)
                  : card.value;

          return (
            <div
              key={card.label}
              className={`rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} p-4`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className={`text-xs font-medium ${TEXT_COLOR.secondary}`}>{card.label}</span>
                <Icon className={`h-4 w-4 ${card.iconClassName}`} />
              </div>
              <p className={`mt-3 text-2xl font-semibold ${TEXT_COLOR.primary}`}>{value}</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className={`rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card}`}>
          <div className={`border-b ${BORDER_COLOR.default} px-4 py-3`}>
            <h2 className={`text-sm font-semibold ${TEXT_COLOR.primary}`}>미해결 실패</h2>
          </div>
          <OperationFailuresTable
            failures={failuresQuery.data?.items}
            isLoading={failuresQuery.isLoading}
            isError={failuresQuery.isError}
          />
        </div>

        <div className={`rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card}`}>
          <div className={`border-b ${BORDER_COLOR.default} px-4 py-3`}>
            <h2 className={`text-sm font-semibold ${TEXT_COLOR.primary}`}>주문 타임라인</h2>
          </div>
          <OrderTimelinePanel
            orderId={timelineOrderId}
            timeline={timelineQuery.data}
            isLoading={failuresQuery.isLoading || timelineQuery.isLoading}
            isError={timelineQuery.isError}
          />
        </div>

        <div className={`rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card}`}>
          <div className={`border-b ${BORDER_COLOR.default} px-4 py-3`}>
            <h2 className={`text-sm font-semibold ${TEXT_COLOR.primary}`}>Worker heartbeat</h2>
          </div>
          <WorkerHeartbeatPanel
            heartbeats={heartbeatsQuery.data?.items}
            summary={heartbeatsQuery.data?.summary}
            isLoading={heartbeatsQuery.isLoading}
            isError={heartbeatsQuery.isError}
          />
        </div>
      </section>
    </>
  );
}
