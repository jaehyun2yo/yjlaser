import { loadDeviceAuthConfig } from './device-auth.config';
import type { ApproveEnrollmentInput } from './device-auth.types';
import * as deviceManagementServiceModule from './device-management.service';

const NOW = new Date('2026-07-20T01:02:03.000Z');
const DEVICE_ID = '4ac3e42f-437b-4e6b-88b5-5c12df8d1e4d';
const ACTOR_HASH = 'a'.repeat(64);
const AUDIT_LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface ManagedDeviceRow {
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
  readonly approvedByActorHash?: string | null;
  readonly credentialHash?: string;
}

interface DeviceManagementServiceLike {
  listDevices(): Promise<readonly Record<string, unknown>[]>;
  approveDevice(input: ApproveEnrollmentInput): Promise<unknown>;
  revokeDevice(input: { readonly deviceId: string; readonly actorHash: string }): Promise<unknown>;
}

function makeConfig() {
  return loadDeviceAuthConfig({
    environment: 'dev',
    environments: {
      dev: {
        currentHashKeyVersion: 1,
        credentialPepperKeyring: {
          '1': 'synthetic-device-management-pepper-0123456789',
        },
      },
    },
  });
}

function makeDevice(overrides: Partial<ManagedDeviceRow> = {}): ManagedDeviceRow {
  return {
    id: DEVICE_ID,
    environment: 'dev',
    programType: 'management_program',
    capabilityProfile: 'standard',
    displayName: 'management-program-install-01',
    appVersion: '1.2.3',
    status: 'active',
    credentialVersion: 7,
    enrolledAt: new Date('2026-07-19T01:02:03.000Z'),
    approvedAt: new Date('2026-07-19T01:03:03.000Z'),
    lastHeartbeatAt: new Date('2026-07-20T01:01:03.000Z'),
    revokedAt: null,
    approvedByActorHash: 'b'.repeat(64),
    credentialHash: 'must-not-escape-service-boundary',
    ...overrides,
  };
}

function makeRevokePrisma(device: ManagedDeviceRow | null = makeDevice()) {
  const transaction = {
    integrationDevice: {
      findFirst: jest.fn().mockResolvedValue(device),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    deviceRefreshCredential: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    deviceCredentialRotation: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    deviceTokenExchange: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    deviceCredentialAuditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-001' }),
    },
  };

  return {
    transaction,
    $transaction: jest.fn(async (callback: (client: typeof transaction) => Promise<unknown>) =>
      callback(transaction)
    ),
  };
}

function loadServiceModule(): Record<string, unknown> {
  return deviceManagementServiceModule;
}

function createServiceUnderTest(
  prisma: unknown,
  enrollmentService: { readonly approveEnrollment: jest.Mock },
  overrides: Partial<{
    readonly now: () => Date;
    readonly auditLogTtlMs: number;
  }> = {}
): DeviceManagementServiceLike {
  const DeviceManagementService = loadServiceModule().DeviceManagementService;
  if (typeof DeviceManagementService !== 'function') {
    throw new Error('DeviceManagementService is not implemented');
  }

  return new (DeviceManagementService as new (
    prisma: unknown,
    config: ReturnType<typeof makeConfig>,
    options: {
      readonly preparedCredentialTtlMs: number;
      readonly activeCredentialTtlMs: number;
      readonly auditLogTtlMs: number;
      readonly now?: () => Date;
    },
    enrollmentService: { readonly approveEnrollment: jest.Mock }
  ) => DeviceManagementServiceLike)(
    prisma,
    makeConfig(),
    {
      preparedCredentialTtlMs: 15 * 60 * 1000,
      activeCredentialTtlMs: 30 * 24 * 60 * 60 * 1000,
      auditLogTtlMs: AUDIT_LOG_TTL_MS,
      now: () => NOW,
      ...overrides,
    },
    enrollmentService
  );
}

