import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { RecoveryApiKeyGuard } from './recovery-api-key.guard';

function makeContext(input: {
  headers: Record<string, string | undefined>;
  ip?: string;
  remoteAddress?: string;
}): ExecutionContext {
  const request = {
    headers: input.headers,
    ip: input.ip,
    socket: {
      remoteAddress: input.remoteAddress,
    },
  } as Request;

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('RecoveryApiKeyGuard', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('ACCOUNT_RECOVERY_API_KEY와 일치하는 전용 header만 허용한다', () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'ACCOUNT_RECOVERY_API_KEY' ? 'recovery-secret' : undefined
      ),
    } as unknown as ConfigService;
    const guard = new RecoveryApiKeyGuard(config);

    expect(
      guard.canActivate(makeContext({ headers: { 'x-account-recovery-key': 'recovery-secret' } }))
    ).toBe(true);
    expect(() =>
      guard.canActivate(makeContext({ headers: { 'x-api-key': 'recovery-secret' } }))
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(makeContext({ headers: { 'x-account-recovery-key': 'wrong-secret' } }))
    ).toThrow(ForbiddenException);
  });

  it('development에서 env가 없으면 recovery key 요청을 거부한다', () => {
    process.env.NODE_ENV = 'development';
    const config = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService;
    const guard = new RecoveryApiKeyGuard(config);

    expect(() =>
      guard.canActivate(
        makeContext({
          headers: { 'x-account-recovery-key': 'yjlaser-dev-account-recovery-key' },
          ip: '127.0.0.1',
        })
      )
    ).toThrow(ForbiddenException);
  });

  it('production에서 env가 없으면 recovery key 요청을 거부한다', () => {
    process.env.NODE_ENV = 'production';
    const config = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService;
    const guard = new RecoveryApiKeyGuard(config);

    expect(() =>
      guard.canActivate(
        makeContext({
          headers: { 'x-account-recovery-key': 'yjlaser-dev-account-recovery-key' },
          ip: '127.0.0.1',
        })
      )
    ).toThrow(ForbiddenException);
  });

  it('staging에서 env가 없으면 dev-only 기본 recovery key를 거부한다', () => {
    process.env.NODE_ENV = 'staging';
    const config = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService;
    const guard = new RecoveryApiKeyGuard(config);

    expect(() =>
      guard.canActivate(
        makeContext({
          headers: { 'x-account-recovery-key': 'yjlaser-dev-account-recovery-key' },
          ip: '127.0.0.1',
        })
      )
    ).toThrow(ForbiddenException);
  });

  it('configured key가 있으면 development loopback 요청도 명시 key만 허용한다', () => {
    process.env.NODE_ENV = 'development';
    const config = {
      get: jest.fn((key: string) =>
        key === 'ACCOUNT_RECOVERY_API_KEY' ? 'recovery-secret' : undefined
      ),
    } as unknown as ConfigService;
    const guard = new RecoveryApiKeyGuard(config);

    expect(
      guard.canActivate(
        makeContext({
          headers: { 'x-account-recovery-key': 'recovery-secret' },
          ip: '127.0.0.1',
        })
      )
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        makeContext({
          headers: { 'x-account-recovery-key': 'yjlaser-dev-account-recovery-key' },
          ip: '127.0.0.1',
        })
      )
    ).toThrow(ForbiddenException);
  });
});
