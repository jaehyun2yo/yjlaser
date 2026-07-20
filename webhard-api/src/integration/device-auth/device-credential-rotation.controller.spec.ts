import { INestApplication, Logger, type Type, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import * as request from 'supertest';
import { AuthService, type SessionUser } from '../../auth/auth.service';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { CsrfTokenMiddleware } from '../../common/middleware/csrf-token.middleware';
import { DeviceEnrollmentAdminSessionSourceGuard } from './device-enrollment-admin-session-source.guard';
import { DeviceManagementNoStoreMiddleware } from './device-management-no-store.middleware';
import { DeviceCredentialRotationBearerController } from './device-credential-rotation.controller';
import { DeviceCredentialRotationError } from './device-credential-rotation.service';
import { DeviceAuthModule } from './device-auth.module';

const BASE = '/api/v1/integration/devices';
const DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const ROTATION_ID = '22222222-2222-4222-8222-222222222222';
const PATH = `${BASE}/${DEVICE_ID}/credential-rotations`;
const DETAIL = `${PATH}/${ROTATION_ID}`;
const ADMIN_SESSION = 'admin-session-fixture';
const CSRF = 'csrf-fixture';
const ACTOR_HASH = 'a'.repeat(64);

const admin: SessionUser = { userType: 'admin', userId: 'admin-1', companyId: null };
const summary = {
  id: ROTATION_ID,
  deviceId: DEVICE_ID,
  status: 'requested',
  deadlineAt: '2026-07-20T01:15:00.000Z',
  credentialVersion: 7,
};

describe('DeviceCredentialRotationController', () => {
  let app: INestApplication;
  let service: { requestRotation: jest.Mock; getRotation: jest.Mock; cancelRotation: jest.Mock };

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const controllerModule = require('./device-credential-rotation.controller') as Record<
      string,
      unknown
    >;
    const guardModule = require('./device-rotation-admin-request-shape.guard') as Record<
      string,
      unknown
    >;
    const Controller = controllerModule.DeviceCredentialRotationController as Type<unknown>;
    const Guard = guardModule.DeviceRotationAdminRequestShapeGuard;
    const tokens = require('./device-auth.tokens') as Record<string, unknown>;
    if (
      typeof Controller !== 'function' ||
      typeof Guard !== 'function' ||
      typeof tokens.DEVICE_CREDENTIAL_ROTATION_SERVICE !== 'symbol'
    ) {
      throw new Error('admin rotation controller boundary is not implemented');
    }
    service = {
      requestRotation: jest.fn(),
      getRotation: jest.fn(),
      cancelRotation: jest.fn(),
    };
    const authService = {
      verifySession: jest.fn((value: string | undefined) =>
        value === ADMIN_SESSION ? admin : null
      ),
    };
    const moduleFixture = await Test.createTestingModule({
      controllers: [Controller],
      providers: [
        SessionAuthGuard,
        AdminGuard,
        DeviceEnrollmentAdminSessionSourceGuard,
        {
          provide: tokens.DEVICE_AUTH_ROTATION_OPTIONS as symbol,
          useValue: { rotationRuntimeEnabled: true },
        },
        { provide: AuthService, useValue: authService },
        { provide: tokens.DEVICE_CREDENTIAL_ROTATION_SERVICE, useValue: service },
        {
          provide: tokens.DEVICE_ADMIN_ACTOR_HASHER as symbol,
          useValue: { hashAdmin: () => ACTOR_HASH },
        },
      ],
    }).compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    const noStore = new DeviceManagementNoStoreMiddleware();
    app.getHttpAdapter().getInstance().use(BASE, noStore.use.bind(noStore)).use(express.json());
    app.use(cookieParser());
    const csrf = new CsrfTokenMiddleware();
    app.use(csrf.use.bind(csrf));
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalGuards(new CsrfGuard());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service.requestRotation.mockResolvedValue(summary);
    service.getRotation.mockResolvedValue(summary);
    service.cancelRotation.mockResolvedValue({ ...summary, status: 'cancelled' });
  });

  afterAll(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });

  function session(method: 'post' | 'get', path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set('Cookie', [`admin-session=${ADMIN_SESSION}`, `csrf-token=${CSRF}`]);
  }

  it('requests, reads, and cancels through the exact safe wire contract with no-store', async () => {
    const requested = await session('post', PATH)
      .set('X-CSRF-Token', CSRF)
      .set('Content-Length', '0')
      .expect(201);
    const read = await session('get', DETAIL).expect(200);
    const cancelled = await session('post', `${DETAIL}/cancel`)
      .set('X-CSRF-Token', CSRF)
      .set('Content-Length', '0')
      .expect(200);

    for (const response of [requested, read, cancelled]) {
      expect(response.headers['cache-control']).toBe('no-store, private');
      const serialized = JSON.stringify(response.body);
      for (const forbidden of [
        ACTOR_HASH,
        'actorHash',
        'candidateCredentialId',
        'predecessorCredentialId',
        'credentialHash',
        'requestIdDigest',
        'accessToken',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    }
    expect(service.requestRotation).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: DEVICE_ID, actorHash: ACTOR_HASH, now: expect.any(Date) })
    );
    expect(service.getRotation).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: DEVICE_ID,
        rotationId: ROTATION_ID,
        now: expect.any(Date),
      })
    );
    expect(service.cancelRotation).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: DEVICE_ID,
        rotationId: ROTATION_ID,
        actorHash: ACTOR_HASH,
        now: expect.any(Date),
      })
    );
  });

  it('structurally serializes only the public summary even if a dependency returns internal fields', async () => {
    service.getRotation.mockResolvedValue({
      ...summary,
      actorHash: ACTOR_HASH,
      predecessorCredentialId: 'predecessor-internal-id',
      candidateCredentialId: 'candidate-internal-id',
      credentialHash: 'credential-hash-secret',
      requestIdDigest: 'request-digest-secret',
      accessToken: 'raw-jwt-secret',
    });

    const response = await session('get', DETAIL).expect(200);
    expect(response.body).toEqual(summary);
    expect(JSON.stringify(response.body)).not.toMatch(
      /actorHash|predecessor|candidate|credentialHash|requestIdDigest|accessToken|raw-jwt-secret/
    );
  });

  it.each([
    ['missing session', {}],
    ['Bearer ambiguity', { Authorization: 'Bearer raw-token' }],
    ['API key ambiguity', { 'X-API-Key': 'raw-key' }],
    ['recovery ambiguity', { 'X-Account-Recovery-Key': 'raw-key' }],
    ['session header ambiguity', { 'X-Session-Token': 'raw-session' }],
  ])('rejects %s before a state write', async (_label, headers) => {
    const hasExtraSource = Object.keys(headers).length > 0;
    let call = request(app.getHttpServer())
      .post(PATH)
      .set('Content-Length', '0')
      .set('X-CSRF-Token', CSRF);
    call = hasExtraSource
      ? call.set('Cookie', [`admin-session=${ADMIN_SESSION}`, `csrf-token=${CSRF}`])
      : call.set('Cookie', `csrf-token=${CSRF}`);
    for (const [name, value] of Object.entries(headers)) call = call.set(name, value);
    await call.expect(403);
    expect(service.requestRotation).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'bearer-only', staticKey: false, namedSession: false },
    { label: 'bearer plus static API key', staticKey: true, namedSession: false },
    { label: 'bearer plus named admin session', staticKey: false, namedSession: true },
  ])(
    'hard-holds $label on every administrator rotation route before service work',
    async ({ staticKey, namedSession }) => {
      const routes = [
        { method: 'post' as const, path: PATH },
        { method: 'get' as const, path: DETAIL },
        { method: 'post' as const, path: `${DETAIL}/cancel` },
      ];

      for (const route of routes) {
        let routeRequest = request(app.getHttpServer())[route.method](route.path);
        if (route.method === 'post') routeRequest = routeRequest.set('Content-Length', '0');
        routeRequest = routeRequest.set('Authorization', 'Bearer raw-token');
        if (staticKey) routeRequest = routeRequest.set('X-API-Key', 'raw-key');
        if (namedSession) {
          routeRequest = routeRequest
            .set('Cookie', [`admin-session=${ADMIN_SESSION}`, `csrf-token=${CSRF}`])
            .set('X-CSRF-Token', CSRF);
        }

        const response = await routeRequest;
        expect([401, 403]).toContain(response.status);
        expect(response.headers['cache-control']).toBe('no-store, private');
      }

      expect(service.requestRotation).not.toHaveBeenCalled();
      expect(service.getRotation).not.toHaveBeenCalled();
      expect(service.cancelRotation).not.toHaveBeenCalled();
    }
  );

  it.each([
    'company-session=admin-session-fixture; csrf-token=csrf-fixture',
    'worker-session=worker-token; csrf-token=csrf-fixture',
    'erp-session=worker-token; csrf-token=csrf-fixture',
    'admin-session=admin-session-fixture; company-session=company-token; csrf-token=csrf-fixture',
    'admin-session=admin-session-fixture; admin-session=second-token; csrf-token=csrf-fixture',
  ])(
    'rejects a non-exclusive named session before auth verification or service work: %s',
    async (cookie) => {
      await request(app.getHttpServer())
        .post(PATH)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', CSRF)
        .set('Content-Length', '0')
        .expect(403);
      expect(service.requestRotation).not.toHaveBeenCalled();
    }
  );

  it('requires CSRF and an exact empty body before request or cancel writes', async () => {
    await session('post', PATH).set('Content-Length', '0').expect(403);
    await session('post', PATH)
      .set('X-CSRF-Token', CSRF)
      .send({ reason: 'raw-secret' })
      .expect(400);
    expect(service.requestRotation).not.toHaveBeenCalled();
  });

  it.each([
    ['DEVICE_ROTATION_INCOMPATIBLE', 409, 'device_rotation_incompatible'],
    ['DEVICE_ROTATION_EXPIRED', 409, 'device_rotation_expired'],
    ['DEVICE_ROTATION_IN_PROGRESS', 409, 'device_rotation_in_progress'],
    ['DEVICE_ROTATION_INVALID', 409, 'device_rotation_invalid'],
    ['DEVICE_ROTATION_UNAVAILABLE', 503, 'device_auth_unavailable'],
  ])('maps %s to a generic no-store public error', async (code, status, publicCode) => {
    const loaded = require('./device-credential-rotation.service') as Record<string, unknown>;
    const ErrorClass = loaded.DeviceCredentialRotationError as new (code: string) => Error;
    service.getRotation.mockRejectedValue(new ErrorClass(code));
    const response = await session('get', DETAIL).expect(status);
    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(response.body).toMatchObject({ code: publicCode });
    expect(JSON.stringify(response.body)).not.toContain(ACTOR_HASH);
  });
});

