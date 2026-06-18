import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSyncLogDto, SyncLogQueryDto, SyncLogStatus } from './dto/sync-log.dto';
import type { RecordDriveDbMismatchInput } from '../../storage/storage-repair.service';

export type PipelineStage = 'routing' | 'auto_contact';
export type PipelineEventStatus = 'failed' | 'skipped';

export interface CreatePipelineEventInput {
  filename: string;
  companyName?: string;
  stage: PipelineStage;
  status: PipelineEventStatus;
  reasonCode: string;
  fileId?: string;
  folderId?: string;
  context?: Record<string, unknown>;
}

export interface PipelineBacklogQuery {
  limit?: number;
}

export interface PipelineBacklogItem {
  id: number;
  filename: string;
  companyName: string | null;
  stage: PipelineStage | string;
  status: PipelineEventStatus | string;
  reasonCode: string;
  fileId?: string;
  folderId?: string;
  context: Record<string, unknown>;
  createdAt: string;
}

interface PipelineMetadata {
  auditKind?: unknown;
  stage?: unknown;
  pipelineStatus?: unknown;
  reasonCode?: unknown;
  fileId?: unknown;
  folderId?: unknown;
  context?: unknown;
}

const SENSITIVE_CONTEXT_KEY = /(url|token|api.?key|secret|password|authorization|cookie)/i;

@Injectable()
export class SyncLogService {
  private readonly logger = new Logger(SyncLogService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSyncLogDto) {
    const log = await this.prisma.executeWithRetry(
      () =>
        this.prisma.syncLog.create({
          data: {
            filename: dto.filename,
            companyName: dto.companyName,
            status: dto.status,
            contactId: dto.contactId,
            orderId: dto.orderId,
            errorMessage: dto.errorMessage,
            md5Hash: dto.md5Hash,
            metadata: dto.metadata ? (dto.metadata as Prisma.InputJsonValue) : undefined,
          },
        }),
      { operationName: 'syncLog.create' }
    );
    this.logger.log(`SyncLog created: ${dto.filename} -> ${dto.status}`);
    return log;
  }

