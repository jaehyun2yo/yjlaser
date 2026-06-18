import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ActivityLogsGateway } from './activity-logs.gateway';

export interface CreateActivityLogDto {
  actorType: string;
  actorId: string;
  actorName?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface FindActivityLogsOptions {
  action?: string;
  actorId?: string;
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
}

@Injectable()
export class ActivityLogsService {
  private readonly logger = new Logger(ActivityLogsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsGateway: ActivityLogsGateway
  ) {}

  /**
   * 활동 로그 기록
   */
  async create(data: CreateActivityLogDto) {
    try {
      const log = await this.prisma.activityLog.create({
        data: {
          actorType: data.actorType,
          actorId: data.actorId,
          actorName: data.actorName || null,
          action: data.action,
          resourceType: data.resourceType || null,
          resourceId: data.resourceId || null,
          details: (data.details as Prisma.InputJsonValue) || {},
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent || null,
        },
      });
      this.activityLogsGateway.emitActivityCreated({
        id: log.id,
        actor_type: log.actorType,
        actor_id: log.actorId,
        actor_name: log.actorName,
        action: log.action,
        resource_type: log.resourceType,
        resource_id: log.resourceId,
        details: log.details,
        ip_address: log.ipAddress,
        user_agent: log.userAgent,
        created_at: log.createdAt.toISOString(),
      });
      return { id: log.id, success: true };
    } catch (error) {
      this.logger.error('Failed to create activity log', error);
      return { id: null, success: false };
    }
  }

  /**
   * 활동 로그 목록 조회
   */
  async findAll(options: FindActivityLogsOptions) {
    const where: Prisma.ActivityLogWhereInput = {};

    if (options.action) where.action = options.action;
    if (options.actorId) where.actorId = options.actorId;
    if (options.startDate || options.endDate) {
      where.createdAt = {
        ...(options.startDate ? { gte: options.startDate } : {}),
        ...(options.endDate ? { lte: options.endDate } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: options.offset || 0,
        take: options.limit || 50,
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return {
      logs: logs.map((l) => ({
        id: l.id,
        actor_type: l.actorType,
        actor_id: l.actorId,
        actor_name: l.actorName,
        action: l.action,
        resource_type: l.resourceType,
        resource_id: l.resourceId,
        details: l.details,
        ip_address: l.ipAddress,
        user_agent: l.userAgent,
        created_at: l.createdAt.toISOString(),
      })),
      total,
    };
  }
}
