import { JwtService } from '@nestjs/jwt';
import { loadDeviceAccessTokenConfig } from './device-access-token.config';
import { DeviceAccessTokenError, DeviceAccessTokenService } from './device-access-token.service';
import type { DeviceAccessTokenIssueInput } from './device-auth.types';
import { DEFAULT_DEVICE_ACCESS_PERMISSIONS } from '../auth/integration-permissions';

const CURRENT_SECRET = 'synthetic-current-signing-secret-0123456789';
const PREVIOUS_SECRET = 'synthetic-previous-signing-secret-0123456789';
const NOW = new Date('2026-07-20T00:00:00.000Z');
const DEVICE_ID = '8b3d9a4e-5c66-4c89-a813-4f33fd70fd21';
const MANAGEMENT_PERMISSIONS = DEFAULT_DEVICE_ACCESS_PERMISSIONS.management_program;

function createConfig() {
  return loadDeviceAccessTokenConfig(
    {
      environment: 'dev',
      environments: {
        dev: {
          issuer: 'https://device-auth.example.test/dev',
          audience: 'yjlaser-device-api/dev',
          currentKid: 'current-key',
          signingKeyring: [
            { kid: 'current-key', secret: CURRENT_SECRET },
            {
              kid: 'previous-key',
              secret: PREVIOUS_SECRET,
              verifyUntil: '2026-07-20T00:11:00.000Z',
            },
          ],
        },
      },
    },
    NOW
  );
}

function createService(): DeviceAccessTokenService {
  return new DeviceAccessTokenService(new JwtService(), createConfig());
}

function createIssueInput(): DeviceAccessTokenIssueInput {
  return {
    deviceId: DEVICE_ID,
    environment: 'dev' as const,
    programType: 'management_program',
    permissions: MANAGEMENT_PERMISSIONS,
    capabilityProfile: 'standard' as const,
    credentialVersion: 7,
  };
}

function createClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const issuedAt = Math.floor(NOW.getTime() / 1000);
  return {
    sub: DEVICE_ID,
    environment: 'dev',
    program_type: 'management_program',
    permissions: MANAGEMENT_PERMISSIONS,
    capability_profile: 'standard',
    credential_version: 7,
    token_type: 'device_access',
    iat: issuedAt,
    ...overrides,
  };
}

async function signToken({
  secret = CURRENT_SECRET,
  kid = 'current-key',
  issuer = 'https://device-auth.example.test/dev',
  audience = 'yjlaser-device-api/dev',
  algorithm = 'HS256',
  expiresIn = 600,
  claims = createClaims(),
}: {
  readonly secret?: string;
  readonly kid?: string;
  readonly issuer?: string;
  readonly audience?: string;
  readonly algorithm?: 'HS256' | 'HS384';
  readonly expiresIn?: number;
  readonly claims?: Record<string, unknown>;
} = {}): Promise<string> {
  return new JwtService().signAsync(claims, {
    secret,
    algorithm,
    header: { alg: algorithm, kid },
    issuer,
    audience,
    expiresIn,
  });
}

function createUnsignedToken(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', kid: 'current-key', typ: 'JWT' })}.${encode(payload)}.`;
}

async function expectInvalidToken(
  action: () => Promise<unknown>,
  sensitiveValue?: string
): Promise<void> {
  try {
    await action();
    throw new Error('Expected the token to be rejected');
  } catch (error) {
    expect(error).toBeInstanceOf(DeviceAccessTokenError);
    expect((error as DeviceAccessTokenError).code).toBe('DEVICE_ACCESS_TOKEN_INVALID');
    expect(String(error)).not.toContain(sensitiveValue ?? '');
    expect(JSON.stringify(error)).not.toContain(sensitiveValue ?? '');
  }
}

