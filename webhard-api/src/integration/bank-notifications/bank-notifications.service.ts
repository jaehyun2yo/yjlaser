import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  formatLogEvent,
  generateCorrelationId,
  hashIdentifier,
} from '../../common/logging/log-event';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CollectBankNotificationDto,
  CreateBackupBatchDto,
  DeleteRetentionDto,
  ListBankNotificationsQueryDto,
  MarkProcessedDto,
} from './dto/bank-notification.dto';

type BankNotificationStatus = 'accepted' | 'duplicate';

type BankNotificationEventRecord = {
  id: string;
  eventId: string;
  status: string;
  payloadHash?: string;
  postedAt?: Date;
  receivedAt?: Date;
  rawTitle?: string;
  rawText?: string;
  rawBigText?: string | null;
  rawPayload?: unknown;
};

type NormalizedCollectPayload = {
  event_id: string;
  device_id: string;
  source_app: string;
  source_package: string;
  notification_key: string;
  posted_at: string;
  raw_title: string;
  raw_text: string;
  raw_big_text?: string | null;
  raw_payload: Record<string, unknown>;
};

type BankNotificationDelegate = {
  create(input: { data: Record<string, unknown> }): Promise<BankNotificationEventRecord>;
  findUnique(input: {
    where: { eventId: string };
    select?: Record<string, boolean>;
  }): Promise<BankNotificationEventRecord | null>;
  findMany(input: Record<string, unknown>): Promise<BankNotificationEventRecord[]>;
  updateMany(input: Record<string, unknown>): Promise<{ count: number }>;
  deleteMany(input: Record<string, unknown>): Promise<{ count: number }>;
};

type BankNotificationBackupBatchDelegate = {
  create(input: { data: Record<string, unknown> }): Promise<{ id: string }>;
};

type BankNotificationPrisma = PrismaService & {
  bankNotificationEvent: BankNotificationDelegate;
  bankNotificationBackupBatch: BankNotificationBackupBatchDelegate;
};

export type CollectBankNotificationResponse = {
  event_id: string;
  status: BankNotificationStatus;
  id: string;
};

@Injectable()
export class BankNotificationsService {
  private readonly logger = new Logger(BankNotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async collect(dto: CollectBankNotificationDto): Promise<CollectBankNotificationResponse> {
    const startedAt = Date.now();
    const normalized = this.normalizeCollectPayload(dto);
    const payloadHash = this.hashCollectPayload(normalized);
    const correlationId = generateCorrelationId('bank-notification');

    try {
      const created = await this.bankNotificationEvent.create({
        data: {
          eventId: normalized.event_id,
          deviceIdHash: hashIdentifier(normalized.device_id),
          sourcePackage: normalized.source_package,
          notificationKeyHash: hashIdentifier(normalized.notification_key),
          postedAt: new Date(normalized.posted_at),
          rawTitle: normalized.raw_title,
          rawText: normalized.raw_text,
          rawBigText: normalized.raw_big_text,
          rawPayload: normalized.raw_payload,
          payloadHash,
        },
      });
      this.logCollectResult('bank_notification_collected', 'success', startedAt, correlationId, {
        event_id_hash: hashIdentifier(normalized.event_id),
        source_package: normalized.source_package,
        result: 'accepted',
      });
      return { event_id: normalized.event_id, status: 'accepted', id: created.id };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        this.logCollectResult(
          'bank_notification_collect_failed',
          'failure',
          startedAt,
          correlationId,
          {
            event_id_hash: hashIdentifier(normalized.event_id),
            error_code: 'BANK_NOTIFICATION_COLLECT_FAILED',
          }
        );
        throw error;
      }

      const existing = await this.bankNotificationEvent.findUnique({
        where: { eventId: normalized.event_id },
        select: { id: true, payloadHash: true },
      });

      if (existing) {
        this.logCollectResult('bank_notification_duplicate', 'success', startedAt, correlationId, {
          event_id_hash: hashIdentifier(normalized.event_id),
          result: 'duplicate',
          payload_hash_changed: existing.payloadHash !== payloadHash,
        });
        return { event_id: normalized.event_id, status: 'duplicate', id: existing.id };
      }

      this.logCollectResult(
        'bank_notification_duplicate_lookup_failed',
        'failure',
        startedAt,
        correlationId,
        {
          event_id_hash: hashIdentifier(normalized.event_id),
          error_code: 'BANK_NOTIFICATION_DUPLICATE_LOOKUP_FAILED',
        }
      );
      throw error;
    }
  }

  async list(query: ListBankNotificationsQueryDto): Promise<{ count: number; events: unknown[] }> {
    const where = this.buildListWhere(query);
    const events = await this.bankNotificationEvent.findMany({
      where,
      orderBy: { postedAt: 'asc' },
      take: query.limit ?? 100,
      skip: query.offset ?? 0,
    });

    const newIds = events.filter((event) => event.status === 'new').map((event) => event.id);
    if (newIds.length > 0) {
      await this.bankNotificationEvent.updateMany({
        where: { id: { in: newIds }, status: 'new' },
        data: { status: 'fetched', fetchedAt: new Date() },
      });
    }

    return {
      count: events.length,
      events: events.map((event) => this.toApiEvent(event, newIds.includes(event.id))),
    };
  }

