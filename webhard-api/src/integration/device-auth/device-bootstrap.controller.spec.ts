import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { CsrfTokenMiddleware } from '../../common/middleware/csrf-token.middleware';
import { createDeviceAuthBootstrapTransportMiddleware } from '../../common/middleware/device-auth-bootstrap-transport.middleware';
import { DEVICE_ENROLLMENT_SERVICE } from './device-auth.tokens';
import { DeviceBootstrapController } from './device-bootstrap.controller';
import {
  DeviceBootstrapEnrollmentRateGuard,
  DeviceBootstrapStatusRateGuard,
} from './device-bootstrap-rate.guard';
import {
  DeviceBootstrapEnrollRequestShapeGuard,
  DeviceBootstrapStatusRequestShapeGuard,
} from './device-bootstrap-request-shape.guard';
import { DeviceBootstrapRequestSourceGuard } from './device-bootstrap-request-source.guard';
import { DeviceBootstrapRateStore } from './device-bootstrap-rate-store';
import { DeviceEnrollmentError } from './device-enrollment.service';

const ENROLL_PATH = '/api/v1/integration/device-auth/enroll';
const STATUS_PATH = '/api/v1/integration/device-auth/enrollment-status';
const ENROLLMENT_CODE = Buffer.from(Array.from({ length: 32 }, (_, index) => index)).toString(
  'base64url'
);
const ENROLLMENT_ATTEMPT = Buffer.from(
  Array.from({ length: 16 }, (_, index) => index + 32)
).toString('base64url');
const REFRESH_CREDENTIAL = Buffer.from(
  Array.from({ length: 32 }, (_, index) => index + 64)
).toString('base64url');

function validEnrollBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    enrollmentCode: ENROLLMENT_CODE,
    enrollmentAttemptId: ENROLLMENT_ATTEMPT,
    displayName: '  device-install-01  ',
    refreshCredential: REFRESH_CREDENTIAL,
    appVersion: '1.2.3',
    ...overrides,
  };
}

function validStatusBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    enrollmentAttemptId: ENROLLMENT_ATTEMPT,
    refreshCredential: REFRESH_CREDENTIAL,
    ...overrides,
  };
}

const pendingStatus = {
  deviceId: '11111111-1111-4111-8111-111111111111',
  state: 'pending_approval' as const,
  environment: 'dev' as const,
  programType: 'management_program' as const,
  capabilityProfile: 'standard' as const,
  credentialVersion: 1,
};

