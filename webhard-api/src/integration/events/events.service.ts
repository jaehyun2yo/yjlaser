import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto, EventQueryDto } from './dto/event.dto';
import { OrdersService } from '../orders/orders.service';
import { ContactStatus } from '../orders/dto/order.dto';

// 이벤트 타입 -> 자동 상태 전환 매핑
const AUTO_STATUS_MAP: Record<string, string> = {
  file_synced: 'drawing_received',
  file_classified: 'file_classified',
  nesting_started: 'nesting_queued',
  nesting_completed: 'nesting_complete',
};

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService
  ) {}

  async createEvent(dto: CreateEventDto) {
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
        this.logger.log(
          `Auto status transition: ${dto.orderId} ${fromStatus} -> ${autoStatus} (${dto.eventType})`
        );
      } catch (err) {
        this.logger.warn(`Auto status transition failed for ${dto.orderId}: ${err}`);
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
      this.logger.warn(`Auto stock out failed for order ${orderId}: ${err}`);
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
