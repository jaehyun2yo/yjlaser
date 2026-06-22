import { redactSentryEventUrl } from '@/lib/monitoring/sentry/redaction';

describe('redactSentryEventUrl', () => {
  it('event request url의 query와 hash token 값을 제거한다', () => {
    const event = {
      request: {
        url: 'https://www.yjlaser.net/reset-password?token=query-token#token=hash-token',
      },
    };

    expect(redactSentryEventUrl(event)).toEqual({
      request: {
        url: 'https://www.yjlaser.net/reset-password?token=%5BFiltered%5D#token=%5BFiltered%5D',
      },
    });
  });

  it('event request query_string과 navigation breadcrumb URL token을 제거한다', () => {
    const event = {
      request: {
        url: 'https://www.yjlaser.net/reset-password',
        query_string: 'token=query-token&next=%2Flogin',
      },
      breadcrumbs: [
        {
          category: 'navigation',
          data: {
            from: '/reset-password#token=hash-token',
            to: '/reset-password',
          },
        },
      ],
    };

    expect(redactSentryEventUrl(event)).toEqual({
      request: {
        url: 'https://www.yjlaser.net/reset-password',
        query_string: 'token=%5BFiltered%5D&next=%2Flogin',
      },
      breadcrumbs: [
        {
          category: 'navigation',
          data: {
            from: '/reset-password#token=%5BFiltered%5D',
            to: '/reset-password',
          },
        },
      ],
    });
  });

  it('객체형 request query_string token 값을 제거한다', () => {
    const event = {
      request: {
        query_string: {
          token: 'query-token',
          next: '/login',
        },
      },
    };

    expect(redactSentryEventUrl(event)).toEqual({
      request: {
        query_string: {
          token: '[Filtered]',
          next: '/login',
        },
      },
    });
  });

  it('request headers, query, body, user context의 민감값을 제거한다', () => {
    const event = {
      request: {
        url: 'https://www.yjlaser.net/api/files/download?token=raw-token&api_key=raw-api-key&password=raw-password&X-Amz-Signature=raw-signature&safe=1',
        query_string: {
          token: 'raw-query-token',
          api_key: 'raw-query-api-key',
          password: 'raw-query-password',
          safe: '1',
        },
        headers: {
          Authorization: 'Bearer raw-header-token',
          Cookie: 'session=raw-cookie',
          'Content-Type': 'application/json',
          'X-Correlation-Id': 'corr-123',
        },
        cookies: {
          session: 'raw-cookie-object',
        },
        metadata: {
          note: 'password=raw-extra-password email=extra@example.com',
        },
        data: {
          password: 'raw-body-password',
          api_key: 'raw-body-api-key',
          nested: {
            secret: 'raw-body-secret',
            phone: '010-1234-5678',
            email: 'customer@example.com',
            path: 'C:\\Users\\jaehy\\customer.dxf',
          },
        },
      },
      user: {
        id: 'user-1',
        email: 'worker@example.com',
        phone: '010-1111-2222',
      },
    };

    const redacted = redactSentryEventUrl(event);
    const serialized = JSON.stringify(redacted);

    expect(serialized).not.toContain('raw-token');
    expect(serialized).not.toContain('raw-api-key');
    expect(serialized).not.toContain('raw-password');
    expect(serialized).not.toContain('raw-signature');
    expect(serialized).not.toContain('raw-header-token');
    expect(serialized).not.toContain('raw-cookie');
    expect(serialized).not.toContain('raw-cookie-object');
    expect(serialized).not.toContain('raw-extra-password');
    expect(serialized).not.toContain('extra@example.com');
    expect(serialized).not.toContain('raw-body-password');
    expect(serialized).not.toContain('raw-body-api-key');
    expect(serialized).not.toContain('raw-body-secret');
    expect(serialized).not.toContain('010-1234-5678');
    expect(serialized).not.toContain('customer@example.com');
    expect(serialized).not.toContain('worker@example.com');
    expect(serialized).not.toContain('010-1111-2222');
    expect(serialized).not.toContain('C:\\Users\\jaehy');
    expect(redacted.request.headers).toMatchObject({
      Authorization: '[Filtered]',
      Cookie: '[Filtered]',
      'Content-Type': 'application/json',
      'X-Correlation-Id': 'corr-123',
    });
    expect(redacted.request.data).toBe('[Filtered]');
  });

  it('breadcrumb data의 로컬 경로와 presigned URL을 제거한다', () => {
    const event = {
      breadcrumbs: [
        {
          category: 'upload',
          data: {
            filePath: 'C:\\Users\\jaehy\\drawing.dxf',
            url: 'https://storage.example.com/file.dxf?X-Amz-Signature=raw-signature&Expires=123',
            provider: 'google_drive',
            size: 1234,
          },
        },
      ],
    };

    const redacted = redactSentryEventUrl(event);
    const serialized = JSON.stringify(redacted);

    expect(serialized).not.toContain('C:\\Users\\jaehy');
    expect(serialized).not.toContain('raw-signature');
    expect(serialized).toContain('google_drive');
    expect(serialized).toContain('1234');
  });

  it('URL query/hash 값 안에 들어온 presigned URL도 제거한다', () => {
    const event = {
      request: {
        url: '/api/files/proxy?downloadUrl=https%3A%2F%2Fstorage.example.com%2Ffile.dxf%3FX-Amz-Signature%3Draw-query-signature%26Expires%3D123#next=https%3A%2F%2Fstorage.example.com%2Fnext.dxf%3FX-Amz-Signature%3Draw-hash-signature',
      },
    };

    const redacted = redactSentryEventUrl(event);
    const serialized = JSON.stringify(redacted);

    expect(serialized).not.toContain('raw-query-signature');
    expect(serialized).not.toContain('raw-hash-signature');
    expect(serialized).not.toContain('X-Amz-Signature');
    expect(serialized).toContain('downloadUrl=%5BFiltered%5D');
    expect(serialized).toContain('next=%5BFiltered%5D');
  });

  it('자유 텍스트의 authorization header와 hash route query를 제거한다', () => {
    const event = {
      request: {
        url: '/reset#/step?token=raw-hash-route-token',
        metadata: {
          message:
            'Authorization: Bearer raw-bearer\nAuthorization: Basic raw-basic\nAuthorization: ApiKey raw-api-key token=raw-text-token password=raw-text-password api_key=raw-text-api-key email=text@example.com phone=010-2222-3333',
        },
      },
    };

    const redacted = redactSentryEventUrl(event);
    const serialized = JSON.stringify(redacted);

    expect(serialized).not.toContain('raw-hash-route-token');
    expect(serialized).not.toContain('raw-bearer');
    expect(serialized).not.toContain('raw-basic');
    expect(serialized).not.toContain('raw-api-key');
    expect(serialized).not.toContain('raw-text-token');
    expect(serialized).not.toContain('raw-text-password');
    expect(serialized).not.toContain('raw-text-api-key');
    expect(serialized).not.toContain('text@example.com');
    expect(serialized).not.toContain('010-2222-3333');
  });
});
