import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessLogsService } from '../access-logs/access-logs.service';
import { AccessLogAction } from '../access-logs/dto/access-log.dto';
import * as crypto from 'crypto';
import {
  WorkerResponseDto,
  WorkerListResponseDto,
  PinLoginResponseDto,
  CreateWorkerDto,
  UpdateWorkerDto,
  PinLoginDto,
} from './dto/worker.dto';

@Injectable()
export class WorkersService {
  constructor(
    private prisma: PrismaService,
    private accessLogsService: AccessLogsService
  ) {}

  /**
   * Hash PIN using SHA-256
   */
  private hashPin(pin: string): string {
    return crypto.createHash('sha256').update(pin).digest('hex');
  }

  /**
   * Get all workers
   */
  async getWorkers(activeOnly: boolean = false): Promise<WorkerListResponseDto> {
    const where = activeOnly ? { isActive: true } : {};

    const workers = await this.prisma.executeWithRetry(
      () =>
        this.prisma.erpWorker.findMany({
          where,
          orderBy: { name: 'asc' },
        }),
      { operationName: 'getWorkers' }
    );

    return {
      workers: workers.map(this.mapToDto),
      total: workers.length,
    };
  }

  /**
   * Get worker by ID
   */
  async getWorker(id: string): Promise<WorkerResponseDto> {
    const worker = await this.prisma.executeWithRetry(
      () => this.prisma.erpWorker.findUnique({ where: { id } }),
      { operationName: 'getWorker' }
    );

    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    return this.mapToDto(worker);
  }

