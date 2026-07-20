import { Prisma } from '@prisma/client';
import { DEFAULT_DEVICE_ACCESS_PERMISSIONS } from '../auth/integration-permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { DeviceAccessTokenService } from './device-access-token.service';
import {
  DeviceAuthRotationCompatibilityError,
  requireCompatibleDeviceCredentialRotation,
} from './device-auth-rotation-compatibility';
import type { DeviceAuthConfig } from './device-auth.config';
import {
  createDeviceCredentialLookupHashes,
  hashDeviceCredential,
  verifyDeviceCredential,
} from './device-credential-hash';
import { DeviceTokenExchangeRequestHasher } from './device-token-exchange-hash';
import {
  DEVICE_AUTH_PROGRAM_TYPES,
  DEVICE_CAPABILITY_PROFILES,
  type DeviceAuthEnvironment,
  type DeviceAuthProgramType,
  type DeviceCapabilityProfile,
  type DeviceTokenExchangeErrorCode,
  type DeviceTokenExchangeInput,
  type DeviceTokenExchangeResult,
} from './device-auth.types';

const CANONICAL_DEVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CANONICAL_BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const REFRESH_CREDENTIAL_BYTE_LENGTH = 32;
const MINIMUM_REQUEST_ID_BYTE_LENGTH = 16;
const MAXIMUM_REQUEST_ID_BYTE_LENGTH = 64;
const MAXIMUM_CREDENTIAL_VERSION = 2_147_483_647;
const MAX_SERIALIZATION_ATTEMPTS = 2;

interface StoredDevice {
  readonly id: string;
  readonly environment: string;
  readonly programType: string;
  readonly capabilityProfile: string;
  readonly status: string;
  readonly credentialVersion: number;
  readonly revokedAt: Date | null;
}

interface StoredRefreshCredential {
  readonly id: string;
  readonly deviceId: string;
  readonly credentialHash: string;
  readonly hashKeyVersion: number;
  readonly status: string;
  readonly credentialVersion: number;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

interface StoredTokenExchange {
  readonly id: string;
  readonly deviceId: string;
  readonly previousCredentialId: string;
  readonly successorCredentialId: string;
  readonly requestIdDigest: string;
  readonly credentialVersion: number;
  readonly status: string;
  readonly completedAt: Date;
  readonly recoverableUntil: Date;
  readonly revokedAt: Date | null;
  readonly previous: StoredRefreshCredential;
  readonly successor: StoredRefreshCredential;
  readonly device: StoredDevice;
}

interface CommittedExchange {
  readonly deviceId: string;
  readonly environment: DeviceAuthEnvironment;
  readonly programType: DeviceAuthProgramType;
  readonly capabilityProfile: DeviceCapabilityProfile;
  readonly credentialVersion: number;
  readonly refreshCredentialAction?: 'replace_with_candidate' | 'keep_current';
  readonly rotation?: { readonly id: string; readonly deadlineAt: string };
}

export interface DeviceTokenExchangeServiceOptions {
  readonly activeCredentialTtlMs: number;
  readonly auditLogTtlMs: number;
  readonly now?: () => Date;
}

export interface DeviceTokenExchangeRotationOptions {
  readonly rotationRuntimeEnabled: boolean;
}

export class DeviceTokenExchangeError extends Error {
  public readonly code: DeviceTokenExchangeErrorCode;

  public constructor(code: DeviceTokenExchangeErrorCode) {
    super(code);
    this.name = 'DeviceTokenExchangeError';
    this.code = code;
  }

  public toJSON(): { readonly code: DeviceTokenExchangeErrorCode } {
    return { code: this.code };
  }
}

export class DeviceTokenExchangeService {
  readonly #now: () => Date;
  readonly #activeCredentialTtlMs: number;
  readonly #auditLogTtlMs: number;

  public constructor(
    private readonly prisma: PrismaService,
    private readonly config: DeviceAuthConfig,
    options: DeviceTokenExchangeServiceOptions,
    private readonly accessTokenService: DeviceAccessTokenService,
    private readonly requestHasher: DeviceTokenExchangeRequestHasher,
    private readonly rotationOptions: DeviceTokenExchangeRotationOptions = {
      rotationRuntimeEnabled: true,
    }
  ) {
    ensurePositiveDuration(options.activeCredentialTtlMs);
    ensurePositiveDuration(options.auditLogTtlMs);
    this.#activeCredentialTtlMs = options.activeCredentialTtlMs;
    this.#auditLogTtlMs = options.auditLogTtlMs;
    this.#now = options.now ?? (() => new Date());
  }

