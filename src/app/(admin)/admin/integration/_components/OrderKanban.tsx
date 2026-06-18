'use client';

import type { FC } from 'react';
import Link from 'next/link';
import { Clock, AlertCircle, ChevronRight } from 'lucide-react';
import { BADGE, BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import type {
  IntegrationOrder,
  OrderStatusGroup,
} from '@/app/(admin)/admin/integration/_lib/types';

interface Props {
  orders: IntegrationOrder[];
}

const statusGroups: OrderStatusGroup[] = ['접수', '작업중', '완료', '납품'];

const statusGroupConfig: Record<OrderStatusGroup, { color: string; dotColor: string; bg: string }> =
  {
    접수: {
      color: TEXT_COLOR.info,
      dotColor: 'bg-blue-500',
      bg: BG_COLOR.info,
    },
    작업중: {
      color: TEXT_COLOR.warning,
      dotColor: 'bg-yellow-500',
      bg: BG_COLOR.warning,
    },
    완료: {
      color: TEXT_COLOR.success,
      dotColor: 'bg-green-500',
      bg: BG_COLOR.success,
    },
    납품: {
      color: TEXT_COLOR.purple,
      dotColor: 'bg-purple-500',
      bg: BG_COLOR.purple,
    },
  };

const priorityConfig: Record<string, string> = {
  urgent: BADGE.error,
  normal: BADGE.info,
  low: BADGE.gray,
};

const priorityLabel: Record<string, string> = {
  urgent: '긴급',
  normal: '보통',
  low: '낮음',
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}

const OrderKanban: FC<Props> = ({ orders }) => {
  const groupedOrders = statusGroups.reduce<Record<OrderStatusGroup, IntegrationOrder[]>>(
    (acc, group) => {
      acc[group] = orders.filter((o) => o.statusGroup === group);
      return acc;
    },
    { 접수: [], 작업중: [], 완료: [], 납품: [] }
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {statusGroups.map((group) => {
        const config = statusGroupConfig[group];
        const groupOrders = groupedOrders[group];

        return (
          <div key={group} className="flex flex-col gap-2">
            {/* 컬럼 헤더 */}
            <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${config.bg}`}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />
                <span className={`text-sm font-semibold ${config.color}`}>{group}</span>
              </div>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${BG_COLOR.card} ${config.color}`}
              >
                {groupOrders.length}
              </span>
            </div>

            {/* 주문 카드들 */}
            <div className="space-y-2 flex-1">
              {groupOrders.length === 0 ? (
                <div className={`py-6 text-center text-xs ${TEXT_COLOR.muted}`}>주문 없음</div>
              ) : (
                groupOrders.slice(0, 5).map((order) => (
                  <Link
                    key={order.id}
                    href={`/admin/integration/orders/${order.id}`}
                    className={`block p-3 rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} hover:shadow-md transition-shadow group`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                      <span className={`text-xs font-mono ${TEXT_COLOR.muted} truncate`}>
                        #{order.orderNumber}
                      </span>
                      {order.priority === 'urgent' && (
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                      )}
                    </div>

                    <p
                      className={`text-xs font-semibold ${TEXT_COLOR.primary} line-clamp-2 mb-1.5 group-hover:text-[#ED6C00] transition-colors`}
                    >
                      {order.title}
                    </p>

                    <p className={`text-xs ${TEXT_COLOR.secondary} truncate mb-2`}>
                      {order.companyName}
                    </p>

                    <div className="flex items-center justify-between">
                      <span className={priorityConfig[order.priority] ?? BADGE.gray}>
                        {priorityLabel[order.priority] ?? order.priority}
                      </span>
                      {order.dueDate && (
                        <span className={`text-xs flex items-center gap-0.5 ${TEXT_COLOR.muted}`}>
                          <Clock className="w-3 h-3" />
                          {formatDate(order.dueDate)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))
              )}

              {groupOrders.length > 5 && (
                <Link
                  href={`/admin/integration/orders?statusGroup=${encodeURIComponent(group)}`}
                  className={`flex items-center justify-center gap-1 py-2 text-xs font-medium ${TEXT_COLOR.secondary} hover:text-[#ED6C00] transition-colors`}
                >
                  +{groupOrders.length - 5}개 더
                  <ChevronRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default OrderKanban;
