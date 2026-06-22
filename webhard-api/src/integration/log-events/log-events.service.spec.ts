import { ConflictException } from '@nestjs/common';
import type { LogEventBatchDto, LogEventDto } from './dto/log-event.dto';
import { LogEventsService } from './log-events.service';
import { InMemoryLogEventRepository } from './repositories/log-event.repository';

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

describe('LogEventsService', () => {
  it('동일 event_id와 동일 payload_hash는 duplicate로 응답한다', async () => {
    const service = new LogEventsService(new InMemoryLogEventRepository());
    const authContext = { clientId: 'company-site', keyId: 'local-test-key', hashKeyVersion: 'v1' };
    const batch = makeBatch([makeEvent()]);

    const first = await service.collect(authContext, batch);
    const second = await service.collect(authContext, batch);

    expect(first).toMatchObject({ accepted: 1, duplicate: 0, rejected: 0, conflict: 0 });
    expect(second).toMatchObject({ accepted: 0, duplicate: 1, rejected: 0, conflict: 0 });
  });

  it('동일 event_id에 다른 payload_hash가 오면 409 conflict로 거부한다', async () => {
    const service = new LogEventsService(new InMemoryLogEventRepository());
    const authContext = { clientId: 'company-site', keyId: 'local-test-key', hashKeyVersion: 'v1' };

    await service.collect(
      authContext,
      makeBatch([makeEvent({ metadata: { processed_count: 1 } })])
    );

    await expect(
      service.collect(authContext, makeBatch([makeEvent({ metadata: { processed_count: 2 } })]))
    ).rejects.toThrow(ConflictException);
  });
});
