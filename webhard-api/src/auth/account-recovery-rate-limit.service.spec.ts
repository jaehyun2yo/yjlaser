import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountRecoveryRateLimitService } from './account-recovery-rate-limit.service';

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
  error_code?: string;
  metadata?: Record<string, unknown>;
};

const RAW_UPSTASH_URL = 'https://raw-upstash.example.com';
const RAW_UPSTASH_TOKEN = 'raw-upstash-token';
const RAW_RATE_LIMIT_SECRET = 'raw-rate-limit-secret';

function makeConfig(values?: Record<string, string | undefined>): ConfigService {
  const configValues: Record<string, string | undefined> = {
    UPSTASH_REDIS_REST_URL: RAW_UPSTASH_URL,
    UPSTASH_REDIS_REST_TOKEN: RAW_UPSTASH_TOKEN,
    ACCOUNT_RECOVERY_RATE_LIMIT_SECRET: RAW_RATE_LIMIT_SECRET,
    ...values,
  };

  return {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
}

function serializeLoggerCalls(...spies: jest.SpyInstance[]): string {
  return JSON.stringify(
    spies.flatMap((spy) =>
      spy.mock.calls.flatMap((call: unknown[]) => call.map((value: unknown) => String(value)))
    )
  );
}

function findJsonLogEvent(spy: jest.SpyInstance, eventName: string): LoggedBackendEvent {
  const event = spy.mock.calls
    .flatMap((call: unknown[]) => call.map((value: unknown) => String(value)))
    .map((value) => {
      try {
        return JSON.parse(value) as Partial<LoggedBackendEvent>;
      } catch {
        return null;
      }
    })
    .find(
      (value): value is LoggedBackendEvent =>
        value?.schema_version === 1 && value.event === eventName
    );

  if (!event) {
    throw new Error(`Missing JSON log event: ${eventName}`);
  }

  return event;
}

describe('AccountRecoveryRateLimitService', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('production에서 Upstash 또는 fingerprint secret이 없으면 fail closed 한다', async () => {
    process.env.NODE_ENV = 'production';
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const config = makeConfig({
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
      ACCOUNT_RECOVERY_RATE_LIMIT_SECRET: undefined,
    });
    const service = new AccountRecoveryRateLimitService(config);

    await expect(
      service.checkPreLookup({
        flow: 'find-id',
        ip: '1.2.3.4',
        fingerprint: 'fingerprint-hash',
      })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const event = findJsonLogEvent(errorSpy, 'account_recovery_rate_limit_failed');
    expect(event).toMatchObject({
      level: 'error',
      project: 'company_site',
      component: 'AccountRecoveryRateLimitService',
      feature: 'auth',
      action: 'enforce_rate_limit',
      status: 'failure',
      channel: 'security',
      error_code: 'ACCOUNT_RECOVERY_RATE_LIMIT_CONFIG_MISSING',
      metadata: {
        reason: 'config_missing',
        operation: 'fixed_window',
        command_count: 2,
      },
    });

    const serialized = serializeLoggerCalls(errorSpy);
    expect(serialized).not.toContain('1.2.3.4');
    expect(serialized).not.toContain('fingerprint-hash');
    expect(serialized).not.toContain('UPSTASH_REDIS_REST_TOKEN');
  });

  it('Upstash HTTP 실패 로그는 token/secret/companyId 없이 구조화한다', async () => {
    process.env.NODE_ENV = 'production';
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as unknown as typeof fetch;
    const service = new AccountRecoveryRateLimitService(makeConfig());

    await expect(
      service.checkMailAllowance({
        flow: 'find-password',
        companyId: 987654321,
        fingerprint: 'mail-fingerprint-hash',
      })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const event = findJsonLogEvent(errorSpy, 'account_recovery_rate_limit_failed');
    expect(event).toMatchObject({
      error_code: 'ACCOUNT_RECOVERY_RATE_LIMIT_UPSTASH_HTTP_ERROR',
      metadata: {
        reason: 'upstash_http_error',
        operation: 'cooldown',
        command_count: 1,
        upstash_status: 503,
      },
    });

    const serialized = serializeLoggerCalls(errorSpy);
    expect(serialized).not.toContain(RAW_UPSTASH_URL);
    expect(serialized).not.toContain(RAW_UPSTASH_TOKEN);
    expect(serialized).not.toContain(RAW_RATE_LIMIT_SECRET);
    expect(serialized).not.toContain('987654321');
    expect(serialized).not.toContain('mail-fingerprint-hash');
  });

  it('Upstash command error 로그는 upstream 원문 없이 reason만 남긴다', async () => {
    process.env.NODE_ENV = 'production';
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ error: `ERR token=${RAW_UPSTASH_TOKEN}` }],
    }) as unknown as typeof fetch;
    const service = new AccountRecoveryRateLimitService(makeConfig());

    await expect(
      service.checkMailAllowance({
        flow: 'find-id',
        companyId: 777001777,
        fingerprint: 'mail-fingerprint-hash',
      })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const event = findJsonLogEvent(errorSpy, 'account_recovery_rate_limit_failed');
    expect(event).toMatchObject({
      error_code: 'ACCOUNT_RECOVERY_RATE_LIMIT_UPSTASH_COMMAND_ERROR',
      metadata: {
        reason: 'upstash_command_error',
        operation: 'cooldown',
        command_count: 1,
      },
    });

    const serialized = serializeLoggerCalls(errorSpy);
    expect(serialized).not.toContain(RAW_UPSTASH_TOKEN);
    expect(serialized).not.toContain('777001777');
  });

  it('Upstash fetch throw 로그는 Error 원문/local path 없이 구조화한다', async () => {
    process.env.NODE_ENV = 'production';
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error(`network failed token=${RAW_UPSTASH_TOKEN} C:\\Users\\secret`));
    const service = new AccountRecoveryRateLimitService(makeConfig());

    await expect(
      service.checkMailAllowance({
        flow: 'find-password',
        companyId: 888001888,
        fingerprint: 'mail-fingerprint-hash',
      })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const event = findJsonLogEvent(errorSpy, 'account_recovery_rate_limit_failed');
    expect(event).toMatchObject({
      error_code: 'ACCOUNT_RECOVERY_RATE_LIMIT_UPSTASH_REQUEST_FAILED',
      metadata: {
        reason: 'upstash_request_failed',
        operation: 'cooldown',
        command_count: 1,
        error_type: 'Error',
      },
    });

    const serialized = serializeLoggerCalls(errorSpy);
    expect(serialized).not.toContain(RAW_UPSTASH_TOKEN);
    expect(serialized).not.toContain('C:\\Users\\secret');
  });
});
