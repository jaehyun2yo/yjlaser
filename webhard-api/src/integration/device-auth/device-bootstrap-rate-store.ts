import { createHmac, randomBytes as createRandomBytes } from 'crypto';
import type { DeviceAuthEnvironment } from './device-auth.types';

const DEVICE_BOOTSTRAP_REPLAY_LEASE_TTL_SECONDS = 60;
const DEVICE_BOOTSTRAP_REQUEST_TIMEOUT_MS = 3_000;
const DEVICE_BOOTSTRAP_NONCE_BYTE_LENGTH = 32;
const MINIMUM_RATE_LIMIT_HMAC_SECRET_BYTE_LENGTH = 32;
const MAXIMUM_IDENTIFIER_LENGTH = 512;
const MAXIMUM_PEER_ADDRESS_LENGTH = 256;
const MAXIMUM_TOKEN_EXCHANGE_OPAQUE_PROOF_BYTE_LENGTH = 4 * 1024;
const MAXIMUM_RETRY_AFTER_SECONDS = 10 * 60;

const ENROLLMENT_RATE_LIMITS = {
  global: { limit: 30, windowSeconds: 60 },
  peer: { limit: 6, windowSeconds: 10 * 60 },
  code: { limit: 3, windowSeconds: 10 * 60 },
} as const;

const ENROLLMENT_STATUS_RATE_LIMITS = {
  global: { limit: 180, windowSeconds: 60 },
  peer: { limit: 60, windowSeconds: 10 * 60 },
  refresh: { limit: 12, windowSeconds: 10 * 60 },
} as const;

const TOKEN_EXCHANGE_RATE_LIMITS = {
  global: { limit: 120, windowSeconds: 60 },
  peer: { limit: 60, windowSeconds: 10 * 60 },
  refresh: { limit: 12, windowSeconds: 10 * 60 },
} as const;

const DEVICE_HEARTBEAT_RATE_LIMIT = { limit: 6, windowSeconds: 60 } as const;

const SINGLE_QUOTA_EVAL_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing then
  local count = tonumber(existing)
  local ttl = redis.call('TTL', KEYS[1])
  if not count or ttl == -1 or ttl == -2 then
    return {-1, 0}
  end
  if count >= tonumber(ARGV[1]) then
    if ttl < 1 then
      ttl = 1
    end
    return {0, ttl}
  end
end

local count = redis.call('INCR', KEYS[1])
if count == 1 then
  local expiryResult = redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
  if expiryResult ~= 1 then
    return {-1, 0}
  end
end
return {1, 0}
`;

const QUOTA_EVAL_SCRIPT = `
local limits = { tonumber(ARGV[1]), tonumber(ARGV[3]), tonumber(ARGV[5]) }
local ttlSeconds = { tonumber(ARGV[2]), tonumber(ARGV[4]), tonumber(ARGV[6]) }

for index = 1, #KEYS do
  local existing = redis.call('GET', KEYS[index])
  if existing then
    local count = tonumber(existing)
    local ttl = redis.call('TTL', KEYS[index])
    if not count or ttl == -1 or ttl == -2 then
      return {-1, 0}
    end
    if count >= limits[index] then
      if ttl < 1 then
        ttl = 1
      end
      return {0, ttl}
    end
  end
end

for index = 1, #KEYS do
  local count = redis.call('INCR', KEYS[index])
  if count == 1 then
    local expiryResult = redis.call('EXPIRE', KEYS[index], ttlSeconds[index])
    if expiryResult ~= 1 then
      return {-1, 0}
    end
  end
end

return {1, 0}
`;

const ENROLLMENT_QUOTA_AND_REPLAY_EVAL_SCRIPT = `
local limits = { tonumber(ARGV[1]), tonumber(ARGV[3]), tonumber(ARGV[5]) }
local ttlSeconds = { tonumber(ARGV[2]), tonumber(ARGV[4]), tonumber(ARGV[6]) }

for index = 1, 3 do
  local existing = redis.call('GET', KEYS[index])
  if existing then
    local count = tonumber(existing)
    local ttl = redis.call('TTL', KEYS[index])
    if not count or ttl == -1 or ttl == -2 then
      return {-1, 0}
    end
    if count >= limits[index] then
      if ttl < 1 then
        ttl = 1
      end
      return {0, ttl}
    end
  end
