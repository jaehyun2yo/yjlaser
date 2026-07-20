import { BadRequestException, Logger } from '@nestjs/common';
import type { ArgumentsHost, CallHandler, ExecutionContext } from '@nestjs/common';
import { throwError, firstValueFrom } from 'rxjs';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import { RequestLoggingInterceptor } from '../interceptors/request-logging.interceptor';
import {
  redactErrorMessage,
  redactLogValue,
  redactRequestUrl,
  safePrincipalLabel,
} from './request-redaction';

function makeExecutionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

function makeArgumentsHost(input: {
  request: Record<string, unknown>;
  response: { status: jest.Mock; json: jest.Mock };
}): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => input.request,
      getResponse: () => input.response,
    }),
  } as ArgumentsHost;
}

describe('request redaction helpers', () => {
  it('URL query의 token, api_key, password, presigned signature를 제거한다', () => {
    const redacted = redactRequestUrl(
      '/api/v1/files/download?token=raw-token&api_key=raw-key&password=raw-password&X-Amz-Signature=raw-signature&safe=1'
    );

    expect(redacted).not.toContain('raw-token');
    expect(redacted).not.toContain('raw-key');
    expect(redacted).not.toContain('raw-password');
    expect(redacted).not.toContain('raw-signature');
    expect(redacted).toContain('safe=1');
  });

  it('URL query와 object field의 device enrollment proof를 제거한다', () => {
    const redactedUrl = redactRequestUrl(
      '/api/v1/integration/device-auth/token?refreshCredential=raw-refresh-credential&nextRefreshCredential=raw-next-refresh-credential&refreshRequestId=raw-refresh-request-id&exchangeId=raw-exchange-id&requestIdDigest=raw-request-digest&authorization=Bearer%20raw-access-token&safe=1'
    );
    const redactedObject = redactLogValue({
      refreshCredential: 'raw-refresh-credential',
      nextRefreshCredential: 'raw-next-refresh-credential',
      refreshRequestId: 'raw-refresh-request-id',
      exchangeId: 'raw-exchange-id',
      requestIdDigest: 'raw-request-digest',
      predecessorCredentialId: 'raw-predecessor-id',
      successorCredentialId: 'raw-successor-id',
      rotation: 'raw-rotation-reference',
      actor: 'raw-actor-reference',
      authorization: 'Bearer raw-access-token',
    });

    expect(redactedUrl).not.toContain('raw-refresh-credential');
    expect(redactedUrl).not.toContain('raw-next-refresh-credential');
    expect(redactedUrl).not.toContain('raw-refresh-request-id');
    expect(redactedUrl).not.toContain('raw-exchange-id');
    expect(redactedUrl).not.toContain('raw-request-digest');
    expect(redactedUrl).not.toContain('raw-access-token');
    expect(redactedUrl).toContain('safe=1');
    expect(JSON.stringify(redactedObject)).not.toContain('raw-refresh-credential');
    expect(JSON.stringify(redactedObject)).not.toContain('raw-next-refresh-credential');
    expect(JSON.stringify(redactedObject)).not.toContain('raw-refresh-request-id');
    expect(JSON.stringify(redactedObject)).not.toContain('raw-exchange-id');
    expect(JSON.stringify(redactedObject)).not.toContain('raw-request-digest');
    expect(JSON.stringify(redactedObject)).not.toContain('raw-predecessor-id');
    expect(JSON.stringify(redactedObject)).not.toContain('raw-successor-id');
    expect(JSON.stringify(redactedObject)).not.toContain('raw-rotation-reference');
    expect(JSON.stringify(redactedObject)).not.toContain('raw-actor-reference');
    expect(JSON.stringify(redactedObject)).not.toContain('raw-access-token');
  });

  it('URL query 값 안에 들어온 presigned URL도 제거한다', () => {
    const redacted = redactRequestUrl(
      '/api/v1/files/proxy?downloadUrl=https%3A%2F%2Fstorage.example.com%2Ffile.dxf%3FX-Amz-Signature%3Draw-query-signature%26Expires%3D123&safe=1#/next?token=raw-hash-route-token&next=https%3A%2F%2Fstorage.example.com%2Fnext.dxf%3FX-Amz-Signature%3Draw-hash-signature'
    );

    expect(redacted).not.toContain('raw-query-signature');
    expect(redacted).not.toContain('raw-hash-signature');
    expect(redacted).not.toContain('raw-hash-route-token');
    expect(redacted).not.toContain('X-Amz-Signature');
    expect(redacted).toContain('downloadUrl=%5BFiltered%5D');
    expect(redacted).toContain('next=%5BFiltered%5D');
    expect(redacted).toContain('safe=1');
  });

  it('error message의 authorization, cookie, presigned URL, 연락처, 로컬 경로를 제거한다', () => {
    const redacted = redactErrorMessage(
      'Authorization: Bearer raw-token\nAuthorization: Basic dXNlcjpwYXNz\nAuthorization: ApiKey raw-api-key\nCookie: session=raw-cookie; other=raw-other-cookie\nurl=https://storage.example.com/file?X-Amz-Signature=raw-signature phone=010-1234-5678 email=user@example.com path=C:\\Users\\jaehy\\file.dxf'
    );

    expect(redacted).not.toContain('raw-token');
    expect(redacted).not.toContain('dXNlcjpwYXNz');
    expect(redacted).not.toContain('raw-api-key');
    expect(redacted).not.toContain('raw-cookie');
    expect(redacted).not.toContain('raw-other-cookie');
    expect(redacted).not.toContain('raw-signature');
    expect(redacted).not.toContain('010-1234-5678');
    expect(redacted).not.toContain('user@example.com');
    expect(redacted).not.toContain('C:\\Users\\jaehy');
  });

  it('principal label은 raw user id 대신 존재 여부와 타입만 남긴다', () => {
    expect(safePrincipalLabel({ userId: 'worker@example.com', userType: 'admin' })).toBe(
      'admin:present'
    );
  });
});

