import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushSubscriptionsService {
  private readonly logger = new Logger(PushSubscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findByWorkerId(workerId: string) {
    const subs = await this.prisma.pushSubscription.findMany({
      where: { workerId },
    });
    return subs.map((s) => ({
      id: s.id,
      worker_id: s.workerId,
      endpoint: s.endpoint,
      p256dh: s.p256dh,
      auth: s.auth,
      created_at: s.createdAt?.toISOString() || null,
      updated_at: s.updatedAt?.toISOString() || null,
    }));
  }

  async upsert(data: { workerId: string; endpoint: string; p256dh: string; auth: string }) {
    const sub = await this.prisma.pushSubscription.upsert({
      where: {
        workerId_endpoint: {
          workerId: data.workerId,
          endpoint: data.endpoint,
        },
      },
      create: {
        workerId: data.workerId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
      },
      update: {
        p256dh: data.p256dh,
        auth: data.auth,
        updatedAt: new Date(),
      },
    });

    return { id: sub.id };
  }

  async delete(workerId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { workerId, endpoint },
    });
    return { success: true };
  }
}
