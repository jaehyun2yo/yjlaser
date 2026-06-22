import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { LOG_PROJECTS, type LogProject } from '../dto/log-event.dto';

export const LOG_INGESTION_KEY_STORE = Symbol('LOG_INGESTION_KEY_STORE');
export const LOG_INGESTION_REPLAY_STORE = Symbol('LOG_INGESTION_REPLAY_STORE');
export const LOG_INGESTION_RATE_LIMITER = Symbol('LOG_INGESTION_RATE_LIMITER');
export const LOG_INGESTION_AUTH_OPTIONS = Symbol('LOG_INGESTION_AUTH_OPTIONS');

export const LOG_INGESTION_HEADERS = [
  'x-log-client-id',
  'x-log-key-id',
  'x-log-timestamp',
  'x-log-nonce',
  'x-log-signature',
] as const;

export type LogIngestionHeader = (typeof LOG_INGESTION_HEADERS)[number];

export type LogIngestionRequest = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  rawBody?: Buffer;
};

export type LogIngestionClientKey = {
  clientId: string;
  keyId: string;
  secret: string;
  allowedProjects: LogProject[];
  hashKeyVersion: string;
  disabled?: boolean;
};

export type LogIngestionAuthContext = {
  clientId: string;
  keyId: string;
  hashKeyVersion: string;
};

export type LogIngestionAuthOptions = {
  allowedClockSkewMs: number;
};

export interface LogIngestionKeyStore {
  getActiveKey(clientId: string, keyId: string): Promise<LogIngestionClientKey | null>;
  recordAuthFailure?(clientId: string, keyId: string, reason: 'signature_invalid'): Promise<void>;
}

export interface LogIngestionReplayStore {
  consumeNonce(clientId: string, nonce: string, expiresAt: number): Promise<'accepted' | 'replay'>;
}

export type LogIngestionRateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export interface LogIngestionRateLimiter {
  check(clientId: string, ip: string | undefined): Promise<LogIngestionRateLimitDecision>;
}

export class InMemoryLogIngestionKeyStore implements LogIngestionKeyStore {
  private readonly keys = new Map<string, LogIngestionClientKey>();
  private readonly authFailures = new Map<string, number>();

  constructor(
    keys: LogIngestionClientKey[] = [],
    private readonly options: { maxAuthFailures?: number } = {}
  ) {
    for (const key of keys) {
      if (Buffer.byteLength(key.secret, 'utf8') < 32) {
        throw new Error('LOG_INGESTION_SECRET_TOO_SHORT');
      }
      this.keys.set(this.getMapKey(key.clientId, key.keyId), key);
    }
  }

  async getActiveKey(clientId: string, keyId: string): Promise<LogIngestionClientKey | null> {
    const key = this.keys.get(this.getMapKey(clientId, keyId));
    if (!key || key.disabled) {
      return null;
    }

    return key;
  }

  async recordAuthFailure(
    clientId: string,
    keyId: string,
    _reason: 'signature_invalid'
  ): Promise<void> {
    if (!this.options.maxAuthFailures) {
      return;
    }

    const mapKey = this.getMapKey(clientId, keyId);
    const nextCount = (this.authFailures.get(mapKey) ?? 0) + 1;
    this.authFailures.set(mapKey, nextCount);

    if (nextCount >= this.options.maxAuthFailures) {
      const key = this.keys.get(mapKey);
      if (key) {
        this.keys.set(mapKey, { ...key, disabled: true });
      }
    }
  }

  private getMapKey(clientId: string, keyId: string): string {
    return `${clientId}:${keyId}`;
  }
}

export function parseLogIngestionClientKeys(
  serializedKeys: string | null | undefined
): LogIngestionClientKey[] {
  if (!serializedKeys?.trim()) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedKeys);
  } catch {
    throw new Error('LOG_INGESTION_CLIENT_KEYS_INVALID');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('LOG_INGESTION_CLIENT_KEYS_INVALID');
  }

  return parsed.map((entry) => parseLogIngestionClientKey(entry));
}

