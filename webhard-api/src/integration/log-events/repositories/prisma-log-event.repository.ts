import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hashIdentifier } from '../../../common/logging/log-event';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  LogEventSaveInput,
  LogEventSaveResult,
  LogEventRepository,
} from './log-event.repository';

const CHANNEL_RETENTION_DAYS: Record<string, number> = {
  debug: 7,
  perf: 14,
  error: 90,
  audit: 180,
  external: 180,
  security: 365,
};

@Injectable()
export class PrismaLogEventRepository implements LogEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(input: LogEventSaveInput): Promise<LogEventSaveResult> {
    const clientIdHash = hashIdentifier(input.authContext.clientId);
    const keyIdHash = hashIdentifier(input.authContext.keyId);

    try {
      await this.prisma.logEvent.create({
        data: {
          schemaVersion: input.event.schema_version,
          eventId: input.event.event_id,
          correlationId: input.event.correlation_id,
          occurredAt: new Date(input.event.timestamp),
          level: input.event.level,
          project: input.event.project,
          component: input.event.component,
          feature: input.event.feature,
          event: input.event.event,
          action: input.event.action,
          status: input.event.status,
          channel: input.event.channel,
          durationMs: input.event.duration_ms,
          count: input.event.count,
          actorType: input.event.actor_type,
          actorIdHash: input.event.actor_id_hash,
          targetType: input.event.target_type,
          targetIdHash: input.event.target_id_hash,
          errorType: input.event.error_type,
          errorCode: input.event.error_code,
          errorMessage: input.event.error_message,
          hashKeyVersion: input.event.hash_key_version ?? input.authContext.hashKeyVersion,
          spanId: input.event.span_id,
          metadata: input.event.metadata as Prisma.InputJsonValue | undefined,
          clientIdHash,
          keyIdHash,
          payloadHash: input.payloadHash,
          retentionExpiresAt: this.calculateRetentionExpiresAt(input.event.channel),
          legalHold: false,
        },
      });
      return { status: 'accepted' };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const existing = await this.prisma.logEvent.findUnique({
        where: {
          clientIdHash_eventId: {
            clientIdHash,
            eventId: input.event.event_id,
          },
        },
        select: {
          payloadHash: true,
        },
      });

      if (existing?.payloadHash === input.payloadHash) {
        return { status: 'duplicate' };
      }

      return { status: 'conflict' };
    }
  }

  private calculateRetentionExpiresAt(channel: string): Date {
    const days = CHANNEL_RETENTION_DAYS[channel] ?? CHANNEL_RETENTION_DAYS.error;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2002';
  }

  return isRecord(error) && error.code === 'P2002';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
