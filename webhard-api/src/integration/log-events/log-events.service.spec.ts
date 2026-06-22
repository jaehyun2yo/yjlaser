import { ConflictException } from '@nestjs/common';
import type { LogEventBatchDto, LogEventDto } from './dto/log-event.dto';
import { LogEventsService } from './log-events.service';
import { InMemoryLogEventRepository } from './repositories/log-event.repository';

function makeEvent(input?: Partial<LogEventDto>): LogEventDto {
  return {
    schema_version: 1,
    event_id: input?.event_id ?? 'evt-service-1',
    trace_id: input?.trace_id ?? 'trace-service-1',
    occurred_at: input?.occurred_at ?? '2026-06-22T00:00:00.000Z',
    project: input?.project ?? 'company_site',
    subsystem: input?.subsystem ?? 'api',
    event_type: input?.event_type ?? 'service.test',
    severity: input?.severity ?? 'info',
    message: input?.message ?? 'safe event',
    metadata: input?.metadata ?? { processed_count: 1 },
    payload_hash: input?.payload_hash ?? 'hash-service-1',
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

    await service.collect(authContext, makeBatch([makeEvent({ payload_hash: 'hash-a' })]));

    await expect(
      service.collect(authContext, makeBatch([makeEvent({ payload_hash: 'hash-b' })]))
    ).rejects.toThrow(ConflictException);
  });
});
