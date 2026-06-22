import { Injectable } from '@nestjs/common';
import type { LogEventDto } from '../dto/log-event.dto';
import type { LogIngestionAuthContext } from '../auth/log-ingestion-auth';

export const LOG_EVENT_REPOSITORY = Symbol('LOG_EVENT_REPOSITORY');

export type LogEventSaveInput = {
  authContext: LogIngestionAuthContext;
  event: LogEventDto;
  payloadHash: string;
};

export type LogEventSaveResult = {
  status: 'accepted' | 'duplicate' | 'conflict';
};

export interface LogEventRepository {
  save(input: LogEventSaveInput): Promise<LogEventSaveResult>;
}

@Injectable()
export class InMemoryLogEventRepository implements LogEventRepository {
  private readonly events = new Map<string, { payloadHash: string }>();

  async save(input: LogEventSaveInput): Promise<LogEventSaveResult> {
    const mapKey = `${input.authContext.clientId}:${input.event.event_id}`;
    const existing = this.events.get(mapKey);

    if (existing) {
      if (existing.payloadHash === input.payloadHash) {
        return { status: 'duplicate' };
      }

      return { status: 'conflict' };
    }

    this.events.set(mapKey, { payloadHash: input.payloadHash });
    return { status: 'accepted' };
  }
}
