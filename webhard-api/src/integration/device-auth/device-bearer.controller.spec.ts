import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { createDeviceAuthBearerTransportMiddleware } from '../../common/middleware/device-auth-bearer-transport.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_DEVICE_ACCESS_PERMISSIONS } from '../auth/integration-permissions';
import { DEVICE_ACCESS_TOKEN_SERVICE, DEVICE_AUTH_CONFIG } from './device-auth.tokens';
import { DeviceBearerRequestSourceGuard } from './device-bearer-request-source.guard';
import { DeviceBearerGuard } from './device-bearer.guard';
import { DeviceBearerController } from './device-bearer.controller';
import { DeviceBearerNoStoreMiddleware } from './device-bearer-no-store.middleware';
import { DeviceBootstrapRateStore } from './device-bootstrap-rate-store';
import { DeviceHeartbeatRateGuard } from './device-heartbeat-rate.guard';
import { DeviceHeartbeatService } from './device-heartbeat.service';

const HEARTBEAT_PATH = '/api/v1/integration/devices/heartbeat';
const CANARY_PATH = '/api/v1/integration/devices/canary';
const DEVICE_ID = '11111111-1111-4111-8111-111111111111';

function activeDevice(profile: 'standard' | 'safe_canary' = 'standard') {
  return {
    id: DEVICE_ID,
    environment: 'dev',
    programType: 'nesting_program',
    capabilityProfile: profile,
    credentialVersion: 4,
  };
}

function verifiedClaims(profile: 'standard' | 'safe_canary' = 'standard') {
  return {
    sub: DEVICE_ID,
    environment: 'dev' as const,
    program_type: 'nesting_program' as const,
    permissions:
      profile === 'safe_canary' ? [] : [...DEFAULT_DEVICE_ACCESS_PERMISSIONS.nesting_program],
    capability_profile: profile,
    credential_version: 4,
    token_type: 'device_access' as const,
    iat: 1_753_000_000,
    exp: 1_753_000_900,
  };
}