describe('DeviceCredentialRotationController disabled feature boundary', () => {
  let app: INestApplication;
  const service = {
    requestRotation: jest.fn(),
    getRotation: jest.fn(),
    cancelRotation: jest.fn(),
  };

  beforeAll(async () => {
    const { DeviceCredentialRotationController: Controller } =
      require('./device-credential-rotation.controller') as {
        DeviceCredentialRotationController: Type<unknown>;
      };
    const { DeviceRotationAdminRequestShapeGuard: ShapeGuard } =
      require('./device-rotation-admin-request-shape.guard') as {
        DeviceRotationAdminRequestShapeGuard: Type<unknown>;
      };
    const { DeviceRotationFeatureGateMiddleware: FeatureGate } =
      require('./device-rotation-feature-gate.middleware') as {
        DeviceRotationFeatureGateMiddleware: new (options: { rotationRuntimeEnabled: boolean }) => {
          use: express.RequestHandler;
        };
      };
    const tokens = require('./device-auth.tokens') as Record<string, symbol>;
    const moduleFixture = await Test.createTestingModule({
      controllers: [Controller],
      providers: [
        SessionAuthGuard,
        AdminGuard,
        DeviceEnrollmentAdminSessionSourceGuard,
        ShapeGuard,
        { provide: AuthService, useValue: { verifySession: jest.fn(() => admin) } },
        {
          provide: tokens.DEVICE_AUTH_ROTATION_OPTIONS,
          useValue: { rotationRuntimeEnabled: false },
        },
        { provide: tokens.DEVICE_CREDENTIAL_ROTATION_SERVICE, useValue: service },
        {
          provide: tokens.DEVICE_ADMIN_ACTOR_HASHER,
          useValue: { hashAdmin: jest.fn(() => ACTOR_HASH) },
        },
      ],
    }).compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    const gate = new FeatureGate({ rotationRuntimeEnabled: false });
    app.getHttpAdapter().getInstance().use(BASE, gate.use.bind(gate)).use(express.json());
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalGuards(new CsrfGuard());
    await app.init();
  });

  afterAll(async () => app.close());

  it.each([
    ['no auth or CSRF', {}],
    [
      'valid admin and CSRF',
      { Cookie: `admin-session=${ADMIN_SESSION}; csrf-token=${CSRF}`, 'X-CSRF-Token': CSRF },
    ],
    ['API-key ambiguity', { 'X-API-Key': 'raw-key' }],
    ['Bearer ambiguity', { Authorization: 'Bearer raw-token' }],
    ['session-header ambiguity', { 'X-Session-Token': 'raw-session' }],
  ])(
    'returns the identical no-store 404 before every global guard for %s',
    async (_label, headers) => {
      let call = request(app.getHttpServer()).post(PATH).send({ hostile: 'body' });
      for (const [name, value] of Object.entries(headers)) call = call.set(name, value);
      const response = await call.expect(404);
      expect(response.headers['cache-control']).toBe('no-store, private');
      expect(response.body).toEqual({ statusCode: 404, message: 'Not Found' });
      expect(service.requestRotation).not.toHaveBeenCalled();
      expect(service.getRotation).not.toHaveBeenCalled();
      expect(service.cancelRotation).not.toHaveBeenCalled();
    }
  );
});

