import { timingSafeEqual } from 'crypto';
import { isDeviceAuthHashKeyVersion, type DeviceAuthConfig } from './device-auth.config';
import type {
  DeviceCredentialHash,
  DeviceCredentialHashErrorCode,
  DeviceCredentialVerificationFailureCode,
  DeviceCredentialVerificationResult,
} from './device-auth.types';

const CREDENTIAL_HASH_HEX_PATTERN = /^[a-f0-9]{64}$/;

export class DeviceCredentialHashError extends Error {
  public readonly code: DeviceCredentialHashErrorCode;

  public constructor(code: DeviceCredentialHashErrorCode) {
    super(code);
    this.name = 'DeviceCredentialHashError';
    this.code = code;
  }
}

export function hashDeviceCredential(
  config: DeviceAuthConfig,
  credential: unknown
): DeviceCredentialHash {
  if (!isValidCredential(credential)) {
    throw new DeviceCredentialHashError('DEVICE_CREDENTIAL_INPUT_INVALID');
  }

  const digest = config.credentialPepperKeyring.createHmacSha256(
    config.currentHashKeyVersion,
    credential
  );
  if (!digest) {
    throw new DeviceCredentialHashError('DEVICE_CREDENTIAL_CURRENT_HASH_KEY_UNAVAILABLE');
  }

  return Object.freeze({
    hashKeyVersion: config.currentHashKeyVersion,
    credentialHash: digest.toString('hex'),
  });
}

export function createDeviceCredentialLookupHashes(
  config: DeviceAuthConfig,
  credential: unknown
): readonly DeviceCredentialHash[] {
  if (!isValidCredential(credential)) {
    throw new DeviceCredentialHashError('DEVICE_CREDENTIAL_INPUT_INVALID');
  }

  const candidates = config.credentialPepperKeyring
    .getRetainedHashKeyVersions()
    .map((hashKeyVersion) => {
      const digest = config.credentialPepperKeyring.createHmacSha256(hashKeyVersion, credential);
      if (!digest) {
        throw new DeviceCredentialHashError('DEVICE_CREDENTIAL_CURRENT_HASH_KEY_UNAVAILABLE');
      }

      return Object.freeze({
        hashKeyVersion,
        credentialHash: digest.toString('hex'),
      });
    });

  return Object.freeze(candidates);
}

export function verifyDeviceCredential(
  config: DeviceAuthConfig,
  credential: unknown,
  storedHash: unknown
): DeviceCredentialVerificationResult {
  if (!isValidCredential(credential)) {
    return verificationFailure('DEVICE_CREDENTIAL_INPUT_INVALID');
  }

  const parsedStoredHash = parseStoredHash(storedHash);
  if (!parsedStoredHash) {
    return verificationFailure('DEVICE_CREDENTIAL_STORED_HASH_INVALID');
  }

  const expectedDigest = config.credentialPepperKeyring.createHmacSha256(
    parsedStoredHash.hashKeyVersion,
    credential
  );
  if (!expectedDigest) {
    return verificationFailure('DEVICE_CREDENTIAL_HASH_KEY_VERSION_UNAVAILABLE');
  }

  const storedDigest = Buffer.from(parsedStoredHash.credentialHash, 'hex');
  if (!timingSafeEqual(expectedDigest, storedDigest)) {
    return verificationFailure('DEVICE_CREDENTIAL_MISMATCH');
  }

  return Object.freeze({ valid: true });
}

function isValidCredential(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseStoredHash(value: unknown): DeviceCredentialHash | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const hashKeyVersion = getOwnValue(value, 'hashKeyVersion');
  const credentialHash = getOwnValue(value, 'credentialHash');
  if (
    !isDeviceAuthHashKeyVersion(hashKeyVersion) ||
    typeof credentialHash !== 'string' ||
    !CREDENTIAL_HASH_HEX_PATTERN.test(credentialHash)
  ) {
    return undefined;
  }

  return {
    hashKeyVersion,
    credentialHash,
  };
}

function verificationFailure(
  code: DeviceCredentialVerificationFailureCode
): DeviceCredentialVerificationResult {
  return Object.freeze({ valid: false, code });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getOwnValue(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}
