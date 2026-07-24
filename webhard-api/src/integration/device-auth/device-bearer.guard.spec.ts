import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DEFAULT_DEVICE_ACCESS_PERMISSIONS } from '../auth/integration-permissions';
import type { DeviceAccessTokenService } from './device-access-token.service';
import { DeviceBearerRequestSourceGuard } from './device-bearer-request-source.guard';
import { DeviceBearerGuard } from './device-bearer.guard';
import type { DeviceAuthConfig } from './device-auth.config';
import type { DeviceAccessTokenClaims } from './device-auth.types';
import type { PrismaService } from '../../prisma/prisma.service';

const DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-07-20T12:00:00.000Z');

function claims(overrides: Partial<DeviceAccessTokenClaims> = {}): DeviceAccessTokenClaims {
  return {
    sub: DEVICE_ID,
    environment: 'dev',
    program_type: 'nesting_program',
    permissions: [...DEFAULT_DEVICE_ACCESS_PERMISSIONS.nesting_program],
    capability_profile: 'standard',
    credential_version: 4,
    token_type: 'device_access',
    iat: 1_753_000_000,
    exp: 1_753_000_900,
    ...overrides,
  };
}

function activeDevice(overrides: Record<string, unknown> = {}) {
  return {
    id: DEVICE_ID,
    environment: 'dev',
    programType: 'nesting_program',
    capabilityProfile: 'standard',
    status: 'active',
    revokedAt: null,
    credentialVersion: 4,
    refreshCredentials: [{ id: 'credential-4' }],
    ...overrides,
  };
}

