import { randomBytes as createRandomBytes, randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { DeviceAuthConfig } from './device-auth.config';
import {
  createDeviceCredentialLookupHashes,
  hashDeviceCredential,
  verifyDeviceCredential,
} from './device-credential-hash';
import {
  DEVICE_AUTH_PROGRAM_TYPES,
  DEVICE_CAPABILITY_PROFILES,
  type CreateEnrollmentCodeInput,
  type ApproveEnrollmentInput,
  type DeviceEnrollmentStatus,
  type DeviceAuthProgramType,
  type DeviceCapabilityProfile,
  type DeviceEnrollmentErrorCode,
  type EnrollDeviceInput,
  type EnrollmentStatusInput,
  type EnrollmentCodeCreated,
} from './device-auth.types';

const ENROLLMENT_CODE_TTL_MS = 10 * 60 * 1000;
const ENROLLMENT_CODE_BYTE_LENGTH = 32;
const REFRESH_CREDENTIAL_BYTE_LENGTH = 32;
const MINIMUM_ENROLLMENT_ATTEMPT_BYTE_LENGTH = 16;
const MAXIMUM_ENROLLMENT_ATTEMPT_BYTE_LENGTH = 64;
const MAX_ENROLLMENT_CODE_ATTEMPTS = 3;
const MAX_SERIALIZATION_ATTEMPTS = 2;
const CANONICAL_BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const SEMVER_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*))(?:\.(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*)))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export interface DeviceEnrollmentServiceOptions {
  readonly now?: () => Date;
  readonly randomBytes?: (size: number) => Buffer;
  readonly preparedCredentialTtlMs: number;
  readonly activeCredentialTtlMs: number;
  readonly auditLogTtlMs: number;
  readonly randomId?: () => string;
}

export class DeviceEnrollmentError extends Error {
  public readonly code: DeviceEnrollmentErrorCode;

  public constructor(code: DeviceEnrollmentErrorCode) {
    super(code);
    this.name = 'DeviceEnrollmentError';
    this.code = code;
  }
}

class EnrollmentCodeHashCollisionError extends Error {
  public constructor() {
    super('DEVICE_ENROLLMENT_CODE_HASH_COLLISION');
    this.name = 'EnrollmentCodeHashCollisionError';
  }
}

@Injectable()
export class DeviceEnrollmentService {
  readonly #now: () => Date;
  readonly #randomBytes: (size: number) => Buffer;
  readonly #randomId: () => string;
  readonly #preparedCredentialTtlMs: number;
  readonly #activeCredentialTtlMs: number;
  readonly #auditLogTtlMs: number;

  public constructor(
    private readonly prisma: PrismaService,
    private readonly config: DeviceAuthConfig,
    options: DeviceEnrollmentServiceOptions
  ) {
    this.#now = options.now ?? (() => new Date());
    this.#randomBytes = options.randomBytes ?? createRandomBytes;
    this.#randomId = options.randomId ?? randomUUID;
    ensurePositiveDuration(options.preparedCredentialTtlMs);
    ensurePositiveDuration(options.activeCredentialTtlMs);
    ensurePositiveDuration(options.auditLogTtlMs);
    this.#preparedCredentialTtlMs = options.preparedCredentialTtlMs;
    this.#activeCredentialTtlMs = options.activeCredentialTtlMs;
    this.#auditLogTtlMs = options.auditLogTtlMs;
  }

