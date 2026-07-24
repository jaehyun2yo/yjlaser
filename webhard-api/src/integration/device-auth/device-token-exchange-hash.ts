import { createHmac, timingSafeEqual } from 'crypto';
import {
  DEVICE_AUTH_ENVIRONMENTS,
  type DeviceAuthEnvironment,
  type DeviceTokenExchangeRequestHashErrorCode,
} from './device-auth.types';

export const TOKEN_EXCHANGE_REQUEST_DOMAIN = 'yjlaser:device-auth:v1:token-exchange-request:';

const MINIMUM_REQUEST_ID_BYTE_LENGTH = 16;
const MAXIMUM_REQUEST_ID_BYTE_LENGTH = 64;
const MINIMUM_HMAC_SECRET_BYTE_LENGTH = 32;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const CANONICAL_BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export class DeviceTokenExchangeRequestHashError extends Error {
  public readonly code: DeviceTokenExchangeRequestHashErrorCode;

  public constructor(code: DeviceTokenExchangeRequestHashErrorCode) {
    super(code);
    this.name = 'DeviceTokenExchangeRequestHashError';
    this.code = code;
  }

  public toJSON(): { readonly code: DeviceTokenExchangeRequestHashErrorCode } {
    return { code: this.code };
  }
}

export class DeviceTokenExchangeRequestHasher {
  readonly #environment: DeviceAuthEnvironment;
  readonly #secret: Buffer;

  public constructor(environment: DeviceAuthEnvironment, secret: string) {
    if (!isDeviceAuthEnvironment(environment)) {
      throw new DeviceTokenExchangeRequestHashError('DEVICE_TOKEN_EXCHANGE_ENVIRONMENT_INVALID');
    }
    if (!isValidHmacSecret(secret)) {
      throw new DeviceTokenExchangeRequestHashError('DEVICE_TOKEN_EXCHANGE_HMAC_SECRET_INVALID');
    }

    this.#environment = environment;
    this.#secret = Buffer.from(secret, 'utf8');
  }

  public digest(requestId: string): string {
    const parsedRequestId = parseCanonicalRequestId(requestId);
    return createHmac('sha256', this.#secret)
      .update(`${TOKEN_EXCHANGE_REQUEST_DOMAIN}${this.#environment}:${parsedRequestId}`, 'utf8')
      .digest('hex');
  }

  public verify(requestId: string, digest: string): boolean {
    if (typeof digest !== 'string' || !SHA256_HEX_PATTERN.test(digest)) {
      return false;
    }

    try {
      const expectedDigest = this.digest(requestId);
      return timingSafeEqual(Buffer.from(expectedDigest, 'hex'), Buffer.from(digest, 'hex'));
    } catch {
      return false;
    }
  }
}

function parseCanonicalRequestId(value: unknown): string {
  if (typeof value !== 'string' || !CANONICAL_BASE64URL_PATTERN.test(value)) {
    throw new DeviceTokenExchangeRequestHashError('DEVICE_TOKEN_EXCHANGE_REQUEST_ID_INVALID');
  }

  const decodedValue = Buffer.from(value, 'base64url');
  if (
    decodedValue.length < MINIMUM_REQUEST_ID_BYTE_LENGTH ||
    decodedValue.length > MAXIMUM_REQUEST_ID_BYTE_LENGTH ||
    decodedValue.toString('base64url') !== value
  ) {
    throw new DeviceTokenExchangeRequestHashError('DEVICE_TOKEN_EXCHANGE_REQUEST_ID_INVALID');
  }

  return value;
}

function isDeviceAuthEnvironment(value: unknown): value is DeviceAuthEnvironment {
  return (
    typeof value === 'string' && (DEVICE_AUTH_ENVIRONMENTS as readonly string[]).includes(value)
  );
}

function isValidHmacSecret(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    Buffer.byteLength(value, 'utf8') >= MINIMUM_HMAC_SECRET_BYTE_LENGTH
  );
}
