import { timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_DEVICE_ACCESS_PERMISSIONS } from '../auth/integration-permissions';
import {
  DeviceAuthRotationCompatibilityError,
  requireCompatibleDeviceCredentialRotation,
} from './device-auth-rotation-compatibility';
import type { DeviceAuthConfig } from './device-auth.config';
import type {
  DeviceAuthRotationRuntimeOptions,
  DeviceEnrollmentRuntimeOptions,
} from './device-auth.runtime-config';
import type { DeviceAuthProgramType, DeviceCredentialRotationStatus } from './device-auth.types';
import type { DeviceAccessPrincipal } from './device-auth.types';
import type { DeviceAccessTokenService } from './device-access-token.service';
import {
  createDeviceCredentialLookupHashes,
  hashDeviceCredential,
  verifyDeviceCredential,
} from './device-credential-hash';
import type { DeviceRotationSummary } from './dto/device-credential-rotation.dto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACTOR_HASH_PATTERN = /^[a-f0-9]{64}$/;
const MAX_TRANSACTION_ATTEMPTS = 2;
const LIVE_STATUSES = ['requested', 'prepared'] as const;

const ROTATION_SELECT = {
  id: true,
  deviceId: true,
  status: true,
  deadlineAt: true,
  baseCredentialVersion: true,
  predecessorCredentialId: true,
  candidateCredentialId: true,
  acknowledgedAt: true,
} as const;

type RotationErrorCode =
  | 'DEVICE_ROTATION_INVALID'
  | 'DEVICE_ROTATION_INCOMPATIBLE'
  | 'DEVICE_ROTATION_EXPIRED'
  | 'DEVICE_ROTATION_IN_PROGRESS'
  | 'DEVICE_ROTATION_REVOKED'
  | 'DEVICE_ROTATION_UNAVAILABLE';

interface RotationRecord {
  readonly id: string;
  readonly deviceId: string;
  readonly status: DeviceCredentialRotationStatus;
  readonly deadlineAt: Date;
  readonly baseCredentialVersion: number | null;
  readonly predecessorCredentialId: string | null;
  readonly candidateCredentialId: string | null;
  readonly acknowledgedAt: Date | null;
}

export class DeviceCredentialRotationError extends Error {
  public constructor(public readonly code: RotationErrorCode) {
    super(code);
    this.name = 'DeviceCredentialRotationError';
  }
}