describe('DeviceAccessTokenService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('issues exactly a ten-minute HS256 device access token without exposing the signing secret', async () => {
    const service = createService();

    const token = await service.issue(createIssueInput());
    const decoded = new JwtService().decode<{
      readonly header: Record<string, unknown>;
      readonly payload: Record<string, unknown>;
    }>(token, { complete: true });

    expect(decoded.header).toMatchObject({ alg: 'HS256', kid: 'current-key' });
    expect(decoded.payload).toMatchObject({
      sub: DEVICE_ID,
      environment: 'dev',
      program_type: 'management_program',
      permissions: MANAGEMENT_PERMISSIONS,
      capability_profile: 'standard',
      credential_version: 7,
      token_type: 'device_access',
      iat: Math.floor(NOW.getTime() / 1000),
      exp: Math.floor(NOW.getTime() / 1000) + 600,
    });
    expect(token).not.toContain(CURRENT_SECRET);
    expect(await service.verify(token)).toEqual({
      sub: DEVICE_ID,
      environment: 'dev',
      program_type: 'management_program',
      permissions: MANAGEMENT_PERMISSIONS,
      capability_profile: 'standard',
      credential_version: 7,
      token_type: 'device_access',
      iat: Math.floor(NOW.getTime() / 1000),
      exp: Math.floor(NOW.getTime() / 1000) + 600,
    });
  });

  it('verifies a not-yet-expired previous signing key during its overlap window', async () => {
    const service = createService();
    const previousKeyToken = await signToken({ secret: PREVIOUS_SECRET, kid: 'previous-key' });

    await expect(service.verify(previousKeyToken)).resolves.toMatchObject({
      sub: DEVICE_ID,
      token_type: 'device_access',
    });
  });

  it("rejects non-device programs and permissions outside each program's server-derived scope", async () => {
    const service = createService();
    const adminDashboardInput = {
      ...createIssueInput(),
      programType: 'admin_dashboard',
      permissions: ['operation/read'],
    };
    const externalProgramScopeInput = {
      ...createIssueInput(),
      programType: 'external_webhard_sync',
      permissions: ['operation/read'],
    };
    const nonDeviceProgramToken = await signToken({
      claims: createClaims({
        program_type: 'admin_dashboard',
        permissions: ['operation/read'],
      }),
    });
    const crossProgramScopeToken = await signToken({
      claims: createClaims({
        program_type: 'external_webhard_sync',
        permissions: ['operation/read'],
      }),
    });

    await expect(
      service.issue(adminDashboardInput as DeviceAccessTokenIssueInput)
    ).rejects.toMatchObject({
      code: 'DEVICE_ACCESS_TOKEN_INPUT_INVALID',
    });
    await expect(
      service.issue(externalProgramScopeInput as DeviceAccessTokenIssueInput)
    ).rejects.toMatchObject({
      code: 'DEVICE_ACCESS_TOKEN_INPUT_INVALID',
    });
    await expectInvalidToken(() => service.verify(nonDeviceProgramToken), nonDeviceProgramToken);
    await expectInvalidToken(() => service.verify(crossProgramScopeToken), crossProgramScopeToken);
  });

  it('rejects the broader legacy worker defaults for device issue and verify', async () => {
    const service = createService();
    const legacyPermissions = [
      'event/write',
      'job/read',
      'contact/process-stage:write',
      'bank-notification/read',
      'bank-notification/manage',
    ];
    await expect(
      service.issue({ ...createIssueInput(), permissions: legacyPermissions })
    ).rejects.toMatchObject({ code: 'DEVICE_ACCESS_TOKEN_INPUT_INVALID' });
    const token = await signToken({ claims: createClaims({ permissions: legacyPermissions }) });
    await expectInvalidToken(() => service.verify(token), token);
  });

  it('rejects malformed, unsigned, unknown-kid, and non-HS256 tokens with one safe error code', async () => {
    const service = createService();
    const unknownKidToken = await signToken({ kid: 'unknown-key' });
    const hs384Token = await signToken({ algorithm: 'HS384' });
    const unsignedToken = createUnsignedToken(
      createClaims({ exp: Math.floor(NOW.getTime() / 1000) + 600 })
    );

    await expectInvalidToken(() => service.verify('not-a-jwt'), 'not-a-jwt');
    await expectInvalidToken(() => service.verify(unknownKidToken), unknownKidToken);
    await expectInvalidToken(() => service.verify(hs384Token), hs384Token);
    await expectInvalidToken(() => service.verify(unsignedToken), unsignedToken);
  });

  it('rejects a valid signature with the wrong issuer, audience, selected environment, expiry, token type, or malformed claims', async () => {
    const service = createService();
    const wrongIssuerToken = await signToken({ issuer: 'https://wrong.example.test' });
    const wrongAudienceToken = await signToken({ audience: 'another-audience' });
    const wrongEnvironmentToken = await signToken({
      claims: createClaims({ environment: 'stg' }),
    });
    const wrongTokenType = await signToken({
      claims: createClaims({ token_type: 'device_refresh' }),
    });
    const malformedPermissions = await signToken({
      claims: createClaims({ permissions: ['all'] }),
    });
    const expiredToken = await signToken({ expiresIn: 1 });

    await expectInvalidToken(() => service.verify(wrongIssuerToken), wrongIssuerToken);
    await expectInvalidToken(() => service.verify(wrongAudienceToken), wrongAudienceToken);
    await expectInvalidToken(() => service.verify(wrongEnvironmentToken), wrongEnvironmentToken);
    await expectInvalidToken(() => service.verify(wrongTokenType), wrongTokenType);
    await expectInvalidToken(() => service.verify(malformedPermissions), malformedPermissions);

    jest.setSystemTime(new Date(NOW.getTime() + 2_000));
    await expectInvalidToken(() => service.verify(expiredToken), expiredToken);
  });
});