function parseLogIngestionClientKey(entry: unknown): LogIngestionClientKey {
  if (!isRecord(entry)) {
    throw new Error('LOG_INGESTION_CLIENT_KEYS_INVALID');
  }

  const clientId = readRequiredString(entry, 'clientId');
  const keyId = readRequiredString(entry, 'keyId');
  const secret = readRequiredString(entry, 'secret');
  const hashKeyVersion = readRequiredString(entry, 'hashKeyVersion');
  const allowedProjects = readAllowedProjects(entry.allowedProjects);
  const disabled = typeof entry.disabled === 'boolean' ? entry.disabled : undefined;

  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('LOG_INGESTION_SECRET_TOO_SHORT');
  }

  return {
    clientId,
    keyId,
    secret,
    allowedProjects,
    hashKeyVersion,
    disabled,
  };
}

function readRequiredString(entry: Record<string, unknown>, key: string): string {
  const value = entry[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('LOG_INGESTION_CLIENT_KEYS_INVALID');
  }
  return value;
}

function readAllowedProjects(value: unknown): LogProject[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('LOG_INGESTION_CLIENT_KEYS_INVALID');
  }

  const validProjects = new Set<string>(LOG_PROJECTS);
  const projects = value.map((project) => {
    if (typeof project !== 'string' || !validProjects.has(project)) {
      throw new Error('LOG_INGESTION_CLIENT_KEYS_INVALID');
    }
    return project as LogProject;
  });

  return [...new Set(projects)];
}

export class InMemoryLogIngestionReplayStore implements LogIngestionReplayStore {
  private readonly nonces = new Map<string, number>();

  async consumeNonce(
    clientId: string,
    nonce: string,
    expiresAt: number
  ): Promise<'accepted' | 'replay'> {
    const now = Date.now();
    for (const [key, expiry] of this.nonces.entries()) {
      if (expiry <= now) {
        this.nonces.delete(key);
      }
    }

    const mapKey = `${clientId}:${nonce}`;
    if (this.nonces.has(mapKey)) {
      return 'replay';
    }

    this.nonces.set(mapKey, expiresAt);
    return 'accepted';
  }
}

export class InMemoryLogIngestionRateLimiter implements LogIngestionRateLimiter {
  private readonly buckets = new Map<string, { windowStart: number; count: number }>();

  constructor(private readonly options: { maxRequests: number; windowMs: number }) {}

  async check(clientId: string, ip: string | undefined): Promise<LogIngestionRateLimitDecision> {
    const now = Date.now();
    const bucketKey = `${clientId}:${ip ?? 'unknown'}`;
    const current = this.buckets.get(bucketKey);

    if (!current || now - current.windowStart >= this.options.windowMs) {
      this.buckets.set(bucketKey, { windowStart: now, count: 1 });
      return { allowed: true };
    }

    if (current.count >= this.options.maxRequests) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((this.options.windowMs - (now - current.windowStart)) / 1000)
        ),
      };
    }

    current.count += 1;
    return { allowed: true };
  }
}

@Injectable()
export class LogIngestionAuthVerifier {
  constructor(
    @Inject(LOG_INGESTION_KEY_STORE)
    private readonly keyStore: LogIngestionKeyStore,
    @Inject(LOG_INGESTION_REPLAY_STORE)
    private readonly replayStore: LogIngestionReplayStore,
    @Inject(LOG_INGESTION_RATE_LIMITER)
    private readonly rateLimiter: LogIngestionRateLimiter,
    @Optional()
    @Inject(LOG_INGESTION_AUTH_OPTIONS)
    private readonly options: LogIngestionAuthOptions = { allowedClockSkewMs: 300_000 }
  ) {}

  async verifyRequest(
    request: LogIngestionRequest,
    projects: LogProject[]
  ): Promise<LogIngestionAuthContext> {
    const headers = this.getRequiredHeaders(request);
    const key = await this.keyStore.getActiveKey(headers.clientId, headers.keyId);

    if (!key) {
      throw new UnauthorizedException({
        code: 'LOG_AUTH_REQUIRED',
        message: 'LOG_AUTH_REQUIRED',
      });
    }

    this.verifyTimestamp(headers.timestamp);
    await this.verifyRateLimit(headers.clientId, request.ip);
    try {
      this.verifySignature(request, key.secret, headers);
    } catch (error) {
      await this.keyStore.recordAuthFailure?.(headers.clientId, headers.keyId, 'signature_invalid');
      throw error;
    }
    this.verifyProjectAllowlist(key, projects);
    await this.verifyReplay(headers.clientId, headers.nonce, headers.timestamp);

    return {
      clientId: key.clientId,
      keyId: key.keyId,
      hashKeyVersion: key.hashKeyVersion,
    };
  }

