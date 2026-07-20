import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { DeviceEndpointPolicyGuard } from '../auth/device-endpoint-policy.guard';
import { IntegrationPrincipalSourceGuard } from '../auth/integration-principal-source.guard';
import { DeviceBearerGuard } from '../device-auth/device-bearer.guard';
import { DeviceBearerRequestSourceGuard } from '../device-auth/device-bearer-request-source.guard';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

const payload = {
  idempotency_key: 'management_program:outbox-123:worker.ping',
  attempt_no: 1,
  event_type: 'worker.ping',
  event_version: 1,
  source_worker: 'management_program',
  source_version: '1.0.0',
  occurred_at: '2026-06-19T09:00:00+09:00',
  result: 'success',
  payload: { heartbeat: true },
};
const legacyPayload = {
  orderId: '11111111-1111-4111-8111-111111111111',
  eventType: 'drawing_received',
  source: 'management_program',
};

describe('EventsController device endpoint policy', () => {
  let app: INestApplication;
  const devicePersistence = {
    executeWithRetry: jest.fn().mockResolvedValue({ accepted: true }),
  };
  const deviceAdapter = new EventsService(devicePersistence as never, {} as never);
  const deviceLogger = {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  (deviceAdapter as unknown as { logger: typeof deviceLogger }).logger = deviceLogger;
  const service = {
    createEvent: jest.fn(),
    createEventForDevice: jest.fn((dto, principal) =>
      deviceAdapter.createEventForDevice(dto, principal)
    ),
    createBatchEvents: jest.fn(),
    getEvents: jest.fn(),
  };
  const canActivateStrict = jest.fn((context: ExecutionContext): boolean => {
    const req = context.switchToHttp().getRequest();
    if (req.headers['x-api-key']) {
      req.user = { userType: 'integration', userId: 'legacy', companyId: null };
      req.apiKeyInfo = { id: 'legacy' };
      return true;
    }
    if (String(req.headers.cookie ?? '').includes('admin-session=')) {
      req.user = { userType: 'admin', userId: 'admin', companyId: 0 };
      return true;
    }
    return false;
  });
  const apiKeyGuard = {
    canActivate: jest.fn((context: ExecutionContext) => canActivateStrict(context)),
    canActivateStrict,
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        Reflector,
        IntegrationPrincipalSourceGuard,
        DeviceEndpointPolicyGuard,
        { provide: ApiKeyGuard, useValue: apiKeyGuard },
        {
          provide: DeviceBearerRequestSourceGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
        {
          provide: DeviceBearerGuard,
          useValue: {
            canActivate: jest.fn((context: ExecutionContext) => {
              const req = context.switchToHttp().getRequest();
              const state = req.headers['x-test-device-state'];
              if (['revoked', 'stale', 'wrong_environment'].includes(state)) {
                throw new UnauthorizedException(`synthetic ${state}`);
              }
              req.deviceAuthInfo = {
                deviceId: 'device-1',
                environment: 'prd',
                programType: req.headers['x-test-program'] ?? 'management_program',
                capabilityProfile: req.headers['x-test-capability'] ?? 'standard',
                permissions: String(req.headers['x-test-permissions'] ?? '')
                  .split(',')
                  .filter(Boolean),
                credentialVersion: 4,
              };
              return true;
            }),
          },
        },
        { provide: EventsService, useValue: service },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue(apiKeyGuard)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    service.createEvent.mockResolvedValue({ accepted: true });
    devicePersistence.executeWithRetry.mockResolvedValue({ accepted: true });
  });

  it('allows exact management_program event/write only', async () => {
    await post({ 'X-Test-Permissions': 'event/write' }).expect(201);
    expect(service.createEventForDevice).toHaveBeenCalledWith(
      expect.objectContaining(payload),
      expect.objectContaining({ programType: 'management_program' })
    );
    expect(service.createEvent).not.toHaveBeenCalled();

    const denied: Array<Record<string, string>> = [
      { 'X-Test-Program': 'external_webhard_sync', 'X-Test-Permissions': 'event/write' },
      { 'X-Test-Program': 'nesting_program', 'X-Test-Permissions': 'event/write' },
      { 'X-Test-Permissions': '' },
      { 'X-Test-Capability': 'safe_canary', 'X-Test-Permissions': 'event/write' },
      { 'X-Test-Device-State': 'revoked', 'X-Test-Permissions': 'event/write' },
      { 'X-Test-Device-State': 'stale', 'X-Test-Permissions': 'event/write' },
      { 'X-Test-Device-State': 'wrong_environment', 'X-Test-Permissions': 'event/write' },
      { 'X-API-Key': 'legacy', 'X-Test-Permissions': 'event/write' },
    ];
    for (const headers of denied) {
      jest.clearAllMocks();
      await post(headers).expect((res) => {
        if (![401, 403].includes(res.status)) throw new Error(`expected deny, got ${res.status}`);
      });
      expect(service.createEvent).not.toHaveBeenCalled();
      expect(service.createEventForDevice).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['mismatched source_worker', { ...payload, source_worker: 'external_webhard_sync' }],
    ['CRLF-suffixed source_worker', { ...payload, source_worker: 'management_program\r\n' }],
    ['CRLF-suffixed event_type', { ...payload, event_type: 'worker.ping\r\n' }],
    [
      'CRLF-suffixed error.code',
      {
        ...payload,
        result: 'failed',
        error: { code: 'WORKER_FAILED\r\n', message: 'synthetic failure', retryable: false },
      },
    ],
    ['legacy event shape', legacyPayload],
  ])('rejects device %s before persistence or legacy service work', async (_label, body) => {
    await post({ 'X-Test-Permissions': 'event/write' }, body).expect(403);
    expect(service.createEvent).not.toHaveBeenCalled();
    expect(service.createEventForDevice).toHaveBeenCalledTimes(1);
    expect(devicePersistence.executeWithRetry).not.toHaveBeenCalled();
    expect(deviceLogger.debug).not.toHaveBeenCalled();
    expect(deviceLogger.warn).not.toHaveBeenCalled();
    expect(deviceLogger.error).not.toHaveBeenCalled();
  });

  it.each([
    ['legacy API key envelope', { 'X-API-Key': 'legacy' }, payload],
    ['legacy API key legacy shape', { 'X-API-Key': 'legacy' }, legacyPayload],
    ['admin session envelope', { Cookie: 'admin-session=synthetic' }, payload],
    ['admin session legacy shape', { Cookie: 'admin-session=synthetic' }, legacyPayload],
    [
      'legacy API key envelope event_type CRLF',
      { 'X-API-Key': 'legacy' },
      { ...payload, event_type: 'worker.ping\r\n' },
    ],
    [
      'admin session envelope error.code CRLF',
      { Cookie: 'admin-session=synthetic' },
      {
        ...payload,
        result: 'failed',
        error: { code: 'WORKER_FAILED\r\n', message: 'synthetic failure', retryable: false },
      },
    ],
  ])('preserves %s behavior', async (_label, headers, body) => {
    let call = request(app.getHttpServer()).post('/integration/events').send(body);
    for (const [name, value] of Object.entries(headers)) call = call.set(name, value);
    await call.expect(201);
    expect(service.createEvent).toHaveBeenCalledTimes(1);
    expect(service.createEventForDevice).not.toHaveBeenCalled();
  });

  it('holds batch and read routes before service calls', async () => {
    await request(app.getHttpServer())
      .post('/integration/events/batch')
      .set('Authorization', 'Bearer synthetic.jwt.token')
      .set('X-Test-Permissions', 'event/write')
      .send({ events: [payload] })
      .expect(403);
    await request(app.getHttpServer())
      .get('/integration/events')
      .set('Authorization', 'Bearer synthetic.jwt.token')
      .set('X-Test-Permissions', 'event/write')
      .expect(403);
    expect(service.createBatchEvents).not.toHaveBeenCalled();
    expect(service.getEvents).not.toHaveBeenCalled();
  });

  function post(headers: Record<string, string>, body: Record<string, unknown> = payload) {
    const call = request(app.getHttpServer())
      .post('/integration/events')
      .set('Authorization', 'Bearer synthetic.jwt.token')
      .send(body);
    for (const [name, value] of Object.entries(headers)) call.set(name, value);
    return call;
  }
});
