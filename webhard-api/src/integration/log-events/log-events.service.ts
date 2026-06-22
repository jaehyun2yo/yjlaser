import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
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
      this.logger.warn(
        `Log event batch conflict: clientId=${authContext.clientId}, eventCount=${batch.events.length}, conflict=${response.conflict}, elapsedMs=${elapsedMs}`
      );
      throw new ConflictException({
        code: 'LOG_EVENT_ID_CONFLICT',
        message: 'LOG_EVENT_ID_CONFLICT',
        conflict: response.conflict,
      });
    }

    this.logger.debug(
      `Log event batch stored: clientId=${authContext.clientId}, eventCount=${batch.events.length}, accepted=${response.accepted}, duplicate=${response.duplicate}, elapsedMs=${elapsedMs}`
    );

    return response;
  }

  private hashEventPayload(event: LogEventDto): string {
    return createHash('sha256').update(JSON.stringify(event)).digest('hex');
  }
}
