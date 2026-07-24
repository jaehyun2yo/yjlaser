import { INestApplication, ValidationPipe } from '@nestjs/common';
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
import { DeviceAdminActorHasher } from './device-admin-actor-hash';
import { DEVICE_ADMIN_ACTOR_HASHER, DEVICE_ENROLLMENT_SERVICE } from './device-auth.module';
import { DeviceEnrollmentAdminRequestShapeGuard } from './device-enrollment-admin-request-shape.guard';
import { DeviceEnrollmentAdminSessionSourceGuard } from './device-enrollment-admin-session-source.guard';
import { DeviceEnrollmentController } from './device-enrollment.controller';

const PATH = '/api/v1/integration/devices/enrollment-codes';
const CSRF_BOOTSTRAP_PATH = '/api/v1/integration/devices/csrf';
const ADMIN_SESSION = 'admin-session-fixture';
const COMPANY_SESSION = 'company-session-fixture';
const CSRF_TOKEN = 'csrf-token-fixture';
const ACTOR_HASH = 'a'.repeat(64);
const RAW_ENROLLMENT_CODE = Buffer.alloc(32, 31).toString('base64url');

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

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    programType: 'management_program',
    capabilityProfile: 'standard',
    expectedDisplayName: 'management-install-01',
    ...overrides,
  };
}

