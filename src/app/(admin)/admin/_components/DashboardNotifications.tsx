import { logger } from '@/lib/utils/logger';
import {
  serverGetNotifications,
  serverGetUnreadNotificationSummary,
} from '@/lib/api/nestjs-server-client';
import {
  getNotificationCategory,
  type NotificationUnreadSummary,
} from '@/lib/notifications/categories';
import type { Notification } from '@/hooks/useNotifications';
import { AdminDashboardNotifications } from './AdminDashboardNotifications';

function normalizeNotification(raw: Record<string, unknown>): Notification {
  const type = typeof raw.type === 'string' ? raw.type : 'system';
  return {
    id: String(raw.id ?? ''),
    type,
    category:
      raw.category === 'webhard' ||
      raw.category === 'integration' ||
      raw.category === 'work-management'
        ? raw.category
        : getNotificationCategory(type),
    title: String(raw.title ?? ''),
    message: String(raw.message ?? ''),
    metadata:
      raw.metadata && typeof raw.metadata === 'object'
        ? (raw.metadata as Record<string, unknown>)
        : {},
    is_read: raw.is_read === true,
    read_at: typeof raw.read_at === 'string' ? raw.read_at : null,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : new Date(0).toISOString(),
  };
}

export async function DashboardNotifications() {
  const adminLogger = logger.createLogger('DASHBOARD_NOTIFICATIONS');
  let notifications: Notification[] = [];
  let unreadSummary: NotificationUnreadSummary = {
    all: 0,
    webhard: 0,
    integration: 0,
    workManagement: 0,
  };

  try {
    const [notificationRows, summary] = await Promise.all([
      serverGetNotifications({ userType: 'admin', userId: null, limit: 24 }),
      serverGetUnreadNotificationSummary('admin', null),
    ]);
    notifications = notificationRows.map(normalizeNotification);
    unreadSummary = summary;
  } catch (error) {
    adminLogger.error('Error in DashboardNotifications', error);
  }

  return (
    <AdminDashboardNotifications notifications={notifications} unreadSummary={unreadSummary} />
  );
}