describe('DeviceBearerController', () => {
  let app: INestApplication;
  let verify: jest.Mock;
  let findFirst: jest.Mock;
  let record: jest.Mock;
  let checkDeviceHeartbeat: jest.Mock;

  beforeAll(async () => {
    verify = jest.fn();
    findFirst = jest.fn();
    record = jest.fn();
    checkDeviceHeartbeat = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [DeviceBearerController],
      providers: [
        DeviceBearerRequestSourceGuard,
        DeviceBearerGuard,
        DeviceHeartbeatRateGuard,
        { provide: DEVICE_ACCESS_TOKEN_SERVICE, useValue: { verify } },
        { provide: DEVICE_AUTH_CONFIG, useValue: { environment: 'dev' } },
        { provide: PrismaService, useValue: { integrationDevice: { findFirst } } },
        { provide: DeviceHeartbeatService, useValue: { record } },
        { provide: DeviceBootstrapRateStore, useValue: { checkDeviceHeartbeat } },
      ],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    const rawApp = app.getHttpAdapter().getInstance();
    rawApp.use(createDeviceAuthBearerTransportMiddleware());
    const noStore = new DeviceBearerNoStoreMiddleware();
    rawApp.use(noStore.use.bind(noStore));
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
    verify.mockReset();
    findFirst.mockReset();
    record.mockReset();
    checkDeviceHeartbeat.mockReset();
    verify.mockResolvedValue(verifiedClaims());
    findFirst.mockResolvedValue(activeDevice());
    record.mockResolvedValue(undefined);
    checkDeviceHeartbeat.mockResolvedValue({ kind: 'allowed' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('records only the minimum heartbeat after bearer and rate verification', async () => {
    const response = await request(app.getHttpServer())
      .post(HEARTBEAT_PATH)
      .set('Authorization', 'Bearer synthetic.jwt.token')
      .set('Content-Type', 'application/json')
      .send({ appVersion: '1.2.3' })
      .expect(200);

    expect(Object.keys(response.body).sort()).toEqual([
      'capabilityProfile',
      'credentialVersion',
      'deviceId',
      'environment',
      'ok',
      'programType',
    ]);
    expect(response.body).toEqual({
      ok: true,
      deviceId: DEVICE_ID,
      environment: 'dev',
      programType: 'nesting_program',
      capabilityProfile: 'standard',
      credentialVersion: 4,
    });
    expect(response.headers['cache-control']).toContain('no-store');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: DEVICE_ID, credentialVersion: 4 }),
      { appVersion: '1.2.3' }
    );
    expect(checkDeviceHeartbeat).toHaveBeenCalledWith({ deviceId: DEVICE_ID });
  });

  it('rejects deviceId, metadata, and unknown heartbeat fields', async () => {
    for (const body of [
      { deviceId: DEVICE_ID },
      { metadata: { hostname: 'secret-host' } },
      { unknown: true },
    ]) {
      await request(app.getHttpServer())
        .post(HEARTBEAT_PATH)
        .set('Authorization', 'Bearer synthetic.jwt.token')
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(400);
    }

    await request(app.getHttpServer())
      .post(HEARTBEAT_PATH)
      .set('Authorization', 'Bearer synthetic.jwt.token')
      .set('Content-Type', 'application/json')
      .send({ appVersion: '1.2.3-01' })
      .expect(400);
  });

  it('returns a no-op canary response and performs no heartbeat/Prisma write', async () => {
    verify.mockResolvedValue(verifiedClaims('safe_canary'));
    findFirst.mockResolvedValue(activeDevice('safe_canary'));

    const response = await request(app.getHttpServer())
      .post(CANARY_PATH)
      .set('Authorization', 'Bearer synthetic.jwt.token')
      .expect(200);

    expect(response.body).toEqual({
      ok: true,
      contractVersion: 'v1',
      environment: 'dev',
      programType: 'nesting_program',
      capabilityProfile: 'safe_canary',
    });
    expect(Object.keys(response.body).sort()).toEqual([
      'capabilityProfile',
      'contractVersion',
      'environment',
      'ok',
      'programType',
    ]);
    expect(record).not.toHaveBeenCalled();
    expect(checkDeviceHeartbeat).not.toHaveBeenCalled();
  });

  it('CSRF exemption never admits cookie, static API key, or missing bearer credentials', async () => {
    for (const headers of [
      { Cookie: 'admin-session=secret' },
      { 'X-API-Key': 'legacy-secret' },
      {},
    ]) {
      await request(app.getHttpServer())
        .post(CANARY_PATH)
        .set(headers)
        .expect((response) => {
          expect([400, 401]).toContain(response.status);
        });
    }
    expect(verify).not.toHaveBeenCalled();
  });

  it('fails the very next heartbeat and canary after revocation is observed', async () => {
    findFirst
      .mockResolvedValueOnce(activeDevice())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        status: 'revoked',
        revokedAt: new Date(),
        refreshCredentials: [],
        tokenExchanges: [],
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        status: 'revoked',
        revokedAt: new Date(),
        refreshCredentials: [],
        tokenExchanges: [],
      });

    await request(app.getHttpServer())
      .post(HEARTBEAT_PATH)
      .set('Authorization', 'Bearer synthetic.jwt.token')
      .set('Content-Type', 'application/json')
      .send({ appVersion: '1.2.3' })
      .expect(200);

    const revokedHeartbeat = await request(app.getHttpServer())
      .post(HEARTBEAT_PATH)
      .set('Authorization', 'Bearer synthetic.jwt.token')
      .set('Content-Type', 'application/json')
      .send({ appVersion: '1.2.3' })
      .expect(401);
    expect(revokedHeartbeat.body.code).toBe('device_revoked');

    const revokedCanary = await request(app.getHttpServer())
      .post(CANARY_PATH)
      .set('Authorization', 'Bearer synthetic.jwt.token')
      .expect(401);
    expect(revokedCanary.body.code).toBe('device_revoked');
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('rate-limits the seventh verified-device heartbeat before writes', async () => {
    checkDeviceHeartbeat
      .mockResolvedValueOnce({ kind: 'allowed' })
      .mockResolvedValueOnce({ kind: 'allowed' })
      .mockResolvedValueOnce({ kind: 'allowed' })
      .mockResolvedValueOnce({ kind: 'allowed' })
      .mockResolvedValueOnce({ kind: 'allowed' })
      .mockResolvedValueOnce({ kind: 'allowed' })
      .mockResolvedValueOnce({ kind: 'limited', retryAfterSeconds: 60 });

    for (let index = 0; index < 6; index += 1) {
      await request(app.getHttpServer())
        .post(HEARTBEAT_PATH)
        .set('Authorization', 'Bearer synthetic.jwt.token')
        .set('Content-Type', 'application/json')
        .send({ appVersion: '1.2.3' })
        .expect(200);
    }
    const limited = await request(app.getHttpServer())
      .post(HEARTBEAT_PATH)
      .set('Authorization', 'Bearer synthetic.jwt.token')
      .set('Content-Type', 'application/json')
      .send({ appVersion: '1.2.3' })
      .expect(429);

    expect(limited.body.code).toBe('device_auth_rate_limited');
    expect(record).toHaveBeenCalledTimes(6);
  });
});
