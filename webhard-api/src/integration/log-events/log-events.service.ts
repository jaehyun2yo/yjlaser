import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  formatLogEvent,
  generateCorrelationId,
  hashIdentifier,
} from '../../common/logging/log-event';
import type { LogEventBatchDto, LogEventDto } from './dto/log-event.dto';
import type { LogIngestionAuthContext } from './auth/log-ingestion-auth';
import {
  LOG_EVENT_REPOSITORY,
  type LogEventRepository,
  type LogEventSaveResult,
} from './repositories/log-event.repository';

export type LogEventCollectResult = {
  event_id: string;
  status: LogEventSaveResult['status'];
};

export type LogEventCollectResponse = {
  accepted: number;
  duplicate: number;
  rejected: number;
  conflict: number;
  results: LogEventCollectResult[];
};

@Injectable()
export class LogEventsService {
  private readonly logger = new Logger(LogEventsService.name);

  constructor(
    @Inject(LOG_EVENT_REPOSITORY)
    private readonly repository: LogEventRepository
  ) {}

  async collect(
    authContext: LogIngestionAuthContext,
    batch: LogEventBatchDto
  ): Promise<LogEventCollectResponse> {
    const startedAt = Date.now();
    const response: LogEventCollectResponse = {
      accepted: 0,
      duplicate: 0,
      rejected: 0,
      conflict: 0,
      results: [],
    };
    const correlationId = this.getCorrelationId(batch);

    for (const event of batch.events) {
      const result = await this.repository.save({
        authContext,
        event,
        payloadHash: this.hashEventPayload(event),
      });
      response[result.status] += 1;
      response.results.push({ event_id: event.event_id, status: result.status });
    }

    const elapsedMs = Date.now() - startedAt;
    if (response.conflict > 0) {
      this.logBatchConflict(authContext, batch, response, elapsedMs, correlationId);
      throw new ConflictException({
        code: 'LOG_EVENT_ID_CONFLICT',
        message: 'LOG_EVENT_ID_CONFLICT',
        conflict: response.conflict,
      });
    }

    this.logBatchStored(authContext, batch, response, elapsedMs, correlationId);

    return response;
  }

  private hashEventPayload(event: LogEventDto): string {
    return createHash('sha256').update(JSON.stringify(event)).digest('hex');
  }

  private getCorrelationId(batch: LogEventBatchDto): string {
    return batch.events[0]?.correlation_id || generateCorrelationId('log-ingestion');
  }

  private logBatchStored(
    authContext: LogIngestionAuthContext,
    batch: LogEventBatchDto,
    response: LogEventCollectResponse,
    elapsedMs: number,
    correlationId: string
  ): void {
    this.logger.debug(
      formatLogEvent({
        level: 'debug',
        project: 'company_site',
        component: LogEventsService.name,
        feature: 'log_ingestion',
        event: 'log_event_batch_stored',
        action: 'store',
        status: 'success',
        channel: 'audit',
        correlation_id: correlationId,
        duration_ms: elapsedMs,
        count: batch.events.length,
        actor_type: 'log_client',
        actor_id_hash: hashIdentifier(authContext.clientId),
        hash_key_version: authContext.hashKeyVersion,
        metadata: {
          event_count: batch.events.length,
          accepted: response.accepted,
          duplicate: response.duplicate,
          rejected: response.rejected,
          conflict: response.conflict,
        },
      })
    );
  }

  private logBatchConflict(
    authContext: LogIngestionAuthContext,
    batch: LogEventBatchDto,
    response: LogEventCollectResponse,
    elapsedMs: number,
    correlationId: string
  ): void {
    this.logger.warn(
      formatLogEvent({
        level: 'warn',
        project: 'company_site',
        component: LogEventsService.name,
        feature: 'log_ingestion',
        event: 'log_event_batch_conflict',
        action: 'store',
        status: 'failure',
        channel: 'security',
        correlation_id: correlationId,
        duration_ms: elapsedMs,
        count: batch.events.length,
        actor_type: 'log_client',
        actor_id_hash: hashIdentifier(authContext.clientId),
        error_code: 'LOG_EVENT_ID_CONFLICT',
        hash_key_version: authContext.hashKeyVersion,
        metadata: {
          event_count: batch.events.length,
          accepted: response.accepted,
          duplicate: response.duplicate,
          rejected: response.rejected,
          conflict: response.conflict,
        },
      })
    );
  }
}