  /**
   * Create new worker
   */
  async createWorker(dto: CreateWorkerDto): Promise<WorkerResponseDto> {
    const existing = await this.prisma.erpWorker.findFirst({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Worker with this name already exists');
    }

    const createData: Prisma.ErpWorkerCreateInput = {
      name: dto.name,
      pinHash: this.hashPin(dto.pin),
      role: dto.role || 'field_worker',
      workerType: dto.workerType || null,
      allowedIps: dto.allowedIps || [],
    };

    const worker = await this.prisma.executeWithRetry(
      () =>
        this.prisma.erpWorker.create({
          data: createData,
        }),
      { operationName: 'createWorker' }
    );

    return this.mapToDto(worker);
  }

  /**
   * Update worker
   */
  async updateWorker(id: string, dto: UpdateWorkerDto): Promise<WorkerResponseDto> {
    const existing = await this.prisma.erpWorker.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Worker not found');
    }

    if (dto.name && dto.name !== existing.name) {
      const duplicate = await this.prisma.erpWorker.findFirst({
        where: { name: dto.name, id: { not: id } },
      });
      if (duplicate) {
        throw new ConflictException('Worker with this name already exists');
      }
    }

    const updateData: Record<string, unknown> = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.role) updateData.role = dto.role;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.pin) updateData.pinHash = this.hashPin(dto.pin);
    if (dto.allowedIps !== undefined) updateData.allowedIps = dto.allowedIps;
    if (dto.workerType !== undefined) updateData.workerType = dto.workerType;

    const worker = await this.prisma.executeWithRetry(
      () =>
        this.prisma.erpWorker.update({
          where: { id },
          data: updateData,
        }),
      { operationName: 'updateWorker' }
    );

    return this.mapToDto(worker);
  }

  /**
   * Delete worker
   */
  async deleteWorker(id: string): Promise<void> {
    const existing = await this.prisma.erpWorker.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Worker not found');
    }

    await this.prisma.executeWithRetry(() => this.prisma.erpWorker.delete({ where: { id } }), {
      operationName: 'deleteWorker',
    });
  }

  /**
   * PIN login with IP validation and access logging
   */
  async pinLogin(dto: PinLoginDto): Promise<PinLoginResponseDto> {
    const ipAddress = dto.ipAddress || '0.0.0.0';
    const userAgent = dto.userAgent ?? undefined;

    const rateLimitStatus = await this.accessLogsService.getPinRateLimitStatus(ipAddress);
    if (rateLimitStatus.isRateLimited) {
      await this.accessLogsService.createLog({
        ipAddress,
        userAgent,
        action: AccessLogAction.LOGIN_FAILED,
        success: false,
        metadata: {
          reason: 'rate_limited',
          failedAttempts: rateLimitStatus.failedAttempts,
          retryAfterSeconds: rateLimitStatus.retryAfterSeconds,
        },
      });

      return {
        success: false,
        worker: null,
        message: '로그인 시도가 너무 많습니다. 5분 후 다시 시도해주세요.',
        reason: 'rate_limited',
        retry_after_seconds: rateLimitStatus.retryAfterSeconds,
      };
    }

    const hashedPin = this.hashPin(dto.pin);

    const whereClause: { pinHash: string; isActive: boolean; name?: string } = {
      pinHash: hashedPin,
      isActive: true,
    };

    if (dto.name) {
      whereClause.name = dto.name;
    }

    const worker = await this.prisma.executeWithRetry(
      () =>
        this.prisma.erpWorker.findFirst({
          where: whereClause,
        }),
      { operationName: 'pinLogin.findWorker' }
    );

    if (!worker) {
      await this.accessLogsService.createLog({
        ipAddress,
        userAgent,
        action: AccessLogAction.LOGIN_FAILED,
        success: false,
        metadata: { reason: 'invalid_credentials', attemptedName: dto.name || null },
      });

      return {
        success: false,
        worker: null,
        message: dto.name ? '이름 또는 PIN이 일치하지 않습니다.' : 'PIN이 일치하지 않습니다.',
        reason: 'invalid_credentials',
      };
    }

    // IP whitelist check (empty array = allow all IPs)
    if (worker.allowedIps.length > 0 && !worker.allowedIps.includes(ipAddress)) {
      await this.accessLogsService.createLog({
        workerId: worker.id,
        ipAddress,
        userAgent,
        action: AccessLogAction.IP_BLOCKED,
        success: false,
        metadata: {
          workerName: worker.name,
          allowedIps: worker.allowedIps,
        },
      });

      return {
        success: false,
        worker: null,
        message: '허용되지 않은 IP에서의 접근입니다. 관리자에게 문의하세요.',
        reason: 'ip_blocked',
      };
    }

    // Update last login time
    await this.prisma.executeWithRetry(
      () =>
        this.prisma.erpWorker.update({
          where: { id: worker.id },
          data: { lastLoginAt: new Date() },
        }),
      { operationName: 'pinLogin.updateLastLogin' }
    );

    // Log successful login
    await this.accessLogsService.createLog({
      workerId: worker.id,
      ipAddress,
      userAgent,
      action: AccessLogAction.LOGIN_SUCCESS,
      success: true,
      metadata: { workerName: worker.name },
    });

    const token = crypto.randomBytes(32).toString('hex');

    return {
      success: true,
      worker: {
        id: worker.id,
        name: worker.name,
        role: worker.role,
        worker_type: ((worker as Record<string, unknown>).workerType as string | null) ?? null,
      },
      token,
    };
  }

  /**
   * Map database model to DTO
   * workerType is optional until prisma generate runs after migration
   */
  private mapToDto = (worker: {
    id: string;
    name: string;
    role: string;
    workerType?: string | null;
    isActive: boolean;
    allowedIps: string[];
    lastLoginAt: Date | null;
    createdAt: Date;
    [key: string]: unknown;
  }): WorkerResponseDto => ({
    id: worker.id,
    name: worker.name,
    role: worker.role,
    worker_type: (worker.workerType as string | null) ?? null,
    is_active: worker.isActive,
    allowed_ips: worker.allowedIps,
    last_login_at: worker.lastLoginAt?.toISOString() ?? null,
    created_at: worker.createdAt.toISOString(),
  });
}
