import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateDeliveryDto,
  UpdateDeliveryDto,
  UpdateDeliveryStatusDto,
  DeliveryQueryDto,
  VALID_DELIVERY_TRANSITIONS,
} from './dto/delivery.dto';
import { OrdersService } from '../orders/orders.service';
import { ContactStatus } from '../orders/dto/order.dto';

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService
  ) {}

  async getDeliveries(query: DeliveryQueryDto) {
    const { status, dateFrom, dateTo, orderId, page = 1, limit = 50 } = query;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (orderId) where.orderId = orderId;
    if (dateFrom || dateTo) {
      where.scheduledDate = {};
      if (dateFrom) (where.scheduledDate as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.scheduledDate as Record<string, unknown>).lte = new Date(dateTo);
    }

    const [total, deliveries] = await this.prisma.executeWithRetry(
      () =>
        Promise.all([
          this.prisma.delivery.count({ where }),
          this.prisma.delivery.findMany({
            where,
            include: {
              order: {
                select: { id: true, title: true, companyName: true, status: true },
              },
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
        ]),
      { operationName: 'getDeliveries' }
    );

    return {
      deliveries: deliveries.map(this.mapToDto),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  async getDeliverySchedule(dateFrom: string, dateTo: string) {
    const deliveries = await this.prisma.executeWithRetry(
      () =>
        this.prisma.delivery.findMany({
          where: {
            scheduledDate: {
              gte: new Date(dateFrom),
              lte: new Date(dateTo),
            },
            status: { notIn: ['delivered', 'returned'] },
          },
          include: {
            order: {
              select: { id: true, title: true, companyName: true },
            },
          },
          orderBy: { scheduledDate: 'asc' },
        }),
      { operationName: 'getDeliverySchedule' }
    );

    return deliveries.map(this.mapToDto);
  }

  async getDelivery(id: string) {
    const delivery = await this.prisma.executeWithRetry(
      () =>
        this.prisma.delivery.findUnique({
          where: { id },
          include: {
            order: {
              select: { id: true, title: true, companyName: true, status: true },
            },
          },
        }),
      { operationName: 'getDelivery' }
    );

    if (!delivery) throw new NotFoundException('Delivery not found');
    return this.mapToDto(delivery);
  }

  async createDelivery(dto: CreateDeliveryDto) {
    // 주문 존재 확인
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const delivery = await this.prisma.executeWithRetry(
      () =>
        this.prisma.delivery.create({
          data: {
            orderId: dto.orderId,
            deliveryType: dto.deliveryType,
            recipientName: dto.recipientName,
            recipientPhone: dto.recipientPhone,
            address: dto.address,
            scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
            note: dto.note,
          },
          include: {
            order: {
              select: { id: true, title: true, companyName: true, status: true },
            },
          },
        }),
      { operationName: 'createDelivery' }
    );

    this.logger.log(`Delivery created: ${delivery.id} for order ${dto.orderId}`);
    return this.mapToDto(delivery);
  }

  async updateDelivery(id: string, dto: UpdateDeliveryDto) {
    const existing = await this.prisma.delivery.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Delivery not found');

    const data: Record<string, unknown> = {};
    if (dto.recipientName !== undefined) data.recipientName = dto.recipientName;
    if (dto.recipientPhone !== undefined) data.recipientPhone = dto.recipientPhone;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.trackingNumber !== undefined) data.trackingNumber = dto.trackingNumber;
    if (dto.courierCompany !== undefined) data.courierCompany = dto.courierCompany;
    if (dto.scheduledDate !== undefined) data.scheduledDate = new Date(dto.scheduledDate);
    if (dto.note !== undefined) data.note = dto.note;

    const delivery = await this.prisma.executeWithRetry(
      () =>
        this.prisma.delivery.update({
          where: { id },
          data,
          include: {
            order: {
              select: { id: true, title: true, companyName: true, status: true },
            },
          },
        }),
      { operationName: 'updateDelivery' }
    );

    return this.mapToDto(delivery);
  }

  async updateDeliveryStatus(id: string, dto: UpdateDeliveryStatusDto) {
    const existing = await this.prisma.delivery.findUnique({
      where: { id },
      include: { order: { select: { id: true, status: true } } },
    });
    if (!existing) throw new NotFoundException('Delivery not found');

    const validTransitions = VALID_DELIVERY_TRANSITIONS[existing.status] || [];
    if (!validTransitions.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from '${existing.status}' to '${dto.status}'. Valid: ${validTransitions.join(', ')}`
      );
    }

    const data: Record<string, unknown> = { status: dto.status };
    if (dto.status === 'in_transit') data.shippedAt = new Date();
    if (dto.status === 'delivered') data.deliveredAt = new Date();

    const delivery = await this.prisma.executeWithRetry(
      () =>
        this.prisma.delivery.update({
          where: { id },
          data,
          include: {
            order: {
              select: { id: true, title: true, companyName: true, status: true },
            },
          },
        }),
      { operationName: 'updateDeliveryStatus' }
    );

    // Sync order status to delivered via OrdersService (validates VALID_STATUS_TRANSITIONS + records OrderEvent)
    if (dto.status === 'delivered' && existing.order) {
      try {
        await this.ordersService.updateOrderStatus(existing.order.id, {
          status: ContactStatus.DELIVERED,
          actorName: 'system',
          message: '납품 완료 처리',
        });
        this.logger.log(`Order ${existing.order.id} marked as delivered`);
      } catch (err) {
        this.logger.warn(`Failed to update order status on delivery: ${err}`);
      }
    }

    this.logger.log(`Delivery ${id} status: ${existing.status} -> ${dto.status}`);
    return this.mapToDto(delivery);
  }

  private mapToDto = (delivery: {
    id: string;
    orderId: string;
    deliveryType: string;
    status: string;
    recipientName: string | null;
    recipientPhone: string | null;
    address: string | null;
    trackingNumber: string | null;
    courierCompany: string | null;
    scheduledDate: Date | null;
    shippedAt: Date | null;
    deliveredAt: Date | null;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
    order?: { id: string; title: string; companyName: string; status?: string };
  }) => ({
    id: delivery.id,
    order_id: delivery.orderId,
    delivery_type: delivery.deliveryType,
    status: delivery.status,
    recipient_name: delivery.recipientName,
    recipient_phone: delivery.recipientPhone,
    address: delivery.address,
    tracking_number: delivery.trackingNumber,
    courier_company: delivery.courierCompany,
    scheduled_date: delivery.scheduledDate?.toISOString() ?? null,
    shipped_at: delivery.shippedAt?.toISOString() ?? null,
    delivered_at: delivery.deliveredAt?.toISOString() ?? null,
    note: delivery.note,
    created_at: delivery.createdAt.toISOString(),
    updated_at: delivery.updatedAt.toISOString(),
    order: delivery.order
      ? {
          id: delivery.order.id,
          title: delivery.order.title,
          company_name: delivery.order.companyName,
          status: delivery.order.status ?? null,
        }
      : undefined,
  });
}
