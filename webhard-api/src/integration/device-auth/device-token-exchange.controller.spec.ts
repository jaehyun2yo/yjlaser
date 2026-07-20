import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import { Logger } from '@nestjs/common';
import * as request from 'supertest';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { CsrfTokenMiddleware } from '../../common/middleware/csrf-token.middleware';
import { createDeviceAuthBootstrapTransportMiddleware } from '../../common/middleware/device-auth-bootstrap-transport.middleware';
import { DEVICE_TOKEN_EXCHANGE_SERVICE } from './device-auth.tokens';
import { DeviceBootstrapTokenExchangeRateGuard } from './device-bootstrap-rate.guard';
import { DeviceBootstrapRateStore } from './device-bootstrap-rate-store';
import { DeviceBootstrapRequestSourceGuard } from './device-bootstrap-request-source.guard';
import { DeviceTokenExchangeRequestShapeGuard } from './device-bootstrap-request-shape.guard';
import { DeviceAuthModule } from './device-auth.module';
import { DeviceTokenExchangeController } from './device-token-exchange.controller';
import { DeviceTokenExchangeError } from './device-token-exchange.service';

const TOKEN_PATH = '/api/v1/integration/device-auth/token';
const DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const REFRESH_CREDENTIAL = Buffer.from(
  Array.from({ length: 32 }, (_, index) => index + 1)
).toString('base64url');
const NEXT_REFRESH_CREDENTIAL = Buffer.from(
  Array.from({ length: 32 }, (_, index) => index + 33)
).toString('base64url');
const REFRESH_REQUEST_ID = Buffer.from(
  Array.from({ length: 16 }, (_, index) => index + 65)
).toString('base64url');
const ACCESS_TOKEN = 'header.raw-jwt-payload.signature';
const RATE_STORE_CONFIGURATION = {
  environment: 'dev' as const,
  upstashRedisRestUrl: 'https://device-bootstrap-rate.example.test',
  upstashRedisRestToken: 'device-bootstrap-upstash-token-do-not-log',
  rateLimitHmacSecret: 'device-bootstrap-rate-hmac-secret-0123456789',
};

function validTokenBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    deviceId: DEVICE_ID,
    refreshCredential: REFRESH_CREDENTIAL,
    nextRefreshCredential: NEXT_REFRESH_CREDENTIAL,
    refreshRequestId: REFRESH_REQUEST_ID,
    ...overrides,
  };
}

function readEvalCommandFromFetchCall(fetchCall: unknown[]): unknown[] {
  const init = fetchCall[1] as RequestInit;
  if (typeof init.body !== 'string') {
    throw new Error('Expected the test Upstash fetch body to be a JSON string');
  }

  const command: unknown = JSON.parse(init.body);
  if (!Array.isArray(command)) {
    throw new Error('Expected the test Upstash fetch body to contain a command array');
  }

  return command;
}

function commandContainsRawProof(command: readonly unknown[], proof: string): boolean {
  return command.some((value) => typeof value === 'string' && value.includes(proof));
}

const tokenExchangeResult = {
  deviceId: DEVICE_ID,
  environment: 'dev' as const,
  programType: 'management_program' as const,
  capabilityProfile: 'standard' as const,
  credentialVersion: 2,
  accessToken: ACCESS_TOKEN,
  refreshCredentialAction: 'replace_with_candidate' as const,
};

