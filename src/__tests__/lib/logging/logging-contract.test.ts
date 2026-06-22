import { buildLogEvent, generateCorrelationId } from '@/lib/logging/event';
import { containsRawSensitiveValue, maskSensitive } from '@/lib/logging/masking';

describe('YJLaser logging contract', () => {
  it('masks nested sensitive keys and string assignments', () => {
    const masked = maskSensitive({
      api_key: 'raw-api-key',
      nested: { message: 'token=raw-token path=C:\\Users\\jaehy\\file.dxf' },
    });

    const serialized = JSON.stringify(masked);
    expect(serialized).not.toContain('raw-api-key');
    expect(serialized).not.toContain('raw-token');
    expect(serialized).not.toContain('C:\\Users\\jaehy');
    expect(serialized).toContain('[REDACTED]');
  });

  it('detects raw sensitive payload before central collection', () => {
    expect(
      containsRawSensitiveValue({
        metadata: { message: 'password=secret-value' },
      })
    ).toBe(true);
  });

  it('builds required v1 event fields', () => {
    const event = buildLogEvent({
      level: 'info',
      project: 'company_site',
      component: 'LoggingContractTest',
      feature: 'log_collection',
      event: 'contract_built',
      action: 'build',
      status: 'success',
      channel: 'audit',
      correlation_id: generateCorrelationId('test'),
      metadata: { token: 'raw-token' },
    });

    expect(event.schema_version).toBe(1);
    expect(event.event_id).toMatch(/^evt-\d{8}-\d{6}-[a-f0-9]{8}$/);
    expect(event.project).toBe('company_site');
    expect(event.metadata).toEqual({ token: '[REDACTED]' });
    expect(event.correlation_id).toMatch(/^test-\d{8}-\d{6}-[a-f0-9]{6}$/);
  });
});