end

if redis.call('EXISTS', KEYS[4]) == 1 then
  local leaseTtl = redis.call('TTL', KEYS[4])
  if leaseTtl == -1 or leaseTtl == -2 then
    return {-1, 0}
  end
  if leaseTtl < 1 then
    leaseTtl = 1
  end
  return {0, leaseTtl}
end

for index = 1, 3 do
  local count = redis.call('INCR', KEYS[index])
  if count == 1 then
    local expiryResult = redis.call('EXPIRE', KEYS[index], ttlSeconds[index])
    if expiryResult ~= 1 then
      return {-1, 0}
    end
  end
end

local leaseResult = redis.call('SET', KEYS[4], ARGV[7], 'EX', ARGV[8], 'NX')
if leaseResult ~= 'OK' then
  return {-1, 0}
end

return {1, 0}
`;

const RELEASE_REPLAY_LEASE_EVAL_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export interface DeviceBootstrapRateStoreConfiguration {
  readonly environment: DeviceAuthEnvironment;
  readonly upstashRedisRestUrl: string;
  readonly upstashRedisRestToken: string;
  readonly rateLimitHmacSecret: string;
}

export interface DeviceBootstrapRateStoreConfigReader {
  get(key: string): unknown;
}

export interface DeviceBootstrapFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type DeviceBootstrapFetch = (
  input: string,
  init: RequestInit
) => Promise<DeviceBootstrapFetchResponse>;

export interface DeviceBootstrapRateStoreDependencies {
  readonly fetch: DeviceBootstrapFetch;
  readonly now?: () => Date;
  readonly randomBytes?: (size: number) => Buffer;
}

export interface DeviceBootstrapEnrollmentRateInput {
  readonly peerAddress: string;
  readonly enrollmentCode: string;
  readonly enrollmentAttemptId: string;
}

export interface DeviceBootstrapEnrollmentStatusRateInput {
  readonly peerAddress: string;
  readonly refreshCredential: string;
}

export interface DeviceBootstrapTokenExchangeRateInput {
  readonly peerAddress: string;
  readonly refreshCredential: string;
  readonly refreshRequestId: string;
}

export interface DeviceHeartbeatRateInput {
  readonly deviceId: string;
}

export interface DeviceBootstrapReplayLease {
  readonly nonce: string;
}

export interface DeviceBootstrapReplayLeaseReleaseInput {
  readonly enrollmentAttemptId: string;
  readonly replayLease: DeviceBootstrapReplayLease;
}

export interface DeviceBootstrapTokenExchangeRequestLeaseReleaseInput {
  readonly refreshRequestId: string;
  readonly requestLease: DeviceBootstrapReplayLease;
}

export type DeviceBootstrapRateDecision =
  | {
      readonly kind: 'allowed';
    }
  | {
      readonly kind: 'limited';
      readonly retryAfterSeconds: number;
    }
  | {
      readonly kind: 'unavailable';
    };

export type DeviceBootstrapEnrollmentRateDecision =
  | {
      readonly kind: 'allowed';
      readonly replayLease: DeviceBootstrapReplayLease;
    }
  | {
      readonly kind: 'limited';
      readonly retryAfterSeconds: number;
    }
  | {
      readonly kind: 'unavailable';
    };

export type DeviceBootstrapTokenExchangeRateDecision =
  | {
      readonly kind: 'allowed';
      readonly requestLease: DeviceBootstrapReplayLease;
    }
  | {
      readonly kind: 'limited';
      readonly retryAfterSeconds: number;
    }
  | {
      readonly kind: 'unavailable';
    };

export type DeviceBootstrapReplayLeaseReleaseDecision =
  | {
      readonly kind: 'released';
    }
  | {
      readonly kind: 'unavailable';
    };

export type DeviceBootstrapRateStoreConfigurationErrorCode =
  | 'DEVICE_BOOTSTRAP_RATE_STORE_CONFIG_INVALID'
  | 'DEVICE_BOOTSTRAP_RATE_STORE_ENVIRONMENT_INVALID'
  | 'DEVICE_BOOTSTRAP_RATE_STORE_URL_INVALID'
  | 'DEVICE_BOOTSTRAP_RATE_STORE_TOKEN_INVALID'
  | 'DEVICE_BOOTSTRAP_RATE_STORE_HMAC_SECRET_INVALID';

export class DeviceBootstrapRateStoreConfigurationError extends Error {
  public readonly code: DeviceBootstrapRateStoreConfigurationErrorCode;

  public constructor(code: DeviceBootstrapRateStoreConfigurationErrorCode) {
    super(code);
    this.name = 'DeviceBootstrapRateStoreConfigurationError';
    this.code = code;
  }

  public toJSON(): { readonly code: DeviceBootstrapRateStoreConfigurationErrorCode } {
    return { code: this.code };
  }
}

/**
 * Dedicated fail-closed, Upstash-backed public bootstrap limiter. It has no
 * in-memory mode and never reads a generic Redis setting or unrelated secret.
 */
export class DeviceBootstrapRateStore {
  readonly #environment: DeviceAuthEnvironment;
  readonly #upstashRedisRestUrl: string;
  readonly #upstashRedisRestToken: string;
  readonly #rateLimitHmacSecret: Buffer;
  readonly #fetch: DeviceBootstrapFetch;
  readonly #now: () => Date;
  readonly #randomBytes: (size: number) => Buffer;

  public constructor(
    configuration: DeviceBootstrapRateStoreConfiguration,
    dependencies: DeviceBootstrapRateStoreDependencies
  ) {
    const parsedConfiguration = parseConfiguration(configuration);
    if (typeof dependencies?.fetch !== 'function') {
      throw new DeviceBootstrapRateStoreConfigurationError(
        'DEVICE_BOOTSTRAP_RATE_STORE_CONFIG_INVALID'
      );
    }

    this.#environment = parsedConfiguration.environment;
    this.#upstashRedisRestUrl = parsedConfiguration.upstashRedisRestUrl;
    this.#upstashRedisRestToken = parsedConfiguration.upstashRedisRestToken;
    this.#rateLimitHmacSecret = Buffer.from(parsedConfiguration.rateLimitHmacSecret, 'utf8');
    this.#fetch = dependencies.fetch;
    this.#now = dependencies.now ?? (() => new Date());
    this.#randomBytes = dependencies.randomBytes ?? createRandomBytes;
  }

  public static fromConfigService(
    configService: DeviceBootstrapRateStoreConfigReader,
    environment: DeviceAuthEnvironment,
    dependencies: DeviceBootstrapRateStoreDependencies
  ): DeviceBootstrapRateStore {
    if (!configService || typeof configService.get !== 'function') {
      throw new DeviceBootstrapRateStoreConfigurationError(
        'DEVICE_BOOTSTRAP_RATE_STORE_CONFIG_INVALID'
      );
    }

    return new DeviceBootstrapRateStore(
      {
        environment,
        upstashRedisRestUrl: configService.get(
          'DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL'
        ) as string,
        upstashRedisRestToken: configService.get(
          'DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN'
        ) as string,
        rateLimitHmacSecret: configService.get(
          'DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET'
        ) as string,
      },
      dependencies
    );
  }

  public async acquireEnrollment(
    input: DeviceBootstrapEnrollmentRateInput
  ): Promise<DeviceBootstrapEnrollmentRateDecision> {
    try {
      const peerAddress = parseIdentifier(input?.peerAddress, MAXIMUM_PEER_ADDRESS_LENGTH);
      const enrollmentCode = parseIdentifier(input?.enrollmentCode, MAXIMUM_IDENTIFIER_LENGTH);
      const enrollmentAttemptId = parseIdentifier(
        input?.enrollmentAttemptId,
        MAXIMUM_IDENTIFIER_LENGTH
      );
      const now = parseNow(this.#now());
      const nonce = createReplayLeaseNonce(this.#randomBytes);
      if (!peerAddress || !enrollmentCode || !enrollmentAttemptId || !now || !nonce) {
        return { kind: 'unavailable' };
      }

      const globalWindow = createWindow(now, ENROLLMENT_RATE_LIMITS.global.windowSeconds);
      const peerWindow = createWindow(now, ENROLLMENT_RATE_LIMITS.peer.windowSeconds);
      const codeWindow = createWindow(now, ENROLLMENT_RATE_LIMITS.code.windowSeconds);
      const result = await this.executeEval(
        ENROLLMENT_QUOTA_AND_REPLAY_EVAL_SCRIPT,
        [
          this.createQuotaKey('enroll', 'global', 'global', globalWindow.index),
          this.createQuotaKey('enroll', 'peer', peerAddress, peerWindow.index),
          this.createQuotaKey('enroll', 'code', enrollmentCode, codeWindow.index),
          this.createReplayKey('attempt', enrollmentAttemptId),
        ],
        [
          String(ENROLLMENT_RATE_LIMITS.global.limit),
          String(globalWindow.ttlSeconds),
          String(ENROLLMENT_RATE_LIMITS.peer.limit),
          String(peerWindow.ttlSeconds),
          String(ENROLLMENT_RATE_LIMITS.code.limit),
          String(codeWindow.ttlSeconds),
          nonce,
          String(DEVICE_BOOTSTRAP_REPLAY_LEASE_TTL_SECONDS),
        ]
      );
      const decision = parseQuotaDecision(result);
      if (decision.kind !== 'allowed') {
        return decision;
      }

      return {
        kind: 'allowed',
        replayLease: { nonce },
      };
    } catch {
      return { kind: 'unavailable' };
    }
  }

  public async checkEnrollmentStatus(
    input: DeviceBootstrapEnrollmentStatusRateInput
  ): Promise<DeviceBootstrapRateDecision> {
    try {
      const peerAddress = parseIdentifier(input?.peerAddress, MAXIMUM_PEER_ADDRESS_LENGTH);
      const refreshCredential = parseIdentifier(
        input?.refreshCredential,
        MAXIMUM_IDENTIFIER_LENGTH
      );
      const now = parseNow(this.#now());
      if (!peerAddress || !refreshCredential || !now) {
        return { kind: 'unavailable' };
      }

      const globalWindow = createWindow(now, ENROLLMENT_STATUS_RATE_LIMITS.global.windowSeconds);
      const peerWindow = createWindow(now, ENROLLMENT_STATUS_RATE_LIMITS.peer.windowSeconds);
      const refreshWindow = createWindow(now, ENROLLMENT_STATUS_RATE_LIMITS.refresh.windowSeconds);
      const result = await this.executeEval(
        QUOTA_EVAL_SCRIPT,
        [
          this.createQuotaKey('status', 'global', 'global', globalWindow.index),
          this.createQuotaKey('status', 'peer', peerAddress, peerWindow.index),
          this.createQuotaKey('status', 'refresh', refreshCredential, refreshWindow.index),
        ],
        [
          String(ENROLLMENT_STATUS_RATE_LIMITS.global.limit),
          String(globalWindow.ttlSeconds),
          String(ENROLLMENT_STATUS_RATE_LIMITS.peer.limit),
          String(peerWindow.ttlSeconds),
          String(ENROLLMENT_STATUS_RATE_LIMITS.refresh.limit),
          String(refreshWindow.ttlSeconds),
        ]
      );

      return parseQuotaDecision(result);
    } catch {
      return { kind: 'unavailable' };
    }
  }

  public async acquireTokenExchange(
    input: DeviceBootstrapTokenExchangeRateInput
  ): Promise<DeviceBootstrapTokenExchangeRateDecision> {
    try {
      const peerAddress = parseIdentifier(input?.peerAddress, MAXIMUM_PEER_ADDRESS_LENGTH);
      const refreshCredential = parseTokenExchangeOpaqueProof(input?.refreshCredential);
      const refreshRequestId = parseTokenExchangeOpaqueProof(input?.refreshRequestId);
      const now = parseNow(this.#now());
      const nonce = createReplayLeaseNonce(this.#randomBytes);
      if (!peerAddress || !refreshCredential || !refreshRequestId || !now || !nonce) {
        return { kind: 'unavailable' };
      }

      const globalWindow = createWindow(now, TOKEN_EXCHANGE_RATE_LIMITS.global.windowSeconds);
      const peerWindow = createWindow(now, TOKEN_EXCHANGE_RATE_LIMITS.peer.windowSeconds);
      const refreshWindow = createWindow(now, TOKEN_EXCHANGE_RATE_LIMITS.refresh.windowSeconds);
      const result = await this.executeEval(
        ENROLLMENT_QUOTA_AND_REPLAY_EVAL_SCRIPT,
        [
          this.createQuotaKey('token', 'global', 'global', globalWindow.index),
          this.createQuotaKey('token', 'peer', peerAddress, peerWindow.index),
          this.createQuotaKey('token', 'refresh', refreshCredential, refreshWindow.index),
          this.createReplayKey('request', refreshRequestId),
        ],
        [
          String(TOKEN_EXCHANGE_RATE_LIMITS.global.limit),
          String(globalWindow.ttlSeconds),
          String(TOKEN_EXCHANGE_RATE_LIMITS.peer.limit),
          String(peerWindow.ttlSeconds),
          String(TOKEN_EXCHANGE_RATE_LIMITS.refresh.limit),
          String(refreshWindow.ttlSeconds),
          nonce,
          String(DEVICE_BOOTSTRAP_REPLAY_LEASE_TTL_SECONDS),
        ]
      );
      const decision = parseQuotaDecision(result);
      if (decision.kind !== 'allowed') {
        return decision;
      }

      return {
        kind: 'allowed',
        requestLease: { nonce },
      };
    } catch {
      return { kind: 'unavailable' };
    }
  }

  public async releaseEnrollmentReplayLease(
    input: DeviceBootstrapReplayLeaseReleaseInput
  ): Promise<DeviceBootstrapReplayLeaseReleaseDecision> {
    try {
      const enrollmentAttemptId = parseIdentifier(
        input?.enrollmentAttemptId,
        MAXIMUM_IDENTIFIER_LENGTH
      );
      const nonce = parseReplayLeaseNonce(input?.replayLease?.nonce);
      if (!enrollmentAttemptId || !nonce) {
        return { kind: 'unavailable' };
      }

      const result = await this.executeEval(
        RELEASE_REPLAY_LEASE_EVAL_SCRIPT,
        [this.createReplayKey('attempt', enrollmentAttemptId)],
        [nonce]
      );
      if (result === 0 || result === 1 || isSingleNumberResult(result, 0, 1)) {
        // Both a matching deletion and a mismatch intentionally return the
        // same safe result to the public request path.
        return { kind: 'released' };
      }

      return { kind: 'unavailable' };
    } catch {
      return { kind: 'unavailable' };
    }
  }

  public async checkDeviceHeartbeat(
    input: DeviceHeartbeatRateInput
  ): Promise<DeviceBootstrapRateDecision> {
    try {
      const deviceId = parseIdentifier(input?.deviceId, MAXIMUM_IDENTIFIER_LENGTH);
      const now = parseNow(this.#now());
      if (!deviceId || !now) {
        return { kind: 'unavailable' };
      }

      const window = createWindow(now, DEVICE_HEARTBEAT_RATE_LIMIT.windowSeconds);
      const result = await this.executeEval(
        SINGLE_QUOTA_EVAL_SCRIPT,
        [this.createHeartbeatDeviceKey(deviceId, window.index)],
        [String(DEVICE_HEARTBEAT_RATE_LIMIT.limit), String(window.ttlSeconds)]
      );
      return parseQuotaDecision(result);
    } catch {
      return { kind: 'unavailable' };
    }
  }

  public async releaseTokenExchangeRequestLease(
    input: DeviceBootstrapTokenExchangeRequestLeaseReleaseInput
  ): Promise<DeviceBootstrapReplayLeaseReleaseDecision> {
    try {
      const refreshRequestId = parseTokenExchangeOpaqueProof(input?.refreshRequestId);
      const nonce = parseReplayLeaseNonce(input?.requestLease?.nonce);
      if (!refreshRequestId || !nonce) {
        return { kind: 'unavailable' };
      }

      const result = await this.executeEval(
        RELEASE_REPLAY_LEASE_EVAL_SCRIPT,
        [this.createReplayKey('request', refreshRequestId)],
        [nonce]
      );
      if (result === 0 || result === 1 || isSingleNumberResult(result, 0, 1)) {
        return { kind: 'released' };
      }

      return { kind: 'unavailable' };
    } catch {
      return { kind: 'unavailable' };
    }
  }

  public toJSON(): { readonly environment: DeviceAuthEnvironment } {
    return { environment: this.#environment };
  }

  private async executeEval(
    script: string,
    keys: readonly string[],
    argumentsList: readonly string[]
  ): Promise<unknown | undefined> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), DEVICE_BOOTSTRAP_REQUEST_TIMEOUT_MS);
    try {
      const response = await this.#fetch(this.#upstashRedisRestUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.#upstashRedisRestToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['EVAL', script, String(keys.length), ...keys, ...argumentsList]),
        // The dedicated credential must never follow a Redis endpoint redirect
        // to an unvalidated origin.
        redirect: 'error',
        signal: abortController.signal,
      });
      if (
        !response ||
        response.ok !== true ||
        !Number.isInteger(response.status) ||
        response.status < 200 ||
        response.status >= 300
      ) {
        return undefined;
      }

      const body = await response.json();
      if (!isRecord(body) || Object.prototype.hasOwnProperty.call(body, 'error')) {
        return undefined;
      }

      return Object.prototype.hasOwnProperty.call(body, 'result') ? body.result : undefined;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }

  private createQuotaKey(
    operation: 'enroll' | 'status' | 'token',
    scope: 'global' | 'peer' | 'code' | 'refresh',
    identifier: string,
    windowIndex: number
  ): string {
    const digest =
      operation === 'token'
        ? this.createTokenExchangeIdentifierDigest(
            `rate:${operation}:${scope}:${windowIndex}:${identifier}`
          )
        : this.createIdentifierDigest(`rate:${operation}:${scope}:${windowIndex}:${identifier}`);
    return `yjlaser:device-auth:v1:bootstrap:${this.#environment}:rate:${operation}:${scope}:${digest}`;
  }

  private createReplayKey(scope: 'attempt' | 'request', identifier: string): string {
    const digest =
      scope === 'request'
        ? this.createTokenExchangeIdentifierDigest(`replay:${scope}:${identifier}`)
        : this.createIdentifierDigest(`replay:${scope}:${identifier}`);
    return `yjlaser:device-auth:v1:bootstrap:${this.#environment}:replay:${scope}:${digest}`;
  }

  private createHeartbeatDeviceKey(deviceId: string, windowIndex: number): string {
    const digest = createHmac('sha256', this.#rateLimitHmacSecret)
      .update(
        `device-auth:${this.#environment}:heartbeat:device:${windowIndex}:${deviceId}`,
        'utf8'
      )
      .digest('hex');
    return `yjlaser:device-auth:v1:heartbeat:${this.#environment}:device:${digest}`;
  }

  private createIdentifierDigest(value: string): string {
    const canonicalValue = `yjlaser:device-auth:v1:bootstrap-rate:${this.#environment}:${value}`;
    return createHmac('sha256', this.#rateLimitHmacSecret)
      .update(canonicalValue, 'utf8')
      .digest('hex');
  }

  private createTokenExchangeIdentifierDigest(value: string): string {
    const canonicalValue = `device-auth:${this.#environment}:token:${value}`;
    return createHmac('sha256', this.#rateLimitHmacSecret)
      .update(canonicalValue, 'utf8')
      .digest('hex');
  }
}

function parseConfiguration(input: unknown): DeviceBootstrapRateStoreConfiguration {
  if (!isRecord(input)) {
    throw new DeviceBootstrapRateStoreConfigurationError(
      'DEVICE_BOOTSTRAP_RATE_STORE_CONFIG_INVALID'
    );
  }

  const environment = input.environment;
  if (environment !== 'dev' && environment !== 'stg' && environment !== 'prd') {
    throw new DeviceBootstrapRateStoreConfigurationError(
      'DEVICE_BOOTSTRAP_RATE_STORE_ENVIRONMENT_INVALID'
    );
  }

  const upstashRedisRestUrl = parseUpstashRedisRestUrl(input.upstashRedisRestUrl);
  const upstashRedisRestToken = parseRequiredString(
    input.upstashRedisRestToken,
    'DEVICE_BOOTSTRAP_RATE_STORE_TOKEN_INVALID'
  );
  const rateLimitHmacSecret = parseRateLimitHmacSecret(input.rateLimitHmacSecret);

  return {
    environment,
    upstashRedisRestUrl,
    upstashRedisRestToken,
    rateLimitHmacSecret,
  };
}

function parseUpstashRedisRestUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new DeviceBootstrapRateStoreConfigurationError('DEVICE_BOOTSTRAP_RATE_STORE_URL_INVALID');
  }

  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error('invalid');
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    throw new DeviceBootstrapRateStoreConfigurationError('DEVICE_BOOTSTRAP_RATE_STORE_URL_INVALID');
  }
}