describe('RequestLoggingInterceptor redaction', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('실패 로그에 request body, authorization, cookie, raw user id, 민감 query를 남기지 않는다', async () => {
    const interceptor = new RequestLoggingInterceptor();
    const context = makeExecutionContext({
      method: 'POST',
      url: '/api/v1/integration/log-events?token=raw-token&api_key=raw-api-key',
      user: { userId: 'worker@example.com', userType: 'admin' },
      headers: {
        authorization: 'Bearer raw-header-token',
        cookie: 'session=raw-cookie',
      },
      body: {
        password: 'raw-body-password',
      },
    });
    const next: CallHandler = {
      handle: () =>
        throwError(
          () =>
            new Error(
              'Authorization: Bearer raw-error-token path=C:\\Users\\jaehy\\drawing.dxf phone=010-1234-5678'
            )
        ),
    };

    await expect(firstValueFrom(interceptor.intercept(context, next))).rejects.toThrow();

    const serialized = JSON.stringify(warnSpy.mock.calls);
    expect(serialized).not.toContain('raw-token');
    expect(serialized).not.toContain('raw-api-key');
    expect(serialized).not.toContain('raw-header-token');
    expect(serialized).not.toContain('raw-cookie');
    expect(serialized).not.toContain('raw-body-password');
    expect(serialized).not.toContain('worker@example.com');
    expect(serialized).not.toContain('raw-error-token');
    expect(serialized).not.toContain('C:\\Users\\jaehy');
    expect(serialized).not.toContain('010-1234-5678');
    expect(serialized).toContain('admin:present');
  });
});

describe('GlobalExceptionFilter redaction', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('응답 path와 500 로그에 raw query/body/header 값을 직렬화하지 않는다', () => {
    const filter = new GlobalExceptionFilter();
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const response = { status, json };

    filter.catch(
      new Error('password=raw-password path=C:\\Users\\jaehy\\drawing.dxf'),
      makeArgumentsHost({
        request: {
          method: 'GET',
          url: '/api/v1/files/download?token=raw-token&X-Amz-Signature=raw-signature',
          body: { api_key: 'raw-body-api-key' },
          headers: { authorization: 'Bearer raw-header-token', cookie: 'session=raw-cookie' },
        },
        response,
      })
    );

    const responsePayload = JSON.stringify(json.mock.calls);
    const logPayload = JSON.stringify(errorSpy.mock.calls);
    const combined = `${responsePayload} ${logPayload}`;

    expect(combined).not.toContain('raw-token');
    expect(combined).not.toContain('raw-signature');
    expect(combined).not.toContain('raw-password');
    expect(combined).not.toContain('raw-body-api-key');
    expect(combined).not.toContain('raw-header-token');
    expect(combined).not.toContain('raw-cookie');
    expect(combined).not.toContain('C:\\Users\\jaehy');
  });

  it('HttpException message와 extra field의 민감값도 응답에서 제거한다', () => {
    const filter = new GlobalExceptionFilter();
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();

    filter.catch(
      new BadRequestException({
        code: 'RAW_VALIDATION_FAILURE',
        message: 'token=raw-token email=user@example.com',
        detail: 'password=raw-password',
      }),
      makeArgumentsHost({
        request: {
          method: 'POST',
          url: '/api/v1/integration/log-events',
        },
        response: { status, json },
      })
    );

    const responsePayload = JSON.stringify(json.mock.calls);

    expect(responsePayload).not.toContain('raw-token');
    expect(responsePayload).not.toContain('user@example.com');
    expect(responsePayload).not.toContain('raw-password');
    expect(responsePayload).toContain('RAW_VALIDATION_FAILURE');
  });
});
