import { DeviceRotationBearerGuard } from './device-rotation-bearer.guard';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { DeviceBearerGuard } from './device-bearer.guard';
import {
  DEVICE_ACCESS_TOKEN_SERVICE,
  DEVICE_AUTH_CONFIG,
  DEVICE_AUTH_ROTATION_OPTIONS,
} from './device-auth.tokens';
import { DeviceBearerRequestSourceGuard } from './device-bearer-request-source.guard';
import { loadDeviceAuthConfig } from './device-auth.config';
import { hashDeviceCredential } from './device-credential-hash';

const CANDIDATE = Buffer.alloc(32, 8).toString('base64url');

describe('DeviceRotationBearerGuard', () => {
  it('compiles through Nest DI without requiring a Function clock provider', async () => {
    await expect(
      Test.createTestingModule({
        providers: [
          DeviceRotationBearerGuard,
          { provide: DeviceBearerGuard, useValue: { canActivate: jest.fn() } },
          { provide: PrismaService, useValue: {} },
          { provide: DEVICE_AUTH_CONFIG, useValue: {} },
          { provide: DEVICE_ACCESS_TOKEN_SERVICE, useValue: {} },
          {
            provide: DEVICE_AUTH_ROTATION_OPTIONS,
            useValue: { rotationAckRecoverySeconds: 120 },
          },
        ],
      }).compile()
    ).resolves.toBeDefined();
  });

  it('delegates an ordinary rotation request to the device bearer guard', async () => {
    const deviceBearerGuard = { canActivate: jest.fn().mockResolvedValue(true) };
    const guard = new DeviceRotationBearerGuard(deviceBearerGuard as never);
    const context = {};

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(deviceBearerGuard.canActivate).toHaveBeenCalledWith(context);
  });

  it('recovers only an acknowledged ACK with the predecessor token and matching candidate at the inclusive boundary', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-20T01:02:00.000Z'));
    const config = loadDeviceAuthConfig({
      environment: 'dev',
      environments: {
        dev: {
          currentHashKeyVersion: 1,
          credentialPepperKeyring: { '1': 'synthetic-rotation-pepper-0123456789' },
        },
      },
    });
    const request = {
      method: 'POST',
      route: { path: 'credential-rotations/:rotationId/ack' },
      params: { rotationId: '22222222-2222-4222-8222-222222222222' },
      body: { candidateCredential: CANDIDATE },
      headers: { authorization: 'Bearer old.jwt.token' },
      rawHeaders: ['Authorization', 'Bearer old.jwt.token'],
    };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as never;
    new DeviceBearerRequestSourceGuard().canActivate(context);
    const regular = { canActivate: jest.fn().mockRejectedValue(new Error('old version')) };
    const prisma = {
      deviceCredentialRotation: {
        findFirst: jest.fn().mockResolvedValue({
          id: request.params.rotationId,
          status: 'acknowledged',
          baseCredentialVersion: 7,
          acknowledgedAt: new Date('2026-07-20T01:00:00.000Z'),
          device: {
            id: '11111111-1111-4111-8111-111111111111',
            environment: 'dev',
            programType: 'nesting_program',
            capabilityProfile: 'standard',
            status: 'active',
            credentialVersion: 8,
            revokedAt: null,
          },
          candidateCredential: {
            ...hashDeviceCredential(config, CANDIDATE),
            status: 'active',
            credentialVersion: 8,
            revokedAt: null,
            expiresAt: new Date('2026-08-20T00:00:00.000Z'),
          },
        }),
      },
    };
    const verifier = {
      verify: jest.fn().mockResolvedValue({
        sub: '11111111-1111-4111-8111-111111111111',
        environment: 'dev',
        program_type: 'nesting_program',
        permissions: [],
        capability_profile: 'standard',
        credential_version: 7,
        token_type: 'device_access',
        iat: 1,
        exp: 2,
      }),
    };
    const guard = new (DeviceRotationBearerGuard as unknown as new (
      ...args: unknown[]
    ) => DeviceRotationBearerGuard)(regular, prisma, config, verifier, {
      rotationAckRecoverySeconds: 120,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    jest.useRealTimers();
  });

  it('maps recovery database failures to the generic unavailable response and installs no principal', async () => {
    const request = {
      method: 'POST',
      route: { path: 'credential-rotations/:rotationId/ack' },
      params: { rotationId: '22222222-2222-4222-8222-222222222222' },
      body: { candidateCredential: CANDIDATE },
      headers: { authorization: 'Bearer old.jwt.token' },
      rawHeaders: ['Authorization', 'Bearer old.jwt.token'],
    };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as never;
    new DeviceBearerRequestSourceGuard().canActivate(context);
    const guard = new (DeviceRotationBearerGuard as unknown as new (
      ...args: unknown[]
    ) => DeviceRotationBearerGuard)(
      { canActivate: jest.fn().mockRejectedValue(new Error('old version')) },
      { deviceCredentialRotation: { findFirst: jest.fn().mockRejectedValue(new Error('db')) } },
      loadDeviceAuthConfig({
        environment: 'dev',
        environments: {
          dev: {
            currentHashKeyVersion: 1,
            credentialPepperKeyring: { '1': 'synthetic-rotation-pepper-0123456789' },
          },
        },
      }),
      {
        verify: jest.fn().mockResolvedValue({
          sub: '11111111-1111-4111-8111-111111111111',
          environment: 'dev',
          program_type: 'nesting_program',
          permissions: [],
          capability_profile: 'standard',
          credential_version: 7,
        }),
      },
      { rotationAckRecoverySeconds: 120 }
    );

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 503,
      response: { code: 'device_auth_unavailable' },
    });
    expect((request as { deviceAuthInfo?: unknown }).deviceAuthInfo).toBeUndefined();
  });

  it('never invokes recovery or installs a principal outside the ACK route', async () => {
    const request = { method: 'POST', originalUrl: '/api/v1/integration/devices/heartbeat' };
    const original = new Error('old version');
    const prisma = { deviceCredentialRotation: { findFirst: jest.fn() } };
    const guard = new (DeviceRotationBearerGuard as unknown as new (
      ...args: unknown[]
    ) => DeviceRotationBearerGuard)(
      { canActivate: jest.fn().mockRejectedValue(original) },
      prisma,
      {},
      {},
      { rotationAckRecoverySeconds: 120 }
    );
    await expect(
      guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never)
    ).rejects.toBe(original);
    expect(prisma.deviceCredentialRotation.findFirst).not.toHaveBeenCalled();
    expect((request as { deviceAuthInfo?: unknown }).deviceAuthInfo).toBeUndefined();
  });

  it.each([
    ['wrong rotation', { row: { id: '33333333-3333-4333-8333-333333333333' } }],
    ['wrong status', { row: { status: 'prepared' } }],
    ['wrong predecessor version', { row: { baseCredentialVersion: 6 } }],
    ['wrong device', { device: { id: '33333333-3333-4333-8333-333333333333' } }],
    ['wrong environment', { device: { environment: 'stg' } }],
    ['wrong program', { device: { programType: 'management_program' } }],
    ['wrong profile', { device: { capabilityProfile: 'safe_canary' } }],
    [
      'revoked device',
      { device: { status: 'revoked', revokedAt: new Date('2026-07-20T01:00:00.000Z') } },
    ],
    ['expired candidate', { candidate: { expiresAt: new Date('2026-07-20T01:02:00.000Z') } }],
    ['wrong proof', { rawCandidate: Buffer.alloc(32, 9).toString('base64url') }],
    ['expired recovery window', { now: new Date('2026-07-20T01:02:00.001Z') }],
  ])('rejects ACK recovery for %s without installing a principal', async (_label, overrides) => {
    const now =
      'now' in overrides && overrides.now ? overrides.now : new Date('2026-07-20T01:02:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const config = loadDeviceAuthConfig({
      environment: 'dev',
      environments: {
        dev: {
          currentHashKeyVersion: 1,
          credentialPepperKeyring: { '1': 'synthetic-rotation-pepper-0123456789' },
        },
      },
    });
    const rawCandidate =
      'rawCandidate' in overrides && overrides.rawCandidate ? overrides.rawCandidate : CANDIDATE;
    const request = {
      method: 'POST',
      route: { path: 'credential-rotations/:rotationId/ack' },
      params: { rotationId: '22222222-2222-4222-8222-222222222222' },
      body: { candidateCredential: rawCandidate },
      headers: { authorization: 'Bearer old.jwt.token' },
      rawHeaders: ['Authorization', 'Bearer old.jwt.token'],
    };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as never;
    new DeviceBearerRequestSourceGuard().canActivate(context);
    const original = new Error('old version');
    const row = {
      id: request.params.rotationId,
      status: 'acknowledged',
      baseCredentialVersion: 7,
      acknowledgedAt: new Date('2026-07-20T01:00:00.000Z'),
      device: {
        id: '11111111-1111-4111-8111-111111111111',
        environment: 'dev',
        programType: 'nesting_program',
        capabilityProfile: 'standard',
        status: 'active',
        credentialVersion: 8,
        revokedAt: null,
        ...('device' in overrides ? overrides.device : {}),
      },
      candidateCredential: {
        ...hashDeviceCredential(config, CANDIDATE),
        status: 'active',
        credentialVersion: 8,
        revokedAt: null,
        expiresAt: new Date('2026-08-20T00:00:00.000Z'),
        ...('candidate' in overrides ? overrides.candidate : {}),
      },
      ...('row' in overrides ? overrides.row : {}),
    };
    const guard = new (DeviceRotationBearerGuard as unknown as new (
      ...args: unknown[]
    ) => DeviceRotationBearerGuard)(
      { canActivate: jest.fn().mockRejectedValue(original) },
      { deviceCredentialRotation: { findFirst: jest.fn().mockResolvedValue(row) } },
      config,
      {
        verify: jest.fn().mockResolvedValue({
          sub: '11111111-1111-4111-8111-111111111111',
          environment: 'dev',
          program_type: 'nesting_program',
          permissions: [],
          capability_profile: 'standard',
          credential_version: 7,
        }),
      },
      { rotationAckRecoverySeconds: 120 }
    );
    await expect(guard.canActivate(context)).rejects.toBe(original);
    expect((request as { deviceAuthInfo?: unknown }).deviceAuthInfo).toBeUndefined();
    jest.useRealTimers();
  });
});
