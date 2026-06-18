import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { NotificationsGateway } from './notifications.gateway';

type NotificationCategory = 'all' | 'webhard' | 'integration' | 'work-management';

const NOTIFICATION_CATEGORY_TYPES: Record<Exclude<NotificationCategory, 'all'>, string[]> = {
  webhard: ['file_uploaded', 'webhard_company_mismatch', 'webhard_classify_failed'],
  integration: [
    'company_approval_pending',
    'company_created',
    'company_status_updated',
    'company_approved',
    'booking_created',
    'booking_updated',
    'booking_cancelled',
    'worker_created',
    'worker_updated',
  ],
  'work-management': [
    'new_contact',
    'worker_note_added',
    'worker_issue_added',
    'worker_request_added',
    'contact_urgent',
  ],
};

function getNotificationCategory(type: string): Exclude<NotificationCategory, 'all'> {
  if (NOTIFICATION_CATEGORY_TYPES.webhard.includes(type)) return 'webhard';
  if (NOTIFICATION_CATEGORY_TYPES.integration.includes(type)) return 'integration';
  return 'work-management';
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway
  ) {}

  /**
   * 알림 목록 조회
   */
  async getNotifications(
    userType: string,
    userId: number | null,
    limit = 20,
    offset = 0,
    unreadOnly = false,
    category: NotificationCategory = 'all'
  ) {
    const where: Prisma.NotificationWhereInput = { userType };

    if (userId !== null && userId !== undefined) {
      where.userId = BigInt(userId);
    }

    if (unreadOnly) {
      where.isRead = false;
    }

    if (category !== 'all') {
      where.type = { in: NOTIFICATION_CATEGORY_TYPES[category] };
    }

    const notifications = await this.prisma.executeWithRetry(
      () =>
        this.prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
        }),
      { operationName: 'notifications.getNotifications' }
    );

    return notifications.map((n) => ({
      id: n.id,
      user_type: n.userType,
      user_id: n.userId ? Number(n.userId) : null,
      type: n.type,
      category: getNotificationCategory(n.type),
      title: n.title,
      message: n.message,
      metadata: n.metadata,
      is_read: n.isRead,
      read_at: n.readAt?.toISOString() || null,
      created_at: n.createdAt.toISOString(),
    }));
  }

  /**
   * 읽지 않은 알림 수 조회
   */
  async getUnreadCount(
    userType: string,
    userId: number | null,
    category: NotificationCategory = 'all'
  ): Promise<number> {
    const where: Prisma.NotificationWhereInput = {
      userType,
      isRead: false,
    };

    if (userId !== null && userId !== undefined) {
      where.userId = BigInt(userId);
    }

    if (category !== 'all') {
      where.type = { in: NOTIFICATION_CATEGORY_TYPES[category] };
    }

    return this.prisma.executeWithRetry(() => this.prisma.notification.count({ where }), {
      operationName: 'notifications.getUnreadCount',
    });
  }

  async getUnreadSummary(userType: string, userId: number | null) {
    const where: Prisma.NotificationWhereInput = {
      userType,
      isRead: false,
    };

    if (userId !== null && userId !== undefined) {
      where.userId = BigInt(userId);
    }

    const rows = await this.prisma.executeWithRetry(
      () =>
        this.prisma.notification.groupBy({
          by: ['type'],
          where,
          _count: { _all: true },
        }),
      { operationName: 'notifications.getUnreadSummary' }
    );

    const summary = { all: 0, webhard: 0, integration: 0, workManagement: 0 };
    for (const row of rows) {
      const count = row._count._all;
      summary.all += count;
      const category = getNotificationCategory(row.type);
      if (category === 'work-management') summary.workManagement += count;
      else summary[category] += count;
    }

    return summary;
  }

  /**
   * 알림 읽음 처리
   */
  async markRead(notificationId: string): Promise<boolean> {
    try {
      const notification = await this.prisma.executeWithRetry(
        () =>
          this.prisma.notification.update({
            where: { id: notificationId },
            data: { isRead: true, readAt: new Date() },
          }),
        { operationName: 'notifications.markRead' }
      );
      this.notificationsGateway.emitNotificationUpdated({
        id: notification.id,
        is_read: notification.isRead,
        read_at: notification.readAt?.toISOString() || null,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to mark notification ${notificationId} as read`, error);
      return false;
    }
  }

  /**
   * 모든 알림 읽음 처리
   */
  async markAllRead(userType: string, userId: number | null): Promise<number> {
    const where: Prisma.NotificationWhereInput = {
      userType,
      isRead: false,
    };

    if (userId !== null && userId !== undefined) {
      where.userId = BigInt(userId);
    }

    const result = await this.prisma.executeWithRetry(
      () =>
        this.prisma.notification.updateMany({
          where,
          data: { isRead: true, readAt: new Date() },
        }),
      { operationName: 'notifications.markAllRead' }
    );

    this.notificationsGateway.emitAllNotificationsRead(userType, userId);
    return result.count;
  }
}
