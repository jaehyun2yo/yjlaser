'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { FaBell, FaCheckCircle, FaExclamationCircle, FaFolderOpen } from 'react-icons/fa';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Notification } from '@/hooks/useNotifications';
import {
  NOTIFICATION_CATEGORY_OPTIONS,
  type NotificationCategory,
  type NotificationUnreadSummary,
} from '@/lib/notifications/categories';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

interface AdminDashboardNotificationsProps {
  notifications: Notification[];
  unreadSummary: NotificationUnreadSummary;
}

function getSafeLink(notification: Notification): string | null {
  const link = notification.metadata?.link;
  if (typeof link !== 'string' || !link.startsWith('/')) return null;

  const allowedPrefixes = ['/admin/', '/webhard/', '/worker/'];
  return allowedPrefixes.some((prefix) => link.startsWith(prefix)) ? link : null;
}

export function AdminDashboardNotifications({
  notifications,
  unreadSummary,
}: AdminDashboardNotificationsProps) {
  const [category, setCategory] = useState<NotificationCategory>('all');

  const visibleNotifications = useMemo(() => {
    if (category === 'all') return notifications;
    return notifications.filter((notification) => notification.category === category);
  }, [category, notifications]);

  return (
    <section
      className={`${BG_COLOR.card} rounded-lg border ${BORDER_COLOR.default} shadow-sm overflow-hidden`}
    >
      <div className={`flex items-center justify-between px-4 py-3 border-b ${BORDER_COLOR.light}`}>
        <div className="flex items-center gap-2">
          <FaBell className={TEXT_COLOR.brand} />
          <h2 className={`text-sm font-semibold ${TEXT_COLOR.primary}`}>알림</h2>
          <span className={`text-xs font-semibold ${TEXT_COLOR.brand}`}>{unreadSummary.all}건</span>
        </div>
        <Link
          href="/admin/work-management"
          className={`text-xs ${TEXT_COLOR.brand} hover:underline`}
        >
          작업관리
        </Link>
      </div>

      <div className="flex gap-1 px-3 py-2 overflow-x-auto">
        {NOTIFICATION_CATEGORY_OPTIONS.map((option) => {
          const selected = option.value === category;
          const count = unreadSummary[option.summaryKey];
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setCategory(option.value)}
              className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                selected
                  ? `${BG_COLOR.brandLight} ${BORDER_COLOR.brand} ${TEXT_COLOR.brand}`
                  : `${BG_COLOR.muted} ${BORDER_COLOR.transparent} ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}`
              }`}
            >
              {option.label}
              <span className="ml-1">{count}</span>
            </button>
          );
        })}
      </div>

      {visibleNotifications.length === 0 ? (
        <div className={`px-4 py-8 text-center ${TEXT_COLOR.muted}`}>
          <FaCheckCircle className="mx-auto mb-2" />
          <p className="text-sm">확인할 알림이 없습니다</p>
        </div>
      ) : (
        <ul aria-label="대시보드 알림 목록" className="max-h-72 overflow-y-auto">
          {visibleNotifications.slice(0, 8).map((notification) => {
            const link = getSafeLink(notification);
            const content = (
              <div
                className={`flex gap-3 px-4 py-3 border-t ${BORDER_COLOR.light} ${BG_COLOR.hoverMuted}`}
              >
                <div
                  className={`mt-0.5 ${notification.is_read ? TEXT_COLOR.muted : TEXT_COLOR.brand}`}
                >
                  {notification.type === 'file_uploaded' ? (
                    <FaFolderOpen />
                  ) : (
                    <FaExclamationCircle />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${TEXT_COLOR.primary}`}>
                    {notification.title}
                  </p>
                  <p className={`mt-0.5 line-clamp-2 text-xs ${TEXT_COLOR.secondary}`}>
                    {notification.message}
                  </p>
                  <p className={`mt-1 text-[11px] ${TEXT_COLOR.muted}`}>
                    {formatDistanceToNow(new Date(notification.created_at), {
                      addSuffix: true,
                      locale: ko,
                    })}
                  </p>
                </div>
              </div>
            );

            return (
              <li key={notification.id}>{link ? <Link href={link}>{content}</Link> : content}</li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
