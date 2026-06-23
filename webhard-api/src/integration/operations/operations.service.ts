import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const HEARTBEAT_LATE_THRESHOLD_MS = 120 * 1000;
const HEARTBEAT_OFFLINE_THRESHOLD_MS = 10 * 60 * 1000;

export type OperationFailuresQuery = {
  cursor?: string;
  limit?: string | number;
};

type JobFailureWithLastEvent = {
  id: string;
  jobId: string | null;
  orderId: string | null;
  sourceWorker: string;
  eventType: string | null;
  errorCode: string;
  message: string | null;
  retryable: boolean;
  retryCount: number;
  resolvedAt: Date | null;
  lastEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastEvent: {
    id: string;
    eventType: string;
    sourceWorker: string;
    occurredAt: Date;
    result: string;
    stateApplyStatus: string;
  } | null;
};

type ProgramHeartbeatRead = {
  id: string;
  programType: string;
  instanceName: string;
  status: string;
  version: string | null;
  hostname: string | null;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type HeartbeatStatus = 'online' | 'late' | 'offline';

@Injectable()
export class OperationsService {
  private readonly logger = new Logger(OperationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getUnresolvedFailures(query: OperationFailuresQuery = {}) {
    const limit = this.normalizeLimit(query.limit);
    const hasCursor = Boolean(query.cursor);
    const startedAt = Date.now();

    this.logger.log(`operation failures list status=start limit=${limit} hasCursor=${hasCursor}`);

    try {
      const failures = await this.prisma.executeWithRetry(
        () =>
          this.prisma.jobFailure.findMany({
            where: { resolvedAt: null },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            select: {
              id: true,
              jobId: true,
              orderId: true,
              sourceWorker: true,
              eventType: true,
              errorCode: true,
              message: true,
              retryable: true,
              retryCount: true,
              resolvedAt: true,
              lastEventId: true,
              createdAt: true,
              updatedAt: true,
              lastEvent: {
                select: {
                  id: true,
                  eventType: true,
                  sourceWorker: true,
                  occurredAt: true,
                  result: true,
                  stateApplyStatus: true,
                },
              },
            },
          }),
        { operationName: 'getUnresolvedJobFailures' }
      );

      const items = (failures as JobFailureWithLastEvent[]).slice(0, limit);
      const hasMore = failures.length > limit;

      this.logger.log(
        `operation failures list status=success limit=${limit} hasCursor=${hasCursor} count=${items.length} hasMore=${hasMore} elapsedMs=${
          Date.now() - startedAt
        }`
      );

      return {
        items: items.map((failure) => this.mapFailure(failure)),
        next_cursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
        has_more: hasMore,
        limit,
      };
    } catch (error) {
      this.logger.error(
        `operation failures list status=failure limit=${limit} hasCursor=${hasCursor} errorType=${this.getErrorType(
          error
        )} elapsedMs=${Date.now() - startedAt}`
      );
      throw error;
    }
  }

  async getProgramHeartbeats() {
    const startedAt = Date.now();

    this.logger.log('operation heartbeats list status=start');

    try {
      const heartbeats = (await this.prisma.executeWithRetry(
        () =>
          this.prisma.programHeartbeat.findMany({
            orderBy: [{ programType: 'asc' }, { instanceName: 'asc' }],
            select: {
              id: true,
              programType: true,
              instanceName: true,
              status: true,
              version: true,
              hostname: true,
              lastSeenAt: true,
              createdAt: true,
              updatedAt: true,
            },
          }),
        { operationName: 'getProgramHeartbeats' }
      )) as ProgramHeartbeatRead[];

      const nowMs = Date.now();
      const items = heartbeats.map((heartbeat) => this.mapHeartbeat(heartbeat, nowMs));
      const summary = this.summarizeHeartbeats(items);

      this.logger.log(
        `operation heartbeats list status=success count=${summary.total} online=${summary.online} late=${summary.late} offline=${summary.offline} elapsedMs=${
          Date.now() - startedAt
        }`
      );

      return {
        items,
        summary,
        threshold_seconds: {
          late: HEARTBEAT_LATE_THRESHOLD_MS / 1000,
          offline: HEARTBEAT_OFFLINE_THRESHOLD_MS / 1000,
        },
      };
    } catch (error) {
      this.logger.error(
        `operation heartbeats list status=failure errorType=${this.getErrorType(
          error
        )} elapsedMs=${Date.now() - startedAt}`
      );
      throw error;
    }
  }

  private mapFailure(failure: JobFailureWithLastEvent) {
    return {
      failure_id: failure.id,
      job_id: failure.jobId,
      order_id: failure.orderId,
      source_worker: failure.sourceWorker,
      event_type: failure.eventType,
      error_code: failure.errorCode,
      message: failure.message,
      retryable: failure.retryable,
      retry_count: failure.retryCount,
      resolved_at: this.toIsoOrNull(failure.resolvedAt),
      last_event_id: failure.lastEventId,
      created_at: failure.createdAt.toISOString(),
      updated_at: failure.updatedAt.toISOString(),
      last_event: failure.lastEvent
        ? {
            event_id: failure.lastEvent.id,
            event_type: failure.lastEvent.eventType,
            source_worker: failure.lastEvent.sourceWorker,
            occurred_at: failure.lastEvent.occurredAt.toISOString(),
            result: failure.lastEvent.result,
            state_apply_status: failure.lastEvent.stateApplyStatus,
          }
        : null,
    };
  }

  private normalizeLimit(value: string | number | undefined): number {
    const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(parsed)) {
      return 50;
    }

    return Math.min(Math.max(parsed, 1), 100);
  }

  private toIsoOrNull(value: Date | null): string | null {
    return value ? value.toISOString() : null;
  }

  private getErrorType(error: unknown): string {
    return error instanceof Error && error.name ? error.name : typeof error;
  }

  private mapHeartbeat(heartbeat: ProgramHeartbeatRead, nowMs: number) {
    const lagSeconds = Math.max(0, Math.floor((nowMs - heartbeat.lastSeenAt.getTime()) / 1000));

    return {
      heartbeat_id: heartbeat.id,
      program_type: heartbeat.programType,
      instance_name: heartbeat.instanceName,
      status: this.resolveHeartbeatStatus(heartbeat, nowMs),
      stored_status: heartbeat.status,
      version: heartbeat.version,
      hostname: heartbeat.hostname,
      last_seen_at: heartbeat.lastSeenAt.toISOString(),
      lag_seconds: lagSeconds,
      created_at: heartbeat.createdAt.toISOString(),
      updated_at: heartbeat.updatedAt.toISOString(),
    };
  }

  private resolveHeartbeatStatus(
    heartbeat: Pick<ProgramHeartbeatRead, 'status' | 'lastSeenAt'>,
    nowMs: number
  ): HeartbeatStatus {
    if (heartbeat.status === 'offline') {
      return 'offline';
    }

    const ageMs = nowMs - heartbeat.lastSeenAt.getTime();
    if (ageMs > HEARTBEAT_OFFLINE_THRESHOLD_MS) {
      return 'offline';
    }
    if (ageMs > HEARTBEAT_LATE_THRESHOLD_MS) {
      return 'late';
    }

    return 'online';
  }

  private summarizeHeartbeats(items: Array<{ status: HeartbeatStatus }>) {
    return items.reduce(
      (summary, item) => {
        summary[item.status] += 1;
        summary.total += 1;
        return summary;
      },
      { total: 0, online: 0, late: 0, offline: 0 }
    );
  }
}
