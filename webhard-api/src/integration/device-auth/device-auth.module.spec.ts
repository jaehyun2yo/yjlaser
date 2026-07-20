import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { MiddlewareConsumer } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthService } from '../../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DeviceEnrollmentService } from './device-enrollment.service';
import { DeviceManagementController } from './device-management.controller';
import { DeviceManagementNoStoreMiddleware } from './device-management-no-store.middleware';
import { DeviceManagementService } from './device-management.service';
import { DeviceBearerController } from './device-bearer.controller';
import { DeviceBearerNoStoreMiddleware } from './device-bearer-no-store.middleware';
import { DeviceHeartbeatService } from './device-heartbeat.service';
import { DeviceBearerGuard } from './device-bearer.guard';
import { DeviceBearerRequestSourceGuard } from './device-bearer-request-source.guard';
import { DeviceCredentialRotationController } from './device-credential-rotation.controller';
import { DeviceCredentialRotationService } from './device-credential-rotation.service';
import { DeviceRotationFeatureGateMiddleware } from './device-rotation-feature-gate.middleware';
import {
  DEVICE_ADMIN_ACTOR_HASHER,
  DEVICE_AUTH_CONFIG,
  DEVICE_AUTH_RUNTIME_CONFIG,
  DEVICE_ENROLLMENT_SERVICE,
  DEVICE_ENROLLMENT_OPTIONS,
  DEVICE_MANAGEMENT_SERVICE,
  DEVICE_AUTH_ROTATION_OPTIONS,
  DEVICE_CREDENTIAL_ROTATION_SERVICE,
  DeviceAuthModule,
} from './device-auth.module';
import * as deviceAuthModule from './device-auth.module';

const PEPPER_V1 = 'synthetic-device-auth-module-pepper-v1-0123456789';
const AUDIT_HMAC_SECRET = 'synthetic-device-auth-module-audit-hmac-0123456789';
const BOOTSTRAP_RATE_HMAC_SECRET = 'synthetic-device-bootstrap-rate-hmac-0123456789';
const ACCESS_TOKEN_SIGNING_SECRET = 'synthetic-device-auth-module-signing-secret-0123456789';
const TOKEN_EXCHANGE_HMAC_SECRET = 'synthetic-device-auth-module-exchange-hmac-0123456789';

function createEnvironment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    DEVICE_AUTH_ENVIRONMENT: 'dev',
    DEVICE_AUTH_CREDENTIAL_CURRENT_HASH_KEY_VERSION: '1',
    DEVICE_AUTH_CREDENTIAL_PEPPER_KEYRING_JSON: JSON.stringify({ '1': PEPPER_V1 }),
    DEVICE_AUTH_AUDIT_HMAC_SECRET: AUDIT_HMAC_SECRET,
    DEVICE_AUTH_PREPARED_CREDENTIAL_TTL_MS: String(15 * 60 * 1000),
    DEVICE_AUTH_ACTIVE_CREDENTIAL_TTL_MS: String(30 * 24 * 60 * 60 * 1000),
    DEVICE_AUTH_AUDIT_LOG_TTL_MS: String(30 * 24 * 60 * 60 * 1000),
    DEVICE_AUTH_ACCESS_TOKEN_ISSUER: 'https://device-auth.example.test/dev',
    DEVICE_AUTH_ACCESS_TOKEN_AUDIENCE: 'yjlaser-device-api/dev',
    DEVICE_AUTH_ACCESS_TOKEN_CURRENT_KID: 'module-current',
    DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON: JSON.stringify([
      { kid: 'module-current', secret: ACCESS_TOKEN_SIGNING_SECRET },
    ]),
    DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET: TOKEN_EXCHANGE_HMAC_SECRET,
    DEVICE_AUTH_ROTATION_DEADLINE_SECONDS: '900',
    DEVICE_AUTH_ROTATION_ACK_RECOVERY_SECONDS: '120',
    DEVICE_AUTH_ROTATION_RUNTIME_ENABLED: 'false',
    DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL: 'https://device-bootstrap.example.test',
    DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN: 'synthetic-device-bootstrap-token',
    DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET: BOOTSTRAP_RATE_HMAC_SECRET,
    ...overrides,
  };
}

function getRequiredExportedSymbol(name: string): symbol {
  const value = deviceAuthModule[name as keyof typeof deviceAuthModule];
  if (typeof value !== 'symbol') {
    throw new Error(`${name} is not implemented as a symbol token`);
  }

  return value;
}