  public async exchange(input: DeviceTokenExchangeInput): Promise<DeviceTokenExchangeResult> {
    const parsedInput = parseInput(input);
    let requestIdDigest: string;
    try {
      requestIdDigest = this.requestHasher.digest(parsedInput.refreshRequestId);
    } catch {
      throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
    }

    const existingExchange = await this.findExistingExchange(parsedInput.deviceId, requestIdDigest);

    if (existingExchange) {
      return this.recoverExistingExchange(existingExchange, parsedInput);
    }

    let committedExchange: CommittedExchange;
    try {
      committedExchange = await this.createReplacementExchange(parsedInput, requestIdDigest);
    } catch (error: unknown) {
      if (!(error instanceof DeviceTokenExchangeError)) {
        throw error;
      }

      const concurrentExchange = await this.findExistingExchange(
        parsedInput.deviceId,
        requestIdDigest
      );
      if (!concurrentExchange) {
        throw error;
      }

      return this.recoverExistingExchange(concurrentExchange, parsedInput);
    }

    return this.issueAccessToken(committedExchange);
  }

  private async findExistingExchange(
    deviceId: string,
    requestIdDigest: string
  ): Promise<StoredTokenExchange | null> {
    return this.runSafeDatabaseOperation(async () => {
      const exchange = await this.prisma.deviceTokenExchange.findFirst({
        where: {
          deviceId,
          requestIdDigest,
        },
        select: {
          id: true,
          deviceId: true,
          previousCredentialId: true,
          successorCredentialId: true,
          requestIdDigest: true,
          credentialVersion: true,
          status: true,
          completedAt: true,
          recoverableUntil: true,
          revokedAt: true,
          previous: {
            select: {
              id: true,
              deviceId: true,
              credentialHash: true,
              hashKeyVersion: true,
              status: true,
              credentialVersion: true,
              expiresAt: true,
              revokedAt: true,
            },
          },
          successor: {
            select: {
              id: true,
              deviceId: true,
              credentialHash: true,
              hashKeyVersion: true,
              status: true,
              credentialVersion: true,
              expiresAt: true,
              revokedAt: true,
            },
          },
          device: {
            select: {
              id: true,
              environment: true,
              programType: true,
              capabilityProfile: true,
              status: true,
              credentialVersion: true,
              revokedAt: true,
            },
          },
        },
      });
      return exchange as unknown as StoredTokenExchange | null;
    });
  }

  private async recoverExistingExchange(
    exchange: StoredTokenExchange,
    input: DeviceTokenExchangeInput
  ): Promise<DeviceTokenExchangeResult> {
    if (exchange.status === 'revoked' || exchange.revokedAt !== null) {
      throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_REVOKED');
    }
    if (exchange.status === 'expired') {
      throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
    }
    if (exchange.status !== 'completed') {
      throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
    }

    const now = this.#now();
    if (exchange.recoverableUntil.getTime() <= now.getTime()) {
      await this.expireCompletedExchange(exchange, now);
      throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
    }

    if (
      !verifyDeviceCredential(this.config, input.refreshCredential, exchange.previous).valid ||
      !verifyDeviceCredential(this.config, input.nextRefreshCredential, exchange.successor).valid
    ) {
      throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
    }

    const device = exchange.device;
    const successor = exchange.successor;
    const predecessor = exchange.previous;
    if (device.environment !== this.config.environment || device.id !== input.deviceId) {
      throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
    }
    if (device.status === 'revoked' || device.revokedAt !== null) {
      throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_REVOKED');
    }
    if (
      device.status !== 'active' ||
      device.credentialVersion !== exchange.credentialVersion ||
      successor.deviceId !== device.id ||
      successor.status !== 'active' ||
      successor.revokedAt !== null ||
      successor.credentialVersion !== exchange.credentialVersion ||
      successor.expiresAt.getTime() <= now.getTime() ||
      predecessor.deviceId !== device.id ||
      predecessor.status !== 'revoked' ||
      predecessor.revokedAt === null ||
      predecessor.credentialVersion !== exchange.credentialVersion - 1
    ) {
      throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
    }

    return this.issueAccessToken({
      deviceId: device.id,
      environment: this.config.environment,
      programType: parseProgramType(device.programType),
      capabilityProfile: parseCapabilityProfile(device.capabilityProfile),
      credentialVersion: exchange.credentialVersion,
    });
  }

  private async expireCompletedExchange(exchange: StoredTokenExchange, now: Date): Promise<void> {
    const updatedCount = await this.runSerializableTransaction(async (transaction) => {
      const updated = await transaction.deviceTokenExchange.updateMany({
        where: {
          id: exchange.id,
          deviceId: exchange.deviceId,
          status: 'completed',
          revokedAt: null,
          recoverableUntil: { lte: now },
        },
        data: { status: 'expired' },
      });
      return updated.count;
    });

    if (updatedCount !== 1) {
      throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
    }
  }

