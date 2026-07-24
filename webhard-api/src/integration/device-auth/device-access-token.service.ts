import { JwtService } from '@nestjs/jwt';
import {
  DEFAULT_DEVICE_ACCESS_PERMISSIONS,
  isIntegrationPermission,
} from '../auth/integration-permissions';
import {
  DEVICE_ACCESS_TOKEN_TTL_SECONDS,
  type DeviceAccessTokenConfig,
} from './device-access-token.config';
import {
  DEVICE_CAPABILITY_PROFILES,
  DEVICE_AUTH_PROGRAM_TYPES,
  type DeviceAccessTokenClaims,
  type DeviceAccessTokenErrorCode,
  type DeviceAccessTokenIssueInput,
  type DeviceAuthEnvironment,
  type DeviceCapabilityProfile,
  type DeviceAuthProgramType,
} from './device-auth.types';

const CANONICAL_KID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const DEVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAXIMUM_CREDENTIAL_VERSION = 2_147_483_647;

export class DeviceAccessTokenError extends Error {
  public readonly code: DeviceAccessTokenErrorCode;

  public constructor(code: DeviceAccessTokenErrorCode) {
    super(code);
    this.name = 'DeviceAccessTokenError';
    this.code = code;
  }

  public toJSON(): { readonly code: DeviceAccessTokenErrorCode } {
    return { code: this.code };
  }
}

export class DeviceAccessTokenService {
  public constructor(
    private readonly jwtService: JwtService,
    private readonly config: DeviceAccessTokenConfig
  ) {}

  public async issue(input: DeviceAccessTokenIssueInput): Promise<string> {
    const claims = parseIssueInput(input, this.config.environment);
    if (!claims) {
      throw new DeviceAccessTokenError('DEVICE_ACCESS_TOKEN_INPUT_INVALID');
    }

    const issuedAt = getCurrentUnixTimeSeconds();
    const signingKey = this.config.keyring.getCurrentSigningKey();

    try {
      return await this.jwtService.signAsync(
        {
          ...claims,
          iat: issuedAt,
        },
        {
          secret: signingKey.secret,
          algorithm: 'HS256',
          header: { alg: 'HS256', kid: signingKey.kid },
          issuer: this.config.issuer,
          audience: this.config.audience,
          expiresIn: DEVICE_ACCESS_TOKEN_TTL_SECONDS,
        }
      );
    } catch {
      throw new DeviceAccessTokenError('DEVICE_ACCESS_TOKEN_INPUT_INVALID');
    }
  }

  public async verify(token: unknown): Promise<DeviceAccessTokenClaims> {
    if (typeof token !== 'string' || token.length === 0) {
      throwInvalidToken();
    }

    const kid = this.getUnverifiedKid(token);
    if (!kid) {
      throwInvalidToken();
    }

    const verificationKey = this.config.keyring.getVerificationKey(kid, new Date());
    if (!verificationKey) {
      throwInvalidToken();
    }

    let payload: Record<string, unknown>;
    try {
      payload = await this.jwtService.verifyAsync<Record<string, unknown>>(token, {
        secret: verificationKey.secret,
        algorithms: ['HS256'],
        issuer: this.config.issuer,
        audience: this.config.audience,
        clockTimestamp: getCurrentUnixTimeSeconds(),
      });
    } catch {
      throwInvalidToken();
    }

    const claims = parseVerifiedClaims(
      payload,
      this.config.environment,
      getCurrentUnixTimeSeconds()
    );
    if (!claims) {
      throwInvalidToken();
    }

    return claims;
  }

  private getUnverifiedKid(token: string): string | undefined {
    try {
      const decoded = this.jwtService.decode<unknown>(token, { complete: true });
      if (!isRecord(decoded)) {
        return undefined;
      }

      const header = getOwnValue(decoded, 'header');
      if (!isRecord(header)) {
        return undefined;
      }

      const kid = getOwnValue(header, 'kid');
      return isCanonicalKid(kid) ? kid : undefined;
    } catch {
      return undefined;
    }
  }
}