  async findAll(query: SyncLogQueryDto) {
    const { status, dateFrom, dateTo, page = 1, limit = 50 } = query;
    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo);
    }

    const [total, logs] = await this.prisma.executeWithRetry(
      () =>
        Promise.all([
          this.prisma.syncLog.count({ where }),
          this.prisma.syncLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
        ]),
      { operationName: 'syncLog.findAll' }
    );

    return { logs, total, page, limit, hasMore: page * limit < total };
  }

  async getStats(date?: string) {
    const startOfDay = date ? new Date(date) : new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setHours(23, 59, 59, 999);

    const counts = await this.prisma.syncLog.groupBy({
      by: ['status'],
      _count: true,
      where: { createdAt: { gte: startOfDay, lte: endOfDay } },
    });

    const result: Record<string, number> = {
      synced: 0,
      company_not_found: 0,
      api_error: 0,
      duplicate: 0,
      skipped: 0,
    };
    counts.forEach((c) => {
      result[c.status] = c._count;
    });

    return {
      date: startOfDay.toISOString().split('T')[0],
      ...result,
      total: Object.values(result).reduce((a, b) => a + b, 0),
    };
  }

  async checkDuplicate(md5Hash: string): Promise<boolean> {
    const existing = await this.prisma.executeWithRetry(
      () => this.prisma.syncLog.findFirst({ where: { md5Hash, status: 'synced' } }),
      { operationName: 'syncLog.checkDuplicate' }
    );
    return !!existing;
  }

  async createPipelineEvent(input: CreatePipelineEventInput) {
    const status = input.status === 'failed' ? SyncLogStatus.API_ERROR : SyncLogStatus.SKIPPED;

    const metadata = {
      auditKind: 'webhard_pipeline',
      stage: input.stage,
      pipelineStatus: input.status,
      reasonCode: input.reasonCode,
      fileId: input.fileId,
      folderId: input.folderId,
      context: this.sanitizeContext(input.context),
    };

    return this.prisma.executeWithRetry(
      () =>
        this.prisma.syncLog.create({
          data: {
            filename: input.filename,
            companyName: input.companyName,
            status,
            contactId: undefined,
            orderId: undefined,
            errorMessage: input.reasonCode,
            md5Hash: undefined,
            metadata: metadata as Prisma.InputJsonValue,
          },
        }),
      { operationName: 'syncLog.createPipelineEvent' }
    );
  }

  async createStorageRepairEvent(input: RecordDriveDbMismatchInput) {
    const driveId = input.driveFileId ?? input.driveFolderId;
    const detectedAt = input.detectedAt ?? new Date();
    const metadata = {
      auditKind: 'storage_repair',
      operation: input.operation,
      storageProvider: input.storageProvider,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      driveId,
      reason: input.reason,
      detectedAt: detectedAt.toISOString(),
      driveFileId: input.driveFileId,
      driveFolderId: input.driveFolderId,
      webhardFileId: input.webhardFileId,
      webhardFolderId: input.webhardFolderId,
      expectedDbState: this.sanitizeContext(input.expectedDbState),
      actualDriveState: this.sanitizeContext(input.actualDriveState),
    };

    return this.prisma.executeWithRetry(
      () =>
        this.prisma.syncLog.create({
          data: {
            filename: driveId ?? input.resourceId ?? 'google-drive-storage',
            companyName: undefined,
            status: SyncLogStatus.API_ERROR,
            contactId: undefined,
            orderId: undefined,
            errorMessage: input.reason ?? input.operation,
            md5Hash: undefined,
            metadata: metadata as Prisma.InputJsonValue,
          },
        }),
      { operationName: 'syncLog.createStorageRepairEvent' }
    );
  }

  async findPipelineBacklog(query: PipelineBacklogQuery): Promise<PipelineBacklogItem[]> {
    const limit = query.limit ?? 50;
    const logs = await this.prisma.executeWithRetry(
      () =>
        this.prisma.syncLog.findMany({
          where: {
            status: {
              in: [SyncLogStatus.API_ERROR, SyncLogStatus.SKIPPED, SyncLogStatus.COMPANY_NOT_FOUND],
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
      { operationName: 'syncLog.findPipelineBacklog' }
    );

    return logs
      .map((log): PipelineBacklogItem | null => {
        const metadata = this.asPipelineMetadata(log.metadata);
        if (!metadata || metadata.auditKind !== 'webhard_pipeline') return null;

        return {
          id: log.id,
          filename: log.filename,
          companyName: log.companyName ?? null,
          stage: typeof metadata.stage === 'string' ? metadata.stage : 'unknown',
          status:
            typeof metadata.pipelineStatus === 'string' ? metadata.pipelineStatus : log.status,
          reasonCode:
            typeof metadata.reasonCode === 'string'
              ? metadata.reasonCode
              : (log.errorMessage ?? 'unknown'),
          fileId: typeof metadata.fileId === 'string' ? metadata.fileId : undefined,
          folderId: typeof metadata.folderId === 'string' ? metadata.folderId : undefined,
          context: this.sanitizeContext(
            this.isRecord(metadata.context) ? metadata.context : undefined
          ),
          createdAt: log.createdAt.toISOString(),
        };
      })
      .filter((item): item is PipelineBacklogItem => item !== null);
  }

  private asPipelineMetadata(value: Prisma.JsonValue | null): PipelineMetadata | null {
    if (!this.isRecord(value)) return null;
    return value;
  }

  private sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> {
    if (!context) return {};

    return Object.fromEntries(
      Object.entries(context).filter(([key, value]) => {
        if (SENSITIVE_CONTEXT_KEY.test(key)) return false;
        return this.isSerializableContextValue(value);
      })
    );
  }

  private isSerializableContextValue(value: unknown): boolean {
    if (value === null) return true;
    if (['string', 'number', 'boolean'].includes(typeof value)) return true;
    return this.isRecord(value) || Array.isArray(value);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
