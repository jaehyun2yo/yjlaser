'use client';

import type { FC } from 'react';
import { ShoppingCart, Package, Truck, Monitor, Bell, Activity } from 'lucide-react';
import { BADGE, BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import type { IntegrationEvent } from '@/app/(admin)/admin/integration/_lib/types';

interface Props {
  events: IntegrationEvent[];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return '방금 전';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  return date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSourceConfig(source: string) {
  switch (source) {
    case 'order':
    case 'integration-order':
      return { label: '주문', badge: BADGE.info, icon: <ShoppingCart className="w-3.5 h-3.5" /> };
    case 'inventory':
      return { label: '재고', badge: BADGE.warning, icon: <Package className="w-3.5 h-3.5" /> };
    case 'delivery':
      return { label: '납품', badge: BADGE.success, icon: <Truck className="w-3.5 h-3.5" /> };
    case 'program':
      return { label: '프로그램', badge: BADGE.gray, icon: <Monitor className="w-3.5 h-3.5" /> };
    case 'system':
      return { label: '시스템', badge: BADGE.error, icon: <Bell className="w-3.5 h-3.5" /> };
    default:
      return { label: source, badge: BADGE.gray, icon: <Activity className="w-3.5 h-3.5" /> };
  }
}

const EventTimeline: FC<Props> = ({ events }) => {
  if (events.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-8 ${TEXT_COLOR.muted}`}>
        <Activity className="w-10 h-10 mb-2 opacity-40" />
        <p className="text-sm">최근 이벤트가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {events.map((event, index) => {
        const sourceConfig = getSourceConfig(event.source);
        const isLast = index === events.length - 1;

        return (
          <div key={event.id} className="flex gap-3">
            {/* 타임라인 선 */}
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  event.source === 'order' || event.source === 'integration-order'
                    ? `${BG_COLOR.infoLighter} ${TEXT_COLOR.info}`
                    : event.source === 'inventory'
                      ? `${BG_COLOR.warningLight} ${TEXT_COLOR.warning}`
                      : event.source === 'delivery'
                        ? `${BG_COLOR.successLight} ${TEXT_COLOR.success}`
                        : event.source === 'system'
                          ? `${BG_COLOR.errorLight} ${TEXT_COLOR.error}`
                          : `${BG_COLOR.lightDark} ${TEXT_COLOR.secondary}`
                }`}
              >
                {sourceConfig.icon}
              </div>
              {!isLast && (
                <div
                  className={`w-px flex-1 my-1 ${BORDER_COLOR.default} border-l`}
                  style={{ minHeight: '16px' }}
                />
              )}
            </div>

            {/* 내용 */}
            <div className={`flex-1 pb-4 ${isLast ? '' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${TEXT_COLOR.primary} leading-snug`}>
                    {event.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={sourceConfig.badge}>{sourceConfig.label}</span>
                    <span className={`text-xs ${TEXT_COLOR.muted}`}>
                      {formatDate(event.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default EventTimeline;
