import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
}