function parseRequiredString(
  value: unknown,
  code: 'DEVICE_BOOTSTRAP_RATE_STORE_TOKEN_INVALID'
): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim() !== value) {
    throw new DeviceBootstrapRateStoreConfigurationError(code);
  }

  return value;
}

function parseRateLimitHmacSecret(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    Buffer.byteLength(value, 'utf8') < MINIMUM_RATE_LIMIT_HMAC_SECRET_BYTE_LENGTH
  ) {
    throw new DeviceBootstrapRateStoreConfigurationError(
      'DEVICE_BOOTSTRAP_RATE_STORE_HMAC_SECRET_INVALID'
    );
  }

  return value;
}

function parseIdentifier(value: unknown, maximumLength: number): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumLength ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return undefined;
  }

  return value;
}

function parseTokenExchangeOpaqueProof(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Buffer.byteLength(value, 'utf8') > MAXIMUM_TOKEN_EXCHANGE_OPAQUE_PROOF_BYTE_LENGTH
  ) {
    return undefined;
  }

  return value;
}

function parseNow(value: unknown): Date | undefined {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()) || value.getTime() < 0) {
    return undefined;
  }

  return value;
}

function createWindow(
  now: Date,
  windowSeconds: number
): { readonly index: number; readonly ttlSeconds: number } {
  const nowMilliseconds = now.getTime();
  const windowMilliseconds = windowSeconds * 1_000;
  const index = Math.floor(nowMilliseconds / windowMilliseconds);
  const elapsedMilliseconds = nowMilliseconds % windowMilliseconds;
  const ttlSeconds = Math.max(1, Math.ceil((windowMilliseconds - elapsedMilliseconds) / 1_000));

  return { index, ttlSeconds };
}

