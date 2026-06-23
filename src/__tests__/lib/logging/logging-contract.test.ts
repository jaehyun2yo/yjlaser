import { buildLogEvent, generateCorrelationId } from '@/lib/logging/event';
import { containsRawSensitiveValue, maskSensitive, maskText } from '@/lib/logging/masking';

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

  it('masks repeated sensitive values in one text field', () => {
    const masked = maskText(
      'Authorization: Bearer raw-bearer\nAuthorization: Basic raw-basic\nAuthorization: ApiKey raw-api-key\nCookie: session=raw-cookie; other=raw-other-cookie\ntoken=raw-token password=raw-password api_key=raw-text-api-key email=one@example.com phone=010-1234-5678 url=https://storage.example.com/file?X-Amz-Signature=raw-signature path=C:\\Users\\jaehy\\a.dxf'
    );

    expect(masked).not.toContain('raw-bearer');
    expect(masked).not.toContain('raw-basic');
    expect(masked).not.toContain('raw-api-key');
    expect(masked).not.toContain('raw-cookie');
    expect(masked).not.toContain('raw-other-cookie');
    expect(masked).not.toContain('raw-token');
    expect(masked).not.toContain('raw-password');
    expect(masked).not.toContain('raw-text-api-key');
    expect(masked).not.toContain('one@example.com');
    expect(masked).not.toContain('010-1234-5678');
    expect(masked).not.toContain('raw-signature');
    expect(masked).not.toContain('C:\\Users\\jaehy');
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