async function compileDeviceAuthModule(environment: Record<string, unknown>) {
  return Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), DeviceAuthModule],
  })
    .overrideProvider(ConfigService)
    .useValue({ get: (key: string) => environment[key] })
    .overrideProvider(AuthService)
    .useValue({ verifySession: jest.fn() })
    .overrideProvider(PrismaService)
    .useValue({})
    .compile();
}

describe('DeviceAuthModule', () => {
  it('resolves lifecycle and token-exchange services only through validated symbol factory providers', async () => {
    const moduleFixture = await compileDeviceAuthModule(createEnvironment());

    const runtimeConfig = moduleFixture.get(DEVICE_AUTH_RUNTIME_CONFIG);
    const deviceAuthConfig = moduleFixture.get(DEVICE_AUTH_CONFIG);
    const enrollmentOptions = moduleFixture.get(DEVICE_ENROLLMENT_OPTIONS);
    const actorHasher = moduleFixture.get(DEVICE_ADMIN_ACTOR_HASHER);
    const service = moduleFixture.get<DeviceEnrollmentService>(DEVICE_ENROLLMENT_SERVICE);
    const managementService = moduleFixture.get<DeviceManagementService>(DEVICE_MANAGEMENT_SERVICE);
    const rotationOptions = moduleFixture.get(DEVICE_AUTH_ROTATION_OPTIONS);
    const rotationService = moduleFixture.get<DeviceCredentialRotationService>(
      DEVICE_CREDENTIAL_ROTATION_SERVICE
    );

    expect(runtimeConfig).toBeDefined();
    expect(deviceAuthConfig).toMatchObject({ environment: 'dev', currentHashKeyVersion: 1 });
    expect(enrollmentOptions).toEqual({
      preparedCredentialTtlMs: 15 * 60 * 1000,
      activeCredentialTtlMs: 30 * 24 * 60 * 60 * 1000,
      auditLogTtlMs: 30 * 24 * 60 * 60 * 1000,
    });
    expect(
      actorHasher.hashAdmin({
        userType: 'admin',
        userId: 'admin-001',
        companyId: null,
      })
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(service).toBeInstanceOf(DeviceEnrollmentService);
    expect(managementService).toBeInstanceOf(DeviceManagementService);
    expect(rotationOptions).toEqual({
      rotationDeadlineSeconds: 900,
      rotationAckRecoverySeconds: 120,
      rotationRuntimeEnabled: false,
    });
    expect(rotationService).toBeInstanceOf(DeviceCredentialRotationService);

    const accessTokenConfigToken = getRequiredExportedSymbol('DEVICE_ACCESS_TOKEN_CONFIG');
    const requestHasherToken = getRequiredExportedSymbol('DEVICE_TOKEN_EXCHANGE_REQUEST_HASHER');
    const accessTokenServiceToken = getRequiredExportedSymbol('DEVICE_ACCESS_TOKEN_SERVICE');
    const tokenExchangeServiceToken = getRequiredExportedSymbol('DEVICE_TOKEN_EXCHANGE_SERVICE');
    const accessTokenConfig = moduleFixture.get(accessTokenConfigToken);
    const requestHasher = moduleFixture.get(requestHasherToken);
    const accessTokenService = moduleFixture.get(accessTokenServiceToken);
    const tokenExchangeService = moduleFixture.get(tokenExchangeServiceToken);

    expect(accessTokenConfig).toMatchObject({
      environment: 'dev',
      issuer: 'https://device-auth.example.test/dev',
      audience: 'yjlaser-device-api/dev',
      keyring: { currentKid: 'module-current' },
    });
    expect(requestHasher).toEqual(
      expect.objectContaining({ digest: expect.any(Function), verify: expect.any(Function) })
    );
    expect(accessTokenService).toEqual(expect.objectContaining({ issue: expect.any(Function) }));
    expect(tokenExchangeService).toEqual(
      expect.objectContaining({ exchange: expect.any(Function) })
    );
    await expect(moduleFixture.get(JwtService).signAsync({ probe: true })).rejects.toThrow();
    expect(JSON.stringify(runtimeConfig)).not.toContain(ACCESS_TOKEN_SIGNING_SECRET);
    expect(JSON.stringify(runtimeConfig)).not.toContain(TOKEN_EXCHANGE_HMAC_SECRET);

    await moduleFixture.close();
  });

  it('injects the enrollment service into management and approves through the resolved module graph', async () => {
    const approvedStatus = { state: 'approved-by-enrollment-service' };
    const approveEnrollment = jest.fn().mockResolvedValue(approvedStatus);
    const environment = createEnvironment();
    const moduleFixture = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), DeviceAuthModule],
    })
      .overrideProvider(ConfigService)
      .useValue({ get: (key: string) => environment[key] })
      .overrideProvider(AuthService)
      .useValue({ verifySession: jest.fn() })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(DEVICE_ENROLLMENT_SERVICE)
      .useValue({ approveEnrollment })
      .compile();

    const managementService = moduleFixture.get<DeviceManagementService>(DEVICE_MANAGEMENT_SERVICE);
    await expect(
      managementService.approveDevice({
        deviceId: '11111111-1111-4111-8111-111111111111',
        actorHash: 'a'.repeat(64),
      })
    ).resolves.toBe(approvedStatus);
    expect(approveEnrollment).toHaveBeenCalledWith({
      deviceId: '11111111-1111-4111-8111-111111111111',
      actorHash: 'a'.repeat(64),
    });

    await moduleFixture.close();
  });

  it('exports device-auth dependencies through symbols rather than service classes', () => {
    const exportedModule: Record<string, unknown> = deviceAuthModule;

    expect(typeof exportedModule.DEVICE_ACCESS_TOKEN_CONFIG).toBe('symbol');
    expect(typeof exportedModule.DEVICE_TOKEN_EXCHANGE_REQUEST_HASHER).toBe('symbol');
    expect(typeof exportedModule.DEVICE_ACCESS_TOKEN_SERVICE).toBe('symbol');
    expect(typeof exportedModule.DEVICE_TOKEN_EXCHANGE_SERVICE).toBe('symbol');
    expect(exportedModule.DeviceAccessTokenService).toBeUndefined();
    expect(exportedModule.DeviceTokenExchangeService).toBeUndefined();
  });

  it('fails module dependency construction when required device-auth config is absent', async () => {
    await expect(compileDeviceAuthModule({})).rejects.toMatchObject({
      code: 'DEVICE_AUTH_RUNTIME_ENVIRONMENT_INVALID',
    });
  });

  it('applies separate no-store middleware to management and bearer-only device routes', () => {
    const forRoutes = jest.fn();
    const apply = jest.fn(() => ({ forRoutes }));
    const middlewareConsumer = { apply } as unknown as MiddlewareConsumer;

    new DeviceAuthModule().configure(middlewareConsumer);

    expect(apply).toHaveBeenCalledWith(DeviceRotationFeatureGateMiddleware);
    expect(apply).toHaveBeenCalledWith(DeviceManagementNoStoreMiddleware);
    expect(forRoutes).toHaveBeenCalledWith(DeviceManagementController);
    expect(apply).toHaveBeenCalledWith(DeviceBearerNoStoreMiddleware);
    expect(forRoutes).toHaveBeenCalledWith(DeviceBearerController);
    expect(forRoutes).toHaveBeenCalledWith(DeviceCredentialRotationController);
  });

  it('registers the bearer controller and heartbeat service without ProgramsService or ApiKeyGuard', () => {
    const controllers = Reflect.getMetadata('controllers', DeviceAuthModule) as unknown[];
    const providers = Reflect.getMetadata('providers', DeviceAuthModule) as unknown[];

    expect(controllers).toContain(DeviceBearerController);
    expect(controllers).toContain(DeviceCredentialRotationController);
    expect(providers).toContain(DeviceHeartbeatService);
    expect(JSON.stringify(controllers.map((value) => String(value)))).not.toContain(
      'ProgramsController'
    );
    expect(JSON.stringify(providers.map((value) => String(value)))).not.toContain('ApiKeyGuard');

    const managementProvider = providers.find(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        (provider as { provide?: unknown }).provide === DEVICE_MANAGEMENT_SERVICE
    ) as { inject?: unknown[]; useFactory?: (...args: unknown[]) => unknown };
    expect(managementProvider.inject).toEqual([
      PrismaService,
      DEVICE_AUTH_CONFIG,
      DEVICE_ENROLLMENT_OPTIONS,
      DEVICE_ENROLLMENT_SERVICE,
    ]);
    expect(managementProvider.useFactory).toHaveLength(4);
  });

  it('exports only the device bearer source and verifier needed by composite integration auth', () => {
    const exports = Reflect.getMetadata('exports', DeviceAuthModule) as unknown[];
    expect(exports).toEqual(
      expect.arrayContaining([DeviceBearerRequestSourceGuard, DeviceBearerGuard])
    );
  });
});
