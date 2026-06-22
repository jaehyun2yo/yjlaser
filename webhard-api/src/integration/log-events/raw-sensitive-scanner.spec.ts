import { scanRawLogPayload } from './raw-sensitive-scanner';

describe('scanRawLogPayload', () => {
  it('metadata뿐 아니라 요청 전체의 token 값을 거부한다', () => {
    const result = scanRawLogPayload({
      events: [
        {
          schema_version: 1,
          event_id: 'evt-sensitive-1',
          trace_id: 'trace-sensitive-1',
          occurred_at: '2026-06-22T00:00:00.000Z',
          project: 'company_site',
          subsystem: 'api',
          event_type: 'auth.failure',
          severity: 'warn',
          message: 'failed',
          access_token: 'sensitive-token-value',
          metadata: { safe_count: 1 },
          payload_hash: 'hash-sensitive-1',
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
          trace_id: 'trace-sensitive-camel-1',
          occurred_at: '2026-06-22T00:00:00.000Z',
          project: 'company_site',
          subsystem: 'api',
          event_type: 'auth.failure',
          severity: 'warn',
          message: 'failed',
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
          payload_hash: 'hash-sensitive-camel-1',
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
          trace_id: 'trace-sensitive-2',
          occurred_at: '2026-06-22T00:00:00.000Z',
          project: 'company_site',
          subsystem: 'api',
          event_type: 'upload.failure',
          severity: 'error',
          message: 'safe message',
          metadata: {
            samples: [
              'user@example.com',
              '010-1234-5678',
              'https://storage.example.com/file?X-Amz-Signature=abc',
              'C:\\Users\\jaehy\\sample.dxf',
            ],
          },
          payload_hash: 'hash-sensitive-2',
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
          trace_id: 'trace-depth-1',
          occurred_at: '2026-06-22T00:00:00.000Z',
          project: 'company_site',
          subsystem: 'api',
          event_type: 'depth.test',
          severity: 'info',
          message: 'safe message',
          metadata: { a: { b: { c: { d: { e: { f: { g: 'too deep' } } } } } } },
          payload_hash: 'hash-depth-1',
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
          trace_id: 'trace-safe-1',
          occurred_at: '2026-06-22T00:00:00.000Z',
          project: 'company_site',
          subsystem: 'api',
          event_type: 'safe.test',
          severity: 'info',
          message: 'safe event',
          metadata: { processed_count: 1 },
          payload_hash: 'hash-safe-1',
          hash_key_version: 'v1',
        },
      ],
    });

    expect(result).toEqual({ ok: true });
  });
});
