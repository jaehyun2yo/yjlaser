import { ConflictException, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto, EventQueryDto } from './dto/event.dto';
import type { EventEnvelopeDto } from './dto/event-envelope.dto';
import type { EventAppliedStateChangeDto, EventResponseDto } from './dto/event-response.dto';
import { OrdersService } from '../orders/orders.service';
import { ContactStatus } from '../orders/dto/order.dto';
import {
  sanitizeIntegrationEventData,
  sanitizeIntegrationEventText,
} from '../../common/sensitive-data-sanitizer.util';
import { resolveOrderStateEventEffects } from '../state/order-state-event-effect';

// 이벤트 타입 -> 자동 상태 전환 매핑
const AUTO_STATUS_MAP: Record<string, string> = {
  file_synced: 'drawing_received',
  file_classified: 'file_classified',
  nesting_started: 'nesting_queued',
  nesting_completed: 'nesting_complete',
};

const JOB_EVENT_STATE_APPLY_FAILED = 'STATE_APPLY_FAILED';
const JOB_EVENT_WORKER_REPORTED_FAILED = 'WORKER_REPORTED_FAILED';

type JobEventFailureDetails = {
  errorCode: string;
  message: string;
  retryable: boolean;
  logReason: string;
};

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService
  ) {}

  async createEvent(dto: CreateEventDto | EventEnvelopeDto) {
    if (this.isEventEnvelopeDto(dto)) {
      return this.createJobEvent(dto);
    }

    return this.createLegacyOrderEvent(dto);
  }

  private async createJobEvent(dto: EventEnvelopeDto): Promise<EventResponseDto> {
    const startedAt = Date.now();
    const logContext = this.getJobEventLogContext(dto);
    const processedCount = dto.processed_count ?? 0;
    this.logger.debug(`Job event create started: ${logContext}, processedCount=${processedCount}`);

    try {
      const response = await this.prisma.executeWithRetry(
        () => this.prisma.$transaction((tx) => this.createJobEventInTransaction(tx, dto)),
        { operationName: 'createJobEventTransaction' }
      );
      const elapsedMs = Date.now() - startedAt;

      if (response.accepted) {
        this.logger.debug(
          `Job event create succeeded: eventId=${response.event_id}, duplicate=${response.duplicate}, ${logContext}, processedCount=${processedCount}, elapsedMs=${elapsedMs}`
        );
      } else {
        this.logger.warn(
          `Job event create failed: eventId=${response.event_id}, duplicate=${response.duplicate}, failureId=${response.failure_id}, errorCode=${response.error.code}, retryable=${response.error.retryable ?? false}, ${logContext}, processedCount=${processedCount}, elapsedMs=${elapsedMs}`
        );
      }

      return response;
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      this.logger.error(
        `Job event create errored: ${logContext}, processedCount=${processedCount}, elapsedMs=${elapsedMs}, error=${this.getErrorType(error)}`
      );
      throw error;
    }
  }

  private async createJobEventInTransaction(
    tx: Prisma.TransactionClient,
    dto: EventEnvelopeDto
  ): Promise<EventResponseDto> {
    const existingEvent = await tx.jobEvent.findUnique({
      where: { idempotencyKey: dto.idempotency_key },
      select: {
        id: true,
        stateApplyStatus: true,
        failureId: true,
        failure: {
          select: {
            errorCode: true,
            message: true,
            retryable: true,
          },
        },
      },
    });

    if (existingEvent) {
      this.logger.debug(
        `Duplicate job event ignored: eventId=${existingEvent.id}, sourceWorker=${dto.source_worker}, eventType=${dto.event_type}`
      );

      return this.getDuplicateJobEventResponse(existingEvent);
    }

    const createdEvent = await tx.jobEvent.create({
      data: {
        idempotencyKey: dto.idempotency_key,
        eventType: dto.event_type,
        eventVersion: dto.event_version,
        sourceWorker: dto.source_worker,
        sourceVersion: dto.source_version ?? null,
        orderId: dto.order_id ?? null,
        jobId: dto.job_id ?? null,
        integrationRunId: dto.integration_run_id ?? null,
        workerLocalId: dto.worker_local_id ?? null,
        result: dto.result,
        occurredAt: new Date(dto.occurred_at),
        durationMs: dto.duration_ms ?? null,
        processedCount: dto.processed_count ?? null,
        payload: sanitizeIntegrationEventData(dto.payload) as Prisma.InputJsonValue,
        stateApplyStatus: 'not_applicable',
      },
      select: { id: true },
    });

    if (dto.result === 'failed') {
      return this.createJobFailureResponse(
        tx,
        dto,
        createdEvent.id,
        this.getWorkerReportedFailureDetails(dto)
      );
    }

    try {
      const appliedStateChanges = await this.applyJobEventStateEffect(tx, dto);

      if (appliedStateChanges.length > 0) {
        await tx.jobEvent.update({
          where: { id: createdEvent.id },
          data: { stateApplyStatus: 'applied' },
          select: { id: true },
        });
      }

      this.logger.debug(
        `Job event created: eventId=${createdEvent.id}, sourceWorker=${dto.source_worker}, eventType=${dto.event_type}`
      );

      return {
        event_id: createdEvent.id,
        duplicate: false,
        accepted: true,
        applied_state_changes: appliedStateChanges,
      };
    } catch {
      return this.createJobFailureResponse(tx, dto, createdEvent.id, {
        errorCode: JOB_EVENT_STATE_APPLY_FAILED,
        message: this.getStateApplyFailureMessage(dto.event_type),
        retryable: true,
        logReason: 'state_apply_failed',
      });
    }
  }

  private async createJobFailureResponse(
    tx: Prisma.TransactionClient,
    dto: EventEnvelopeDto,
    eventId: string,
    failureDetails: JobEventFailureDetails
  ): Promise<EventResponseDto> {
    const failureMessage = sanitizeIntegrationEventText(failureDetails.message);
    const failure = await tx.jobFailure.create({
      data: {
        jobId: dto.job_id ?? null,
        orderId: dto.order_id ?? null,
        sourceWorker: dto.source_worker,
        eventType: dto.event_type,
        errorCode: failureDetails.errorCode,
        message: failureMessage,
        retryable: failureDetails.retryable,
        lastEventId: eventId,
      },
      select: { id: true },
    });

    await tx.jobEvent.update({
      where: { id: eventId },
      data: {
        stateApplyStatus: 'failed',
        failureId: failure.id,
      },
      select: { id: true },
    });

    this.logger.warn(
      `Job event failure recorded: eventId=${eventId}, failureId=${failure.id}, sourceWorker=${dto.source_worker}, eventType=${dto.event_type}, errorCode=${failureDetails.errorCode}, reason=${failureDetails.logReason}`
    );

    return {
      event_id: eventId,
      duplicate: false,
      accepted: false,
      state_apply_status: 'failed',
      failure_id: failure.id,
      applied_state_changes: [],
      error: {
        code: failureDetails.errorCode,
        message: failureMessage,
        retryable: failureDetails.retryable,
      },
    };
  }

  private getDuplicateJobEventResponse(existingEvent: {
    id: string;
    stateApplyStatus: string;
    failureId: string | null;
    failure: {
      errorCode: string;
      message: string | null;
      retryable: boolean;
    } | null;
  }): EventResponseDto {
    if (
      existingEvent.stateApplyStatus === 'failed' &&
      existingEvent.failureId &&
      existingEvent.failure
    ) {
      return {
        event_id: existingEvent.id,
        duplicate: true,
        accepted: false,
        state_apply_status: 'failed',
        failure_id: existingEvent.failureId,
        applied_state_changes: [],
        error: {
          code: existingEvent.failure.errorCode,
          message: sanitizeIntegrationEventText(
            existingEvent.failure.message ?? 'Job event failed'
          ),
          retryable: existingEvent.failure.retryable,
        },
      };
    }

    return {
      event_id: existingEvent.id,
      duplicate: true,
      accepted: true,
      applied_state_changes: [],
    };
  }

  private async applyJobEventStateEffect(
    tx: Prisma.TransactionClient,
    dto: EventEnvelopeDto
  ): Promise<EventAppliedStateChangeDto[]> {
    const resolution = resolveOrderStateEventEffects(dto.event_type, dto.payload);
    if (!resolution.ok) {
      throw new Error('Invalid order state event payload');
    }
    if (resolution.effects.length === 0) {
      return [];
    }
    if (!dto.order_id) {
      throw new Error('Order state event requires order_id');
    }

    const data = Object.fromEntries(
      resolution.effects.map((effect) => [effect.dbField, effect.value])
    ) as Prisma.OrderUpdateManyMutationInput;
    const updateResult = await tx.order.updateMany({
      where: { id: dto.order_id },
      data,
    });
    if (updateResult.count !== 1) {
      throw new Error('Order state event target order not found');
    }

    return resolution.effects.map((effect) => ({
      target: effect.target,
      id: dto.order_id as string,
      field: effect.eventField,
      value: effect.value,
    }));
  }

  private getStateApplyFailureMessage(eventType: string): string {
    return `State apply failed for event type ${eventType}`;
  }

  private getWorkerReportedFailureDetails(dto: EventEnvelopeDto): JobEventFailureDetails {
    return {
      errorCode: dto.error?.code ?? JOB_EVENT_WORKER_REPORTED_FAILED,
      message: dto.error?.message ?? this.getWorkerReportedFailureMessage(dto.event_type),
      retryable: dto.error?.retryable ?? false,
      logReason: 'worker_reported_failed',
    };
  }

  private getWorkerReportedFailureMessage(eventType: string): string {
    return `Worker reported failed event type ${eventType}`;
  }

  private getJobEventLogContext(dto: EventEnvelopeDto): string {
    return `sourceWorker=${dto.source_worker}, eventType=${dto.event_type}, idempotencyKeyHash=${this.getIdempotencyKeyHash(dto.idempotency_key)}`;
  }

  private getIdempotencyKeyHash(idempotencyKey: string): string {
    return createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 16);
  }

  private getErrorType(error: unknown): string {
    return error instanceof Error ? error.name : typeof error;
  }

  private getStateApplyFailureResponse(eventId: string, eventType: string) {
    return {
      event_id: eventId,
      accepted: false,
      state_apply_status: 'failed',
      error: {
        code: JOB_EVENT_STATE_APPLY_FAILED,
        message: this.getStateApplyFailureMessage(eventType),
        retryable: true,
      },
    };
  }

  private getLegacyStateApplyFailureException(eventId: string, eventType: string) {
    return new ConflictException(this.getStateApplyFailureResponse(eventId, eventType));
  }

  private logLegacyStateApplyFailure(eventId: string, orderId: string, eventType: string) {
    this.logger.warn(
      `Legacy event state apply failed: eventId=${eventId}, orderId=${orderId}, eventType=${eventType}`
    );
  }

  private logLegacyStateApplySuccess(
    orderId: string,
    fromStatus: string | null,
    autoStatus: string,
    eventType: string
  ) {
    this.logger.debug(
      `Auto status transition: ${orderId} ${fromStatus} -> ${autoStatus} (${eventType})`
    );
  }

  private isEventEnvelopeDto(dto: CreateEventDto | EventEnvelopeDto): dto is EventEnvelopeDto {
    return 'idempotency_key' in dto;
  }

  private async createLegacyOrderEvent(dto: CreateEventDto) {
    // 현재 주문 상태 조회
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: { status: true },
    });

    const fromStatus = order?.status ?? null;
    const autoStatus = AUTO_STATUS_MAP[dto.eventType];

    const event = await this.prisma.executeWithRetry(
      () =>
        this.prisma.orderEvent.create({
          data: {
            orderId: dto.orderId,
            eventType: dto.eventType,
            fromStatus,
            toStatus: autoStatus ?? fromStatus,
            source: dto.source,
            actorName: dto.actorName ?? null,
            data: dto.data ? (dto.data as object) : undefined,
            message: dto.message ?? null,
          },
        }),
      { operationName: 'createEvent' }
    );

    // Auto status transition via OrdersService (validates VALID_STATUS_TRANSITIONS)
    if (autoStatus && order && order.status !== autoStatus) {
      try {
        await this.ordersService.updateOrderStatus(dto.orderId, {
          status: autoStatus as ContactStatus,
          actorName: dto.source ?? 'system',
          message: `Auto transition via ${dto.eventType}`,
        });
        this.logLegacyStateApplySuccess(dto.orderId, fromStatus, autoStatus, dto.eventType);
      } catch {
        this.logLegacyStateApplyFailure(event.id, dto.orderId, dto.eventType);
        throw this.getLegacyStateApplyFailureException(event.id, dto.eventType);
      }
    }

    // 네스팅 완료 시 합판 자동 출고
    if (dto.eventType === 'nesting_completed' && dto.data) {
      await this.handleNestingPlywoodUsage(dto.orderId, dto.data);
    }

    this.logger.debug(
      `Event created: ${dto.eventType} from ${dto.source} for order ${dto.orderId}`
    );
    return this.mapEventToDto(event);
  }

  async createBatchEvents(events: CreateEventDto[]) {
    // Events that trigger auto status transitions must go through createEvent (sequential)
    // Events without status transitions can be bulk-inserted via createMany
    const statusTransitionEvents = events.filter((e) => AUTO_STATUS_MAP[e.eventType]);
    const plainEvents = events.filter((e) => !AUTO_STATUS_MAP[e.eventType]);

    const results = [];

    // Bulk insert plain events (no status transition side effects)
    if (plainEvents.length > 0) {
      const orderIds = [...new Set(plainEvents.map((e) => e.orderId))];
      const orders = await this.prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, status: true },
      });
      const statusByOrderId = new Map(orders.map((o) => [o.id, o.status]));

      await this.prisma.orderEvent.createMany({
        data: plainEvents.map((dto) => ({
          orderId: dto.orderId,
          eventType: dto.eventType,
          fromStatus: statusByOrderId.get(dto.orderId) ?? null,
          toStatus: statusByOrderId.get(dto.orderId) ?? null,
          source: dto.source,
          actorName: dto.actorName ?? null,
          data: dto.data ? (dto.data as object) : undefined,
          message: dto.message ?? null,
        })),
        skipDuplicates: true,
      });
    }

    // Sequential processing for events that trigger status transitions
    for (const dto of statusTransitionEvents) {
      const result = await this.createEvent(dto);
      results.push(result);
    }

    return results;
  }

  async getEvents(query: EventQueryDto) {
    const { source, eventType, orderId, dateFrom, dateTo, page = 1, limit = 50 } = query;

    const where: Record<string, unknown> = {};
    if (source) where.source = source;
    if (eventType) where.eventType = eventType;
    if (orderId) where.orderId = orderId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo);
    }

    const [total, events] = await this.prisma.executeWithRetry(
      () =>
        Promise.all([
          this.prisma.orderEvent.count({ where }),
          this.prisma.orderEvent.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
        ]),
      { operationName: 'getEvents' }
    );

    return {
      events: events.map(this.mapEventToDto),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  /**
   * 네스팅 완료 시 합판 자동 출고 처리
   */
  private async handleNestingPlywoodUsage(orderId: string, data: Record<string, unknown>) {
    const plywoodUsage = data.plywood_usage as
      | Array<{ item_id: string; quantity: number }>
      | undefined;
    if (!plywoodUsage || !Array.isArray(plywoodUsage)) return;

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const usage of plywoodUsage) {
          const item = await tx.inventoryItem.findUnique({
            where: { id: usage.item_id },
          });
          if (!item) continue;

          // Guard against negative stock
          if (item.currentStock < usage.quantity) {
            this.logger.warn(
              `Insufficient stock for item ${usage.item_id}: available=${item.currentStock}, requested=${usage.quantity} — skipping`
            );
            continue;
          }

          const prev = item.currentStock;
          const updatedItem = await tx.inventoryItem.update({
            where: { id: usage.item_id },
            data: { currentStock: { decrement: usage.quantity } },
          });

          await tx.inventoryTransaction.create({
            data: {
              itemId: usage.item_id,
              type: 'out',
              quantity: usage.quantity,
              previousStock: prev,
              newStock: updatedItem.currentStock,
              orderId,
              reason: '네스팅 자동 출고',
              actorName: 'system',
            },
          });
          this.logger.log(
            `Auto stock out: item ${usage.item_id}, qty ${usage.quantity} for order ${orderId}`
          );
        }
      });
    } catch (err) {
      this.logger.warn(
        `Auto stock out failed: orderId=${orderId}, error=${this.getErrorType(err)}`
      );
    }
  }

  private mapEventToDto = (event: {
    id: string;
    orderId: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    source: string;
    actorName: string | null;
    data: unknown;
    message: string | null;
    createdAt: Date;
  }) => ({
    id: event.id,
    order_id: event.orderId,
    event_type: event.eventType,
    from_status: event.fromStatus,
    to_status: event.toStatus,
    source: event.source,
    actor_name: event.actorName,
    data: event.data,
    message: event.message,
    created_at: event.createdAt.toISOString(),
  });
}
