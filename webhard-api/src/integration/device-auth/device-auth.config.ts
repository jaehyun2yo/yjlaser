import { createHmac } from 'crypto';
import {
  DEVICE_AUTH_ENVIRONMENTS,
  type DeviceAuthConfigurationErrorCode,
  type DeviceAuthEnvironment,
  type DeviceAuthHashKeyVersion,
} from './device-auth.types';

const CANONICAL_HASH_KEY_VERSION_PATTERN = /^[1-9][0-9]*$/;
const MAXIMUM_PRISMA_INT = 2_147_483_647;
const MINIMUM_PEPPER_BYTE_LENGTH = 32;

export interface DeviceAuthConfig {
  readonly environment: DeviceAuthEnvironment;
  readonly currentHashKeyVersion: DeviceAuthHashKeyVersion;
  readonly credentialPepperKeyring: DeviceCredentialPepperKeyring;
}

export class DeviceAuthConfigurationError extends Error {
  public readonly code: DeviceAuthConfigurationErrorCode;

  public constructor(code: DeviceAuthConfigurationErrorCode) {
    super(code);
    this.name = 'DeviceAuthConfigurationError';
    this.code = code;
  }
}

export class DeviceCredentialPepperKeyring {
  readonly #peppers: ReadonlyMap<DeviceAuthHashKeyVersion, Buffer>;

  private constructor(peppers: ReadonlyMap<DeviceAuthHashKeyVersion, Buffer>) {
    this.#peppers = peppers;
  }

  public static fromUnknown(value: unknown): DeviceCredentialPepperKeyring {
    if (!isRecord(value)) {
      throw new DeviceAuthConfigurationError('DEVICE_AUTH_PEPPER_KEYRING_INVALID');
    }

    const pepperEntries = new Map<DeviceAuthHashKeyVersion, Buffer>();
    for (const [objectKey, pepper] of Object.entries(value)) {
      const hashKeyVersion = parseCanonicalHashKeyVersionObjectKey(objectKey);
      if (hashKeyVersion === undefined || !isValidPepper(pepper)) {
        throw new DeviceAuthConfigurationError('DEVICE_AUTH_PEPPER_INVALID');
      }

      pepperEntries.set(hashKeyVersion, Buffer.from(pepper, 'utf8'));
    }

    if (pepperEntries.size === 0) {
      throw new DeviceAuthConfigurationError('DEVICE_AUTH_PEPPER_KEYRING_INVALID');
    }

    return new DeviceCredentialPepperKeyring(pepperEntries);
  }

  public hasVersion(hashKeyVersion: DeviceAuthHashKeyVersion): boolean {
    return this.#peppers.has(hashKeyVersion);
  }

  public getRetainedHashKeyVersions(): readonly DeviceAuthHashKeyVersion[] {
    return Object.freeze([...this.#peppers.keys()].sort((left, right) => left - right));
  }

  public createHmacSha256(
    hashKeyVersion: DeviceAuthHashKeyVersion,
    credential: string
  ): Buffer | undefined {
    const pepper = this.#peppers.get(hashKeyVersion);
    if (!pepper) {
      return undefined;
    }

    return createHmac('sha256', pepper).update(credential, 'utf8').digest();
  }

  public toJSON(): undefined {
    return undefined;
  }
}

export function loadDeviceAuthConfig(input: unknown): DeviceAuthConfig {
  if (!isRecord(input)) {
    throw new DeviceAuthConfigurationError('DEVICE_AUTH_CONFIG_INVALID');
  }

  const environment = getOwnValue(input, 'environment');
  if (!isDeviceAuthEnvironment(environment)) {
    throw new DeviceAuthConfigurationError('DEVICE_AUTH_ENVIRONMENT_INVALID');
  }

  const environments = getOwnValue(input, 'environments');
  if (!isRecord(environments)) {
    throw new DeviceAuthConfigurationError('DEVICE_AUTH_CONFIG_INVALID');
  }

  const selectedEnvironmentConfig = getOwnValue(environments, environment);
  if (!isRecord(selectedEnvironmentConfig)) {
    throw new DeviceAuthConfigurationError('DEVICE_AUTH_ENVIRONMENT_CONFIG_MISSING');
  }

  const currentHashKeyVersion = getOwnValue(selectedEnvironmentConfig, 'currentHashKeyVersion');
  if (!isDeviceAuthHashKeyVersion(currentHashKeyVersion)) {
    throw new DeviceAuthConfigurationError('DEVICE_AUTH_CURRENT_HASH_KEY_VERSION_INVALID');
  }

  const credentialPepperKeyring = DeviceCredentialPepperKeyring.fromUnknown(
    getOwnValue(selectedEnvironmentConfig, 'credentialPepperKeyring')
  );
  if (!credentialPepperKeyring.hasVersion(currentHashKeyVersion)) {
    throw new DeviceAuthConfigurationError('DEVICE_AUTH_CURRENT_HASH_KEY_MISSING');
  }

  return Object.freeze({
    environment,
    currentHashKeyVersion,
    credentialPepperKeyring,
  });
}

export function isDeviceAuthHashKeyVersion(value: unknown): value is DeviceAuthHashKeyVersion {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= MAXIMUM_PRISMA_INT
  );
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

function parseCanonicalHashKeyVersionObjectKey(
  value: string
): DeviceAuthHashKeyVersion | undefined {
  if (!CANONICAL_HASH_KEY_VERSION_PATTERN.test(value)) {
    return undefined;
  }

  const parsedValue = Number(value);
  return isDeviceAuthHashKeyVersion(parsedValue) ? parsedValue : undefined;
}

function isValidPepper(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    Buffer.byteLength(value, 'utf8') >= MINIMUM_PEPPER_BYTE_LENGTH
  );
}
