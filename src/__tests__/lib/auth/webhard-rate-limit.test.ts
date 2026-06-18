describe('checkWebhardRateLimit', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const originalAccountRecoverySecret = process.env.ACCOUNT_RECOVERY_RATE_LIMIT_SECRET;

  const limitMock = jest.fn();
  const warnMock = jest.fn();

  function restoreEnv(): void {
    process.env.NODE_ENV = originalNodeEnv;

    if (originalUpstashUrl === undefined) {
      delete process.env.UPSTASH_REDIS_REST_URL;
    } else {
      process.env.UPSTASH_REDIS_REST_URL = originalUpstashUrl;
    }

    if (originalUpstashToken === undefined) {
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    } else {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalUpstashToken;
    }

    if (originalAccountRecoverySecret === undefined) {
      delete process.env.ACCOUNT_RECOVERY_RATE_LIMIT_SECRET;
    } else {
      process.env.ACCOUNT_RECOVERY_RATE_LIMIT_SECRET = originalAccountRecoverySecret;
    }
  }

  function mockDependencies(): void {
    jest.doMock('@/lib/utils/logger', () => ({
      logger: {
        createLogger: () => ({
          debug: jest.fn(),
          error: jest.fn(),
          info: jest.fn(),
          warn: warnMock,
        }),
      },
    }));

    jest.doMock('@upstash/redis', () => ({
      Redis: jest.fn(() => ({})),
    }));

    jest.doMock('@upstash/ratelimit', () => {
      const Ratelimit = Object.assign(
        jest.fn(() => ({ limit: limitMock })),
        {
          slidingWindow: jest.fn(() => 'sliding-window'),
        }
      );

      return { Ratelimit };
    });
  }

  async function loadRateLimitModule(
    nodeEnv: 'production' | 'test',
    options?: { configureUpstash?: boolean; configureAccountRecoverySecret?: boolean }
  ) {
    jest.resetModules();
    jest.clearAllMocks();
    limitMock.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 60_000,
    });
    process.env.NODE_ENV = nodeEnv;
    if (options?.configureUpstash === false) {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    } else {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    }
    if (options?.configureAccountRecoverySecret === false) {
      delete process.env.ACCOUNT_RECOVERY_RATE_LIMIT_SECRET;
    } else {
      process.env.ACCOUNT_RECOVERY_RATE_LIMIT_SECRET = 'account-recovery-secret';
    }
    mockDependencies();

    return import('@/lib/auth/rateLimit');
  }

  afterEach(() => {
    jest.dontMock('@/lib/utils/logger');
    jest.dontMock('@upstash/redis');
    jest.dontMock('@upstash/ratelimit');
    restoreEnv();
    jest.resetModules();
  });

  it('개발 환경에서는 Upstash가 설정되어도 웹하드 API rate limit을 적용하지 않는다', async () => {
    const { checkWebhardRateLimit } = await loadRateLimitModule('test');

    const result = await checkWebhardRateLimit(new Headers({ 'x-forwarded-for': '1.2.3.4' }));

    expect(result).toEqual({
      allowed: true,
      remainingAttempts: Number.MAX_SAFE_INTEGER,
      ip: '1.2.3.4',
    });
    expect(limitMock).not.toHaveBeenCalled();
    expect(warnMock).not.toHaveBeenCalledWith('Webhard rate limit exceeded for IP 1.2.3.4');
  });

  it('프로덕션에서는 Upstash reset timestamp를 잠금 만료 시각으로 그대로 사용한다', async () => {
    const resetAt = Date.now() + 60_000;
    const { checkWebhardRateLimit } = await loadRateLimitModule('production');
    limitMock.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: resetAt,
    });

    const result = await checkWebhardRateLimit(new Headers({ 'x-forwarded-for': '1.2.3.4' }));

    expect(result).toMatchObject({
      allowed: false,
      remainingAttempts: 0,
      lockedUntil: resetAt,
      ip: '1.2.3.4',
    });
  });

  it('계정 복구 limiter는 production 설정 누락 시 fail closed 503 결과를 반환한다', async () => {
    const { checkAccountRecoveryRateLimit } = await loadRateLimitModule('production', {
      configureUpstash: false,
      configureAccountRecoverySecret: false,
    });

    const result = await checkAccountRecoveryRateLimit(
      { headers: new Headers({ 'x-forwarded-for': '1.2.3.4' }) } as Request,
      {
        flow: 'find-id',
        fields: ['대성목형', 'manager@example.com', '01012345678'],
      }
    );

    expect(result).toMatchObject({
      allowed: false,
      remainingAttempts: 0,
      ip: '1.2.3.4',
      status: 503,
    });
  });

  it('계정 복구 limiter는 production에서 IP 또는 fingerprint 초과 시 429 결과를 반환한다', async () => {
    const { checkAccountRecoveryRateLimit } = await loadRateLimitModule('production');

    const result = await checkAccountRecoveryRateLimit(
      { headers: new Headers({ 'x-forwarded-for': '1.2.3.4' }) } as Request,
      {
        flow: 'find-id',
        fields: ['대성목형', 'manager@example.com', '01012345678'],
      }
    );

    expect(result).toMatchObject({
      allowed: false,
      remainingAttempts: 0,
      ip: '1.2.3.4',
      status: 429,
      message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    });
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
