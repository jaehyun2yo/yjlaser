import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import * as request from 'supertest';
import type { SessionUser } from '../../auth/auth.service';
import { AuthService } from '../../auth/auth.service';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { CsrfTokenMiddleware } from '../../common/middleware/csrf-token.middleware';
import { DEVICE_ADMIN_ACTOR_HASHER, DEVICE_MANAGEMENT_SERVICE } from './device-auth.tokens';
import { DeviceEnrollmentAdminEmptyBodyGuard } from './device-enrollment-admin-empty-body.guard';
import { DeviceEnrollmentAdminSessionSourceGuard } from './device-enrollment-admin-session-source.guard';
import { DeviceEnrollmentError } from './device-enrollment.service';
import { DeviceManagementController } from './device-management.controller';
import { DeviceManagementError } from './device-management.service';
import { DeviceManagementNoStoreMiddleware } from './device-management-no-store.middleware';

const PATH = '/api/v1/integration/devices';
const DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_DEVICE_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_SESSION = 'admin-session-fixture';
const COMPANY_SESSION = 'company-session-fixture';
const CSRF_TOKEN = 'csrf-token-fixture';
const ACTOR_HASH = 'a'.repeat(64);
const RAW_CREDENTIAL = 'raw-device-credential-must-never-escape';
const ACTION_PATHS = [
  PATH + '/' + DEVICE_ID + '/approve-enrollment',
  PATH + '/' + DEVICE_ID + '/revoke',
] as const;

const adminUser: SessionUser = {
  userType: 'admin',
  userId: 'admin-001',
  companyId: null,
};

const companyUser: SessionUser = {
  userType: 'company',
  userId: 'company-001',
  companyId: 123,
};

function managedDeviceSummary(overrides: Record<string, unknown> = {}) {
  return {
    deviceId: DEVICE_ID,
    environment: 'dev',
    programType: 'management_program',
    capabilityProfile: 'standard',
    displayName: 'management-install-01',
    appVersion: '1.2.3',
    state: 'pending_approval',
    credentialVersion: 1,
    enrolledAt: new Date('2026-07-20T00:00:00.000Z'),
    ...overrides,
  };
}

const approvedEnrollment = {
  deviceId: DEVICE_ID,
  state: 'active',
  environment: 'dev',
  programType: 'management_program',
  capabilityProfile: 'standard',
  credentialVersion: 2,
};

