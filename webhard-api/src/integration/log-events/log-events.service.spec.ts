import { ConflictException, Logger } from '@nestjs/common';
import { hashIdentifier } from '../../common/logging/log-event';
import type { LogEventBatchDto, LogEventDto } from './dto/log-event.dto';
import { LogEventsService } from './log-events.service';
import { InMemoryLogEventRepository } from './repositories/log-event.repository';

type LoggedBackendEvent = {
  schema_version: 1;
  event: string;
  level: string;
  project: string;
  component: string;
  feature: string;
  action: string;
  status: string;
  channel: string;
  correlation_id: string;
  metadata?: Record<string, unknown>;
  actor_id_hash?: string;
  error_code?: string;
};

function makeEvent(input?: Partial<LogEventDto>): LogEventDto {
  return {
    schema_version: 1,
    event_id: input?.event_id ?? 'evt-service-1',
    timestamp: input?.timestamp ?? '2026-06-22T00:00:00.000Z',
    level: input?.level ?? 'info',
    project: input?.project ?? 'company_site',
    component: input?.component ?? 'LogEventsServiceSpec',
    feature: input?.feature ?? 'log_collection',
    event: input?.event ?? 'service_test',
    action: input?.action ?? 'collect',
    status: input?.status ?? 'success',
    channel: input?.channel ?? 'audit',
    correlation_id: input?.correlation_id ?? 'log-20260622-000000-service',
    metadata: input?.metadata ?? { processed_count: 1 },
    hash_key_version: input?.hash_key_version ?? 'v1',
  };
}

function makeBatch(events: LogEventDto[]): LogEventBatchDto {
  return { events };
}

function serializeLoggerCalls(...spies: jest.SpyInstance[]): string {
  return JSON.stringify(readLoggerMessages(spies));
}

function parseJsonLogEvents(...spies: jest.SpyInstance[]): LoggedBackendEvent[] {
  return readLoggerMessages(spies)
    .map((value) => {
      try {
        return JSON.parse(value) as Partial<LoggedBackendEvent>;
      } catch {
        return null;
      }
    })
    .filter(
      (value): value is LoggedBackendEvent =>
        value?.schema_version === 1 && typeof value.event === 'string'
    );
}

function readLoggerMessages(spies: jest.SpyInstance[]): string[] {
  return spies.flatMap((spy) =>
    spy.mock.calls.flatMap((call: unknown[]) => call.map((value: unknown) => String(value)))
  );
}

function findJsonLogEvent(spy: jest.SpyInstance, eventName: string): LoggedBackendEvent {
  const event = parseJsonLogEvents(spy).find((candidate) => candidate.event === eventName);
  if (!event) {
    throw new Error(`Missing JSON log event: ${eventName}`);
  }
  return event;
}

describe('LogEventsService', () => {
  it('동일 event_id와 동일 payload_hash는 duplicate로 응답한다', async () => {
    const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const service = new LogEventsService(new InMemoryLogEventRepository());
    const authContext = { clientId: 'company-site', keyId: 'local-test-key', hashKeyVersion: 'v1' };
    const batch = makeBatch([makeEvent()]);

    const first = await service.collect(authContext, batch);
    const second = await service.collect(authContext, batch);

    expect(first).toMatchObject({ accepted: 1, duplicate: 0, rejected: 0, conflict: 0 });
    expect(second).toMatchObject({ accepted: 0, duplicate: 1, rejected: 0, conflict: 0 });

    const storedEvents = parseJsonLogEvents(debugSpy).filter(
      (event) => event.event === 'log_event_batch_stored'
    );
    expect(storedEvents).toHaveLength(2);
    expect(storedEvents[1]).toMatchObject({
      level: 'debug',
      project: 'company_site',
      component: 'LogEventsService',
      feature: 'log_ingestion',
      action: 'store',
      status: 'success',
      channel: 'audit',
      actor_id_hash: hashIdentifier(authContext.clientId),
      metadata: {
        event_count: 1,
        accepted: 0,
        duplicate: 1,
      },
    });
    expect(serializeLoggerCalls(debugSpy, warnSpy)).not.toContain(authContext.clientId);
    expect(serializeLoggerCalls(debugSpy, warnSpy)).not.toContain(authContext.keyId);
  });

  it('동일 event_id에 다른 payload_hash가 오면 409 conflict로 거부한다', async () => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const service = new LogEventsService(new InMemoryLogEventRepository());
    const authContext = { clientId: 'company-site', keyId: 'local-test-key', hashKeyVersion: 'v1' };

    await service.collect(
      authContext,
      makeBatch([makeEvent({ metadata: { processed_count: 1 } })])
    );

    await expect(
      service.collect(authContext, makeBatch([makeEvent({ metadata: { processed_count: 2 } })]))
    ).rejects.toThrow(ConflictException);

    const event = findJsonLogEvent(warnSpy, 'log_event_batch_conflict');
    expect(event).toMatchObject({
      level: 'warn',
      project: 'company_site',
      component: 'LogEventsService',
      feature: 'log_ingestion',
      action: 'store',
      status: 'failure',
      channel: 'security',
      actor_id_hash: hashIdentifier(authContext.clientId),
      error_code: 'LOG_EVENT_ID_CONFLICT',
      metadata: {
        event_count: 1,
        conflict: 1,
      },
    });
    expect(serializeLoggerCalls(warnSpy)).not.toContain(authContext.clientId);
    expect(serializeLoggerCalls(warnSpy)).not.toContain(authContext.keyId);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