  public async createEnrollmentCode(
    input: CreateEnrollmentCodeInput
  ): Promise<EnrollmentCodeCreated> {
    assertExactInputShape(input, [
      'programType',
      'capabilityProfile',
      'expectedDisplayName',
      'actorHash',
    ]);
    const programType = parseProgramType(input.programType);
    const capabilityProfile = parseCapabilityProfile(input.capabilityProfile);
    const expectedDisplayName = parseDisplayName(input.expectedDisplayName);
    const actorHash = parseActorHash(input.actorHash);
    const expectedDisplayNameHash = hashDeviceCredential(this.config, expectedDisplayName);
    const expectedDisplayNameLookupHashes = createDeviceCredentialLookupHashes(
      this.config,
      expectedDisplayName
    );

    for (let attempt = 1; attempt <= MAX_ENROLLMENT_CODE_ATTEMPTS; attempt += 1) {
      const enrollmentCode = createRawEnrollmentCode(this.#randomBytes);
      const enrollmentCodeHash = hashDeviceCredential(this.config, enrollmentCode);

      try {
        const persistedEnrollment = await this.runSerializableTransaction(
          async (transaction) => {
            const transactionNow = this.#now();
            const expiresAt = new Date(transactionNow.getTime() + ENROLLMENT_CODE_TTL_MS);
            await transaction.deviceEnrollment.updateMany({
              where: {
                environment: this.config.environment,
                programType,
                capabilityProfile,
                consumedAt: null,
                invalidatedAt: null,
                expiresAt: { gt: transactionNow },
                OR: expectedDisplayNameLookupHashes.map((candidate) => ({
                  hashKeyVersion: candidate.hashKeyVersion,
                  expectedDisplayNameHash: candidate.credentialHash,
                })),
              },
              data: { invalidatedAt: transactionNow },
            });

            const enrollment = await transaction.deviceEnrollment.create({
              data: {
                environment: this.config.environment,
                programType,
                capabilityProfile,
                enrollmentCodeHash: enrollmentCodeHash.credentialHash,
                hashKeyVersion: enrollmentCodeHash.hashKeyVersion,
                expectedDisplayNameHash: expectedDisplayNameHash.credentialHash,
                approvalPolicy: 'pending_approval',
                actorHash,
                expiresAt,
              },
            });

            return { enrollment, expiresAt };
          },
          { allowUniqueConstraintRetry: true }
        );

        return {
          enrollmentCode,
          enrollmentId: persistedEnrollment.enrollment.id,
          environment: this.config.environment,
          programType,
          capabilityProfile,
          expiresAt: persistedEnrollment.expiresAt,
        };
      } catch (error: unknown) {
        if (
          error instanceof EnrollmentCodeHashCollisionError &&
          attempt < MAX_ENROLLMENT_CODE_ATTEMPTS
        ) {
          continue;
        }

        if (error instanceof EnrollmentCodeHashCollisionError) {
          throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_UNAVAILABLE');
        }

        throw error;
      }
    }

    throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_UNAVAILABLE');
  }

  public async enroll(input: EnrollDeviceInput): Promise<DeviceEnrollmentStatus> {
    assertExactInputShape(input, [
      'enrollmentCode',
      'enrollmentAttemptId',
      'displayName',
      'refreshCredential',
      'appVersion',
    ]);
    const enrollmentCode = parseEnrollmentCode(input.enrollmentCode);
    const enrollmentAttemptId = parseEnrollmentAttemptId(input.enrollmentAttemptId);
    const refreshCredential = parseRefreshCredential(input.refreshCredential);
    if (
      enrollmentCode === enrollmentAttemptId ||
      enrollmentCode === refreshCredential ||
      enrollmentAttemptId === refreshCredential
    ) {
      throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
    }
    const displayName = parseDisplayName(input.displayName);
    const appVersion = parseAppVersion(input.appVersion);
    const lookupNow = this.#now();
    const codeLookupHashes = createDeviceCredentialLookupHashes(this.config, enrollmentCode);
    const enrollment = await this.runSafeDatabaseOperation(() =>
      this.prisma.deviceEnrollment.findFirst({
        where: {
          environment: this.config.environment,
          consumedAt: null,
          invalidatedAt: null,
          expiresAt: { gt: lookupNow },
          OR: codeLookupHashes.map((candidate) => ({
            hashKeyVersion: candidate.hashKeyVersion,
            enrollmentCodeHash: candidate.credentialHash,
          })),
        },
        select: {
          id: true,
          environment: true,
          programType: true,
          capabilityProfile: true,
          enrollmentCodeHash: true,
          hashKeyVersion: true,
          expectedDisplayNameHash: true,
        },
      })
    );
    if (!enrollment || !enrollment.expectedDisplayNameHash) {
      throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
    }

    const storedEnrollmentCode = {
      hashKeyVersion: enrollment.hashKeyVersion,
      credentialHash: enrollment.enrollmentCodeHash,
    };
    const storedDisplayName = {
      hashKeyVersion: enrollment.hashKeyVersion,
      credentialHash: enrollment.expectedDisplayNameHash,
    };
    if (
      !verifyDeviceCredential(this.config, enrollmentCode, storedEnrollmentCode).valid ||
      !verifyDeviceCredential(this.config, displayName, storedDisplayName).valid
    ) {
      throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
    }

    const programType = parseProgramType(enrollment.programType);
    const capabilityProfile = parseCapabilityProfile(enrollment.capabilityProfile);
    const currentEnrollmentCodeHash = hashDeviceCredential(this.config, enrollmentCode);
    const currentDisplayNameHash = hashDeviceCredential(this.config, displayName);
    const currentAttemptHash = hashDeviceCredential(this.config, enrollmentAttemptId);
    const currentRefreshHash = hashDeviceCredential(this.config, refreshCredential);
    const deviceId = this.#randomId();

    await this.runSerializableTransaction(async (transaction) => {
      const transactionNow = this.#now();
      const refreshCredentialExpiresAt = new Date(
        transactionNow.getTime() + this.#preparedCredentialTtlMs
      );
      const auditExpiresAt = new Date(transactionNow.getTime() + this.#auditLogTtlMs);
      const consumed = await transaction.deviceEnrollment.updateMany({
        where: {
          id: enrollment.id,
          environment: this.config.environment,
          hashKeyVersion: enrollment.hashKeyVersion,
          enrollmentCodeHash: enrollment.enrollmentCodeHash,
          consumedAt: null,
          invalidatedAt: null,
          candidateCredentialHash: null,
          consumedAttemptHash: null,
          expiresAt: { gt: transactionNow },
        },
        data: {
          consumedAt: transactionNow,
          enrollmentCodeHash: currentEnrollmentCodeHash.credentialHash,
          expectedDisplayNameHash: currentDisplayNameHash.credentialHash,
          candidateCredentialHash: currentRefreshHash.credentialHash,
          consumedAttemptHash: currentAttemptHash.credentialHash,
          hashKeyVersion: currentEnrollmentCodeHash.hashKeyVersion,
        },
      });
      if (consumed.count !== 1) {
        throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
      }

      await transaction.integrationDevice.create({
        data: {
          id: deviceId,
          environment: this.config.environment,
          programType,
          capabilityProfile,
          displayName,
          appVersion,
          status: 'pending_approval',
          credentialVersion: 1,
          enrolledAt: transactionNow,
        },
      });
      const linked = await transaction.deviceEnrollment.updateMany({
        where: {
          id: enrollment.id,
          environment: this.config.environment,
          deviceId: null,
          consumedAt: transactionNow,
          invalidatedAt: null,
        },
        data: { deviceId },
      });
      if (linked.count !== 1) {
        throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
      }

      const preparedCredential = await transaction.deviceRefreshCredential.create({
        data: {
          deviceId,
          credentialHash: currentRefreshHash.credentialHash,
          hashKeyVersion: currentRefreshHash.hashKeyVersion,
          status: 'prepared',
          credentialVersion: 1,
          expiresAt: refreshCredentialExpiresAt,
        },
      });
      await transaction.deviceCredentialAuditLog.create({
        data: {
          deviceId,
          enrollmentId: enrollment.id,
          refreshCredentialId: preparedCredential.id,
          action: 'device_enrolled',
          expiresAt: auditExpiresAt,
        },
      });
    });

    return {
      deviceId,
      state: 'pending_approval',
      environment: this.config.environment,
      programType,
      capabilityProfile,
      credentialVersion: 1,
    };
  }

  public async getEnrollmentStatus(input: EnrollmentStatusInput): Promise<DeviceEnrollmentStatus> {
    assertExactInputShape(input, ['enrollmentAttemptId', 'refreshCredential']);
    const enrollmentAttemptId = parseEnrollmentAttemptId(input.enrollmentAttemptId);
    const refreshCredential = parseRefreshCredential(input.refreshCredential);
    const now = this.#now();
    const refreshLookupHashes = createDeviceCredentialLookupHashes(this.config, refreshCredential);
    const attemptLookupHashes = createDeviceCredentialLookupHashes(
      this.config,
      enrollmentAttemptId
    );
    const storedRefreshCredential = await this.runSafeDatabaseOperation(() =>
      this.prisma.deviceRefreshCredential.findFirst({
        where: {
          device: { is: { environment: this.config.environment } },
          OR: refreshLookupHashes.map((candidate) => ({
            hashKeyVersion: candidate.hashKeyVersion,
            credentialHash: candidate.credentialHash,
          })),
          AND: [
            {
              OR: [
                {
                  status: { in: ['prepared', 'active'] },
                  revokedAt: null,
                  expiresAt: { gt: now },
                },
                {
                  status: 'revoked',
                  revokedAt: { not: null },
                },
              ],
            },
          ],
        },
        select: {
          deviceId: true,
          hashKeyVersion: true,
          credentialHash: true,
          status: true,
          credentialVersion: true,
          revokedAt: true,
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
      })
    );
    if (!storedRefreshCredential?.device) {
      throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
    }

    const refreshVerification = verifyDeviceCredential(this.config, refreshCredential, {
      hashKeyVersion: storedRefreshCredential.hashKeyVersion,
      credentialHash: storedRefreshCredential.credentialHash,
    });
    if (!refreshVerification.valid) {
      throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
    }

    const enrollment = await this.runSafeDatabaseOperation(() =>
      this.prisma.deviceEnrollment.findFirst({
        where: {
          deviceId: storedRefreshCredential.deviceId,
          environment: this.config.environment,
          consumedAt: { not: null },
          invalidatedAt: null,
          OR: attemptLookupHashes.map((candidate) => ({
            hashKeyVersion: candidate.hashKeyVersion,
            consumedAttemptHash: candidate.credentialHash,
          })),
        },
        select: {
          hashKeyVersion: true,
          consumedAttemptHash: true,
          candidateCredentialHash: true,
        },
      })
    );
    if (!enrollment?.consumedAttemptHash || !enrollment.candidateCredentialHash) {
      throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
    }

    const attemptVerification = verifyDeviceCredential(this.config, enrollmentAttemptId, {
      hashKeyVersion: enrollment.hashKeyVersion,
      credentialHash: enrollment.consumedAttemptHash,
    });
    const enrollmentRefreshVerification = verifyDeviceCredential(this.config, refreshCredential, {
      hashKeyVersion: enrollment.hashKeyVersion,
      credentialHash: enrollment.candidateCredentialHash,
    });
    const state = parseDeviceState(storedRefreshCredential.device.status);
    if (
      !attemptVerification.valid ||
      !enrollmentRefreshVerification.valid ||
      storedRefreshCredential.device.environment !== this.config.environment ||
      (state !== 'revoked' &&
        storedRefreshCredential.credentialVersion !==
          storedRefreshCredential.device.credentialVersion) ||
      (state === 'pending_approval' && storedRefreshCredential.status !== 'prepared') ||
      (state === 'active' && storedRefreshCredential.status !== 'active') ||
      (state === 'revoked' &&
        (storedRefreshCredential.status !== 'revoked' ||
          storedRefreshCredential.revokedAt === null ||
          storedRefreshCredential.device.revokedAt === null))
    ) {
      throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
    }

    return {
      deviceId: storedRefreshCredential.device.id,
      state,
      environment: this.config.environment,
      programType: parseProgramType(storedRefreshCredential.device.programType),
      capabilityProfile: parseCapabilityProfile(storedRefreshCredential.device.capabilityProfile),
      credentialVersion: storedRefreshCredential.device.credentialVersion,
    };
  }

  public async approveEnrollment(input: ApproveEnrollmentInput): Promise<DeviceEnrollmentStatus> {
    assertExactInputShape(input, ['deviceId', 'actorHash']);
    const deviceId = parseDeviceId(input.deviceId);
    const actorHash = parseActorHash(input.actorHash);

    return this.runSerializableTransaction(async (transaction) => {
      const transactionNow = this.#now();
      const activeCredentialExpiresAt = new Date(
        transactionNow.getTime() + this.#activeCredentialTtlMs
      );
      const auditExpiresAt = new Date(transactionNow.getTime() + this.#auditLogTtlMs);
      const device = await transaction.integrationDevice.findFirst({
        where: {
          id: deviceId,
          environment: this.config.environment,
          status: 'pending_approval',
          approvedAt: null,
          revokedAt: null,
        },
        select: {
          id: true,
          environment: true,
          programType: true,
          capabilityProfile: true,
          credentialVersion: true,
        },
      });
      if (!device) {
        throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_CONFLICT');
      }

      const preparedCredentials = await transaction.deviceRefreshCredential.findMany({
        where: {
          deviceId,
          status: 'prepared',
          credentialVersion: device.credentialVersion,
          revokedAt: null,
          expiresAt: { gt: transactionNow },
        },
        select: { id: true },
        take: 2,
      });
      if (preparedCredentials.length !== 1) {
        throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_CONFLICT');
      }

      const deviceUpdated = await transaction.integrationDevice.updateMany({
        where: {
          id: deviceId,
          environment: this.config.environment,
          status: 'pending_approval',
          credentialVersion: device.credentialVersion,
          approvedAt: null,
          revokedAt: null,
        },
        data: {
          status: 'active',
          approvedAt: transactionNow,
          approvedByActorHash: actorHash,
        },
      });
      if (deviceUpdated.count !== 1) {
        throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_CONFLICT');
      }

      const preparedCredential = preparedCredentials[0];
      const credentialUpdated = await transaction.deviceRefreshCredential.updateMany({
        where: {
          id: preparedCredential.id,
          deviceId,
          status: 'prepared',
          credentialVersion: device.credentialVersion,
          revokedAt: null,
          expiresAt: { gt: transactionNow },
        },
        data: {
          status: 'active',
          actorHash,
          expiresAt: activeCredentialExpiresAt,
        },
      });
      if (credentialUpdated.count !== 1) {
        throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_CONFLICT');
      }

      await transaction.deviceCredentialAuditLog.create({
        data: {
          deviceId,
          refreshCredentialId: preparedCredential.id,
          action: 'device_enrollment_approved',
          actorHash,
          expiresAt: auditExpiresAt,
        },
      });

      return {
        deviceId,
        state: 'active' as const,
        environment: this.config.environment,
        programType: parseProgramType(device.programType),
        capabilityProfile: parseCapabilityProfile(device.capabilityProfile),
        credentialVersion: device.credentialVersion,
      };
    });
  }

  private async runSerializableTransaction<T>(
    callback: (transaction: Prisma.TransactionClient) => Promise<T>,
    options: { readonly allowUniqueConstraintRetry?: boolean } = {}
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZATION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(callback, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (error instanceof DeviceEnrollmentError) {
          throw error;
        }

        if (isSerializationFailure(error) && attempt < MAX_SERIALIZATION_ATTEMPTS) {
          continue;
        }

        if (isUniqueConstraintFailure(error) && options.allowUniqueConstraintRetry) {
          throw new EnrollmentCodeHashCollisionError();
        }

        throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_UNAVAILABLE');
      }
    }

    throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_UNAVAILABLE');
  }

  private async runSafeDatabaseOperation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (error instanceof DeviceEnrollmentError) {
        throw error;
      }

      throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_UNAVAILABLE');
    }
  }
}

function parseProgramType(value: unknown): DeviceAuthProgramType {
  if (
    typeof value !== 'string' ||
    !(DEVICE_AUTH_PROGRAM_TYPES as readonly string[]).includes(value)
  ) {
    throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
  }

  return value as DeviceAuthProgramType;
}

function assertExactInputShape(value: unknown, allowedKeys: readonly string[]): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
  }

  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
  }
}