describe('DeviceTokenExchangeController', () => {
  let app: INestApplication;
  let tokenExchangeService: { exchange: jest.Mock };
  let rateStore: {
    acquireTokenExchange: jest.Mock;
    releaseTokenExchangeRequestLease: jest.Mock;
  };
  let errorSpy: jest.SpyInstance;

  beforeAll(async () => {
    tokenExchangeService = { exchange: jest.fn() };
    rateStore = {
      acquireTokenExchange: jest.fn(),
      releaseTokenExchangeRequestLease: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [DeviceTokenExchangeController],
      providers: [
        DeviceBootstrapRequestSourceGuard,
        DeviceTokenExchangeRequestShapeGuard,
        DeviceBootstrapTokenExchangeRateGuard,
        { provide: DEVICE_TOKEN_EXCHANGE_SERVICE, useValue: tokenExchangeService },
        { provide: DeviceBootstrapRateStore, useValue: rateStore },
      ],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.getHttpAdapter().getInstance().use(createDeviceAuthBootstrapTransportMiddleware());
    app.use(cookieParser());
    const csrfTokenMiddleware = new CsrfTokenMiddleware();
    app.use(csrfTokenMiddleware.use.bind(csrfTokenMiddleware));
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalGuards(new CsrfGuard(new Reflector()));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      })
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tokenExchangeService.exchange.mockResolvedValue({
      ...tokenExchangeResult,
      exchangeId: 'private-exchange-id',
      requestIdDigest: 'private-request-digest',
      predecessorCredentialId: 'private-predecessor-id',
      successorCredentialId: 'private-successor-id',
    });
    rateStore.acquireTokenExchange.mockResolvedValue({
      kind: 'allowed',
      requestLease: { nonce: Buffer.alloc(32, 7).toString('base64url') },
    });
    rateStore.releaseTokenExchangeRequestLease.mockResolvedValue({ kind: 'released' });
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  afterAll(async () => {
    await app.close();
  });

  it('provides the public token exchange controller', () => {
    expect(DeviceTokenExchangeController).toBeDefined();
  });

  it('registers the token controller in the device-auth module', () => {
    const controllers = Reflect.getMetadata('controllers', DeviceAuthModule) as
      | unknown[]
      | undefined;

    expect(controllers).toContain(DeviceTokenExchangeController);
  });

  it('accepts only the canonical cookie-less token exchange and projects exactly the public result', async () => {
    const response = await request(app.getHttpServer())
      .post(TOKEN_PATH)
      .send(validTokenBody())
      .expect(201);

    expect(response.headers['cache-control']).toContain('no-store');
    expect(Object.keys(response.body).sort()).toEqual([
      'accessToken',
      'capabilityProfile',
      'credentialVersion',
      'deviceId',
      'environment',
      'programType',
      'refreshCredentialAction',
    ]);
    expect(response.body).toEqual(tokenExchangeResult);
    expect(tokenExchangeService.exchange).toHaveBeenCalledWith(validTokenBody());
    expect(rateStore.acquireTokenExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshCredential: REFRESH_CREDENTIAL,
        refreshRequestId: REFRESH_REQUEST_ID,
      })
    );
    expect(rateStore.releaseTokenExchangeRequestLease).toHaveBeenCalledWith({
      refreshRequestId: REFRESH_REQUEST_ID,
      requestLease: { nonce: Buffer.alloc(32, 7).toString('base64url') },
    });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(REFRESH_CREDENTIAL);
    expect(serialized).not.toContain(NEXT_REFRESH_CREDENTIAL);
    expect(serialized).not.toContain(REFRESH_REQUEST_ID);
    expect(serialized).not.toContain('private-exchange-id');
    expect(serialized).not.toContain('private-request-digest');
    expect(serialized).not.toContain('private-predecessor-id');
    expect(serialized).not.toContain('private-successor-id');
  });

  it('projects the keep_current rotation directive without private exchange fields', async () => {
    tokenExchangeService.exchange.mockResolvedValue({
      ...tokenExchangeResult,
      credentialVersion: 1,
      refreshCredentialAction: 'keep_current',
      rotation: {
        id: '22222222-2222-4222-8222-222222222222',
        deadlineAt: '2026-07-20T00:15:00.000Z',
      },
      successorCredentialId: 'must-not-leak',
    });
    const response = await request(app.getHttpServer())
      .post(TOKEN_PATH)
      .send(validTokenBody())
      .expect(201);
    expect(response.body).toEqual({
      ...tokenExchangeResult,
      credentialVersion: 1,
      refreshCredentialAction: 'keep_current',
      rotation: {
        id: '22222222-2222-4222-8222-222222222222',
        deadlineAt: '2026-07-20T00:15:00.000Z',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('must-not-leak');
  });

  it.each([
    ['Authorization', 'Bearer raw-access-token'],
    ['Proxy-Authorization', 'Basic raw-proxy-token'],
    ['Cookie', 'admin-session=raw-session'],
    ['X-API-Key', 'raw-legacy-api-key'],
    ['X-Account-Recovery-Key', 'raw-recovery-key'],
    ['X-CSRF-Token', 'raw-csrf-token'],
    ['Origin', 'https://www.yjlaser.net'],
    ['Referer', 'https://www.yjlaser.net/admin'],
  ])('rejects ambient %s before token service work', async (header, value) => {
    const response = await request(app.getHttpServer())
      .post(TOKEN_PATH)
      .set(header, value)
      .send(validTokenBody())
      .expect(400);

    expect(tokenExchangeService.exchange).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain(value);
  });

  it.each([
    `${TOKEN_PATH}?refreshCredential=${REFRESH_CREDENTIAL}`,
    `${TOKEN_PATH}/`,
    `${TOKEN_PATH}/%2e`,
    '/API/V1/INTEGRATION/DEVICE-AUTH/TOKEN',
  ])('rejects query and non-canonical token route %s before service work', async (path) => {
    const response = await request(app.getHttpServer())
      .post(path)
      .set('Content-Type', 'application/json')
      .send(validTokenBody());

    expect(response.status).toBe(400);
    expect(tokenExchangeService.exchange).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain(REFRESH_CREDENTIAL);
  });

  it.each([
    validTokenBody({ unexpected: 'private-value' }),
    validTokenBody({ refreshCredential: null }),
    validTokenBody({ nextRefreshCredential: NEXT_REFRESH_CREDENTIAL, actor: 'operator' }),
  ])('rejects non-exact or invalid token bodies before service: %p', async (body) => {
    await request(app.getHttpServer()).post(TOKEN_PATH).send(body).expect(400);

    expect(tokenExchangeService.exchange).not.toHaveBeenCalled();
  });

  it('maps a four-string but malformed refresh proof through the token service and releases its lease', async () => {
    tokenExchangeService.exchange.mockRejectedValue(
      new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID')
    );
    const malformedBody = validTokenBody({ deviceId: 'not-a-canonical-device-id' });

    const response = await request(app.getHttpServer())
      .post(TOKEN_PATH)
      .send(malformedBody)
      .expect(401);

    expect(response.body).toMatchObject({ code: 'device_refresh_invalid' });
    expect(tokenExchangeService.exchange).toHaveBeenCalledWith(malformedBody);
    expect(rateStore.releaseTokenExchangeRequestLease).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'refresh credential beyond the legacy identifier boundary',
      { refreshCredential: 'a'.repeat(513) },
    ],
    [
      'refresh request ID beyond the legacy identifier boundary',
      { refreshRequestId: 'a'.repeat(513) },
    ],
    [
      'refresh credential containing an opaque control character',
      { refreshCredential: 'abc\u0001def' },
    ],
    [
      'refresh request ID containing an opaque control character',
      { refreshRequestId: 'abc\u0001def' },
    ],
  ])(
    'maps %s to the public invalid-refresh contract after the real rate-store boundary',
    async (_label, proofOverride) => {
      const fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: [1, 0] }) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: [1] }) });
      const actualRateStore = new DeviceBootstrapRateStore(RATE_STORE_CONFIGURATION, { fetch });
      const actualTokenExchangeService = {
        exchange: jest
          .fn()
          .mockRejectedValue(new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID')),
      };
      const moduleFixture = await Test.createTestingModule({
        controllers: [DeviceTokenExchangeController],
        providers: [
          DeviceBootstrapRequestSourceGuard,
          DeviceTokenExchangeRequestShapeGuard,
          DeviceBootstrapTokenExchangeRateGuard,
          { provide: DEVICE_TOKEN_EXCHANGE_SERVICE, useValue: actualTokenExchangeService },
          { provide: DeviceBootstrapRateStore, useValue: actualRateStore },
        ],
      }).compile();
      const actualApp = moduleFixture.createNestApplication({ bodyParser: false });
      actualApp.getHttpAdapter().getInstance().use(createDeviceAuthBootstrapTransportMiddleware());
      actualApp.use(cookieParser());
      const csrfTokenMiddleware = new CsrfTokenMiddleware();
      actualApp.use(csrfTokenMiddleware.use.bind(csrfTokenMiddleware));
      actualApp.setGlobalPrefix('api/v1');
      actualApp.useGlobalFilters(new GlobalExceptionFilter());
      actualApp.useGlobalGuards(new CsrfGuard(new Reflector()));
      actualApp.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: false,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        })
      );
      await actualApp.init();
      const body = validTokenBody(proofOverride);
      const refreshCredential = body.refreshCredential;
      const refreshRequestId = body.refreshRequestId;
      if (typeof refreshCredential !== 'string' || typeof refreshRequestId !== 'string') {
        throw new Error('Expected the token test body to contain string refresh proofs');
      }

      try {
        const response = await request(actualApp.getHttpServer())
          .post(TOKEN_PATH)
          .send(body)
          .expect(401);

        expect(response.body).toMatchObject({ code: 'device_refresh_invalid' });
        expect(actualTokenExchangeService.exchange).toHaveBeenCalledTimes(1);
        const serviceInput = actualTokenExchangeService.exchange.mock.calls[0]?.[0] as
          | Record<string, unknown>
          | undefined;
        const serviceReceivedExpectedProofs =
          serviceInput?.deviceId === DEVICE_ID &&
          serviceInput.refreshCredential === refreshCredential &&
          serviceInput.refreshRequestId === refreshRequestId;
        expect(serviceReceivedExpectedProofs).toBe(true);
        expect(fetch).toHaveBeenCalledTimes(2);
        const acquireCommand = readEvalCommandFromFetchCall(fetch.mock.calls[0]);
        const releaseCommand = readEvalCommandFromFetchCall(fetch.mock.calls[1]);
        const releaseScript = String(releaseCommand[1]);
        const commandContainsRawInput = [acquireCommand, releaseCommand].some(
          (command) =>
            commandContainsRawProof(command, refreshCredential) ||
            commandContainsRawProof(command, refreshRequestId)
        );

        expect(String(acquireCommand[6]) === String(releaseCommand[3])).toBe(true);
        expect(String(acquireCommand[13]) === String(releaseCommand[4])).toBe(true);
        expect(
          releaseScript.includes("if redis.call('GET', KEYS[1]) == ARGV[1] then") &&
            releaseScript.includes("return redis.call('DEL', KEYS[1])")
        ).toBe(true);
        expect(releaseScript.includes("redis.call('DECR'")).toBe(false);
        expect(commandContainsRawInput).toBe(false);
      } finally {
        await actualApp.close();
      }
    }
  );

  it.each([
    ['DEVICE_TOKEN_EXCHANGE_INVALID', 401, 'device_refresh_invalid'],
    ['DEVICE_TOKEN_EXCHANGE_CONFLICT', 409, 'device_refresh_in_progress'],
    ['DEVICE_TOKEN_EXCHANGE_REVOKED', 401, 'device_revoked'],
    ['DEVICE_TOKEN_EXCHANGE_UNAVAILABLE', 503, 'device_auth_unavailable'],
  ] as const)(
    'maps %s without reflecting raw inputs or a JWT',
    async (code, status, publicCode) => {
      tokenExchangeService.exchange.mockRejectedValue(new DeviceTokenExchangeError(code));

      const response = await request(app.getHttpServer())
        .post(TOKEN_PATH)
        .send(validTokenBody())
        .expect(status);
      const combined = `${JSON.stringify(response.body)} ${JSON.stringify(errorSpy.mock.calls)}`;

      expect(response.body).toMatchObject({ code: publicCode });
      expect(combined).not.toContain(REFRESH_CREDENTIAL);
      expect(combined).not.toContain(NEXT_REFRESH_CREDENTIAL);
      expect(combined).not.toContain(REFRESH_REQUEST_ID);
      expect(combined).not.toContain(ACCESS_TOKEN);
      expect(rateStore.releaseTokenExchangeRequestLease).toHaveBeenCalledTimes(1);
    }
  );

  it('returns generic rate outcomes with Retry-After before service work', async () => {
    rateStore.acquireTokenExchange.mockResolvedValue({ kind: 'limited', retryAfterSeconds: 17 });
    const limited = await request(app.getHttpServer())
      .post(TOKEN_PATH)
      .send(validTokenBody())
      .expect(429);
    expect(limited.headers['retry-after']).toBe('17');
    expect(limited.body).toMatchObject({ code: 'device_auth_rate_limited' });
    expect(tokenExchangeService.exchange).not.toHaveBeenCalled();

    rateStore.acquireTokenExchange.mockResolvedValue({ kind: 'unavailable' });
    const unavailable = await request(app.getHttpServer())
      .post(TOKEN_PATH)
      .send(validTokenBody())
      .expect(503);
    expect(unavailable.body).toMatchObject({ code: 'device_auth_unavailable' });
    expect(tokenExchangeService.exchange).not.toHaveBeenCalled();
  });
});