  async markProcessed(dto: MarkProcessedDto): Promise<{ updated: number }> {
    const result = await this.bankNotificationEvent.updateMany({
      where: { eventId: { in: dto.event_ids }, deletedAt: null },
      data: { status: 'processed', processedAt: new Date() },
    });
    return { updated: result.count };
  }

  async createBackupBatch(dto: CreateBackupBatchDto): Promise<{ id: string }> {
    if (dto.event_count !== dto.event_ids.length) {
      throw new BadRequestException({
        code: 'BANK_NOTIFICATION_BACKUP_EVENT_COUNT_MISMATCH',
        message: 'BANK_NOTIFICATION_BACKUP_EVENT_COUNT_MISMATCH',
      });
    }

    const batch = await this.bankNotificationBackupBatch.create({
      data: {
        year: dto.year,
        fileName: dto.file_name,
        sha256: dto.sha256,
        eventCount: dto.event_count,
        postedFrom: new Date(dto.posted_from),
        postedTo: new Date(dto.posted_to),
      },
    });

    if (dto.event_ids.length > 0) {
      await this.bankNotificationEvent.updateMany({
        where: { eventId: { in: dto.event_ids }, deletedAt: null },
        data: { backupBatchId: batch.id },
      });
    }

    return { id: batch.id };
  }

  async deleteBackedUpRetention(dto: Partial<DeleteRetentionDto>): Promise<{ deleted: number }> {
    if (!dto.backup_batch_id) {
      throw new BadRequestException({
        code: 'BANK_NOTIFICATION_BACKUP_REQUIRED',
        message: 'BANK_NOTIFICATION_BACKUP_REQUIRED',
      });
    }

    const olderThanDays = dto.older_than_days ?? 365;
    if (olderThanDays < 365) {
      throw new BadRequestException({
        code: 'BANK_NOTIFICATION_RETENTION_MINIMUM_DAYS',
        message: 'BANK_NOTIFICATION_RETENTION_MINIMUM_DAYS',
      });
    }

    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await this.bankNotificationEvent.deleteMany({
      where: {
        backupBatchId: dto.backup_batch_id,
        postedAt: { lte: cutoff },
      },
    });
    return { deleted: result.count };
  }

  hashCollectPayload(dto: CollectBankNotificationDto): string {
    return createHash('sha256').update(stableStringify(dto)).digest('hex');
  }

  private normalizeCollectPayload(dto: CollectBankNotificationDto): NormalizedCollectPayload {
    const sourceApp = nonBlankString(dto.source_app, 'bank_tracker');
    const sourcePackage = nonBlankString(dto.source_package, sourceApp);
    const notificationKey = nonBlankString(dto.notification_key, dto.event_id);
    const rawPayload = isRecord(dto.raw_payload) ? dto.raw_payload : {};

    return {
      event_id: dto.event_id,
      device_id: dto.device_id,
      source_app: sourceApp,
      source_package: sourcePackage,
      notification_key: notificationKey,
      posted_at: dto.posted_at,
      raw_title: dto.raw_title,
      raw_text: dto.raw_text,
      raw_big_text: dto.raw_big_text,
      raw_payload: {
        ...rawPayload,
        source_app: sourceApp,
      },
    };
  }

  private buildListWhere(query: ListBankNotificationsQueryDto): Record<string, unknown> {
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.status) {
      where.status = query.status;
    }
    if (query.posted_from || query.posted_to) {
      where.postedAt = {
        ...(query.posted_from ? { gte: new Date(query.posted_from) } : {}),
        ...(query.posted_to ? { lte: new Date(query.posted_to) } : {}),
      };
    }
    return where;
  }

  private toApiEvent(
    event: BankNotificationEventRecord,
    wasFetchedNow: boolean
  ): Record<string, unknown> {
    return {
      id: event.id,
      event_id: event.eventId,
      status: wasFetchedNow ? 'fetched' : event.status,
      posted_at: event.postedAt?.toISOString?.() ?? event.postedAt,
      received_at: event.receivedAt?.toISOString?.() ?? event.receivedAt,
      raw_title: event.rawTitle,
      raw_text: event.rawText,
      raw_big_text: event.rawBigText,
      raw_payload: event.rawPayload,
    };
  }

  private logCollectResult(
    event: string,
    status: 'success' | 'failure',
    startedAt: number,
    correlationId: string,
    metadata: Record<string, unknown>
  ): void {
    const level = status === 'success' ? 'info' : 'warn';
    this.logger[level === 'info' ? 'log' : 'warn'](
      formatLogEvent({
        level,
        project: 'company_site',
        component: BankNotificationsService.name,
        feature: 'bank_notification_tracking',
        event,
        action: 'collect',
        status,
        channel: status === 'success' ? 'audit' : 'security',
        correlation_id: correlationId,
        duration_ms: Date.now() - startedAt,
        count: 1,
        metadata,
      })
    );
  }

  private get bankNotificationEvent(): BankNotificationDelegate {
    return (this.prisma as BankNotificationPrisma).bankNotificationEvent;
  }

  private get bankNotificationBackupBatch(): BankNotificationBackupBatchDelegate {
    return (this.prisma as BankNotificationPrisma).bankNotificationBackupBatch;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return isRecord(error) && error.code === 'P2002';
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function nonBlankString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
