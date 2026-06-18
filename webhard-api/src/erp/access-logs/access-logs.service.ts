import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateAccessLogDto,
  AccessLogResponseDto,
  AccessLogListResponseDto,
  AccessLogQueryDto,
  AccessLogStatsDto,
  AccessLogAction,
} from './dto/access-log.dto';

const PIN_RATE_LIMIT_MAX_FAILED_ATTEMPTS = 5;
const PIN_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export interface PinRateLimitStatus {
  isRateLimited: boolean;
  retryAfterSeconds: number;
  failedAttempts: number;
}

@Injectable()
export class AccessLogsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create access log entry
   */
  async createLog(dto: CreateAccessLogDto): Promise<void> {
    await this.prisma.executeWithRetry(
      () =>
        this.prisma.workerAccessLog.create({
          data: {
            workerId: dto.workerId ?? null,
            ipAddress: dto.ipAddress,
            userAgent: dto.userAgent ?? null,
            action: dto.action,
            success: dto.success,
            metadata: (dto.metadata ?? {}) as Record<string, string | number | boolean | null>,
          },
        }),
      { operationName: 'createAccessLog' }
    );
  }

  /**
   * Get access logs with pagination and filtering
   */
  async getLogs(query: AccessLogQueryDto): Promise<AccessLogListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.workerId) where.workerId = query.workerId;
    if (query.ipAddress) where.ipAddress = query.ipAddress;
    if (query.action) where.action = query.action;

    const [logs, total] = await Promise.all([
      this.prisma.executeWithRetry(
        () =>
          this.prisma.workerAccessLog.findMany({
            where,
            include: { worker: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
        { operationName: 'getAccessLogs' }
      ),
      this.prisma.executeWithRetry(() => this.prisma.workerAccessLog.count({ where }), {
        operationName: 'countAccessLogs',
      }),
    ]);

    return {
      logs: logs.map(
        (log): AccessLogResponseDto => ({
          id: log.id,
          worker_id: log.workerId,
          worker_name: log.worker?.name ?? null,
          ip_address: log.ipAddress,
          user_agent: log.userAgent,
          action: log.action,
          success: log.success,
          metadata: log.metadata as Record<string, unknown>,
          created_at: log.createdAt.toISOString(),
        })
      ),
      total,
      page,
      limit,
      hasMore: skip + limit < total,
    };
  }

  /**
   * Get access log statistics (last 24 hours)
   */
  async getStats(): Promise<AccessLogStatsDto> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalLogins, successfulLogins, failedLogins, blockedAttempts, blockedIps] =
      await Promise.all([
        this.prisma.workerAccessLog.count({
          where: { createdAt: { gte: since } },
        }),
        this.prisma.workerAccessLog.count({
          where: { createdAt: { gte: since }, success: true },
        }),
        this.prisma.workerAccessLog.count({
          where: { createdAt: { gte: since }, action: 'login_failed' },
        }),
        this.prisma.workerAccessLog.count({
          where: { createdAt: { gte: since }, action: 'ip_blocked' },
        }),
        this.prisma.executeWithRetry(
          () =>
            this.prisma.workerAccessLog.findMany({
              where: { createdAt: { gte: since }, action: 'ip_blocked' },
              select: { ipAddress: true },
              distinct: ['ipAddress'],
              take: 20,
            }),
          { operationName: 'getBlockedIps' }
        ),
      ]);

    // Unique IPs
    const uniqueIpResult = await this.prisma.executeWithRetry(
      () =>
        this.prisma.workerAccessLog.findMany({
          where: { createdAt: { gte: since } },
          select: { ipAddress: true },
          distinct: ['ipAddress'],
        }),
      { operationName: 'getUniqueIps' }
    );

    return {
      total_logins: totalLogins,
      successful_logins: successfulLogins,
      failed_logins: failedLogins,
      blocked_attempts: blockedAttempts,
      unique_ips: uniqueIpResult.length,
      recent_blocked_ips: blockedIps.map((r) => r.ipAddress),
    };
  }

  /**
   * Check rate limit: max 5 failed attempts per IP in 5 minutes
   */
  async isRateLimited(ipAddress: string): Promise<boolean> {
    const status = await this.getPinRateLimitStatus(ipAddress);
    return status.isRateLimited;
  }

  /**
   * Get PIN login rate-limit status from authoritative access logs.
   */
  async getPinRateLimitStatus(ipAddress: string): Promise<PinRateLimitStatus> {
    const now = Date.now();
    const since = new Date(now - PIN_RATE_LIMIT_WINDOW_MS);
    const where = {
      ipAddress,
      action: AccessLogAction.LOGIN_FAILED,
      createdAt: { gte: since },
    };

    const failedCount = await this.prisma.workerAccessLog.count({
      where,
    });

    if (failedCount < PIN_RATE_LIMIT_MAX_FAILED_ATTEMPTS) {
      return {
        isRateLimited: false,
        retryAfterSeconds: 0,
        failedAttempts: failedCount,
      };
    }

    const oldestFailure = await this.prisma.workerAccessLog.findFirst({
      where,
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    const elapsedMs = oldestFailure ? now - oldestFailure.createdAt.getTime() : 0;
    const retryAfterSeconds = Math.max(0, Math.ceil((PIN_RATE_LIMIT_WINDOW_MS - elapsedMs) / 1000));

    return {
      isRateLimited: true,
      retryAfterSeconds,
      failedAttempts: failedCount,
    };
  }
}