describe('DeviceBootstrapController', () => {
  let app: INestApplication;
  let enrollmentService: {
    enroll: jest.Mock;
    getEnrollmentStatus: jest.Mock;
  };
  let rateStore: {
    acquireEnrollment: jest.Mock;
    checkEnrollmentStatus: jest.Mock;
    releaseEnrollmentReplayLease: jest.Mock;
  };

  beforeAll(async () => {
    enrollmentService = {
      enroll: jest.fn(),
      getEnrollmentStatus: jest.fn(),
    };
    rateStore = {
      acquireEnrollment: jest.fn(),
      checkEnrollmentStatus: jest.fn(),
      releaseEnrollmentReplayLease: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [DeviceBootstrapController],
      providers: [
        DeviceBootstrapRequestSourceGuard,
        DeviceBootstrapEnrollRequestShapeGuard,
        DeviceBootstrapStatusRequestShapeGuard,
        DeviceBootstrapEnrollmentRateGuard,
        DeviceBootstrapStatusRateGuard,
        { provide: DEVICE_ENROLLMENT_SERVICE, useValue: enrollmentService },
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
    enrollmentService.enroll.mockResolvedValue(pendingStatus);
    enrollmentService.getEnrollmentStatus.mockResolvedValue(pendingStatus);
    rateStore.acquireEnrollment.mockResolvedValue({
      kind: 'allowed',
      replayLease: { nonce: 'synthetic-replay-lease-nonce' },
    });
    rateStore.checkEnrollmentStatus.mockResolvedValue({ kind: 'allowed' });
    rateStore.releaseEnrollmentReplayLease.mockResolvedValue({ kind: 'released' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows a cookie-less CSRF-metadata-exempt enrollment and returns only public state fields', async () => {
    const response = await request(app.getHttpServer())
      .post(ENROLL_PATH)
      .send(validEnrollBody())
      .expect(201);

    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body).toEqual(pendingStatus);
    expect(enrollmentService.enroll).toHaveBeenCalledWith({
      enrollmentCode: ENROLLMENT_CODE,
      enrollmentAttemptId: ENROLLMENT_ATTEMPT,
      displayName: 'device-install-01',
      refreshCredential: REFRESH_CREDENTIAL,
      appVersion: '1.2.3',
    });
    expect(rateStore.acquireEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        enrollmentCode: ENROLLMENT_CODE,
        enrollmentAttemptId: ENROLLMENT_ATTEMPT,
      })
    );
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(ENROLLMENT_CODE);
    expect(serialized).not.toContain(ENROLLMENT_ATTEMPT);
    expect(serialized).not.toContain(REFRESH_CREDENTIAL);
    expect(serialized).not.toContain('accessToken');
  });

  it('returns status with no CSRF cookie while preserving the same proof-only boundary', async () => {
    const response = await request(app.getHttpServer())
      .post(STATUS_PATH)
      .send(validStatusBody())
      .expect(201);

    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body).toEqual(pendingStatus);
    expect(enrollmentService.getEnrollmentStatus).toHaveBeenCalledWith(validStatusBody());
  });

  it.each([
    ['Authorization', 'Bearer raw-access-token'],
    ['Cookie', 'admin-session=raw-session'],
    ['X-API-Key', 'legacy-api-key'],
    ['X-Account-Recovery-Key', 'recovery-key'],
    ['X-CSRF-Token', 'csrf-token'],
    ['Origin', 'https://www.yjlaser.net'],
  ])(
    'rejects ambient %s before controller/service and does not issue a CSRF cookie',
    async (header, value) => {
      const response = await request(app.getHttpServer())
        .post(ENROLL_PATH)
        .set(header, value)
        .send(validEnrollBody())
        .expect(400);

      expect(response.headers['set-cookie']).toBeUndefined();
      expect(enrollmentService.enroll).not.toHaveBeenCalled();
      expect(JSON.stringify(response.body)).not.toContain(value);
    }
  );

  it.each([
    validEnrollBody({ ownerReference: 'operator' }),
    validEnrollBody({ hostname: 'private-workstation' }),
    validEnrollBody({ metadata: { path: 'C:\\private\\drawing.dxf' } }),
    validEnrollBody({ environment: 'prd' }),
    { ...validEnrollBody(), refreshCredential: null },
  ])(
    'rejects forbidden, unknown, or invalid raw enrollment body before service: %p',
    async (body) => {
      await request(app.getHttpServer()).post(ENROLL_PATH).send(body).expect(400);

      expect(enrollmentService.enroll).not.toHaveBeenCalled();
    }
  );

  it('maps invalid lifecycle outcomes to one generic 400 and releases only its replay lease', async () => {
    enrollmentService.enroll.mockRejectedValue(
      new DeviceEnrollmentError('DEVICE_ENROLLMENT_CONFLICT')
    );

    const response = await request(app.getHttpServer())
      .post(ENROLL_PATH)
      .send(validEnrollBody())
      .expect(400);

    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body).toMatchObject({ code: 'device_enrollment_invalid' });
    expect(rateStore.releaseEnrollmentReplayLease).toHaveBeenCalledWith({
      enrollmentAttemptId: ENROLLMENT_ATTEMPT,
      replayLease: { nonce: 'synthetic-replay-lease-nonce' },
    });
    expect(JSON.stringify(response.body)).not.toContain(ENROLLMENT_ATTEMPT);
    expect(JSON.stringify(response.body)).not.toContain(REFRESH_CREDENTIAL);
  });

  it('maps lifecycle/storage availability outcomes to one generic 503 and releases the lease', async () => {
    enrollmentService.enroll.mockRejectedValue(
      new DeviceEnrollmentError('DEVICE_ENROLLMENT_UNAVAILABLE')
    );

    const response = await request(app.getHttpServer())
      .post(ENROLL_PATH)
      .send(validEnrollBody())
      .expect(503);

    expect(response.body).toMatchObject({ code: 'device_auth_unavailable' });
    expect(rateStore.releaseEnrollmentReplayLease).toHaveBeenCalledTimes(1);
  });

  it('maps rate-limit and rate-store availability guard outcomes before service work', async () => {
    rateStore.acquireEnrollment.mockResolvedValue({ kind: 'limited', retryAfterSeconds: 17 });
    const limited = await request(app.getHttpServer())
      .post(ENROLL_PATH)
      .send(validEnrollBody())
      .expect(429);
    expect(limited.headers['retry-after']).toBe('17');
    expect(limited.headers['cache-control']).toContain('no-store');
    expect(limited.body).toMatchObject({ code: 'device_auth_rate_limited' });
    expect(enrollmentService.enroll).not.toHaveBeenCalled();

    rateStore.acquireEnrollment.mockResolvedValue({ kind: 'unavailable' });
    const unavailable = await request(app.getHttpServer())
      .post(ENROLL_PATH)
      .send(validEnrollBody())
      .expect(503);
    expect(unavailable.body).toMatchObject({ code: 'device_auth_unavailable' });
    expect(enrollmentService.enroll).not.toHaveBeenCalled();
  });
});