  private getRequiredHeaders(request: LogIngestionRequest): {
    clientId: string;
    keyId: string;
    timestamp: string;
    nonce: string;
    signature: string;
  } {
    const clientId = this.getHeader(request, 'x-log-client-id');
    const keyId = this.getHeader(request, 'x-log-key-id');
    const timestamp = this.getHeader(request, 'x-log-timestamp');
    const nonce = this.getHeader(request, 'x-log-nonce');
    const signature = this.getHeader(request, 'x-log-signature');

    if (!clientId || !keyId || !timestamp || !nonce || !signature) {
      throw new UnauthorizedException({
        code: 'LOG_AUTH_REQUIRED',
        message: 'LOG_AUTH_REQUIRED',
      });
    }

    return { clientId, keyId, timestamp, nonce, signature };
  }

  private getHeader(request: LogIngestionRequest, name: LogIngestionHeader): string | null {
    const directValue = request.headers[name];
    const value =
      directValue ??
      Object.entries(request.headers).find(([key]) => key.toLowerCase() === name)?.[1];

    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }

  private verifyTimestamp(timestamp: string): void {
    const parsed = Date.parse(timestamp);
    if (!Number.isFinite(parsed)) {
      throw new UnauthorizedException({
        code: 'LOG_TIMESTAMP_INVALID',
        message: 'LOG_TIMESTAMP_INVALID',
      });
    }

    if (Math.abs(Date.now() - parsed) > this.options.allowedClockSkewMs) {
      throw new UnauthorizedException({
        code: 'LOG_TIMESTAMP_OUT_OF_WINDOW',
        message: 'LOG_TIMESTAMP_OUT_OF_WINDOW',
      });
    }
  }

  private verifyProjectAllowlist(key: LogIngestionClientKey, projects: LogProject[]): void {
    const rejectedProject = projects.find((project) => !key.allowedProjects.includes(project));
    if (rejectedProject) {
      throw new ForbiddenException({
        code: 'LOG_PROJECT_DENIED',
        message: 'LOG_PROJECT_DENIED',
      });
    }
  }

  private async verifyRateLimit(clientId: string, ip: string | undefined): Promise<void> {
    const decision = await this.rateLimiter.check(clientId, ip);
    if (!decision.allowed) {
      throw new HttpException(
        {
          code: 'LOG_RATE_LIMITED',
          message: 'LOG_RATE_LIMITED',
          retry_after_seconds: decision.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  private verifySignature(
    request: LogIngestionRequest,
    secret: string,
    headers: { timestamp: string; nonce: string; signature: string }
  ): void {
    if (!request.rawBody) {
      throw new UnauthorizedException({
        code: 'LOG_RAW_BODY_REQUIRED',
        message: 'LOG_RAW_BODY_REQUIRED',
      });
    }

    const bodyHash = createHash('sha256').update(request.rawBody).digest('hex');
    const expectedSignature = createHmac('sha256', secret)
      .update(`${headers.timestamp}.${headers.nonce}.${bodyHash}`)
      .digest('base64url');

    if (!timingSafeStringEqual(headers.signature, expectedSignature)) {
      throw new UnauthorizedException({
        code: 'LOG_SIGNATURE_INVALID',
        message: 'LOG_SIGNATURE_INVALID',
      });
    }
  }

  private async verifyReplay(clientId: string, nonce: string, timestamp: string): Promise<void> {
    const expiresAt = Date.parse(timestamp) + this.options.allowedClockSkewMs;
    const result = await this.replayStore.consumeNonce(clientId, nonce, expiresAt);

    if (result === 'replay') {
      throw new ConflictException({
        code: 'LOG_REPLAY_DETECTED',
        message: 'LOG_REPLAY_DETECTED',
      });
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function timingSafeStringEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (actualBuffer.length !== expectedBuffer.length) {
    const dummy = Buffer.alloc(actualBuffer.length);
    timingSafeEqual(actualBuffer, dummy);
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
