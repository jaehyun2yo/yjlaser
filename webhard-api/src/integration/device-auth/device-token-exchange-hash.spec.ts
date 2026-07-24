import { createHmac } from 'crypto';
import * as deviceTokenExchangeHashModule from './device-token-exchange-hash';

const HMAC_SECRET = 'synthetic-token-exchange-hmac-secret-0123456789';
const REQUEST_ID = Buffer.alloc(16, 7).toString('base64url');
const LONG_REQUEST_ID = Buffer.alloc(64, 8).toString('base64url');
const ZERO_REQUEST_ID = Buffer.alloc(16).toString('base64url');
const ZERO_LONG_REQUEST_ID = Buffer.alloc(64).toString('base64url');

interface DeviceTokenExchangeRequestHasherLike {
  digest(requestId: string): string;
  verify(requestId: string, digest: string): boolean;
}

interface DeviceTokenExchangeHashModule {
  readonly TOKEN_EXCHANGE_REQUEST_DOMAIN?: unknown;
  readonly DeviceTokenExchangeRequestHasher?: unknown;
  readonly DeviceTokenExchangeRequestHashError?: unknown;
}

function loadHasherModule(): DeviceTokenExchangeHashModule {
  return deviceTokenExchangeHashModule;
}

function createHasher(
  environment: 'dev' | 'stg' | 'prd' = 'dev',
  secret: string = HMAC_SECRET
): DeviceTokenExchangeRequestHasherLike {
  const HashConstructor = loadHasherModule().DeviceTokenExchangeRequestHasher;
  if (typeof HashConstructor !== 'function') {
    throw new Error('DeviceTokenExchangeRequestHasher is not implemented');
  }

  return new (HashConstructor as new (
    selectedEnvironment: 'dev' | 'stg' | 'prd',
    hmacSecret: string
  ) => DeviceTokenExchangeRequestHasherLike)(environment, secret);
}

function expectHashError(action: () => unknown, code: string): void {
  const ErrorConstructor = loadHasherModule().DeviceTokenExchangeRequestHashError;
  try {
    action();
    throw new Error('Expected request hasher construction or digest to fail closed');
  } catch (error: unknown) {
    if (typeof ErrorConstructor !== 'function') {
      throw error;
    }

    expect(error).toBeInstanceOf(ErrorConstructor as new (...args: never[]) => Error);
    expect((error as { readonly code?: unknown }).code).toBe(code);
  }
}

describe('DeviceTokenExchangeRequestHasher', () => {
  it('creates a stable lowercase SHA-256 HMAC over the dedicated domain, selected environment, and request id', () => {
    const testingModule = loadHasherModule();
    const domain = testingModule.TOKEN_EXCHANGE_REQUEST_DOMAIN;
    if (typeof domain !== 'string') {
      throw new Error('TOKEN_EXCHANGE_REQUEST_DOMAIN is not implemented');
    }

    const expected = createHmac('sha256', HMAC_SECRET)
      .update(`${domain}dev:${REQUEST_ID}`, 'utf8')
      .digest('hex');
    const hasher = createHasher();

    expect(domain).toBe('yjlaser:device-auth:v1:token-exchange-request:');
    expect(hasher.digest(REQUEST_ID)).toBe(expected);
    expect(hasher.digest(REQUEST_ID)).toMatch(/^[a-f0-9]{64}$/);
    expect(createHasher('stg').digest(REQUEST_ID)).not.toBe(expected);
  });

  it('accepts only canonical 16-to-64-byte Base64URL request ids', () => {
    const hasher = createHasher();

    expect(hasher.digest(REQUEST_ID)).toMatch(/^[a-f0-9]{64}$/);
    expect(hasher.digest(LONG_REQUEST_ID)).toMatch(/^[a-f0-9]{64}$/);
    expect(hasher.digest(ZERO_REQUEST_ID)).toMatch(/^[a-f0-9]{64}$/);
    expect(hasher.digest(ZERO_LONG_REQUEST_ID)).toMatch(/^[a-f0-9]{64}$/);

    for (const invalidRequestId of [
      Buffer.alloc(15, 1).toString('base64url'),
      Buffer.alloc(65, 2).toString('base64url'),
      `${REQUEST_ID}=`,
      REQUEST_ID.replace(/.$/, '+'),
    ]) {
      expectHashError(
        () => hasher.digest(invalidRequestId),
        'DEVICE_TOKEN_EXCHANGE_REQUEST_ID_INVALID'
      );
    }
  });

  it('requires a dedicated nonblank UTF-8 HMAC secret of at least 32 bytes', () => {
    for (const invalidSecret of ['', '   ', 'too-short', '가'.repeat(10)]) {
      expectHashError(
        () => createHasher('dev', invalidSecret),
        'DEVICE_TOKEN_EXCHANGE_HMAC_SECRET_INVALID'
      );
    }

    expect(createHasher('prd', '가'.repeat(11)).digest(REQUEST_ID)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uses a safe comparison for verification and returns false without exposing a failure reason', () => {
    const hasher = createHasher();
    const digest = hasher.digest(REQUEST_ID);
    const alteredDigest = `${digest.slice(0, -1)}${digest.endsWith('0') ? '1' : '0'}`;

    expect(hasher.verify(REQUEST_ID, digest)).toBe(true);
    expect(hasher.verify(REQUEST_ID, alteredDigest)).toBe(false);
    expect(hasher.verify(REQUEST_ID, 'not-a-digest')).toBe(false);
    expect(hasher.verify(`${REQUEST_ID}=`, digest)).toBe(false);
  });

  it('does not serialize the dedicated HMAC secret', () => {
    const hasher = createHasher();

    expect(JSON.stringify(hasher)).not.toContain(HMAC_SECRET);
  });
});