function parseIssueInput(
  input: DeviceAccessTokenIssueInput,
  selectedEnvironment: DeviceAuthEnvironment
): Omit<DeviceAccessTokenClaims, 'iat' | 'exp'> | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const deviceId = getOwnValue(input, 'deviceId');
  const environment = getOwnValue(input, 'environment');
  const programType = getOwnValue(input, 'programType');
  const permissions = getOwnValue(input, 'permissions');
  const capabilityProfile = getOwnValue(input, 'capabilityProfile');
  const credentialVersion = getOwnValue(input, 'credentialVersion');

  if (
    !isDeviceId(deviceId) ||
    environment !== selectedEnvironment ||
    !isDeviceAuthProgramType(programType) ||
    !isValidPermissionList(permissions) ||
    !isDeviceCapabilityProfile(capabilityProfile) ||
    !isCredentialVersion(credentialVersion)
  ) {
    return undefined;
  }

  if (
    (capabilityProfile === 'safe_canary' && permissions.length !== 0) ||
    (capabilityProfile === 'standard' && !hasServerDerivedPermissions(programType, permissions))
  ) {
    return undefined;
  }

  return Object.freeze({
    sub: deviceId,
    environment: selectedEnvironment,
    program_type: programType,
    permissions: Object.freeze([...permissions]),
    capability_profile: capabilityProfile,
    credential_version: credentialVersion,
    token_type: 'device_access',
  });
}

function parseVerifiedClaims(
  payload: unknown,
  selectedEnvironment: DeviceAuthEnvironment,
  now: number
): DeviceAccessTokenClaims | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const sub = getOwnValue(payload, 'sub');
  const environment = getOwnValue(payload, 'environment');
  const programType = getOwnValue(payload, 'program_type');
  const permissions = getOwnValue(payload, 'permissions');
  const capabilityProfile = getOwnValue(payload, 'capability_profile');
  const credentialVersion = getOwnValue(payload, 'credential_version');
  const tokenType = getOwnValue(payload, 'token_type');
  const issuedAt = getOwnValue(payload, 'iat');
  const expiresAt = getOwnValue(payload, 'exp');

  if (
    !isDeviceId(sub) ||
    environment !== selectedEnvironment ||
    !isDeviceAuthProgramType(programType) ||
    !isValidPermissionList(permissions) ||
    !isDeviceCapabilityProfile(capabilityProfile) ||
    !isCredentialVersion(credentialVersion) ||
    tokenType !== 'device_access' ||
    !isUnixTime(issuedAt) ||
    !isUnixTime(expiresAt) ||
    expiresAt - issuedAt !== DEVICE_ACCESS_TOKEN_TTL_SECONDS ||
    expiresAt <= now
  ) {
    return undefined;
  }

  if (
    (capabilityProfile === 'safe_canary' && permissions.length !== 0) ||
    (capabilityProfile === 'standard' && !hasServerDerivedPermissions(programType, permissions))
  ) {
    return undefined;
  }

  return Object.freeze({
    sub,
    environment: selectedEnvironment,
    program_type: programType,
    permissions: Object.freeze([...permissions]),
    capability_profile: capabilityProfile,
    credential_version: credentialVersion,
    token_type: 'device_access',
    iat: issuedAt,
    exp: expiresAt,
  });
}

function throwInvalidToken(): never {
  throw new DeviceAccessTokenError('DEVICE_ACCESS_TOKEN_INVALID');
}

function getCurrentUnixTimeSeconds(): number {
  return Math.floor(Date.now() / 1_000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getOwnValue(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function isCanonicalKid(value: unknown): value is string {
  return typeof value === 'string' && CANONICAL_KID_PATTERN.test(value);
}

function isDeviceId(value: unknown): value is string {
  return typeof value === 'string' && DEVICE_ID_PATTERN.test(value);
}

function isDeviceAuthProgramType(value: unknown): value is DeviceAuthProgramType {
  return (
    typeof value === 'string' && (DEVICE_AUTH_PROGRAM_TYPES as readonly string[]).includes(value)
  );
}

function isValidPermissionList(value: unknown): value is readonly string[] {
  if (!Array.isArray(value) || new Set(value).size !== value.length) {
    return false;
  }

  return value.every(
    (permission) => typeof permission === 'string' && isIntegrationPermission(permission)
  );
}

function hasServerDerivedPermissions(
  programType: DeviceAuthProgramType,
  permissions: readonly string[]
): boolean {
  const expectedPermissions = DEFAULT_DEVICE_ACCESS_PERMISSIONS[programType];
  return (
    permissions.length === expectedPermissions.length &&
    expectedPermissions.every((permission) => permissions.includes(permission))
  );
}

function isDeviceCapabilityProfile(value: unknown): value is DeviceCapabilityProfile {
  return (
    typeof value === 'string' && (DEVICE_CAPABILITY_PROFILES as readonly string[]).includes(value)
  );
}

function isCredentialVersion(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= MAXIMUM_CREDENTIAL_VERSION
  );
}

function isUnixTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