describe('DeviceCredentialRotationBearerController error boundary', () => {
  it('is registered as a distinct bearer-only controller', () => {
    const controllers = Reflect.getMetadata('controllers', DeviceAuthModule) as unknown[];
    expect(controllers).toContain(DeviceCredentialRotationBearerController);
  });

  it('maps bearer failures to their exact public 401/409 rotation codes', async () => {
    const service = { prepare: jest.fn(), ack: jest.fn() };
    const controller = new DeviceCredentialRotationBearerController(service as never);
    await expect(
      controller.prepare(
        ROTATION_ID,
        { refreshCredential: 'x', candidateCredential: 'y' },
        {} as never
      )
    ).rejects.toMatchObject({ status: 401, response: { code: 'device_rotation_invalid' } });

    service.ack.mockRejectedValue(new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS'));
    const requestWithPrincipal = {
      deviceAuthInfo: {
        deviceId: DEVICE_ID,
        environment: 'dev',
        programType: 'nesting_program',
        capabilityProfile: 'standard',
        permissions: [],
        credentialVersion: 7,
      },
    };
    await expect(
      controller.ack(
        ROTATION_ID,
        { candidateCredential: 'candidate' },
        requestWithPrincipal as never
      )
    ).rejects.toMatchObject({ status: 409, response: { code: 'device_rotation_in_progress' } });
  });
});