function createReplayLeaseNonce(randomBytes: (size: number) => Buffer): string | undefined {
  try {
    const bytes = randomBytes(DEVICE_BOOTSTRAP_NONCE_BYTE_LENGTH);
    if (!Buffer.isBuffer(bytes) || bytes.length !== DEVICE_BOOTSTRAP_NONCE_BYTE_LENGTH) {
      return undefined;
    }

    return bytes.toString('base64url');
  } catch {
    return undefined;
  }
}

function parseReplayLeaseNonce(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    return undefined;
  }

  const bytes = Buffer.from(value, 'base64url');
  if (
    bytes.length !== DEVICE_BOOTSTRAP_NONCE_BYTE_LENGTH ||
    bytes.toString('base64url') !== value
  ) {
    return undefined;
  }

  return value;
}

function parseQuotaDecision(value: unknown): DeviceBootstrapRateDecision {
  if (!Array.isArray(value) || value.length !== 2) {
    return { kind: 'unavailable' };
  }

  const [state, retryAfterSeconds] = value;
  if (state === 1 && retryAfterSeconds === 0) {
    return { kind: 'allowed' };
  }

  if (
    state === 0 &&
    typeof retryAfterSeconds === 'number' &&
    Number.isSafeInteger(retryAfterSeconds) &&
    retryAfterSeconds >= 1 &&
    retryAfterSeconds <= MAXIMUM_RETRY_AFTER_SECONDS
  ) {
    return { kind: 'limited', retryAfterSeconds };
  }

  return { kind: 'unavailable' };
}

function isSingleNumberResult(value: unknown, minimum: number, maximum: number): boolean {
  return (
    Array.isArray(value) &&
    value.length === 1 &&
    typeof value[0] === 'number' &&
    Number.isSafeInteger(value[0]) &&
    value[0] >= minimum &&
    value[0] <= maximum
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
