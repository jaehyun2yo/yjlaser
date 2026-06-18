import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from './orders.service';
import { OrderStatus } from './dto/order.dto';

@Injectable()
export class AutoDeliveryService {
  private readonly logger = new Logger(AutoDeliveryService.name);

  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleAutoDeliveryCompletion() {
    const now = new Date();

    const orders = await this.prisma.order.findMany({
      where: {
        status: 'delivering',
        scheduledAutoCompleteAt: { lte: now },
      },
    });

    if (orders.length === 0) return;

    // Process all eligible orders; each goes through updateOrderStatus for validation + event recording
    const results = await Promise.allSettled(
      orders.map((order) =>
        this.ordersService.updateOrderStatus(order.id, {
          status: OrderStatus.DELIVERED,
          actorName: 'system',
          message: '30분 경과 자동 납품완료',
        })
      )
    );

    let completed = 0;
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        this.logger.log(`Auto-delivered order: ${orders[i].id} (${orders[i].companyName})`);
        completed++;
      } else {
        this.logger.error(`Auto-delivery failed for order ${orders[i].id}: ${result.reason}`);
      }
    });

    this.logger.log(`Auto-delivery check: ${completed}/${orders.length} orders completed`);
  }
}
