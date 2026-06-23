import { scanRawLogPayload } from './raw-sensitive-scanner';

describe('scanRawLogPayload', () => {
  it('metadata뿐 아니라 요청 전체의 token 값을 거부한다', () => {
    const result = scanRawLogPayload({
      events: [
        {
          schema_version: 1,
          event_id: 'evt-sensitive-1',
          timestamp: '2026-06-22T00:00:00.000Z',
          level: 'warn',
          project: 'company_site',
          component: 'RawSensitiveScannerSpec',
          feature: 'auth',
          event: 'auth_failure',
          action: 'collect',
          status: 'failure',
          channel: 'security',
          correlation_id: 'log-20260622-000000-sensitive-1',
          access_token: 'sensitive-token-value',
          metadata: { safe_count: 1 },
          hash_key_version: 'v1',
        },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'LOG_RAW_SENSITIVE_VALUE',
      reason: 'sensitive_key',
    });
  });

  it('camelCase와 suffix 형태의 민감 키도 거부한다', () => {
    const result = scanRawLogPayload({
      events: [
        {
          schema_version: 1,
          event_id: 'evt-sensitive-camel-1',
          timestamp: '2026-06-22T00:00:00.000Z',
          level: 'warn',
          project: 'company_site',
          component: 'RawSensitiveScannerSpec',
          feature: 'auth',
          event: 'auth_failure',
          action: 'collect',
          status: 'failure',
          channel: 'security',
          correlation_id: 'log-20260622-000000-sensitive-camel',
          metadata: {
            userPassword: 'redacted',
            passwordHash: 'redacted',
            secretValue: 'redacted',
            authorizationHeader: 'redacted',
            cookieHeader: 'redacted',
            emailAddress: 'redacted',
            phoneNumber: 'redacted',
            contactName: 'redacted',
          },
          hash_key_version: 'v1',
        },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'LOG_RAW_SENSITIVE_VALUE',
      reason: 'sensitive_key',
    });
  });

  it('이메일, 전화번호, presigned URL, 로컬 경로 형태의 문자열을 거부한다', () => {
    const result = scanRawLogPayload({
      events: [
        {
          schema_version: 1,
          event_id: 'evt-sensitive-2',
          timestamp: '2026-06-22T00:00:00.000Z',
          level: 'error',
          project: 'company_site',
          component: 'RawSensitiveScannerSpec',
          feature: 'upload',
          event: 'upload_failure',
          action: 'collect',
          status: 'failure',
          channel: 'security',
          correlation_id: 'log-20260622-000000-sensitive-2',
          metadata: {
            samples: [
              'user@example.com',
              '010-1234-5678',
              'https://storage.example.com/file?X-Amz-Signature=abc',
              'C:\\Users\\jaehy\\sample.dxf',
            ],
          },
          hash_key_version: 'v1',
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: 'LOG_RAW_SENSITIVE_VALUE' });
  });

  it('중첩 깊이가 6단계를 넘으면 거부한다', () => {
    const result = scanRawLogPayload({
      events: [
        {
          schema_version: 1,
          event_id: 'evt-depth-1',
          timestamp: '2026-06-22T00:00:00.000Z',
          level: 'info',
          project: 'company_site',
          component: 'RawSensitiveScannerSpec',
          feature: 'log_collection',
          event: 'depth_test',
          action: 'collect',
          status: 'failure',
          channel: 'security',
          correlation_id: 'log-20260622-000000-depth',
          metadata: { a: { b: { c: { d: { e: { f: { g: 'too deep' } } } } } } },
          hash_key_version: 'v1',
        },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'LOG_METADATA_TOO_DEEP',
      reason: 'max_depth',
    });
  });

  it('hash_key_version처럼 안전한 계약 필드는 sensitive key로 오탐하지 않는다', () => {
    const result = scanRawLogPayload({
      events: [
        {
          schema_version: 1,
          event_id: 'evt-safe-1',
          timestamp: '2026-06-22T00:00:00.000Z',
          level: 'info',
          project: 'company_site',
          component: 'RawSensitiveScannerSpec',
          feature: 'log_collection',
          event: 'safe_test',
          action: 'collect',
          status: 'success',
          channel: 'audit',
          correlation_id: 'log-20260622-000000-safe',
          metadata: { processed_count: 1 },
          hash_key_version: 'v1',
        },
      ],
    });

    expect(result).toEqual({ ok: true });
  });
});
