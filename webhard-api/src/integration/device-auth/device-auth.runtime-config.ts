import { DeviceAdminActorHashError, DeviceAdminActorHasher } from './device-admin-actor-hash';
import {
  DeviceAuthConfigurationError,
  loadDeviceAuthConfig,
  type DeviceAuthConfig,
} from './device-auth.config';
import {
  loadDeviceAccessTokenConfig,
  DEVICE_ACCESS_TOKEN_TTL_SECONDS,
  type DeviceAccessTokenConfig,
} from './device-access-token.config';
import {
  DeviceTokenExchangeRequestHashError,
  DeviceTokenExchangeRequestHasher,
} from './device-token-exchange-hash';
import type {
  DeviceAuthEnvironment,
  DeviceAuthRuntimeConfigurationErrorCode,
} from './device-auth.types';

const MAXIMUM_PRISMA_INT = 2_147_483_647;
const PREPARED_CREDENTIAL_TTL_RANGE_MS = {
  minimum: 5 * 60 * 1000,
  maximum: 24 * 60 * 60 * 1000,
} as const;
const ACTIVE_CREDENTIAL_TTL_RANGE_MS = {
  minimum: 60 * 60 * 1000,
  maximum: 90 * 24 * 60 * 60 * 1000,
} as const;
const AUDIT_LOG_TTL_RANGE_MS = {
  minimum: 24 * 60 * 60 * 1000,
  maximum: 365 * 24 * 60 * 60 * 1000,
} as const;
const ROTATION_DEADLINE_RANGE_SECONDS = {
  minimum: 300,
  maximum: 86_400,
} as const;
const ROTATION_ACK_RECOVERY_RANGE_SECONDS = {
  minimum: 5,
  maximum: 300,
} as const;
const CANONICAL_POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;

const DEVICE_AUTH_RUNTIME_VARIABLE_NAMES = [
  'DEVICE_AUTH_ENVIRONMENT',
  'DEVICE_AUTH_CREDENTIAL_CURRENT_HASH_KEY_VERSION',
  'DEVICE_AUTH_CREDENTIAL_PEPPER_KEYRING_JSON',
  'DEVICE_AUTH_AUDIT_HMAC_SECRET',
  'DEVICE_AUTH_PREPARED_CREDENTIAL_TTL_MS',
  'DEVICE_AUTH_ACTIVE_CREDENTIAL_TTL_MS',
  'DEVICE_AUTH_AUDIT_LOG_TTL_MS',
  'DEVICE_AUTH_ACCESS_TOKEN_ISSUER',
  'DEVICE_AUTH_ACCESS_TOKEN_AUDIENCE',
  'DEVICE_AUTH_ACCESS_TOKEN_CURRENT_KID',
  'DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON',
  'DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET',
  'DEVICE_AUTH_ROTATION_DEADLINE_SECONDS',
  'DEVICE_AUTH_ROTATION_ACK_RECOVERY_SECONDS',
  'DEVICE_AUTH_ROTATION_RUNTIME_ENABLED',
] as const;

type DeviceAuthRuntimeVariableName = (typeof DEVICE_AUTH_RUNTIME_VARIABLE_NAMES)[number];

export interface DeviceAuthConfigServiceReader {
  get(key: string): unknown;
}

export interface DeviceEnrollmentRuntimeOptions {
  readonly preparedCredentialTtlMs: number;
  readonly activeCredentialTtlMs: number;
  readonly auditLogTtlMs: number;
}

export interface DeviceAuthRotationRuntimeOptions {
  readonly rotationDeadlineSeconds: number;
  readonly rotationAckRecoverySeconds: number;
  readonly rotationRuntimeEnabled: boolean;
}

export interface DeviceAuthRuntimeConfig {
  readonly deviceAuthConfig: DeviceAuthConfig;
  readonly enrollmentOptions: DeviceEnrollmentRuntimeOptions;
  readonly adminActorHasher: DeviceAdminActorHasher;
  readonly accessTokenConfig: DeviceAccessTokenConfig;
  readonly tokenExchangeRequestHasher: DeviceTokenExchangeRequestHasher;
  readonly rotationOptions: DeviceAuthRotationRuntimeOptions;
}

