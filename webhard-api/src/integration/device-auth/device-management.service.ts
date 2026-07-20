import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { DeviceAuthConfig } from './device-auth.config';
import type { DeviceEnrollmentService } from './device-enrollment.service';
import {
  DEVICE_AUTH_PROGRAM_TYPES,
  DEVICE_CAPABILITY_PROFILES,
  type ApproveEnrollmentInput,
  type DeviceAuthEnvironment,
  type DeviceAuthProgramType,
  type DeviceCapabilityProfile,
  type DeviceEnrollmentStatus,
  type DeviceManagementErrorCode,
  type ManagedDeviceSummary,
} from './device-auth.types';

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACTOR_HASH_PATTERN = /^[a-f0-9]{64}$/;
const MAX_SERIALIZATION_ATTEMPTS = 2;

const managedDeviceSelect = {
  id: true,
  environment: true,
  programType: true,
  capabilityProfile: true,
  displayName: true,
  appVersion: true,
  status: true,
  credentialVersion: true,
  enrolledAt: true,
  approvedAt: true,
  lastHeartbeatAt: true,
  revokedAt: true,
} as const;

interface ManagedDeviceRecord {
  readonly id: string;
  readonly environment: string;
  readonly programType: string;
  readonly capabilityProfile: string;
  readonly displayName: string;
  readonly appVersion: string | null;
  readonly status: string;
  readonly credentialVersion: number;
  readonly enrolledAt: Date;
  readonly approvedAt: Date | null;
  readonly lastHeartbeatAt: Date | null;
  readonly revokedAt: Date | null;
}

export interface DeviceManagementServiceOptions {
  readonly auditLogTtlMs: number;
  readonly now?: () => Date;
}

export class DeviceManagementError extends Error {
  public readonly code: DeviceManagementErrorCode;

  public constructor(code: DeviceManagementErrorCode) {
    super(code);
    this.name = 'DeviceManagementError';
    this.code = code;
  }
}

export class DeviceManagementService {
  readonly #now: () => Date;
  readonly #auditLogTtlMs: number;

  public constructor(
    private readonly prisma: PrismaService,
    private readonly config: DeviceAuthConfig,
    options: DeviceManagementServiceOptions,
    private readonly enrollmentService: Pick<DeviceEnrollmentService, 'approveEnrollment'>
  ) {
    ensurePositiveDuration(options.auditLogTtlMs);
    this.#now = options.now ?? (() => new Date());
    this.#auditLogTtlMs = options.auditLogTtlMs;
  }

  public async listDevices(): Promise<readonly ManagedDeviceSummary[]> {
    return this.runSafeDatabaseOperation(async () => {
      const rows = await this.prisma.integrationDevice.findMany({
        where: { environment: this.config.environment },
        orderBy: [{ enrolledAt: 'desc' }, { id: 'asc' }],
        select: managedDeviceSelect,
      });

      return rows
        .filter((row) => row.environment === this.config.environment)
        .map((row) => toManagedDeviceSummary(row));
    });
  }

  public async approveDevice(input: ApproveEnrollmentInput): Promise<DeviceEnrollmentStatus> {
    assertExactInputShape(input, ['deviceId', 'actorHash']);
    const deviceId = parseCanonicalDeviceId(input.deviceId);
    const actorHash = parseActorHash(input.actorHash);

    return this.enrollmentService.approveEnrollment({ deviceId, actorHash });
  }