export class DeviceCredentialRotationService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly config: DeviceAuthConfig,
    private readonly rotationOptions: DeviceAuthRotationRuntimeOptions,
    private readonly enrollmentOptions: Pick<
      DeviceEnrollmentRuntimeOptions,
      'auditLogTtlMs' | 'activeCredentialTtlMs'
    >,
    private readonly accessTokenService?: Pick<DeviceAccessTokenService, 'issue'>
  ) {}

  public async prepare(input: {
    readonly principal: DeviceAccessPrincipal;
    readonly rotationId: string;
    readonly refreshCredential: string;
    readonly candidateCredential: string;
    readonly now: Date;
  }): Promise<{
    readonly status: 'prepared';
    readonly rotationId: string;
    readonly deadlineAt: string;
  }> {
    assertExactKeys(input, [
      'principal',
      'rotationId',
      'refreshCredential',
      'candidateCredential',
      'now',
    ]);
    const rotationId = parseUuid(input.rotationId);
    const now = parseDate(input.now);
    this.assertPrincipal(input.principal);
    assertCredential(input.refreshCredential);
    assertCredential(input.candidateCredential);
    if (credentialsEqual(input.refreshCredential, input.candidateCredential)) {
      throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
    }
    this.assertRuntimeEnabled();
    const outcome = await this.runSerializable(async (transaction) => {
      const row = await this.findRotation(transaction, input.principal.deviceId, rotationId);
      const compatible = this.requireCompatible(row);
      if (input.principal.credentialVersion !== compatible.baseCredentialVersion) {
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
      }
      await this.assertRotationDevice(transaction, row, compatible.baseCredentialVersion);
      if (
        LIVE_STATUSES.includes(row.status as (typeof LIVE_STATUSES)[number]) &&
        row.deadlineAt.getTime() <= now.getTime()
      ) {
        await this.expireIfDue(transaction, row, now);
        return { expired: true as const };
      }
      if (row.status === 'prepared') {
        const [predecessor, candidate] = await Promise.all([
          transaction.deviceRefreshCredential.findFirst({
            where: { id: compatible.predecessorCredentialId, deviceId: row.deviceId },
            select: { id: true, hashKeyVersion: true, credentialHash: true },
          }),
          transaction.deviceRefreshCredential.findFirst({
            where: { id: row.candidateCredentialId ?? undefined, deviceId: row.deviceId },
            select: {
              id: true,
              hashKeyVersion: true,
              credentialHash: true,
              status: true,
              credentialVersion: true,
              revokedAt: true,
              expiresAt: true,
            },
          }),
        ]);
        if (
          !predecessor ||
          !candidate ||
          candidate.status !== 'prepared' ||
          candidate.revokedAt !== null ||
          candidate.credentialVersion !== compatible.baseCredentialVersion + 1 ||
          candidate.expiresAt.getTime() <= now.getTime() ||
          !verifyDeviceCredential(this.config, input.refreshCredential, predecessor).valid ||
          !verifyDeviceCredential(this.config, input.candidateCredential, candidate).valid
        ) {
          throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
        }
        return {
          status: 'prepared' as const,
          rotationId: row.id,
          deadlineAt: row.deadlineAt.toISOString(),
        };
      }
      if (row.status !== 'requested')
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
      const predecessor = await transaction.deviceRefreshCredential.findFirst({
        where: {
          id: compatible.predecessorCredentialId,
          deviceId: row.deviceId,
          status: 'active',
          credentialVersion: compatible.baseCredentialVersion,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        select: {
          id: true,
          hashKeyVersion: true,
          credentialHash: true,
          status: true,
          credentialVersion: true,
          expiresAt: true,
          revokedAt: true,
        },
      });
      if (
        !predecessor ||
        !verifyDeviceCredential(this.config, input.refreshCredential, predecessor).valid
      ) {
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
      }
      const candidate = hashDeviceCredential(this.config, input.candidateCredential);
      const reused = await transaction.deviceRefreshCredential.findMany({
        where: {
          OR: createDeviceCredentialLookupHashes(this.config, input.candidateCredential).map(
            (lookup) => ({
              hashKeyVersion: lookup.hashKeyVersion,
              credentialHash: lookup.credentialHash,
            })
          ),
        },
        select: { id: true },
        take: 1,
      });
      if (reused.length !== 0) {
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
      }
      const created = await transaction.deviceRefreshCredential.create({
        data: {
          deviceId: row.deviceId,
          credentialHash: candidate.credentialHash,
          hashKeyVersion: candidate.hashKeyVersion,
          status: 'prepared',
          credentialVersion: compatible.baseCredentialVersion + 1,
          expiresAt: new Date(now.getTime() + this.enrollmentOptions.activeCredentialTtlMs),
        },
        select: { id: true },
      });
      const updated = await transaction.deviceCredentialRotation.updateMany({
        where: {
          id: row.id,
          deviceId: row.deviceId,
          status: 'requested',
          candidateCredentialId: null,
          deadlineAt: { gt: now },
        },
        data: { status: 'prepared', preparedAt: now, candidateCredentialId: created.id },
      });
      if (updated.count !== 1)
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
      await this.writeAudit(transaction, {
        deviceId: row.deviceId,
        rotationId: row.id,
        action: 'credential_rotation_prepared',
        actorHash: null,
        now,
      });
      return {
        status: 'prepared' as const,
        rotationId: row.id,
        deadlineAt: row.deadlineAt.toISOString(),
      };
    });
    if ('expired' in outcome) {
      throw new DeviceCredentialRotationError('DEVICE_ROTATION_EXPIRED');
    }
    return outcome;
  }

  public async ack(input: {
    readonly principal: DeviceAccessPrincipal;
    readonly rotationId: string;
    readonly candidateCredential: string;
    readonly now: Date;
  }): Promise<{
    readonly status: 'acknowledged';
    readonly rotationId: string;
    readonly credentialVersion: number;
    readonly accessToken: string;
  }> {
    assertExactKeys(input, ['principal', 'rotationId', 'candidateCredential', 'now']);
    const rotationId = parseUuid(input.rotationId);
    const now = parseDate(input.now);
    assertCredential(input.candidateCredential);
    this.assertPrincipal(input.principal);
    this.assertRuntimeEnabled();

    const committed = await this.runSerializable(async (transaction) => {
      const row = await this.findRotation(transaction, input.principal.deviceId, rotationId);
      const compatible = this.requireCompatible(row);
      if (input.principal.credentialVersion !== compatible.baseCredentialVersion) {
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
      }
      if (
        LIVE_STATUSES.includes(row.status as (typeof LIVE_STATUSES)[number]) &&
        row.deadlineAt.getTime() <= now.getTime()
      ) {
        await this.expireIfDue(transaction, row, now);
        return { expired: true as const };
      }
      const candidate = await transaction.deviceRefreshCredential.findFirst({
        where: { id: row.candidateCredentialId ?? undefined, deviceId: row.deviceId },
        select: {
          id: true,
          deviceId: true,
          hashKeyVersion: true,
          credentialHash: true,
          status: true,
          credentialVersion: true,
          expiresAt: true,
          revokedAt: true,
        },
      });
      if (
        !candidate ||
        candidate.credentialVersion !== compatible.baseCredentialVersion + 1 ||
        !verifyDeviceCredential(this.config, input.candidateCredential, candidate).valid
      ) {
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
      }
      const device = await transaction.integrationDevice.findFirst({
        where: { id: row.deviceId, environment: this.config.environment },
        select: {
          id: true,
          environment: true,
          programType: true,
          capabilityProfile: true,
          status: true,
          credentialVersion: true,
          revokedAt: true,
        },
      });
      if (!device || device.status === 'revoked' || device.revokedAt !== null) {
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_REVOKED');
      }
      if (device.capabilityProfile !== 'standard') {
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
      }

      if (row.status === 'acknowledged') {
        if (
          row.acknowledgedAt === null ||
          now.getTime() >
            row.acknowledgedAt.getTime() +
              this.rotationOptions.rotationAckRecoverySeconds * 1_000 ||
          device.credentialVersion !== compatible.baseCredentialVersion + 1 ||
          candidate.status !== 'active' ||
          candidate.revokedAt !== null ||
          candidate.expiresAt.getTime() <= now.getTime()
        ) {
          throw new DeviceCredentialRotationError('DEVICE_ROTATION_EXPIRED');
        }
        return this.toCommittedAck(device, row.id, compatible.baseCredentialVersion + 1);
      }
      if (row.status !== 'prepared') {
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
      }
      if (
        device.credentialVersion !== compatible.baseCredentialVersion ||
        candidate.status !== 'prepared' ||
        candidate.revokedAt !== null ||
        candidate.expiresAt.getTime() <= now.getTime()
      ) {
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
      }

      const predecessorRevoked = await transaction.deviceRefreshCredential.updateMany({
        where: {
          id: compatible.predecessorCredentialId,
          deviceId: row.deviceId,
          status: 'active',
          credentialVersion: compatible.baseCredentialVersion,
          revokedAt: null,
        },
        data: { status: 'revoked', revokedAt: now },
      });
      if (predecessorRevoked.count !== 1)
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
      const candidateActivated = await transaction.deviceRefreshCredential.updateMany({
        where: {
          id: candidate.id,
          deviceId: row.deviceId,
          status: 'prepared',
          credentialVersion: compatible.baseCredentialVersion + 1,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { status: 'active' },
      });
      if (candidateActivated.count !== 1)
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
      await transaction.deviceTokenExchange.updateMany({
        where: {
          deviceId: row.deviceId,
          credentialVersion: compatible.baseCredentialVersion,
          status: 'completed',
          revokedAt: null,
        },
        data: { status: 'revoked', revokedAt: now },
      });
      const deviceUpdated = await transaction.integrationDevice.updateMany({
        where: {
          id: row.deviceId,
          environment: this.config.environment,
          status: 'active',
          capabilityProfile: 'standard',
          credentialVersion: compatible.baseCredentialVersion,
          revokedAt: null,
        },
        data: { credentialVersion: compatible.baseCredentialVersion + 1 },
      });
      if (deviceUpdated.count !== 1)
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
      const acknowledged = await transaction.deviceCredentialRotation.updateMany({
        where: {
          id: row.id,
          deviceId: row.deviceId,
          status: 'prepared',
          candidateCredentialId: candidate.id,
          baseCredentialVersion: compatible.baseCredentialVersion,
          deadlineAt: { gt: now },
        },
        data: { status: 'acknowledged', acknowledgedAt: now },
      });
      if (acknowledged.count !== 1)
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
      await this.writeAudit(transaction, {
        deviceId: row.deviceId,
        rotationId: row.id,
        action: 'credential_rotation_acknowledged',
        actorHash: null,
        now,
      });
      return this.toCommittedAck(device, row.id, compatible.baseCredentialVersion + 1);
    });

    if ('expired' in committed) {
      throw new DeviceCredentialRotationError('DEVICE_ROTATION_EXPIRED');
    }
    return {
      status: committed.status,
      rotationId: committed.rotationId,
      credentialVersion: committed.credentialVersion,
      accessToken: await this.issueAckToken(committed),
    };
  }

  private assertPrincipal(principal: DeviceAccessPrincipal): void {
    if (
      principal.environment !== this.config.environment ||
      principal.capabilityProfile !== 'standard'
    ) {
      throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
    }
  }

  private toCommittedAck(
    device: {
      readonly id: string;
      readonly programType: string;
      readonly capabilityProfile: string;
    },
    rotationId: string,
    credentialVersion: number
  ): {
    readonly status: 'acknowledged';
    readonly rotationId: string;
    readonly deviceId: string;
    readonly environment: DeviceAccessPrincipal['environment'];
    readonly programType: DeviceAuthProgramType;
    readonly capabilityProfile: 'standard';
    readonly credentialVersion: number;
  } {
    if (
      device.programType !== 'external_webhard_sync' &&
      device.programType !== 'management_program' &&
      device.programType !== 'nesting_program'
    ) {
      throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
    }
    const programType: DeviceAuthProgramType = device.programType;
    return {
      status: 'acknowledged' as const,
      rotationId,
      deviceId: device.id,
      environment: this.config.environment,
      programType,
      capabilityProfile: 'standard' as const,
      credentialVersion,
    };
  }

  private async issueAckToken(
    committed: ReturnType<DeviceCredentialRotationService['toCommittedAck']>
  ): Promise<string> {
    if (!this.accessTokenService)
      throw new DeviceCredentialRotationError('DEVICE_ROTATION_UNAVAILABLE');
    try {
      const accessToken = await this.accessTokenService.issue({
        deviceId: committed.deviceId,
        environment: committed.environment,
        programType: committed.programType,
        permissions: DEFAULT_DEVICE_ACCESS_PERMISSIONS[committed.programType],
        capabilityProfile: committed.capabilityProfile,
        credentialVersion: committed.credentialVersion,
      });
      if (typeof accessToken !== 'string' || accessToken.length === 0) {
        throw new Error('invalid access token');
      }
      return accessToken;
    } catch {
      throw new DeviceCredentialRotationError('DEVICE_ROTATION_UNAVAILABLE');
    }
  }

  public async requestRotation(input: {
    readonly deviceId: string;
    readonly actorHash: string;
    readonly now: Date;
  }): Promise<DeviceRotationSummary> {
    assertExactKeys(input, ['deviceId', 'actorHash', 'now']);
    const deviceId = parseUuid(input.deviceId);
    const actorHash = parseActorHash(input.actorHash);
    const now = parseDate(input.now);
    this.assertRuntimeEnabled();

    return this.runSerializable(async (transaction) => {
      const device = await this.findEligibleDevice(transaction, deviceId);
      const existing = await transaction.deviceCredentialRotation.findFirst({
        where: { deviceId, status: { in: [...LIVE_STATUSES] } },
        orderBy: { createdAt: 'desc' },
        select: ROTATION_SELECT,
      });
      if (existing) {
        const compatible = this.requireCompatible(existing);
        const terminal = await this.expireIfDue(transaction, existing, now);
        if (
          terminal.status === 'expired' ||
          terminal.status === 'cancelled' ||
          terminal.status === 'timed_out'
        ) {
          return this.createRequestedRotation(transaction, device, actorHash, now);
        }
        if (terminal.status === 'revoked') {
          throw new DeviceCredentialRotationError('DEVICE_ROTATION_REVOKED');
        }
        if (terminal.status === 'acknowledged') {
          throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
        }

        await this.findActivePredecessor(
          transaction,
          deviceId,
          compatible.baseCredentialVersion,
          compatible.predecessorCredentialId,
          existing.deadlineAt
        );
        if (
          compatible.baseCredentialVersion === device.credentialVersion &&
          compatible.predecessorCredentialId === existing.predecessorCredentialId
        ) {
          return toSummary(terminal);
        }
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
      }

      return this.createRequestedRotation(transaction, device, actorHash, now);
    });
  }

  public async getRotation(input: {
    readonly deviceId: string;
    readonly rotationId: string;
    readonly now: Date;
  }): Promise<DeviceRotationSummary> {
    assertExactKeys(input, ['deviceId', 'rotationId', 'now']);
    const deviceId = parseUuid(input.deviceId);
    const rotationId = parseUuid(input.rotationId);
    const now = parseDate(input.now);
    this.assertRuntimeEnabled();

    return this.runSerializable(async (transaction) => {
      const row = await this.findRotation(transaction, deviceId, rotationId);
      this.requireCompatible(row);
      return toSummary(await this.expireIfDue(transaction, row, now));
    });
  }

  public async cancelRotation(input: {
    readonly deviceId: string;
    readonly rotationId: string;
    readonly actorHash: string;
    readonly now: Date;
  }): Promise<DeviceRotationSummary> {
    assertExactKeys(input, ['deviceId', 'rotationId', 'actorHash', 'now']);
    const deviceId = parseUuid(input.deviceId);
    const rotationId = parseUuid(input.rotationId);
    const actorHash = parseActorHash(input.actorHash);
    const now = parseDate(input.now);
    this.assertRuntimeEnabled();

    return this.runSerializable(async (transaction) => {
      const row = await this.findRotation(transaction, deviceId, rotationId);
      const compatible = this.requireCompatible(row);
      if (
        row.status === 'cancelled' ||
        row.status === 'expired' ||
        row.status === 'revoked' ||
        row.status === 'timed_out'
      ) {
        return toSummary(row);
      }
      if (row.status === 'acknowledged') {
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
      }
      await this.assertRotationDevice(transaction, row, compatible.baseCredentialVersion);
      const current = await this.expireIfDue(transaction, row, now);
      if (
        current.status === 'cancelled' ||
        current.status === 'expired' ||
        current.status === 'revoked' ||
        current.status === 'timed_out'
      ) {
        return toSummary(current);
      }
      if (current.status === 'acknowledged') {
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
      }

      const updated = await transaction.deviceCredentialRotation.updateMany({
        where: {
          id: rotationId,
          deviceId,
          status: { in: [...LIVE_STATUSES] },
          baseCredentialVersion: compatible.baseCredentialVersion,
          deadlineAt: { gt: now },
          device: { is: this.rotationDevicePredicate(compatible.baseCredentialVersion) },
        },
        data: { status: 'cancelled', cancelledAt: now, actorHash },
      });
      if (updated.count !== 1) {
        const loser = await this.findRotation(transaction, deviceId, rotationId);
        if (
          loser.status === 'acknowledged' ||
          LIVE_STATUSES.includes(loser.status as (typeof LIVE_STATUSES)[number])
        ) {
          throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
        }
        return toSummary(loser);
      }

      await this.revokePreparedCandidate(transaction, current, now);
      await this.writeAudit(transaction, {
        deviceId,
        rotationId,
        action: 'credential_rotation_cancelled',
        actorHash,
        now,
      });
      return toSummary({ ...current, status: 'cancelled' });
    });
  }

  private async createRequestedRotation(
    transaction: Prisma.TransactionClient,
    device: { readonly id: string; readonly credentialVersion: number },
    actorHash: string,
    now: Date
  ): Promise<DeviceRotationSummary> {
    const deviceId = device.id;
    const deadlineAt = new Date(
      now.getTime() + this.rotationOptions.rotationDeadlineSeconds * 1_000
    );
    const predecessor = await this.findActivePredecessor(
      transaction,
      deviceId,
      device.credentialVersion,
      undefined,
      deadlineAt
    );

    const created = await transaction.deviceCredentialRotation.create({
      data: {
        deviceId,
        status: 'requested',
        baseCredentialVersion: device.credentialVersion,
        predecessorCredentialId: predecessor.id,
        actorHash,
        deadlineAt,
      },
      select: ROTATION_SELECT,
    });
    await this.writeAudit(transaction, {
      deviceId,
      rotationId: created.id,
      action: 'credential_rotation_requested',
      actorHash,
      now,
    });
    return toSummary(created);
  }

  private rotationDevicePredicate(baseCredentialVersion: number) {
    return {
      environment: this.config.environment,
      status: 'active' as const,
      capabilityProfile: 'standard',
      revokedAt: null,
      credentialVersion: baseCredentialVersion,
    };
  }

  private async assertRotationDevice(
    transaction: Prisma.TransactionClient,
    row: RotationRecord,
    baseCredentialVersion: number
  ): Promise<void> {
    const device = await transaction.integrationDevice.findFirst({
      where: { id: row.deviceId, environment: this.config.environment },
      select: {
        id: true,
        environment: true,
        status: true,
        capabilityProfile: true,
        credentialVersion: true,
        revokedAt: true,
      },
    });
    if (!device) throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
    if (device.status === 'revoked' || device.revokedAt !== null) {
      throw new DeviceCredentialRotationError('DEVICE_ROTATION_REVOKED');
    }
    if (
      device.status !== 'active' ||
      device.capabilityProfile !== 'standard' ||
      device.credentialVersion !== baseCredentialVersion
    ) {
      throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
    }
  }

  private async findEligibleDevice(transaction: Prisma.TransactionClient, deviceId: string) {
    const device = await transaction.integrationDevice.findFirst({
      where: {
        id: deviceId,
        environment: this.config.environment,
        status: 'active',
        capabilityProfile: 'standard',
        revokedAt: null,
      },
      select: {
        id: true,
        environment: true,
        status: true,
        capabilityProfile: true,
        credentialVersion: true,
        revokedAt: true,
      },
    });
    if (
      !device ||
      device.environment !== this.config.environment ||
      device.status !== 'active' ||
      device.capabilityProfile !== 'standard' ||
      device.revokedAt !== null
    ) {
      throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
    }
    return device;
  }

  private async findActivePredecessor(
    transaction: Prisma.TransactionClient,
    deviceId: string,
    credentialVersion: number,
    credentialId: string | undefined,
    deadlineAt: Date
  ) {
    const predecessor = await transaction.deviceRefreshCredential.findFirst({
      where: {
        ...(credentialId === undefined ? {} : { id: credentialId }),
        deviceId,
        status: 'active',
        credentialVersion,
        revokedAt: null,
      },
      select: {
        id: true,
        deviceId: true,
        status: true,
        credentialVersion: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    const requiredLifetime =
      deadlineAt.getTime() + this.rotationOptions.rotationAckRecoverySeconds * 1_000;
    if (!predecessor || predecessor.expiresAt.getTime() < requiredLifetime) {
      throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
    }
    return predecessor;
  }

  private async findRotation(
    transaction: Prisma.TransactionClient,
    deviceId: string,
    rotationId: string
  ): Promise<RotationRecord> {
    const row = await transaction.deviceCredentialRotation.findFirst({
      where: { id: rotationId, deviceId, device: { environment: this.config.environment } },
      select: ROTATION_SELECT,
    });
    if (!row) throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
    return row;
  }

  private requireCompatible(row: RotationRecord) {
    try {
      const compatible = requireCompatibleDeviceCredentialRotation(row);
      if (
        (row.status === 'prepared' || row.status === 'acknowledged') &&
        row.candidateCredentialId === null
      ) {
        throw new DeviceAuthRotationCompatibilityError('device_rotation_incompatible');
      }
      return compatible;
    } catch (error: unknown) {
      if (error instanceof DeviceAuthRotationCompatibilityError) {
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_INCOMPATIBLE');
      }
      throw error;
    }
  }

  private async expireIfDue(
    transaction: Prisma.TransactionClient,
    row: RotationRecord,
    now: Date
  ): Promise<RotationRecord> {
    if (
      !LIVE_STATUSES.includes(row.status as (typeof LIVE_STATUSES)[number]) ||
      row.deadlineAt.getTime() > now.getTime()
    ) {
      return row;
    }
    const compatible = this.requireCompatible(row);
    await this.assertRotationDevice(transaction, row, compatible.baseCredentialVersion);
    const updated = await transaction.deviceCredentialRotation.updateMany({
      where: {
        id: row.id,
        deviceId: row.deviceId,
        status: { in: [...LIVE_STATUSES] },
        baseCredentialVersion: compatible.baseCredentialVersion,
        deadlineAt: { lte: now },
        device: { is: this.rotationDevicePredicate(compatible.baseCredentialVersion) },
      },
      data: { status: 'expired', expiredAt: now },
    });
    if (updated.count !== 1) {
      const loser = await this.findRotation(transaction, row.deviceId, row.id);
      if (LIVE_STATUSES.includes(loser.status as (typeof LIVE_STATUSES)[number])) {
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
      }
      return loser;
    }
    await this.revokePreparedCandidate(transaction, row, now);
    await this.writeAudit(transaction, {
      deviceId: row.deviceId,
      rotationId: row.id,
      action: 'credential_rotation_expired',
      actorHash: null,
      now,
    });
    return { ...row, status: 'expired' };
  }

  private async revokePreparedCandidate(
    transaction: Prisma.TransactionClient,
    row: RotationRecord,
    now: Date
  ): Promise<void> {
    if (row.status !== 'prepared' || row.candidateCredentialId === null) return;
    const compatible = this.requireCompatible(row);
    const updated = await transaction.deviceRefreshCredential.updateMany({
      where: {
        id: row.candidateCredentialId,
        deviceId: row.deviceId,
        status: 'prepared',
        credentialVersion: compatible.baseCredentialVersion + 1,
        revokedAt: null,
      },
      data: { status: 'revoked', revokedAt: now },
    });
    if (updated.count !== 1) {
      throw new DeviceCredentialRotationError('DEVICE_ROTATION_IN_PROGRESS');
    }
  }

  private async writeAudit(
    transaction: Prisma.TransactionClient,
    input: {
      readonly deviceId: string;
      readonly rotationId: string;
      readonly action: string;
      readonly actorHash: string | null;
      readonly now: Date;
    }
  ): Promise<void> {
    await transaction.deviceCredentialAuditLog.create({
      data: {
        deviceId: input.deviceId,
        rotationId: input.rotationId,
        action: input.action,
        actorHash: input.actorHash,
        expiresAt: new Date(input.now.getTime() + this.enrollmentOptions.auditLogTtlMs),
      },
    });
  }

  private assertRuntimeEnabled(): void {
    if (!this.rotationOptions.rotationRuntimeEnabled) {
      throw new DeviceCredentialRotationError('DEVICE_ROTATION_UNAVAILABLE');
    }
  }

  private async runSerializable<T>(
    callback: (transaction: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(callback, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (error instanceof DeviceCredentialRotationError) throw error;
        if (isRetryable(error) && attempt < MAX_TRANSACTION_ATTEMPTS) continue;
        throw new DeviceCredentialRotationError('DEVICE_ROTATION_UNAVAILABLE');
      }
    }
    throw new DeviceCredentialRotationError('DEVICE_ROTATION_UNAVAILABLE');
  }
}

function toSummary(row: RotationRecord): DeviceRotationSummary {
  const compatible = requireCompatibleDeviceCredentialRotation(row);
  return Object.freeze({
    id: row.id,
    deviceId: row.deviceId,
    status: row.status,
    deadlineAt: row.deadlineAt.toISOString(),
    credentialVersion: compatible.baseCredentialVersion,
  });
}

function assertExactKeys(
  value: unknown,
  keys: readonly string[]
): asserts value is Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
  }
}

function parseUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value))
    throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
  return value;
}

function parseActorHash(value: unknown): string {
  if (typeof value !== 'string' || !ACTOR_HASH_PATTERN.test(value))
    throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
  return value;
}

function parseDate(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
  return new Date(value.getTime());
}

function assertCredential(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(value) ||
    Buffer.from(value, 'base64url').length !== 32 ||
    Buffer.from(value, 'base64url').toString('base64url') !== value
  ) {
    throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
  }
}

function credentialsEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'base64url');
  const rightBytes = Buffer.from(right, 'base64url');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function isRetryable(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    ((value as { readonly code?: unknown }).code === 'P2002' ||
      (value as { readonly code?: unknown }).code === 'P2034')
  );
}