describe('DeviceManagementService', () => {
  it('lists only selected-environment safe fields', async () => {
    const activeDevice = makeDevice();
    const prisma = {
      integrationDevice: {
        findMany: jest.fn().mockResolvedValue([activeDevice]),
      },
    };
    const enrollmentService = { approveEnrollment: jest.fn() };
    const service = createServiceUnderTest(prisma, enrollmentService);

    await expect(service.listDevices()).resolves.toEqual([
      {
        deviceId: DEVICE_ID,
        environment: 'dev',
        programType: 'management_program',
        capabilityProfile: 'standard',
        displayName: 'management-program-install-01',
        appVersion: '1.2.3',
        state: 'active',
        credentialVersion: 7,
        enrolledAt: activeDevice.enrolledAt,
        approvedAt: activeDevice.approvedAt,
        lastHeartbeatAt: activeDevice.lastHeartbeatAt,
      },
    ]);
    expect(prisma.integrationDevice.findMany).toHaveBeenCalledWith({
      where: { environment: 'dev' },
      orderBy: [{ enrolledAt: 'desc' }, { id: 'asc' }],
      select: {
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
      },
    });
  });

  it('does not return a row outside the selected device-auth environment', async () => {
    const selectedDevice = makeDevice();
    const crossEnvironmentDevice = makeDevice({
      id: '16c4f80d-d872-4c53-a1d8-6d486269f4f3',
      environment: 'stg',
    });
    const prisma = {
      integrationDevice: {
        findMany: jest.fn().mockResolvedValue([crossEnvironmentDevice, selectedDevice]),
      },
    };
    const enrollmentService = { approveEnrollment: jest.fn() };
    const service = createServiceUnderTest(prisma, enrollmentService);

    await expect(service.listDevices()).resolves.toEqual([
      expect.objectContaining({ deviceId: DEVICE_ID, environment: 'dev' }),
    ]);
  });

  it('delegates a valid pending approval to the enrollment lifecycle once', async () => {
    const enrollmentStatus = {
      deviceId: DEVICE_ID,
      state: 'active',
      environment: 'dev',
      programType: 'management_program',
      capabilityProfile: 'standard',
      credentialVersion: 7,
    };
    const enrollmentService = {
      approveEnrollment: jest.fn().mockResolvedValue(enrollmentStatus),
    };
    const service = createServiceUnderTest({}, enrollmentService);

    await expect(
      service.approveDevice({ deviceId: DEVICE_ID, actorHash: ACTOR_HASH })
    ).resolves.toEqual(enrollmentStatus);
    expect(enrollmentService.approveEnrollment).toHaveBeenCalledTimes(1);
    expect(enrollmentService.approveEnrollment).toHaveBeenCalledWith({
      deviceId: DEVICE_ID,
      actorHash: ACTOR_HASH,
    });
  });

  it('revokes device, every current credential, and live rotations in one serializable transaction', async () => {
    const activeDevice = makeDevice();
    const prisma = makeRevokePrisma(activeDevice);
    const enrollmentService = { approveEnrollment: jest.fn() };
    const service = createServiceUnderTest(prisma, enrollmentService);

    await expect(
      service.revokeDevice({ deviceId: DEVICE_ID, actorHash: ACTOR_HASH })
    ).resolves.toEqual({
      deviceId: DEVICE_ID,
      environment: 'dev',
      programType: 'management_program',
      capabilityProfile: 'standard',
      displayName: 'management-program-install-01',
      appVersion: '1.2.3',
      state: 'revoked',
      credentialVersion: 8,
      enrolledAt: activeDevice.enrolledAt,
      approvedAt: new Date('2026-07-19T01:03:03.000Z'),
      lastHeartbeatAt: new Date('2026-07-20T01:01:03.000Z'),
      revokedAt: NOW,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(prisma.transaction.integrationDevice.findFirst).toHaveBeenCalledWith({
      where: {
        id: DEVICE_ID,
        environment: 'dev',
      },
      select: {
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
      },
    });
    expect(prisma.transaction.integrationDevice.updateMany).toHaveBeenCalledWith({
      where: {
        id: DEVICE_ID,
        environment: 'dev',
        status: 'active',
        credentialVersion: 7,
        revokedAt: null,
      },
      data: {
        status: 'revoked',
        revokedAt: NOW,
        credentialVersion: { increment: 1 },
      },
    });
    expect(prisma.transaction.deviceRefreshCredential.updateMany).toHaveBeenCalledWith({
      where: {
        deviceId: DEVICE_ID,
        status: { in: ['prepared', 'active'] },
        revokedAt: null,
      },
      data: { status: 'revoked', revokedAt: NOW, actorHash: ACTOR_HASH },
    });
    expect(prisma.transaction.deviceCredentialRotation.updateMany).toHaveBeenCalledWith({
      where: { deviceId: DEVICE_ID, status: { in: ['requested', 'prepared'] } },
      data: { status: 'revoked', revokedAt: NOW, actorHash: ACTOR_HASH },
    });
    expect(prisma.transaction.deviceTokenExchange.updateMany).toHaveBeenCalledWith({
      where: { deviceId: DEVICE_ID, status: 'completed', revokedAt: null },
      data: { status: 'revoked', revokedAt: NOW },
    });
    expect(prisma.transaction.deviceCredentialAuditLog.create).toHaveBeenCalledWith({
      data: {
        deviceId: DEVICE_ID,
        action: 'device_revoked',
        actorHash: ACTOR_HASH,
        expiresAt: new Date(NOW.getTime() + AUDIT_LOG_TTL_MS),
      },
    });

    const deviceUpdateOrder =
      prisma.transaction.integrationDevice.updateMany.mock.invocationCallOrder[0];
    const credentialUpdateOrder =
      prisma.transaction.deviceRefreshCredential.updateMany.mock.invocationCallOrder[0];
    const rotationUpdateOrder =
      prisma.transaction.deviceCredentialRotation.updateMany.mock.invocationCallOrder[0];
    const tokenExchangeUpdateOrder =
      prisma.transaction.deviceTokenExchange.updateMany.mock.invocationCallOrder[0];
    const auditOrder =
      prisma.transaction.deviceCredentialAuditLog.create.mock.invocationCallOrder[0];
    expect(deviceUpdateOrder).toBeLessThan(credentialUpdateOrder);
    expect(credentialUpdateOrder).toBeLessThan(rotationUpdateOrder);
    expect(rotationUpdateOrder).toBeLessThan(tokenExchangeUpdateOrder);
    expect(tokenExchangeUpdateOrder).toBeLessThan(auditOrder);
  });

  it('returns an already revoked selected-environment device idempotently with zero dependent writes', async () => {
    const revoked = makeDevice({
      status: 'revoked',
      credentialVersion: 8,
      revokedAt: NOW,
    });
    const prisma = makeRevokePrisma(revoked);
    const service = createServiceUnderTest(prisma, { approveEnrollment: jest.fn() });

    await expect(
      service.revokeDevice({ deviceId: DEVICE_ID, actorHash: ACTOR_HASH })
    ).resolves.toMatchObject({ state: 'revoked', credentialVersion: 8, revokedAt: NOW });
    expect(prisma.transaction.integrationDevice.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceRefreshCredential.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceCredentialRotation.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceTokenExchange.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceCredentialAuditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'uppercase UUID', deviceId: DEVICE_ID.toUpperCase(), actorHash: ACTOR_HASH },
    { label: 'noncanonical UUID', deviceId: 'device-001', actorHash: ACTOR_HASH },
    { label: 'uppercase actor hash', deviceId: DEVICE_ID, actorHash: 'A'.repeat(64) },
    { label: 'short actor hash', deviceId: DEVICE_ID, actorHash: 'a'.repeat(63) },
  ])('rejects $label before delegation or database work', async ({ deviceId, actorHash }) => {
    const prisma = makeRevokePrisma();
    const enrollmentService = { approveEnrollment: jest.fn() };
    const service = createServiceUnderTest(prisma, enrollmentService);

    await expect(service.approveDevice({ deviceId, actorHash })).rejects.toMatchObject({
      code: 'DEVICE_MANAGEMENT_INVALID',
    });
    await expect(service.revokeDevice({ deviceId, actorHash })).rejects.toMatchObject({
      code: 'DEVICE_MANAGEMENT_INVALID',
    });
    expect(enrollmentService.approveEnrollment).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails closed for a cross-environment or terminal device before mutation', async () => {
    const prisma = makeRevokePrisma(null);
    const enrollmentService = { approveEnrollment: jest.fn() };
    const service = createServiceUnderTest(prisma, enrollmentService);

    await expect(
      service.revokeDevice({ deviceId: DEVICE_ID, actorHash: ACTOR_HASH })
    ).rejects.toMatchObject({ code: 'DEVICE_MANAGEMENT_CONFLICT' });
    expect(prisma.transaction.integrationDevice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ environment: 'dev' }) })
    );
    expect(prisma.transaction.integrationDevice.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceRefreshCredential.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceCredentialRotation.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceTokenExchange.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceCredentialAuditLog.create).not.toHaveBeenCalled();
  });

  it('fails closed on a device compare-and-swap miss without revoking dependent records', async () => {
    const prisma = makeRevokePrisma();
    prisma.transaction.integrationDevice.updateMany.mockResolvedValue({ count: 0 });
    const enrollmentService = { approveEnrollment: jest.fn() };
    const service = createServiceUnderTest(prisma, enrollmentService);

    await expect(
      service.revokeDevice({ deviceId: DEVICE_ID, actorHash: ACTOR_HASH })
    ).rejects.toMatchObject({ code: 'DEVICE_MANAGEMENT_CONFLICT' });
    expect(prisma.transaction.deviceRefreshCredential.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceCredentialRotation.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceTokenExchange.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceCredentialAuditLog.create).not.toHaveBeenCalled();
  });

  it('re-reads a CAS loser and converges on an already revoked device without dependent writes', async () => {
    const prisma = makeRevokePrisma();
    prisma.transaction.integrationDevice.updateMany.mockResolvedValue({ count: 0 });
    prisma.transaction.integrationDevice.findFirst
      .mockResolvedValueOnce(makeDevice())
      .mockResolvedValueOnce(
        makeDevice({ status: 'revoked', credentialVersion: 8, revokedAt: NOW })
      );
    const service = createServiceUnderTest(prisma, { approveEnrollment: jest.fn() });

    await expect(
      service.revokeDevice({ deviceId: DEVICE_ID, actorHash: ACTOR_HASH })
    ).resolves.toMatchObject({ state: 'revoked', credentialVersion: 8, revokedAt: NOW });
    expect(prisma.transaction.integrationDevice.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.transaction.deviceRefreshCredential.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceCredentialRotation.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceTokenExchange.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceCredentialAuditLog.create).not.toHaveBeenCalled();
  });

  it('does not report revocation success when audit persistence fails', async () => {
    const prisma = makeRevokePrisma();
    prisma.transaction.deviceCredentialAuditLog.create.mockRejectedValue(
      new Error('sensitive persistence detail')
    );
    const enrollmentService = { approveEnrollment: jest.fn() };
    const service = createServiceUnderTest(prisma, enrollmentService);

    await expect(
      service.revokeDevice({ deviceId: DEVICE_ID, actorHash: ACTOR_HASH })
    ).rejects.toMatchObject({ code: 'DEVICE_MANAGEMENT_UNAVAILABLE' });
  });

  it('retries only a P2034 serialization failure at the established lifecycle limit', async () => {
    const prisma = makeRevokePrisma();
    let attempts = 0;
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof prisma.transaction) => Promise<unknown>) => {
        attempts += 1;
        if (attempts === 1) {
          throw { code: 'P2034' };
        }

        return callback(prisma.transaction);
      }
    );
    const enrollmentService = { approveEnrollment: jest.fn() };
    const service = createServiceUnderTest(prisma, enrollmentService);

    await expect(
      service.revokeDevice({ deviceId: DEVICE_ID, actorHash: ACTOR_HASH })
    ).resolves.toMatchObject({ deviceId: DEVICE_ID, state: 'revoked' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('maps nonserialization database errors to a safe unavailable result without retrying', async () => {
    const prisma = makeRevokePrisma();
    const rawDatabaseMessage = 'raw credential hash must not appear in responses';
    prisma.$transaction.mockRejectedValue({ code: 'P2028', message: rawDatabaseMessage });
    const enrollmentService = { approveEnrollment: jest.fn() };
    const service = createServiceUnderTest(prisma, enrollmentService);

    let caughtError: unknown;
    try {
      await service.revokeDevice({ deviceId: DEVICE_ID, actorHash: ACTOR_HASH });
    } catch (error: unknown) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({ code: 'DEVICE_MANAGEMENT_UNAVAILABLE' });
    expect(caughtError).toBeInstanceOf(Error);
    if (caughtError instanceof Error) {
      expect(caughtError.message).not.toContain(rawDatabaseMessage);
    }
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('maps a list persistence failure to a safe unavailable result', async () => {
    const rawDatabaseMessage = 'raw credential hash must not appear in responses';
    const prisma = {
      integrationDevice: {
        findMany: jest.fn().mockRejectedValue(new Error(rawDatabaseMessage)),
      },
    };
    const enrollmentService = { approveEnrollment: jest.fn() };
    const service = createServiceUnderTest(prisma, enrollmentService);

    let caughtError: unknown;
    try {
      await service.listDevices();
    } catch (error: unknown) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({ code: 'DEVICE_MANAGEMENT_UNAVAILABLE' });
    expect(caughtError).toBeInstanceOf(Error);
    if (caughtError instanceof Error) {
      expect(caughtError.message).not.toContain(rawDatabaseMessage);
    }
  });
});