function parseCapabilityProfile(value: unknown): DeviceCapabilityProfile {
  if (
    typeof value !== 'string' ||
    !(DEVICE_CAPABILITY_PROFILES as readonly string[]).includes(value)
  ) {
    throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
  }

  return value as DeviceCapabilityProfile;
}

function parseDisplayName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim().length > 100 ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
  }

  return value.trim();
}

function parseActorHash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
  }

  return value;
}

function parseEnrollmentCode(value: unknown): string {
  return parseCanonicalBase64Url(value, ENROLLMENT_CODE_BYTE_LENGTH, ENROLLMENT_CODE_BYTE_LENGTH);
}

function parseEnrollmentAttemptId(value: unknown): string {
  return parseCanonicalBase64Url(
    value,
    MINIMUM_ENROLLMENT_ATTEMPT_BYTE_LENGTH,
    MAXIMUM_ENROLLMENT_ATTEMPT_BYTE_LENGTH
  );
}

function parseRefreshCredential(value: unknown): string {
  return parseCanonicalBase64Url(
    value,
    REFRESH_CREDENTIAL_BYTE_LENGTH,
    REFRESH_CREDENTIAL_BYTE_LENGTH
  );
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
    !CANONICAL_BASE64URL_PATTERN.test(value) ||
    new Set(value).size === 1
  ) {
    throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
  }

  const decodedValue = Buffer.from(value, 'base64url');
  if (
    decodedValue.length < minimumByteLength ||
    decodedValue.length > maximumByteLength ||
    decodedValue.toString('base64url') !== value
  ) {
    throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
  }

  return value;
}

function getBase64UrlEncodedLength(byteLength: number): number {
  return Math.ceil((byteLength * 4) / 3);
}

function parseAppVersion(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = typeof value === 'string' ? value.trim() : undefined;
  if (
    !normalizedValue ||
    normalizedValue.length > 20 ||
    /[\u0000-\u001F\u007F]/.test(normalizedValue) ||
    !SEMVER_PATTERN.test(normalizedValue)
  ) {
    throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
  }

  return normalizedValue;
}

function parseDeviceState(value: unknown): DeviceEnrollmentStatus['state'] {
  if (value === 'pending_approval' || value === 'active' || value === 'revoked') {
    return value;
  }

  throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
}

function parseDeviceId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 100) {
    throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
  }

  return value;
}

function ensurePositiveDuration(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_INVALID');
  }
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

function createRawEnrollmentCode(randomBytes: (size: number) => Buffer): string {
  const bytes = randomBytes(ENROLLMENT_CODE_BYTE_LENGTH);
  if (!Buffer.isBuffer(bytes) || bytes.length !== ENROLLMENT_CODE_BYTE_LENGTH) {
    throw new DeviceEnrollmentError('DEVICE_ENROLLMENT_UNAVAILABLE');
  }

  return bytes.toString('base64url');
}
