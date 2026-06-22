import { LogEventRequestPipe } from './log-event-request.pipe';

describe('LogEventRequestPipe', () => {
  it('preserves standard duration_ms instead of the legacy elapsed_ms field', () => {
    const pipe = new LogEventRequestPipe();
    const dto = pipe.transform({
      events: [
        {
          schema_version: 1,
          event_id: 'evt-pipe-duration-1',
          correlation_id: 'log-20260622-000000-pipe',
          timestamp: '2026-06-22T00:00:00.000Z',
          level: 'info',
          project: 'company_site',
          component: 'LogEventRequestPipeSpec',
          feature: 'log_collection',
          event: 'duration_contract_test',
          action: 'validate',
          status: 'success',
          channel: 'audit',
          duration_ms: 123,
          metadata: {
            safe_count: 1,
          },
        },
      ],
    });
    const event = dto.events[0] as { duration_ms?: number; elapsed_ms?: number };

    expect(event.duration_ms).toBe(123);
    expect(event.elapsed_ms).toBeUndefined();
  });
});
