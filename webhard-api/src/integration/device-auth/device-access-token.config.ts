import {
  DEVICE_AUTH_ENVIRONMENTS,
  type DeviceAccessTokenConfigurationErrorCode,
  type DeviceAuthEnvironment,
} from './device-auth.types';

const CANONICAL_KID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MINIMUM_SIGNING_SECRET_BYTE_LENGTH = 32;
export const DEVICE_ACCESS_TOKEN_TTL_SECONDS = 10 * 60;
export const DEVICE_ACCESS_TOKEN_CLOCK_SKEW_SECONDS = 60;
const MAXIMUM_PREVIOUS_KEY_OVERLAP_MILLISECONDS =
  (DEVICE_ACCESS_TOKEN_TTL_SECONDS + DEVICE_ACCESS_TOKEN_CLOCK_SKEW_SECONDS) * 1_000;

export interface DeviceAccessTokenConfig {
  readonly environment: DeviceAuthEnvironment;
  readonly issuer: string;
  readonly audience: string;
  readonly keyring: DeviceAccessTokenKeyring;
}

interface DeviceAccessTokenKey {
  readonly kid: string;
  readonly secret: Buffer;
  readonly verifyUntil?: Date;
}

export class DeviceAccessTokenConfigurationError extends Error {
  public readonly code: DeviceAccessTokenConfigurationErrorCode;

  public constructor(code: DeviceAccessTokenConfigurationErrorCode) {
    super(code);
    this.name = 'DeviceAccessTokenConfigurationError';
    this.code = code;
  }

  public toJSON(): { readonly code: DeviceAccessTokenConfigurationErrorCode } {
    return { code: this.code };
  }
}

export class DeviceAccessTokenKeyring {
  readonly #keys: ReadonlyMap<string, DeviceAccessTokenKey>;
  public readonly currentKid: string;

  private constructor(currentKid: string, keys: ReadonlyMap<string, DeviceAccessTokenKey>) {
    this.currentKid = currentKid;
    this.#keys = keys;
  }

  public static fromUnknown(
    value: unknown,
    currentKid: string,
    now: Date
  ): DeviceAccessTokenKeyring {
    if (!Array.isArray(value) || value.length === 0) {
      throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_SIGNING_KEYRING_INVALID');
    }

    const keys = new Map<string, DeviceAccessTokenKey>();
    for (const entry of value) {
      if (!isRecord(entry)) {
        throw new DeviceAccessTokenConfigurationError(
          'DEVICE_ACCESS_TOKEN_SIGNING_KEYRING_INVALID'
        );
      }

      const kid = getOwnValue(entry, 'kid');
      if (!isCanonicalKid(kid)) {
        throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_KEY_ID_INVALID');
      }
      if (keys.has(kid)) {
        throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_KEY_ID_DUPLICATE');
      }

      const secret = getOwnValue(entry, 'secret');
      if (!isValidSigningSecret(secret)) {
        throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_KEY_SECRET_INVALID');
      }

      const verifyUntil = parseVerifyUntil(getOwnValue(entry, 'verifyUntil'));
      keys.set(
        kid,
        Object.freeze({
          kid,
          secret: Buffer.from(secret, 'utf8'),
          ...(verifyUntil === undefined ? {} : { verifyUntil }),
        })
      );
    }

    if (!keys.has(currentKid)) {
      throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_CURRENT_KEY_MISSING');
    }

    let previousKeyCount = 0;
    for (const key of keys.values()) {
      if (key.kid === currentKid) {
        if (key.verifyUntil !== undefined) {
          throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_KEY_OVERLAP_INVALID');
        }
      } else {
        previousKeyCount += 1;
        if (
          key.verifyUntil === undefined ||
          key.verifyUntil.getTime() <= now.getTime() ||
          key.verifyUntil.getTime() > now.getTime() + MAXIMUM_PREVIOUS_KEY_OVERLAP_MILLISECONDS
        ) {
          throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_KEY_OVERLAP_INVALID');
        }
      }
    }

    if (previousKeyCount > 1) {
      throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_KEY_OVERLAP_INVALID');
    }

    return new DeviceAccessTokenKeyring(currentKid, keys);
  }

  public getCurrentSigningKey(): { readonly kid: string; readonly secret: Buffer } {
    const key = this.#keys.get(this.currentKid);
    if (!key) {
      throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_CURRENT_KEY_MISSING');
    }

    return { kid: key.kid, secret: Buffer.from(key.secret) };
  }

  public getVerificationKey(
    kid: string,
    now: Date
  ): { readonly kid: string; readonly secret: Buffer } | undefined {
    const key = this.#keys.get(kid);
    if (!key || (key.verifyUntil !== undefined && key.verifyUntil.getTime() <= now.getTime())) {
      return undefined;
    }

    return { kid: key.kid, secret: Buffer.from(key.secret) };
  }

  public toJSON(): { readonly currentKid: string; readonly keyIds: readonly string[] } {
    return {
      currentKid: this.currentKid,
      keyIds: [...this.#keys.keys()],
    };
  }
}

export function loadDeviceAccessTokenConfig(
  input: unknown,
  now: Date = new Date()
): DeviceAccessTokenConfig {
  if (!isRecord(input)) {
    throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_CONFIG_INVALID');
  }

  const environment = getOwnValue(input, 'environment');
  if (!isDeviceAuthEnvironment(environment)) {
    throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_ENVIRONMENT_INVALID');
  }

  const environments = getOwnValue(input, 'environments');
  if (!isRecord(environments)) {
    throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_CONFIG_INVALID');
  }

  const selectedEnvironmentConfig = getOwnValue(environments, environment);
  if (!isRecord(selectedEnvironmentConfig)) {
    throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_ENVIRONMENT_CONFIG_MISSING');
  }

  const issuer = getOwnValue(selectedEnvironmentConfig, 'issuer');
  if (!isNonBlankString(issuer)) {
    throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_ISSUER_INVALID');
  }

  const audience = getOwnValue(selectedEnvironmentConfig, 'audience');
  if (!isNonBlankString(audience)) {
    throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_AUDIENCE_INVALID');
  }

  const currentKid = getOwnValue(selectedEnvironmentConfig, 'currentKid');
  if (!isCanonicalKid(currentKid)) {
    throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_CURRENT_KID_INVALID');
  }

  const keyring = DeviceAccessTokenKeyring.fromUnknown(
    getOwnValue(selectedEnvironmentConfig, 'signingKeyring'),
    currentKid,
    now
  );

  return Object.freeze({ environment, issuer, audience, keyring });
}

function isDeviceAuthEnvironment(value: unknown): value is DeviceAuthEnvironment {
  return (
    typeof value === 'string' && (DEVICE_AUTH_ENVIRONMENTS as readonly string[]).includes(value)
  );
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

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidSigningSecret(value: unknown): value is string {
  return (
    isNonBlankString(value) &&
    Buffer.byteLength(value, 'utf8') >= MINIMUM_SIGNING_SECRET_BYTE_LENGTH
  );
}

function parseVerifyUntil(value: unknown): Date | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_KEY_OVERLAP_INVALID');
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new DeviceAccessTokenConfigurationError('DEVICE_ACCESS_TOKEN_KEY_OVERLAP_INVALID');
  }

  return parsed;
}