describe('DeviceManagementController', () => {
  let app: INestApplication;
  let managementService: {
    listDevices: jest.Mock;
    approveDevice: jest.Mock;
    revokeDevice: jest.Mock;
  };
  let actorHasher: { hashAdmin: jest.Mock };

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    managementService = {
      listDevices: jest.fn(),
      approveDevice: jest.fn(),
      revokeDevice: jest.fn(),
    };
    actorHasher = {
      hashAdmin: jest.fn(() => ACTOR_HASH),
    };
    const authService = {
      verifySession: jest.fn((cookieValue: string | undefined) => {
        if (cookieValue === ADMIN_SESSION) return adminUser;
        if (cookieValue === COMPANY_SESSION) return companyUser;
        return null;
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [DeviceManagementController],
      providers: [
        SessionAuthGuard,
        AdminGuard,
        DeviceEnrollmentAdminSessionSourceGuard,
        DeviceEnrollmentAdminEmptyBodyGuard,
        { provide: AuthService, useValue: authService },
        { provide: DEVICE_MANAGEMENT_SERVICE, useValue: managementService },
        { provide: DEVICE_ADMIN_ACTOR_HASHER, useValue: actorHasher },
      ],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    const deviceManagementNoStoreMiddleware = new DeviceManagementNoStoreMiddleware();
    app
      .getHttpAdapter()
      .getInstance()
      .use(PATH, deviceManagementNoStoreMiddleware.use.bind(deviceManagementNoStoreMiddleware))
      .use(express.json({ limit: '10mb' }));
    app.use(cookieParser());
    const csrfTokenMiddleware = new CsrfTokenMiddleware();
    app.use(csrfTokenMiddleware.use.bind(csrfTokenMiddleware));
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalGuards(new CsrfGuard());
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
    managementService.listDevices.mockResolvedValue([managedDeviceSummary()]);
    managementService.approveDevice.mockResolvedValue(approvedEnrollment);
    managementService.revokeDevice.mockResolvedValue(
      managedDeviceSummary({
        state: 'revoked',
        credentialVersion: 2,
        revokedAt: new Date('2026-07-20T00:01:00.000Z'),
      })
    );
    actorHasher.hashAdmin.mockReturnValue(ACTOR_HASH);
  });

  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  function adminGet() {
    return request(app.getHttpServer())
      .get(PATH)
      .set('Cookie', 'admin-session=' + ADMIN_SESSION);
  }

  function adminAction(path: string, body?: string | Record<string, unknown>) {
    const testRequest = request(app.getHttpServer())
      .post(path)
      .set('Cookie', ['admin-session=' + ADMIN_SESSION, 'csrf-token=' + CSRF_TOKEN])
      .set('X-CSRF-Token', CSRF_TOKEN);

    return body === undefined ? testRequest.set('Content-Length', '0') : testRequest.send(body);
  }

  function withCredentialHeader(
    testRequest: request.Test,
    header: string,
    value: string | string[]
  ): request.Test {
    return testRequest.set(header, Array.isArray(value) ? value.join(', ') : value);
  }

  function expectNoCredentialReflection(responseBody: unknown, value: string | string[]): void {
    const serialized = JSON.stringify(responseBody);
    const values = Array.isArray(value) ? value : [value];
    for (const candidate of values) {
      if (candidate.length > 0) {
        expect(serialized).not.toContain(candidate);
      }
    }
  }

  it('lets only an admin session list safe devices with a private no-store response', async () => {
    const response = await adminGet().expect(200);

    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(response.body).toEqual([
      {
        deviceId: DEVICE_ID,
        environment: 'dev',
        programType: 'management_program',
        capabilityProfile: 'standard',
        displayName: 'management-install-01',
        appVersion: '1.2.3',
        state: 'pending_approval',
        credentialVersion: 1,
        enrolledAt: '2026-07-20T00:00:00.000Z',
      },
    ]);
    expect(managementService.listDevices).toHaveBeenCalledTimes(1);
    expect(actorHasher.hashAdmin).not.toHaveBeenCalled();
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(RAW_CREDENTIAL);
    expect(serialized).not.toContain(ACTOR_HASH);
    expect(serialized).not.toContain('credentialHash');
    expect(serialized).not.toContain('approvedByActorHash');
  });

  it('approves a device with an exact zero-octet body and returns 200', async () => {
    const response = await adminAction(PATH + '/' + DEVICE_ID + '/approve-enrollment').expect(200);

    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(response.body).toEqual(approvedEnrollment);
    expect(actorHasher.hashAdmin).toHaveBeenCalledWith(adminUser);
    expect(managementService.approveDevice).toHaveBeenCalledWith({
      deviceId: DEVICE_ID,
      actorHash: ACTOR_HASH,
    });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(ACTOR_HASH);
    expect(serialized).not.toContain(RAW_CREDENTIAL);
  });

  it('revokes a device with an exact zero-octet body and returns 200', async () => {
    const response = await adminAction(PATH + '/' + DEVICE_ID + '/revoke').expect(200);

    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(response.body).toMatchObject({
      deviceId: DEVICE_ID,
      state: 'revoked',
      credentialVersion: 2,
    });
    expect(actorHasher.hashAdmin).toHaveBeenCalledWith(adminUser);
    expect(managementService.revokeDevice).toHaveBeenCalledWith({
      deviceId: DEVICE_ID,
      actorHash: ACTOR_HASH,
    });
  });

  it.each([
    {
      label: 'an empty JSON object',
      body: {},
      extraHeaders: {},
    },
    {
      label: 'a non-empty JSON object',
      body: { reason: RAW_CREDENTIAL },
      extraHeaders: {},
    },
    {
      label: 'a text/plain payload',
      body: 'private reason',
      extraHeaders: { 'Content-Type': 'text/plain' },
    },
  ])('rejects $label before either action service', async ({ body, extraHeaders }) => {
    for (const path of ACTION_PATHS) {
      const response = await adminAction(path, body).set(extraHeaders).expect(400);

      expect(response.headers['cache-control']).toBe('no-store, private');
      expect(JSON.stringify(response.body)).not.toContain(RAW_CREDENTIAL);
    }

    expect(managementService.approveDevice).not.toHaveBeenCalled();
    expect(managementService.revokeDevice).not.toHaveBeenCalled();
  });

  it('sets no-store before SessionAuthGuard rejects unauthenticated list and action requests', async () => {
    const listResponse = await request(app.getHttpServer()).get(PATH).expect(401);
    expect(listResponse.headers['cache-control']).toBe('no-store, private');

    for (const path of ACTION_PATHS) {
      const response = await request(app.getHttpServer())
        .post(path)
        .set('Cookie', 'csrf-token=' + CSRF_TOKEN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Content-Length', '0')
        .expect(401);

      expect(response.headers['cache-control']).toBe('no-store, private');
    }

    expect(managementService.listDevices).not.toHaveBeenCalled();
    expect(managementService.approveDevice).not.toHaveBeenCalled();
    expect(managementService.revokeDevice).not.toHaveBeenCalled();
  });

  it('sets no-store before AdminGuard rejects a company list or action request', async () => {
    const listResponse = await request(app.getHttpServer())
      .get(PATH)
      .set('Cookie', 'company-session=' + COMPANY_SESSION)
      .expect(403);
    expect(listResponse.headers['cache-control']).toBe('no-store, private');

    for (const path of ACTION_PATHS) {
      const response = await request(app.getHttpServer())
        .post(path)
        .set('Cookie', ['company-session=' + COMPANY_SESSION, 'csrf-token=' + CSRF_TOKEN])
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Content-Length', '0')
        .expect(403);

      expect(response.headers['cache-control']).toBe('no-store, private');
    }

    expect(managementService.revokeDevice).not.toHaveBeenCalled();
    expect(managementService.approveDevice).not.toHaveBeenCalled();
    expect(managementService.listDevices).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'a missing CSRF header', csrfHeader: undefined },
    { label: 'a mismatched CSRF header', csrfHeader: 'mismatched-token' },
  ])(
    'sets no-store before CSRF rejects either admin action with $label',
    async ({ csrfHeader }) => {
      for (const path of ACTION_PATHS) {
        let testRequest = request(app.getHttpServer())
          .post(path)
          .set('Cookie', ['admin-session=' + ADMIN_SESSION, 'csrf-token=' + CSRF_TOKEN])
          .set('Content-Length', '0');
        if (csrfHeader !== undefined) {
          testRequest = testRequest.set('X-CSRF-Token', csrfHeader);
        }

        const response = await testRequest.expect(403);
        expect(response.headers['cache-control']).toBe('no-store, private');
      }

      expect(managementService.approveDevice).not.toHaveBeenCalled();
      expect(managementService.revokeDevice).not.toHaveBeenCalled();
    }
  );

  it.each([
    { header: 'X-API-Key', value: 'integration-fixture-key' },
    { header: 'X-API-Key', value: '' },
    { header: 'X-API-Key', value: ['first-key', 'second-key'] },
    { header: 'X-Account-Recovery-Key', value: 'recovery-fixture-key' },
    { header: 'X-Account-Recovery-Key', value: '' },
    { header: 'X-Account-Recovery-Key', value: ['first-key', 'second-key'] },
    { header: 'Authorization', value: 'Bearer raw-access-token' },
    { header: 'Authorization', value: '' },
    { header: 'Authorization', value: ['Bearer first-token', 'Bearer second-token'] },
  ])(
    'sets no-store before credential-source rejection on list and both action routes for $header',
    async ({ header, value }) => {
      const listResponse = await withCredentialHeader(adminGet(), header, value).expect(403);
      expect(listResponse.headers['cache-control']).toBe('no-store, private');
      expect(managementService.listDevices).not.toHaveBeenCalled();
      expectNoCredentialReflection(listResponse.body, value);

      for (const path of ACTION_PATHS) {
        const actionResponse = await withCredentialHeader(adminAction(path), header, value).expect(
          403
        );

        expect(actionResponse.headers['cache-control']).toBe('no-store, private');
        expectNoCredentialReflection(actionResponse.body, value);
      }

      expect(managementService.approveDevice).not.toHaveBeenCalled();
      expect(managementService.revokeDevice).not.toHaveBeenCalled();
    }
  );

  it.each([
    { label: 'bearer-only', staticKey: false, namedSession: false },
    { label: 'bearer plus static API key', staticKey: true, namedSession: false },
    { label: 'bearer plus named admin session', staticKey: false, namedSession: true },
  ])(
    'hard-holds $label on every administrator device-management route before service work',
    async ({ staticKey, namedSession }) => {
      let listRequest = namedSession ? adminGet() : request(app.getHttpServer()).get(PATH);
      listRequest = listRequest.set('Authorization', 'Bearer raw-access-token');
      if (staticKey) listRequest = listRequest.set('X-API-Key', 'integration-fixture-key');

      const listResponse = await listRequest;
      expect([401, 403]).toContain(listResponse.status);
      expect(listResponse.headers['cache-control']).toBe('no-store, private');

      for (const path of ACTION_PATHS) {
        let actionRequest = namedSession
          ? adminAction(path)
          : request(app.getHttpServer())
              .post(path)
              .set('Authorization', 'Bearer raw-access-token')
              .set('Content-Length', '0');
        if (namedSession) {
          actionRequest = actionRequest.set('Authorization', 'Bearer raw-access-token');
        }
        if (staticKey) {
          actionRequest = actionRequest.set('X-API-Key', 'integration-fixture-key');
        }

        const actionResponse = await actionRequest;
        expect([401, 403]).toContain(actionResponse.status);
        expect(actionResponse.headers['cache-control']).toBe('no-store, private');
      }

      expect(managementService.listDevices).not.toHaveBeenCalled();
      expect(managementService.approveDevice).not.toHaveBeenCalled();
      expect(managementService.revokeDevice).not.toHaveBeenCalled();
    }
  );

  it('leaves canonical device-id validation to the management service', async () => {
    const nonCanonicalDeviceId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
    managementService.approveDevice.mockRejectedValue(
      new DeviceManagementError('DEVICE_MANAGEMENT_INVALID')
    );

    await adminAction(PATH + '/' + nonCanonicalDeviceId + '/approve-enrollment').expect(400);

    expect(managementService.approveDevice).toHaveBeenCalledWith({
      deviceId: nonCanonicalDeviceId,
      actorHash: ACTOR_HASH,
    });
  });

  it.each([
    ['invalid input', 'DEVICE_MANAGEMENT_INVALID', 400, 'device_management_invalid'],
    [
      'terminal or cross-environment state',
      'DEVICE_MANAGEMENT_CONFLICT',
      409,
      'device_management_conflict',
    ],
    [
      'unavailable management storage',
      'DEVICE_MANAGEMENT_UNAVAILABLE',
      503,
      'device_management_unavailable',
    ],
  ] as const)(
    'maps a management $0 error to a generic status envelope',
    async (_, code, status, responseCode) => {
      managementService.revokeDevice.mockRejectedValue(new DeviceManagementError(code));

      const response = await adminAction(PATH + '/' + OTHER_DEVICE_ID + '/revoke').expect(status);

      expect(response.headers['cache-control']).toBe('no-store, private');
      expect(response.body).toMatchObject({ code: responseCode });
      expect(JSON.stringify(response.body)).not.toContain(ACTOR_HASH);
      expect(JSON.stringify(response.body)).not.toContain(RAW_CREDENTIAL);
    }
  );

  it.each([
    [
      'invalid enrollment delegation',
      'DEVICE_ENROLLMENT_INVALID',
      400,
      'device_management_invalid',
    ],
    [
      'conflicting enrollment delegation',
      'DEVICE_ENROLLMENT_CONFLICT',
      409,
      'device_management_conflict',
    ],
    [
      'unavailable enrollment delegation',
      'DEVICE_ENROLLMENT_UNAVAILABLE',
      503,
      'device_management_unavailable',
    ],
  ] as const)(
    'maps an approve $0 error to a generic management status envelope',
    async (_, code, status, responseCode) => {
      managementService.approveDevice.mockRejectedValue(new DeviceEnrollmentError(code));

      const response = await adminAction(
        PATH + '/' + OTHER_DEVICE_ID + '/approve-enrollment'
      ).expect(status);

      expect(response.headers['cache-control']).toBe('no-store, private');
      expect(response.body).toMatchObject({ code: responseCode });
      expect(JSON.stringify(response.body)).not.toContain(ACTOR_HASH);
      expect(JSON.stringify(response.body)).not.toContain(RAW_CREDENTIAL);
    }
  );

  it('maps unknown action and list errors to a generic unavailable envelope without raw details', async () => {
    managementService.approveDevice.mockRejectedValue(new Error(RAW_CREDENTIAL));
    const actionResponse = await adminAction(PATH + '/' + DEVICE_ID + '/approve-enrollment').expect(
      503
    );

    managementService.listDevices.mockRejectedValue(new Error(RAW_CREDENTIAL));
    const listResponse = await adminGet().expect(503);

    expect(actionResponse.body).toMatchObject({ code: 'device_management_unavailable' });
    expect(listResponse.body).toMatchObject({ code: 'device_management_unavailable' });
    expect(JSON.stringify(actionResponse.body)).not.toContain(RAW_CREDENTIAL);
    expect(JSON.stringify(listResponse.body)).not.toContain(RAW_CREDENTIAL);
  });
});