  public async revokeDevice(input: {
    readonly deviceId: string;
    readonly actorHash: string;
  }): Promise<ManagedDeviceSummary> {
    assertExactInputShape(input, ['deviceId', 'actorHash']);
    const deviceId = parseCanonicalDeviceId(input.deviceId);
    const actorHash = parseActorHash(input.actorHash);

    return this.runSerializableTransaction(async (transaction) => {
      const transactionNow = this.#now();
      const device = await transaction.integrationDevice.findFirst({
        where: {
          id: deviceId,
          environment: this.config.environment,
        },
        select: managedDeviceSelect,
      });
      if (!device) {
        throw new DeviceManagementError('DEVICE_MANAGEMENT_CONFLICT');
      }
      if (device.status === 'revoked' && device.revokedAt !== null) {
        return toManagedDeviceSummary(device);
      }
      if (
        (device.status !== 'pending_approval' && device.status !== 'active') ||
        device.revokedAt !== null
      ) {
        throw new DeviceManagementError('DEVICE_MANAGEMENT_CONFLICT');
      }

      const updated = await transaction.integrationDevice.updateMany({
        where: {
          id: device.id,
          environment: this.config.environment,
          status: device.status,
          credentialVersion: device.credentialVersion,
          revokedAt: null,
        },
        data: {
          status: 'revoked',
          revokedAt: transactionNow,
          credentialVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        const winner = await transaction.integrationDevice.findFirst({
          where: { id: device.id, environment: this.config.environment },
          select: managedDeviceSelect,
        });
        if (winner?.status === 'revoked' && winner.revokedAt !== null) {
          return toManagedDeviceSummary(winner);
        }
        throw new DeviceManagementError('DEVICE_MANAGEMENT_CONFLICT');
      }

      await transaction.deviceRefreshCredential.updateMany({
        where: {
          deviceId: device.id,
          status: { in: ['prepared', 'active'] },
          revokedAt: null,
        },
        data: { status: 'revoked', revokedAt: transactionNow, actorHash },
      });
      await transaction.deviceCredentialRotation.updateMany({
        where: {
          deviceId: device.id,
          status: { in: ['requested', 'prepared'] },
        },
        data: { status: 'revoked', revokedAt: transactionNow, actorHash },
      });
      await transaction.deviceTokenExchange.updateMany({
        where: { deviceId: device.id, status: 'completed', revokedAt: null },
        data: { status: 'revoked', revokedAt: transactionNow },
      });
      await transaction.deviceCredentialAuditLog.create({
        data: {
          deviceId: device.id,
          action: 'device_revoked',
          actorHash,
          expiresAt: new Date(transactionNow.getTime() + this.#auditLogTtlMs),
        },
      });

      return toManagedDeviceSummary({
        ...device,
        status: 'revoked',
        credentialVersion: device.credentialVersion + 1,
        revokedAt: transactionNow,
      });
    });
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
        if (error instanceof DeviceManagementError) {
          throw error;
        }

        if (isSerializationFailure(error) && attempt < MAX_SERIALIZATION_ATTEMPTS) {
          continue;
        }

        throw new DeviceManagementError('DEVICE_MANAGEMENT_UNAVAILABLE');
      }
    }

    throw new DeviceManagementError('DEVICE_MANAGEMENT_UNAVAILABLE');
  }

  private async runSafeDatabaseOperation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (error instanceof DeviceManagementError) {
        throw error;
      }

      throw new DeviceManagementError('DEVICE_MANAGEMENT_UNAVAILABLE');
    }
  }
}

function toManagedDeviceSummary(device: ManagedDeviceRecord): ManagedDeviceSummary {
  return {
    deviceId: device.id,
    environment: parseDeviceEnvironment(device.environment),
    programType: parseProgramType(device.programType),
    capabilityProfile: parseCapabilityProfile(device.capabilityProfile),
    displayName: device.displayName,
    ...(device.appVersion === null ? {} : { appVersion: device.appVersion }),
    state: parseDeviceState(device.status),
    credentialVersion: device.credentialVersion,
    enrolledAt: device.enrolledAt,
    ...(device.approvedAt === null ? {} : { approvedAt: device.approvedAt }),
    ...(device.lastHeartbeatAt === null ? {} : { lastHeartbeatAt: device.lastHeartbeatAt }),
    ...(device.revokedAt === null ? {} : { revokedAt: device.revokedAt }),
  };
}

function assertExactInputShape(value: unknown, allowedKeys: readonly string[]): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DeviceManagementError('DEVICE_MANAGEMENT_INVALID');
  }

  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new DeviceManagementError('DEVICE_MANAGEMENT_INVALID');
  }
}

function parseCanonicalDeviceId(value: unknown): string {
  if (typeof value !== 'string' || !CANONICAL_UUID_PATTERN.test(value)) {
    throw new DeviceManagementError('DEVICE_MANAGEMENT_INVALID');
  }

  return value;
}

function parseActorHash(value: unknown): string {
  if (typeof value !== 'string' || !ACTOR_HASH_PATTERN.test(value)) {
    throw new DeviceManagementError('DEVICE_MANAGEMENT_INVALID');
  }

  return value;
}

function parseDeviceEnvironment(value: string): DeviceAuthEnvironment {
  if (value === 'dev' || value === 'stg' || value === 'prd') {
    return value;
  }

  throw new DeviceManagementError('DEVICE_MANAGEMENT_UNAVAILABLE');
}

function parseProgramType(value: string): DeviceAuthProgramType {
  if ((DEVICE_AUTH_PROGRAM_TYPES as readonly string[]).includes(value)) {
    return value as DeviceAuthProgramType;
  }

  throw new DeviceManagementError('DEVICE_MANAGEMENT_UNAVAILABLE');
}

function parseCapabilityProfile(value: string): DeviceCapabilityProfile {
  if ((DEVICE_CAPABILITY_PROFILES as readonly string[]).includes(value)) {
    return value as DeviceCapabilityProfile;
  }

  throw new DeviceManagementError('DEVICE_MANAGEMENT_UNAVAILABLE');
}

function parseDeviceState(value: string): ManagedDeviceSummary['state'] {
  if (value === 'pending_approval' || value === 'active' || value === 'revoked') {
    return value;
  }

  throw new DeviceManagementError('DEVICE_MANAGEMENT_UNAVAILABLE');
}

function ensurePositiveDuration(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new DeviceManagementError('DEVICE_MANAGEMENT_INVALID');
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
