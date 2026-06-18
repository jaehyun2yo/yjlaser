'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dropdown, DropdownContent, DropdownTrigger } from '@/components/ui/dropdown';
import {
  isWorkerContactNotificationUnread,
  type WorkerContactNotification,
} from '@/app/worker/_lib/workerNotifications';

interface WorkerNewContactNotificationsProps {
  notifications: WorkerContactNotification[];
  onOpen: (notification: WorkerContactNotification) => void;
  onMarkRead: (notificationId: string) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
  onClear: () => void;
}

const VISIBLE_NOTIFICATION_BATCH_SIZE = 12;

export function WorkerNewContactNotifications({
  notifications,
  onOpen,
  onMarkRead,
  onMarkAllRead,
  onClose,
  onClear,
}: WorkerNewContactNotificationsProps) {
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(VISIBLE_NOTIFICATION_BATCH_SIZE);
  const count = notifications.length;
  const unreadCount = useMemo(
    () => notifications.filter(isWorkerContactNotificationUnread).length,
    [notifications]
  );
  const visibleNotifications = notifications.slice(0, visibleCount);

  useEffect(() => {
    if (open) setVisibleCount(VISIBLE_NOTIFICATION_BATCH_SIZE);
  }, [open]);

  useEffect(() => {
    setVisibleCount((current) =>
      Math.min(Math.max(current, VISIBLE_NOTIFICATION_BATCH_SIZE), count)
    );
  }, [count]);

  const handleOpenNotification = (notification: WorkerContactNotification) => {
    onMarkRead(notification.id);
    onOpen(notification);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (open && !nextOpen) onClose();
    setOpen(nextOpen);
  };

  const handleListScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining > 48 || visibleCount >= count) return;
    setVisibleCount((current) => Math.min(current + VISIBLE_NOTIFICATION_BATCH_SIZE, count));
  };

  const handleClear = () => {
    onClear();
    setOpen(false);
  };

  return (
    <Dropdown open={open} onOpenChange={handleOpenChange}>
      <DropdownTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`새 문의 알림 ${unreadCount}건`}
          className="relative h-9 w-9 bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-error px-1 text-[11px] font-bold leading-none text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownTrigger>

      <DropdownContent
        align="center"
        sideOffset={12}
        collisionPadding={20}
        data-testid="worker-new-contact-dropdown"
        className="w-96 max-w-[calc(100vw-2rem)] origin-[var(--radix-dropdown-menu-content-transform-origin)] p-0 shadow-xl data-[state=open]:duration-150 data-[state=closed]:duration-100"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="whitespace-nowrap text-sm font-semibold text-foreground">새 문의</p>
            <p className="whitespace-nowrap text-xs text-muted-foreground">
              {count}건 · 미확인 {unreadCount}건
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={count === 0}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              모두 확인
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={count === 0}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              비우기
            </button>
          </div>
        </div>

        {count === 0 ? (
          <p className="whitespace-nowrap px-5 py-8 text-center text-sm text-muted-foreground">
            새 문의가 없습니다
          </p>
        ) : (
          <div
            className="max-h-80 overflow-y-auto py-2"
            data-testid="worker-new-contact-list"
            onScroll={handleListScroll}
          >
            {visibleNotifications.map((notification) => {
              const unread = isWorkerContactNotificationUnread(notification);
              return (
                <button
                  key={notification.id}
                  type="button"
                  aria-label={`${notification.companyName} 새 문의로 이동`}
                  onClick={() => handleOpenNotification(notification)}
                  className="block w-full px-4 py-4 text-left transition-colors hover:bg-muted focus:bg-muted focus:outline-none"
                  data-read={unread ? undefined : 'true'}
                >
                  <span className="flex min-w-0 items-start justify-between gap-3">
                    <span className="flex min-w-0 flex-1 items-center gap-2.5">
                      {unread ? (
                        <span
                          aria-hidden="true"
                          data-testid={`worker-new-contact-unread-dot-${notification.contactId}`}
                          className="relative flex h-2.5 w-2.5 shrink-0"
                        >
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error opacity-75" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-error" />
                        </span>
                      ) : (
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 shrink-0 rounded-full bg-transparent"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate whitespace-nowrap text-sm font-semibold ${
                            unread ? 'text-foreground' : 'text-gray-400'
                          }`}
                        >
                          {notification.companyName}
                        </span>
                        <span
                          className={`block truncate whitespace-nowrap text-xs ${
                            unread ? 'text-muted-foreground' : 'text-gray-400'
                          }`}
                        >
                          {notification.title}
                        </span>
                      </span>
                    </span>
                    {notification.numberLabel && (
                      <span
                        className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          unread ? 'bg-muted text-muted-foreground' : 'bg-gray-50 text-gray-400'
                        }`}
                      >
                        {notification.numberLabel}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </DropdownContent>
    </Dropdown>
  );
}