describe('DeviceEnrollmentController', () => {
  let app: INestApplication;
  let enrollmentService: { createEnrollmentCode: jest.Mock };
  let actorHasher: { hashAdmin: jest.Mock };

  beforeAll(async () => {
    enrollmentService = {
      createEnrollmentCode: jest.fn(),
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
      controllers: [DeviceEnrollmentController],
      providers: [
        SessionAuthGuard,
        AdminGuard,
        DeviceEnrollmentAdminSessionSourceGuard,
        DeviceEnrollmentAdminRequestShapeGuard,
        { provide: AuthService, useValue: authService },
        { provide: DEVICE_ENROLLMENT_SERVICE, useValue: enrollmentService },
        { provide: DEVICE_ADMIN_ACTOR_HASHER, useValue: actorHasher },
      ],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    app
      .getHttpAdapter()
      .getInstance()
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
    enrollmentService.createEnrollmentCode.mockResolvedValue({
      enrollmentCode: RAW_ENROLLMENT_CODE,
      enrollmentId: '11111111-1111-4111-8111-111111111111',
      environment: 'dev',
      programType: 'management_program',
      capabilityProfile: 'standard',
      expiresAt: new Date('2026-07-21T00:00:00.000Z'),
    });
    actorHasher.hashAdmin.mockReturnValue(ACTOR_HASH);
  });

  afterAll(async () => {
    await app.close();
  });

  function adminRequest(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(PATH)
      .set('Cookie', [`admin-session=${ADMIN_SESSION}`, `csrf-token=${CSRF_TOKEN}`])
      .set('X-CSRF-Token', CSRF_TOKEN)
      .send(body);
  }

  it('prepares a CSRF cookie for a new admin session without issuing an enrollment code', async () => {
    const response = await request(app.getHttpServer())
      .get(CSRF_BOOTSTRAP_PATH)
      .set('Cookie', `admin-session=${ADMIN_SESSION}`)
      .expect(200);

    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/^csrf-token=/)])
    );
    expect(response.body).toEqual({ ok: true });
    expect(enrollmentService.createEnrollmentCode).not.toHaveBeenCalled();
  });

  it('does not allow API-key, recovery-key, or authorization request sources to prepare a CSRF cookie', async () => {
    await request(app.getHttpServer())
      .get(CSRF_BOOTSTRAP_PATH)
      .set('Cookie', `admin-session=${ADMIN_SESSION}`)
      .set('X-API-Key', '')
      .expect(403);

    await request(app.getHttpServer())
      .get(CSRF_BOOTSTRAP_PATH)
      .set('Cookie', `admin-session=${ADMIN_SESSION}`)
      .set('X-Account-Recovery-Key', '')
      .expect(403);

    await request(app.getHttpServer())
      .get(CSRF_BOOTSTRAP_PATH)
      .set('Cookie', 'admin-session=' + ADMIN_SESSION)
      .set('Authorization', '')
      .expect(403);

    expect(enrollmentService.createEnrollmentCode).not.toHaveBeenCalled();
  });

  it('issues one enrollment code only to an admin session with matching CSRF and no-store response', async () => {
    const response = await adminRequest(
      validBody({ expectedDisplayName: '  management-install-01  ' })
    ).expect(201);

    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body).toEqual({
      enrollmentCode: RAW_ENROLLMENT_CODE,
      enrollmentId: '11111111-1111-4111-8111-111111111111',
      environment: 'dev',
      programType: 'management_program',
      capabilityProfile: 'standard',
      expiresAt: '2026-07-21T00:00:00.000Z',
    });
    expect(actorHasher.hashAdmin).toHaveBeenCalledWith(adminUser);
    expect(enrollmentService.createEnrollmentCode).toHaveBeenCalledWith({
      programType: 'management_program',
      capabilityProfile: 'standard',
      expectedDisplayName: 'management-install-01',
      actorHash: ACTOR_HASH,
    });
    const serializedResponse = JSON.stringify(response.body);
    expect(serializedResponse).not.toContain(ACTOR_HASH);
    expect(serializedResponse).not.toContain('refreshCredential');
    expect(serializedResponse).not.toContain('accessToken');
  });

  it('rejects a request without a session only after valid CSRF reaches SessionAuthGuard', async () => {
    await request(app.getHttpServer())
      .post(PATH)
      .set('Cookie', `csrf-token=${CSRF_TOKEN}`)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .send(validBody())
      .expect(401);

    expect(enrollmentService.createEnrollmentCode).not.toHaveBeenCalled();
  });

  it('rejects a company session', async () => {
    await request(app.getHttpServer())
      .post(PATH)
      .set('Cookie', [`company-session=${COMPANY_SESSION}`, `csrf-token=${CSRF_TOKEN}`])
      .set('X-CSRF-Token', CSRF_TOKEN)
      .send(validBody())
      .expect(403);

    expect(enrollmentService.createEnrollmentCode).not.toHaveBeenCalled();
  });

  it('rejects an API-key-only request before code creation', async () => {
    await request(app.getHttpServer())
      .post(PATH)
      .set('X-API-Key', 'integration-fixture-key')
      .send(validBody())
      .expect(401);

    expect(enrollmentService.createEnrollmentCode).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'without a CSRF token', csrf: false, apiKey: 'integration-fixture-key' },
    { label: 'with a matching CSRF token', csrf: true, apiKey: 'integration-fixture-key' },
    { label: 'with an empty API-key header', csrf: true, apiKey: '' },
  ])(
    'rejects an admin session $label when any API-key header is present',
    async ({ csrf, apiKey }) => {
      let testRequest = request(app.getHttpServer())
        .post(PATH)
        .set('Cookie', [`admin-session=${ADMIN_SESSION}`, `csrf-token=${CSRF_TOKEN}`])
        .set('X-API-Key', apiKey)
        .send(validBody());
      if (csrf) {
        testRequest = testRequest.set('X-CSRF-Token', CSRF_TOKEN);
      }

      await testRequest.expect(403);
      expect(enrollmentService.createEnrollmentCode).not.toHaveBeenCalled();
    }
  );

  it.each([
    { label: 'with an authorization header', authorization: 'Bearer raw-access-token' },
    { label: 'with an empty authorization header', authorization: '' },
    {
      label: 'with duplicated authorization values',
      authorization: ['Bearer first-token', 'Bearer second-token'],
    },
  ])(
    'rejects an admin session $label before enrollment-code issuance',
    async ({ authorization }) => {
      const response = await request(app.getHttpServer())
        .post(PATH)
        .set('Cookie', ['admin-session=' + ADMIN_SESSION, 'csrf-token=' + CSRF_TOKEN])
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set(
          'Authorization',
          Array.isArray(authorization) ? authorization.join(', ') : authorization
        )
        .send(validBody())
        .expect(403);

      expect(enrollmentService.createEnrollmentCode).not.toHaveBeenCalled();
      expect(JSON.stringify(response.body)).not.toContain('raw-access-token');
    }
  );

  it.each([
    { label: 'without a CSRF token', csrf: false, recoveryKey: 'recovery-fixture-key' },
    { label: 'with a matching CSRF token', csrf: true, recoveryKey: 'recovery-fixture-key' },
    { label: 'with an empty recovery-key header', csrf: true, recoveryKey: '' },
  ])(
    'rejects an admin session $label when any account-recovery-key header is present',
    async ({ csrf, recoveryKey }) => {
      let testRequest = request(app.getHttpServer())
        .post(PATH)
        .set('Cookie', [`admin-session=${ADMIN_SESSION}`, `csrf-token=${CSRF_TOKEN}`])
        .set('X-Account-Recovery-Key', recoveryKey)
        .send(validBody());
      if (csrf) {
        testRequest = testRequest.set('X-CSRF-Token', CSRF_TOKEN);
      }

      await testRequest.expect(403);
      expect(enrollmentService.createEnrollmentCode).not.toHaveBeenCalled();
    }
  );

  it.each([
    { label: 'missing CSRF header', header: undefined },
    { label: 'mismatched CSRF header', header: 'different-csrf-token' },
  ])('rejects an otherwise valid admin request with $label', async ({ header }) => {
    let testRequest = request(app.getHttpServer())
      .post(PATH)
      .set('Cookie', [`admin-session=${ADMIN_SESSION}`, `csrf-token=${CSRF_TOKEN}`])
      .send(validBody());
    if (header !== undefined) {
      testRequest = testRequest.set('X-CSRF-Token', header);
    }

    await testRequest.expect(403);
    expect(enrollmentService.createEnrollmentCode).not.toHaveBeenCalled();
  });

  it.each([
    { environment: 'prd' },
    { actorHash: 'a'.repeat(64) },
    { ownerReference: 'operator' },
    { hostname: 'private-workstation' },
    { hardwareId: 'private-hardware' },
    { metadata: { path: 'C:\\private\\customer.dxf' } },
    { appVersion: '1.2.3' },
    { unexpected: 'value' },
  ])('rejects forbidden or unknown body fields before service invocation: %p', async (extra) => {
    await adminRequest(validBody(extra)).expect(400);

    expect(enrollmentService.createEnrollmentCode).not.toHaveBeenCalled();
  });

  it.each([
    { programType: 'computeroff' },
    { capabilityProfile: 'unsafe' },
    { expectedDisplayName: '' },
    { expectedDisplayName: '\u0000private' },
  ])('rejects an invalid allowed field value: %p', async (invalid) => {
    await adminRequest(validBody(invalid)).expect(400);

    expect(enrollmentService.createEnrollmentCode).not.toHaveBeenCalled();
  });
});