export class DeviceAuthRuntimeConfigurationError extends Error {
  public readonly code: DeviceAuthRuntimeConfigurationErrorCode;

  public constructor(code: DeviceAuthRuntimeConfigurationErrorCode) {
    super(code);
    this.name = 'DeviceAuthRuntimeConfigurationError';
    this.code = code;
  }

  public toJSON(): { readonly code: DeviceAuthRuntimeConfigurationErrorCode } {
    return { code: this.code };
  }
}

/**
 * Builds the selected device-auth environment from only its explicitly named
 * process configuration. There are deliberately no defaults or cross-feature
 * fallbacks: a missing value prevents the application from starting.
 */
export function loadDeviceAuthRuntimeConfig(input: unknown): DeviceAuthRuntimeConfig {
  if (!isRecord(input)) {
    throw new DeviceAuthRuntimeConfigurationError('DEVICE_AUTH_RUNTIME_CONFIG_INVALID');
  }

  const environment = parseEnvironment(getOwnValue(input, 'DEVICE_AUTH_ENVIRONMENT'));
  const currentHashKeyVersion = parseCurrentHashKeyVersion(
    getOwnValue(input, 'DEVICE_AUTH_CREDENTIAL_CURRENT_HASH_KEY_VERSION')
  );
  const credentialPepperKeyring = parseCredentialPepperKeyring(
    getOwnValue(input, 'DEVICE_AUTH_CREDENTIAL_PEPPER_KEYRING_JSON')
  );
  const auditHmacSecret = getOwnValue(input, 'DEVICE_AUTH_AUDIT_HMAC_SECRET');
  const enrollmentOptions = Object.freeze({
    preparedCredentialTtlMs: parseDuration(
      getOwnValue(input, 'DEVICE_AUTH_PREPARED_CREDENTIAL_TTL_MS'),
      PREPARED_CREDENTIAL_TTL_RANGE_MS,
      'DEVICE_AUTH_RUNTIME_PREPARED_CREDENTIAL_TTL_INVALID'
    ),
    activeCredentialTtlMs: parseDuration(
      getOwnValue(input, 'DEVICE_AUTH_ACTIVE_CREDENTIAL_TTL_MS'),
      ACTIVE_CREDENTIAL_TTL_RANGE_MS,
      'DEVICE_AUTH_RUNTIME_ACTIVE_CREDENTIAL_TTL_INVALID'
    ),
    auditLogTtlMs: parseDuration(
      getOwnValue(input, 'DEVICE_AUTH_AUDIT_LOG_TTL_MS'),
      AUDIT_LOG_TTL_RANGE_MS,
      'DEVICE_AUTH_RUNTIME_AUDIT_LOG_TTL_INVALID'
    ),
  });
  const rotationDeadlineSeconds = parseRotationDuration(
    getOwnValue(input, 'DEVICE_AUTH_ROTATION_DEADLINE_SECONDS'),
    ROTATION_DEADLINE_RANGE_SECONDS,
    'DEVICE_AUTH_RUNTIME_ROTATION_DEADLINE_INVALID'
  );
  const rotationAckRecoverySeconds = parseRotationDuration(
    getOwnValue(input, 'DEVICE_AUTH_ROTATION_ACK_RECOVERY_SECONDS'),
    ROTATION_ACK_RECOVERY_RANGE_SECONDS,
    'DEVICE_AUTH_RUNTIME_ROTATION_ACK_RECOVERY_INVALID'
  );
  if (
    rotationAckRecoverySeconds > DEVICE_ACCESS_TOKEN_TTL_SECONDS ||
    rotationAckRecoverySeconds >= rotationDeadlineSeconds ||
    enrollmentOptions.activeCredentialTtlMs <=
      (rotationDeadlineSeconds + rotationAckRecoverySeconds) * 1_000
  ) {
    throw new DeviceAuthRuntimeConfigurationError(
      'DEVICE_AUTH_RUNTIME_ROTATION_CONSTRAINT_INVALID'
    );
  }
  const rotationOptions = Object.freeze({
    rotationDeadlineSeconds,
    rotationAckRecoverySeconds,
    rotationRuntimeEnabled: parseRotationRuntimeEnabled(
      getOwnValue(input, 'DEVICE_AUTH_ROTATION_RUNTIME_ENABLED')
    ),
  });

  let deviceAuthConfig: DeviceAuthConfig;
  try {
    deviceAuthConfig = loadDeviceAuthConfig({
      environment,
      environments: {
        [environment]: {
          currentHashKeyVersion,
          credentialPepperKeyring,
        },
      },
    });
  } catch (error: unknown) {
    if (error instanceof DeviceAuthConfigurationError) {
      throw new DeviceAuthRuntimeConfigurationError('DEVICE_AUTH_RUNTIME_PEPPER_KEYRING_INVALID');
    }

    throw new DeviceAuthRuntimeConfigurationError('DEVICE_AUTH_RUNTIME_CONFIG_INVALID');
  }

  let adminActorHasher: DeviceAdminActorHasher;
  try {
    adminActorHasher = new DeviceAdminActorHasher(environment, auditHmacSecret);
  } catch (error: unknown) {
    if (error instanceof DeviceAdminActorHashError) {
      throw new DeviceAuthRuntimeConfigurationError(
        'DEVICE_AUTH_RUNTIME_AUDIT_HMAC_SECRET_INVALID'
      );
    }

    throw new DeviceAuthRuntimeConfigurationError('DEVICE_AUTH_RUNTIME_CONFIG_INVALID');
  }

  let accessTokenConfig: DeviceAccessTokenConfig;
  try {
    const signingKeyring = parseAccessTokenSigningKeyring(
      getOwnValue(input, 'DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON')
    );
    accessTokenConfig = loadDeviceAccessTokenConfig({
      environment,
      environments: {
        [environment]: {
          issuer: getOwnValue(input, 'DEVICE_AUTH_ACCESS_TOKEN_ISSUER'),
          audience: getOwnValue(input, 'DEVICE_AUTH_ACCESS_TOKEN_AUDIENCE'),
          currentKid: getOwnValue(input, 'DEVICE_AUTH_ACCESS_TOKEN_CURRENT_KID'),
          signingKeyring,
        },
      },
    });
  } catch {
    throw new DeviceAuthRuntimeConfigurationError(
      'DEVICE_AUTH_RUNTIME_ACCESS_TOKEN_CONFIG_INVALID'
    );
  }

  let tokenExchangeRequestHasher: DeviceTokenExchangeRequestHasher;
  try {
    tokenExchangeRequestHasher = new DeviceTokenExchangeRequestHasher(
      environment,
      getOwnValue(input, 'DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET') as string
    );
  } catch (error: unknown) {
    if (error instanceof DeviceTokenExchangeRequestHashError) {
      throw new DeviceAuthRuntimeConfigurationError(
        'DEVICE_AUTH_RUNTIME_TOKEN_EXCHANGE_HMAC_SECRET_INVALID'
      );
    }

    throw new DeviceAuthRuntimeConfigurationError('DEVICE_AUTH_RUNTIME_CONFIG_INVALID');
  }

  return Object.freeze({
    deviceAuthConfig,
    enrollmentOptions,
    adminActorHasher,
    accessTokenConfig,
    tokenExchangeRequestHasher,
    rotationOptions,
  });
}

