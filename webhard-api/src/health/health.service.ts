import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface DatabaseStatus {
  ok: boolean;
  responseTime: number;
  error?: string;
}

export interface BasicHealthResponse {
  status: 'ok';
  uptime: number;
  timestamp: string;
}

export interface DetailedHealthResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  timestamp: string;
  database: DatabaseStatus;
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  getBasicHealth(): BasicHealthResponse {
    return {
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  async getDetailedHealth(): Promise<DetailedHealthResponse> {
    const dbStatus = await this.checkDatabase();
    const memory = process.memoryUsage();

    return {
      status: dbStatus.ok ? 'ok' : 'degraded',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: dbStatus,
      memory: {
        rss: Math.round(memory.rss / 1024 / 1024),
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
      },
    };
  }

  private async checkDatabase(): Promise<DatabaseStatus> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
      return { ok: true, responseTime: Date.now() - start };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Database health check failed: ${message}`);
      return { ok: false, responseTime: Date.now() - start, error: message };
    }
  }
}