function makeContext() {
  const request: Record<PropertyKey, unknown> = {
    headers: { authorization: 'Bearer synthetic.jwt.token' },
    rawHeaders: ['Authorization', 'Bearer synthetic.jwt.token'],
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const sourceGuard = new DeviceBearerRequestSourceGuard();
  sourceGuard.canActivate(context);
  return { context, request };
}

function makeGuard(
  input: {
    readonly verifiedClaims?: DeviceAccessTokenClaims;
    readonly exactDevice?: unknown;
    readonly revokedDevice?: unknown;
    readonly verifyError?: unknown;
    readonly databaseError?: unknown;
  } = {}
) {
  const verify = input.verifyError
    ? jest.fn().mockRejectedValue(input.verifyError)
    : jest.fn().mockResolvedValue(input.verifiedClaims ?? claims());
  const findFirst = input.databaseError
    ? jest.fn().mockRejectedValue(input.databaseError)
    : jest
        .fn()
        .mockResolvedValueOnce(input.exactDevice === undefined ? activeDevice() : input.exactDevice)
        .mockResolvedValueOnce(input.revokedDevice ?? null);
  const prisma = { integrationDevice: { findFirst } } as unknown as PrismaService;
  const accessTokenService = { verify } as unknown as DeviceAccessTokenService;
  const config = { environment: 'dev' } as DeviceAuthConfig;
  return {
    guard: new DeviceBearerGuard(prisma, config, accessTokenService, () => NOW),
    verify,
    findFirst,
  };
}

describe('DeviceBearerGuard', () => {
  it('verifies the bearer, performs exact environment/version/credential DB revalidation, and attaches only a frozen principal', async () => {
    const { guard, verify, findFirst } = makeGuard();
    const { context, request } = makeContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('synthetic.jwt.token');
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: DEVICE_ID,
        environment: 'dev',
        status: 'active',
        revokedAt: null,
        credentialVersion: 4,
        programType: 'nesting_program',
        capabilityProfile: 'standard',
        tokenExchanges: {
          none: {
            credentialVersion: 4,
            status: 'revoked',
          },
        },
        refreshCredentials: {
          some: {
            status: 'active',
            revokedAt: null,
            expiresAt: { gt: NOW },
            credentialVersion: 4,
          },
        },
      },
      select: {
        id: true,
        environment: true,
        programType: true,
        capabilityProfile: true,
        credentialVersion: true,
      },
    });
    expect(request.deviceAuthInfo).toEqual({
      deviceId: DEVICE_ID,
      environment: 'dev',
      programType: 'nesting_program',
      capabilityProfile: 'standard',
      permissions: DEFAULT_DEVICE_ACCESS_PERMISSIONS.nesting_program,
      credentialVersion: 4,
    });
    expect(Object.isFrozen(request.deviceAuthInfo)).toBe(true);
    expect(Object.isFrozen((request.deviceAuthInfo as { permissions: unknown }).permissions)).toBe(
      true
    );
    expect(request.user).toBeUndefined();
    expect(request.apiKeyInfo).toBeUndefined();
  });

  it('accepts safe_canary only with an empty permission list', async () => {
    const { guard } = makeGuard({
      verifiedClaims: claims({ capability_profile: 'safe_canary', permissions: [] }),
      exactDevice: activeDevice({ capabilityProfile: 'safe_canary' }),
    });
    const { context, request } = makeContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((request.deviceAuthInfo as { permissions: readonly string[] }).permissions).toEqual([]);
  });

  it.each([
    ['wrong environment', claims({ environment: 'stg' })],
    ['wrong program', claims({ program_type: 'management_program' })],
    ['wrong profile', claims({ capability_profile: 'safe_canary', permissions: [] })],
    ['wrong permission', claims({ permissions: ['event/write'] })],
    ['wrong version', claims({ credential_version: 5 })],
  ])(
    'rejects %s claims without fallback when exact DB state does not match',
    async (_name, value) => {
      const { guard } = makeGuard({ verifiedClaims: value, exactDevice: null });
      const { context } = makeContext();
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    }
  );

  it('maps explicit device revocation to device_revoked', async () => {
    const { guard } = makeGuard({
      exactDevice: null,
      revokedDevice: {
        status: 'revoked',
        revokedAt: NOW,
        refreshCredentials: [],
        tokenExchanges: [],
      },
    });
    const { context } = makeContext();

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
      response: { code: 'device_revoked', message: 'Device revoked' },
    });
  });

  it('maps an explicitly revoked credential or token exchange to device_revoked', async () => {
    for (const revokedDevice of [
      {
        status: 'active',
        revokedAt: null,
        refreshCredentials: [
          { status: 'revoked', revokedAt: NOW, expiresAt: new Date(NOW.getTime() + 60_000) },
        ],
        tokenExchanges: [],
      },
      {
        status: 'active',
        revokedAt: null,
        refreshCredentials: [],
        tokenExchanges: [{ id: 'revoked-exchange' }],
      },
    ]) {
      const { guard } = makeGuard({ exactDevice: null, revokedDevice });
      const { context } = makeContext();
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: 401,
        response: { code: 'device_revoked' },
      });
    }
  });

  it('fails closed when an otherwise active device has a revoked exchange for the token version', async () => {
    const { guard, findFirst } = makeGuard({
      exactDevice: null,
      revokedDevice: {
        status: 'active',
        revokedAt: null,
        refreshCredentials: [
          {
            status: 'active',
            revokedAt: null,
            expiresAt: new Date(NOW.getTime() + 60_000),
          },
        ],
        tokenExchanges: [{ id: 'revoked-exchange' }],
      },
    });

    await expect(guard.canActivate(makeContext().context)).rejects.toMatchObject({
      status: 401,
      response: { code: 'device_revoked' },
    });
    expect(findFirst.mock.calls[0][0].where.tokenExchanges).toEqual({
      none: { credentialVersion: 4, status: 'revoked' },
    });
  });

  it('maps a missing or merely expired credential to invalid rather than claiming explicit revocation', async () => {
    const { guard } = makeGuard({
      exactDevice: null,
      revokedDevice: {
        status: 'active',
        revokedAt: null,
        refreshCredentials: [
          {
            status: 'active',
            revokedAt: null,
            expiresAt: new Date(NOW.getTime() - 1),
          },
        ],
        tokenExchanges: [],
      },
    });
    await expect(guard.canActivate(makeContext().context)).rejects.toMatchObject({
      status: 401,
      response: { code: 'device_access_invalid' },
    });
  });

  it('maps token verification failures to device_access_invalid and DB failures to unavailable', async () => {
    const invalid = makeGuard({ verifyError: new Error('invalid token') });
    await expect(invalid.guard.canActivate(makeContext().context)).rejects.toBeInstanceOf(
      UnauthorizedException
    );

    const unavailable = makeGuard({ databaseError: new Error('db unavailable') });
    await expect(unavailable.guard.canActivate(makeContext().context)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
  });
});