export function loadDeviceAuthRuntimeConfigFromConfigService(
  configService: DeviceAuthConfigServiceReader
): DeviceAuthRuntimeConfig {
  const source: Record<DeviceAuthRuntimeVariableName, unknown> = {} as Record<
    DeviceAuthRuntimeVariableName,
    unknown
  >;
  for (const variableName of DEVICE_AUTH_RUNTIME_VARIABLE_NAMES) {
    source[variableName] = configService.get(variableName);
  }

  return loadDeviceAuthRuntimeConfig(source);
}

function parseEnvironment(value: unknown): DeviceAuthEnvironment {
  if (value !== 'dev' && value !== 'stg' && value !== 'prd') {
    throw new DeviceAuthRuntimeConfigurationError('DEVICE_AUTH_RUNTIME_ENVIRONMENT_INVALID');
  }

  return value;
}

function parseCurrentHashKeyVersion(value: unknown): number {
  if (typeof value !== 'string' || !CANONICAL_POSITIVE_INTEGER_PATTERN.test(value)) {
    throw new DeviceAuthRuntimeConfigurationError('DEVICE_AUTH_RUNTIME_HASH_KEY_VERSION_INVALID');
  }

  const parsedValue = Number(value);
  if (!Number.isSafeInteger(parsedValue) || parsedValue > MAXIMUM_PRISMA_INT) {
    throw new DeviceAuthRuntimeConfigurationError('DEVICE_AUTH_RUNTIME_HASH_KEY_VERSION_INVALID');
  }

  return parsedValue;
}

