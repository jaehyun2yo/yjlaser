import { createHmac } from 'crypto';
import type { SessionUser } from '../../auth/auth.service';
import type { DeviceAdminActorHashErrorCode, DeviceAuthEnvironment } from './device-auth.types';

const MINIMUM_AUDIT_HMAC_SECRET_BYTE_LENGTH = 32;

export class DeviceAdminActorHashError extends Error {
  public readonly code: DeviceAdminActorHashErrorCode;

  public constructor(code: DeviceAdminActorHashErrorCode) {
    super(code);
    this.name = 'DeviceAdminActorHashError';
    this.code = code;
  }
}

/**
 * Hashes an already-authorized administrator principal for device-auth audit
 * rows. The raw principal id and HMAC secret never leave this boundary.
 */
export class DeviceAdminActorHasher {
  readonly #environment: DeviceAuthEnvironment;
  readonly #auditHmacSecret: Buffer;

  public constructor(environment: DeviceAuthEnvironment, auditHmacSecret: unknown) {
    if (environment !== 'dev' && environment !== 'stg' && environment !== 'prd') {
      throw new DeviceAdminActorHashError('DEVICE_ADMIN_ACTOR_HASH_ENVIRONMENT_INVALID');
    }

    if (
      typeof auditHmacSecret !== 'string' ||
      auditHmacSecret.trim().length === 0 ||
      Buffer.byteLength(auditHmacSecret, 'utf8') < MINIMUM_AUDIT_HMAC_SECRET_BYTE_LENGTH
    ) {
      throw new DeviceAdminActorHashError('DEVICE_ADMIN_ACTOR_HASH_SECRET_INVALID');
    }

    this.#environment = environment;
    this.#auditHmacSecret = Buffer.from(auditHmacSecret, 'utf8');
  }

  public hashAdmin(user: SessionUser): string {
    const userId = parseAdminUserId(user);
    const payload = `yjlaser:device-auth:v1:admin-actor:${this.#environment}:admin:${userId}`;

    return createHmac('sha256', this.#auditHmacSecret).update(payload, 'utf8').digest('hex');
  }

  public toJSON(): undefined {
    return undefined;
  }
}

function parseAdminUserId(user: unknown): string {
  if (typeof user !== 'object' || user === null) {
    throw new DeviceAdminActorHashError('DEVICE_ADMIN_ACTOR_INVALID');
  }

  const candidate = user as Partial<SessionUser>;
  if (candidate.userType !== 'admin') {
    throw new DeviceAdminActorHashError('DEVICE_ADMIN_ACTOR_INVALID');
  }

  if (typeof candidate.userId === 'string') {
    const normalized = candidate.userId.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }

  if (
    typeof candidate.userId === 'number' &&
    Number.isSafeInteger(candidate.userId) &&
    candidate.userId >= 0
  ) {
    return String(candidate.userId);
  }

  throw new DeviceAdminActorHashError('DEVICE_ADMIN_ACTOR_INVALID');
}
