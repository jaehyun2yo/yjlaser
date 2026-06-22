'use client';

import { Activity, AlertTriangle, Clock3, Server } from 'lucide-react';
import { useOperationFailures } from '@/app/(admin)/admin/integration/_lib/hooks';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { OperationFailuresTable } from './OperationFailuresTable';

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

const panels = [
  {
    title: '주문 타임라인',
    rows: ['order', 'source', 'eventType', 'occurredAt'],
  },
  {
    title: 'Worker heartbeat',
    rows: ['program', 'instance', 'status', 'lastSeen'],
  },
];

export function OperationsDashboard() {
  const failuresQuery = useOperationFailures(20);
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

        {panels.map((panel) => (
          <div
            key={panel.title}
            className={`rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card}`}
          >
            <div className={`border-b ${BORDER_COLOR.default} px-4 py-3`}>
              <h2 className={`text-sm font-semibold ${TEXT_COLOR.primary}`}>{panel.title}</h2>
            </div>
            <div className="divide-y divide-border">
              {panel.rows.map((row) => (
                <div key={row} className="grid grid-cols-[120px_1fr] gap-3 px-4 py-3">
                  <span className={`text-xs ${TEXT_COLOR.muted}`}>{row}</span>
                  <span className={`text-xs ${TEXT_COLOR.secondary}`}>-</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