function parseCredentialPepperKeyring(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DeviceAuthRuntimeConfigurationError('DEVICE_AUTH_RUNTIME_PEPPER_KEYRING_INVALID');
  }

  try {
    const parsedValue: unknown = JSON.parse(value);
    if (!isRecord(parsedValue)) {
      throw new DeviceAuthRuntimeConfigurationError('DEVICE_AUTH_RUNTIME_PEPPER_KEYRING_INVALID');
    }

    return parsedValue;
  } catch (error: unknown) {
    if (error instanceof DeviceAuthRuntimeConfigurationError) {
      throw error;
    }

    throw new DeviceAuthRuntimeConfigurationError('DEVICE_AUTH_RUNTIME_PEPPER_KEYRING_INVALID');
  }
}

function parseAccessTokenSigningKeyring(value: unknown): unknown {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DeviceAuthRuntimeConfigurationError(
      'DEVICE_AUTH_RUNTIME_ACCESS_TOKEN_CONFIG_INVALID'
    );
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new DeviceAuthRuntimeConfigurationError(
      'DEVICE_AUTH_RUNTIME_ACCESS_TOKEN_CONFIG_INVALID'
    );
  }
}

function parseDuration(
  value: unknown,
  range: { readonly minimum: number; readonly maximum: number },
  errorCode:
    | 'DEVICE_AUTH_RUNTIME_PREPARED_CREDENTIAL_TTL_INVALID'
    | 'DEVICE_AUTH_RUNTIME_ACTIVE_CREDENTIAL_TTL_INVALID'
    | 'DEVICE_AUTH_RUNTIME_AUDIT_LOG_TTL_INVALID'
): number {
  if (typeof value !== 'string' || !CANONICAL_POSITIVE_INTEGER_PATTERN.test(value)) {
    throw new DeviceAuthRuntimeConfigurationError(errorCode);
  }

  const parsedValue = Number(value);
  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < range.minimum ||
    parsedValue > range.maximum
  ) {
    throw new DeviceAuthRuntimeConfigurationError(errorCode);
  }

  return parsedValue;
}

function parseRotationDuration(
  value: unknown,
  range: { readonly minimum: number; readonly maximum: number },
  errorCode:
    | 'DEVICE_AUTH_RUNTIME_ROTATION_DEADLINE_INVALID'
    | 'DEVICE_AUTH_RUNTIME_ROTATION_ACK_RECOVERY_INVALID'
): number {
  if (typeof value !== 'string' || !CANONICAL_POSITIVE_INTEGER_PATTERN.test(value)) {
    throw new DeviceAuthRuntimeConfigurationError(errorCode);
  }

  const parsedValue = Number(value);
  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < range.minimum ||
    parsedValue > range.maximum
  ) {
    throw new DeviceAuthRuntimeConfigurationError(errorCode);
  }

  return parsedValue;
}

function parseRotationRuntimeEnabled(value: unknown): boolean {
  if (value === undefined || value === 'false' || value === false) {
    return false;
  }
  if (value === 'true') {
    return true;
  }

  throw new DeviceAuthRuntimeConfigurationError('DEVICE_AUTH_RUNTIME_ROTATION_ENABLED_INVALID');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getOwnValue(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}