  private async createReplacementExchange(
    input: DeviceTokenExchangeInput,
    requestIdDigest: string
  ): Promise<CommittedExchange> {
    return this.runSerializableTransaction(async (transaction) => {
      const transactionNow = this.#now();
      const device = (await transaction.integrationDevice.findFirst({
        where: {
          id: input.deviceId,
          environment: this.config.environment,
        },
        select: {
          id: true,
          environment: true,
          programType: true,
          capabilityProfile: true,
          status: true,
          credentialVersion: true,
          revokedAt: true,
        },
      })) as unknown as StoredDevice | null;
      if (!device || device.environment !== this.config.environment) {
        throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
      }
      if (device.status === 'revoked' || device.revokedAt !== null) {
        throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_REVOKED');
      }
      if (
        device.status !== 'active' ||
        !isCredentialVersion(device.credentialVersion) ||
        device.credentialVersion >= MAXIMUM_CREDENTIAL_VERSION
      ) {
        throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
      }

      const predecessorLookupHashes = createDeviceCredentialLookupHashes(
        this.config,
        input.refreshCredential
      );
      const matchingCredentials = (await transaction.deviceRefreshCredential.findMany({
        where: {
          deviceId: device.id,
          status: 'active',
          credentialVersion: device.credentialVersion,
          revokedAt: null,
          expiresAt: { gt: transactionNow },
          OR: predecessorLookupHashes.map((candidate) => ({
            hashKeyVersion: candidate.hashKeyVersion,
            credentialHash: candidate.credentialHash,
          })),
        },
        select: {
          id: true,
          deviceId: true,
          credentialHash: true,
          hashKeyVersion: true,
          status: true,
          credentialVersion: true,
          expiresAt: true,
          revokedAt: true,
        },
        take: 2,
      })) as unknown as readonly StoredRefreshCredential[];
      if (matchingCredentials.length !== 1) {
        throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
      }

      const predecessor = matchingCredentials[0];
      if (
        predecessor.deviceId !== device.id ||
        predecessor.status !== 'active' ||
        predecessor.revokedAt !== null ||
        predecessor.credentialVersion !== device.credentialVersion ||
        predecessor.expiresAt.getTime() <= transactionNow.getTime() ||
        !verifyDeviceCredential(this.config, input.refreshCredential, predecessor).valid
      ) {
        throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
      }

      const liveRotation = this.rotationOptions.rotationRuntimeEnabled
        ? await transaction.deviceCredentialRotation.findFirst({
            where: {
              deviceId: device.id,
              status: { in: ['requested', 'prepared'] },
            },
            select: {
              id: true,
              deviceId: true,
              status: true,
              deadlineAt: true,
              baseCredentialVersion: true,
              predecessorCredentialId: true,
              candidateCredentialId: true,
            },
          })
        : null;
      if (liveRotation) {
        let compatible;
        try {
          compatible = requireCompatibleDeviceCredentialRotation(liveRotation);
        } catch (error: unknown) {
          if (error instanceof DeviceAuthRotationCompatibilityError) {
            throw new DeviceTokenExchangeError('DEVICE_ROTATION_INCOMPATIBLE');
          }
          throw error;
        }
        if (
          compatible.baseCredentialVersion !== device.credentialVersion ||
          compatible.predecessorCredentialId !== predecessor.id
        ) {
          throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_CONFLICT');
        }
        if (liveRotation.deadlineAt.getTime() <= transactionNow.getTime()) {
          const expired = await transaction.deviceCredentialRotation.updateMany({
            where: {
              id: liveRotation.id,
              deviceId: device.id,
              status: { in: ['requested', 'prepared'] },
              baseCredentialVersion: compatible.baseCredentialVersion,
              deadlineAt: { lte: transactionNow },
            },
            data: { status: 'expired', expiredAt: transactionNow },
          });
          if (expired.count !== 1) {
            throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_CONFLICT');
          }
          if (liveRotation.status === 'prepared' && liveRotation.candidateCredentialId !== null) {
            const revoked = await transaction.deviceRefreshCredential.updateMany({
              where: {
                id: liveRotation.candidateCredentialId,
                deviceId: device.id,
                status: 'prepared',
                credentialVersion: device.credentialVersion + 1,
                revokedAt: null,
              },
              data: { status: 'revoked', revokedAt: transactionNow },
            });
            if (revoked.count !== 1) {
              throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_CONFLICT');
            }
          }
          await transaction.deviceCredentialAuditLog.create({
            data: {
              deviceId: device.id,
              rotationId: liveRotation.id,
              action: 'credential_rotation_expired',
              actorHash: null,
              expiresAt: new Date(transactionNow.getTime() + this.#auditLogTtlMs),
            },
          });
        } else {
          return {
            deviceId: device.id,
            environment: this.config.environment,
            programType: parseProgramType(device.programType),
            capabilityProfile: parseCapabilityProfile(device.capabilityProfile),
            credentialVersion: device.credentialVersion,
            refreshCredentialAction: 'keep_current',
            rotation: {
              id: liveRotation.id,
              deadlineAt: liveRotation.deadlineAt.toISOString(),
            },
          };
        }
      }

      const predecessorRevoked = await transaction.deviceRefreshCredential.updateMany({
        where: {
          id: predecessor.id,
          deviceId: device.id,
          credentialHash: predecessor.credentialHash,
          hashKeyVersion: predecessor.hashKeyVersion,
          status: 'active',
          credentialVersion: device.credentialVersion,
          revokedAt: null,
          expiresAt: { gt: transactionNow },
        },
        data: { status: 'revoked', revokedAt: transactionNow },
      });
      if (predecessorRevoked.count !== 1) {
        throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_CONFLICT');
      }

      const deviceUpdated = await transaction.integrationDevice.updateMany({
        where: {
          id: device.id,
          environment: this.config.environment,
          status: 'active',
          credentialVersion: device.credentialVersion,
          revokedAt: null,
        },
        data: { credentialVersion: { increment: 1 } },
      });
      if (deviceUpdated.count !== 1) {
        throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_CONFLICT');
      }

      const successorHash = hashDeviceCredential(this.config, input.nextRefreshCredential);
      const successorVersion = device.credentialVersion + 1;
      const successorExpiresAt = new Date(transactionNow.getTime() + this.#activeCredentialTtlMs);
      const recoverableUntil = successorExpiresAt;
      const auditExpiresAt = new Date(transactionNow.getTime() + this.#auditLogTtlMs);
      const successor = await transaction.deviceRefreshCredential.create({
        data: {
          deviceId: device.id,
          credentialHash: successorHash.credentialHash,
          hashKeyVersion: successorHash.hashKeyVersion,
          status: 'active',
          credentialVersion: successorVersion,
          expiresAt: successorExpiresAt,
        },
        select: { id: true },
      });
      await transaction.deviceTokenExchange.create({
        data: {
          deviceId: device.id,
          previousCredentialId: predecessor.id,
          successorCredentialId: successor.id,
          requestIdDigest,
          credentialVersion: successorVersion,
          status: 'completed',
          completedAt: transactionNow,
          recoverableUntil,
        },
      });
      await transaction.deviceCredentialAuditLog.create({
        data: {
          deviceId: device.id,
          refreshCredentialId: successor.id,
          action: 'refresh_credential_replaced',
          expiresAt: auditExpiresAt,
        },
      });

      return {
        deviceId: device.id,
        environment: this.config.environment,
        programType: parseProgramType(device.programType),
        capabilityProfile: parseCapabilityProfile(device.capabilityProfile),
        credentialVersion: successorVersion,
      };
    });
  }

  private async issueAccessToken(
    committedExchange: CommittedExchange
  ): Promise<DeviceTokenExchangeResult> {
    const permissions = getServerDerivedPermissions(
      committedExchange.programType,
      committedExchange.capabilityProfile
    );
    let accessToken: string;
    try {
      accessToken = await this.accessTokenService.issue({
        deviceId: committedExchange.deviceId,
        environment: committedExchange.environment,
        programType: committedExchange.programType,
        permissions,
        capabilityProfile: committedExchange.capabilityProfile,
        credentialVersion: committedExchange.credentialVersion,
      });
    } catch {
      throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_UNAVAILABLE');
    }
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_UNAVAILABLE');
    }

    return {
      deviceId: committedExchange.deviceId,
      environment: committedExchange.environment,
      programType: committedExchange.programType,
      capabilityProfile: committedExchange.capabilityProfile,
      credentialVersion: committedExchange.credentialVersion,
      accessToken,
      refreshCredentialAction:
        committedExchange.refreshCredentialAction ?? 'replace_with_candidate',
      ...(committedExchange.rotation === undefined ? {} : { rotation: committedExchange.rotation }),
    };
  }

  private async runSerializableTransaction<T>(
    callback: (transaction: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZATION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(callback, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (error instanceof DeviceTokenExchangeError) {
          throw error;
        }
        if (isSerializationFailure(error) && attempt < MAX_SERIALIZATION_ATTEMPTS) {
          continue;
        }
        if (isUniqueConstraintFailure(error)) {
          throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_CONFLICT');
        }

        throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_UNAVAILABLE');
      }
    }

    throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_UNAVAILABLE');
  }

  private async runSafeDatabaseOperation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (error instanceof DeviceTokenExchangeError) {
        throw error;
      }

      throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_UNAVAILABLE');
    }
  }
}

function parseInput(value: unknown): DeviceTokenExchangeInput {
  assertExactInputShape(value, [
    'deviceId',
    'refreshCredential',
    'nextRefreshCredential',
    'refreshRequestId',
  ]);
  const input = value as Record<string, unknown>;
  const deviceId = parseCanonicalDeviceId(getOwnValue(input, 'deviceId'));
  const refreshCredential = parseCanonicalBase64Url(
    getOwnValue(input, 'refreshCredential'),
    REFRESH_CREDENTIAL_BYTE_LENGTH,
    REFRESH_CREDENTIAL_BYTE_LENGTH
  );
  const nextRefreshCredential = parseCanonicalBase64Url(
    getOwnValue(input, 'nextRefreshCredential'),
    REFRESH_CREDENTIAL_BYTE_LENGTH,
    REFRESH_CREDENTIAL_BYTE_LENGTH
  );
  const refreshRequestId = parseCanonicalBase64Url(
    getOwnValue(input, 'refreshRequestId'),
    MINIMUM_REQUEST_ID_BYTE_LENGTH,
    MAXIMUM_REQUEST_ID_BYTE_LENGTH
  );
  if (
    refreshCredential === nextRefreshCredential ||
    refreshCredential === refreshRequestId ||
    nextRefreshCredential === refreshRequestId
  ) {
    throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
  }

  return { deviceId, refreshCredential, nextRefreshCredential, refreshRequestId };
}

function assertExactInputShape(value: unknown, expectedKeys: readonly string[]): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
  }
  const keys = Object.keys(value);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => !expectedKeys.includes(key)) ||
    expectedKeys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
  }
}

