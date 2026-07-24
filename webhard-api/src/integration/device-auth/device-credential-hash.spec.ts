import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { loadDeviceAuthConfig } from './device-auth.config';
import {
  DeviceCredentialHashError,
  hashDeviceCredential,
  verifyDeviceCredential,
} from './device-credential-hash';
import * as deviceCredentialHash from './device-credential-hash';

const DEV_V1_PEPPER = 'synthetic-device-auth-dev-v1-pepper-0123456789';
const DEV_V2_PEPPER = 'synthetic-device-auth-dev-v2-pepper-0123456789';
const CREDENTIAL = 'synthetic-device-refresh-credential-0123456789';

function makeConfig(currentHashKeyVersion = 2) {
  return loadDeviceAuthConfig({
    environment: 'dev',
    environments: {
      dev: {
        currentHashKeyVersion,
        credentialPepperKeyring: {
          '1': DEV_V1_PEPPER,
          '2': DEV_V2_PEPPER,
        },
      },
    },
  });
}

function expectCredentialHashError(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error('Expected credential hash input to fail closed');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(DeviceCredentialHashError);
    const hashError = error as DeviceCredentialHashError;
    expect(hashError.code).toBe(code);
  }
}

describe('device credential hash', () => {
  it('creates indexed lookup candidates for the current and every retained hash key version', () => {
    const lookup = (
      deviceCredentialHash as unknown as {
        readonly createDeviceCredentialLookupHashes?: unknown;
      }
    ).createDeviceCredentialLookupHashes;

    expect(typeof lookup).toBe('function');
    if (typeof lookup !== 'function') {
      return;
    }

    const candidates = (
      lookup as (
        config: ReturnType<typeof makeConfig>,
        credential: unknown
      ) => ReadonlyArray<unknown>
    )(makeConfig(2), CREDENTIAL);

    expect(candidates).toEqual([
      {
        hashKeyVersion: 1,
        credentialHash: createHmac('sha256', DEV_V1_PEPPER)
          .update(CREDENTIAL, 'utf8')
          .digest('hex'),
      },
      {
        hashKeyVersion: 2,
        credentialHash: createHmac('sha256', DEV_V2_PEPPER)
          .update(CREDENTIAL, 'utf8')
          .digest('hex'),
      },
    ]);
    expect(JSON.stringify(candidates)).not.toContain(CREDENTIAL);
    expect(JSON.stringify(candidates)).not.toContain(DEV_V1_PEPPER);
    expect(JSON.stringify(candidates)).not.toContain(DEV_V2_PEPPER);
  });

  it('uses numeric Prisma-compatible versions for current and retained stored hashes', () => {
    const currentHash = hashDeviceCredential(makeConfig(2), CREDENTIAL);
    const retainedHash = hashDeviceCredential(makeConfig(1), CREDENTIAL);
    const retainedVerification = verifyDeviceCredential(makeConfig(2), CREDENTIAL, retainedHash);

    expect(currentHash.hashKeyVersion).toBe(2);
    expect(retainedHash.hashKeyVersion).toBe(1);
    expect(retainedVerification).toEqual({ valid: true });
  });

  it.each(['v1', '1'])(
    'fails closed for a string stored hash key version: %s',
    (hashKeyVersion) => {
      const legacyStringHash = {
        hashKeyVersion,
        credentialHash: createHmac('sha256', DEV_V1_PEPPER)
          .update(CREDENTIAL, 'utf8')
          .digest('hex'),
      };

      const result = verifyDeviceCredential(makeConfig(), CREDENTIAL, legacyStringHash);

      expect(result).toEqual({
        valid: false,
        code: 'DEVICE_CREDENTIAL_STORED_HASH_INVALID',
      });
    }
  );

  it('uses HMAC-SHA-256 with the current key version and returns no raw secret', () => {
    const hash = hashDeviceCredential(makeConfig(), CREDENTIAL);
    const expectedHash = createHmac('sha256', DEV_V2_PEPPER)
      .update(CREDENTIAL, 'utf8')
      .digest('hex');

    expect(hash).toEqual({
      hashKeyVersion: 2,
      credentialHash: expectedHash,
    });

    const serializedHash = JSON.stringify(hash);
    expect(serializedHash).not.toContain(CREDENTIAL);
    expect(serializedHash).not.toContain(DEV_V1_PEPPER);
    expect(serializedHash).not.toContain(DEV_V2_PEPPER);
  });

  it('verifies a retained previous key version without treating it as the current key', () => {
    const oldHash = hashDeviceCredential(makeConfig(1), CREDENTIAL);
    const result = verifyDeviceCredential(makeConfig(2), CREDENTIAL, oldHash);

    expect(oldHash.hashKeyVersion).toBe(1);
    expect(result).toEqual({ valid: true });
  });

  it('fails closed when the stored hash key version is unavailable instead of falling back', () => {
    const result = verifyDeviceCredential(makeConfig(), CREDENTIAL, {
      hashKeyVersion: 9,
      credentialHash: 'a'.repeat(64),
    });

    expect(result).toEqual({
      valid: false,
      code: 'DEVICE_CREDENTIAL_HASH_KEY_VERSION_UNAVAILABLE',
    });
  });

  it.each([
    undefined,
    null,
    {},
    { hashKeyVersion: 1 },
    { hashKeyVersion: 1, credentialHash: 'not-a-sha256-hex-digest' },
    { hashKeyVersion: '', credentialHash: 'a'.repeat(64) },
  ])('fails closed for malformed stored hashes: %p', (storedHash) => {
    const result = verifyDeviceCredential(makeConfig(), CREDENTIAL, storedHash);

    expect(result).toEqual({
      valid: false,
      code: 'DEVICE_CREDENTIAL_STORED_HASH_INVALID',
    });
  });

  it('rejects malformed credential input without exposing it through an error or result', () => {
    expectCredentialHashError(
      () => hashDeviceCredential(makeConfig(), ''),
      'DEVICE_CREDENTIAL_INPUT_INVALID'
    );

    const result = verifyDeviceCredential(makeConfig(), '', {
      hashKeyVersion: 2,
      credentialHash: 'a'.repeat(64),
    });
    expect(result).toEqual({
      valid: false,
      code: 'DEVICE_CREDENTIAL_INPUT_INVALID',
    });
  });

  it('uses timing-safe comparison and returns only a fixed mismatch code', () => {
    const hash = hashDeviceCredential(makeConfig(), CREDENTIAL);
    const result = verifyDeviceCredential(makeConfig(), 'different-credential', hash);
    const source = readFileSync(resolve(__dirname, 'device-credential-hash.ts'), 'utf8');

    expect(result).toEqual({
      valid: false,
      code: 'DEVICE_CREDENTIAL_MISMATCH',
    });
    expect(JSON.stringify(result)).not.toContain(CREDENTIAL);
    expect(JSON.stringify(result)).not.toContain(DEV_V2_PEPPER);
    expect(source).toContain('timingSafeEqual');
    expect(source).not.toContain('console.');
  });
});