function parseCanonicalDeviceId(value: unknown): string {
  if (typeof value !== 'string' || !CANONICAL_DEVICE_ID_PATTERN.test(value)) {
    throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
  }

  return value;
}

function parseCanonicalBase64Url(
  value: unknown,
  minimumByteLength: number,
  maximumByteLength: number
): string {
  const minimumEncodedLength = getBase64UrlEncodedLength(minimumByteLength);
  const maximumEncodedLength = getBase64UrlEncodedLength(maximumByteLength);
  if (
    typeof value !== 'string' ||
    value.length < minimumEncodedLength ||
    value.length > maximumEncodedLength ||
    !CANONICAL_BASE64URL_PATTERN.test(value)
  ) {
    throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
  }

  const decodedValue = Buffer.from(value, 'base64url');
  if (
    decodedValue.length < minimumByteLength ||
    decodedValue.length > maximumByteLength ||
    decodedValue.toString('base64url') !== value
  ) {
    throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
  }

  return value;
}

function getBase64UrlEncodedLength(byteLength: number): number {
  return Math.ceil((byteLength * 8) / 6);
}

function parseProgramType(value: unknown): DeviceAuthProgramType {
  if (
    typeof value !== 'string' ||
    !(DEVICE_AUTH_PROGRAM_TYPES as readonly string[]).includes(value)
  ) {
    throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_UNAVAILABLE');
  }

  return value as DeviceAuthProgramType;
}

function parseCapabilityProfile(value: unknown): DeviceCapabilityProfile {
  if (
    typeof value !== 'string' ||
    !(DEVICE_CAPABILITY_PROFILES as readonly string[]).includes(value)
  ) {
    throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_UNAVAILABLE');
  }

  return value as DeviceCapabilityProfile;
}

function getServerDerivedPermissions(
  programType: DeviceAuthProgramType,
  capabilityProfile: DeviceCapabilityProfile
): readonly string[] {
  if (capabilityProfile === 'safe_canary') {
    return [];
  }

  return [...DEFAULT_DEVICE_ACCESS_PERMISSIONS[programType]];
}

function ensurePositiveDuration(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new DeviceTokenExchangeError('DEVICE_TOKEN_EXCHANGE_INVALID');
  }
}

function isCredentialVersion(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= MAXIMUM_CREDENTIAL_VERSION
  );
}

function isSerializationFailure(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    (value as { readonly code?: unknown }).code === 'P2034'
  );
}

function isUniqueConstraintFailure(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    (value as { readonly code?: unknown }).code === 'P2002'
  );
}

function getOwnValue(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}
