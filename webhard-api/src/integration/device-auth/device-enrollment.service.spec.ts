import { loadDeviceAuthConfig } from './device-auth.config';
import { hashDeviceCredential } from './device-credential-hash';

const NOW = new Date('2026-07-20T00:00:00.000Z');
const RETRY_NOW = new Date('2026-07-20T00:11:00.000Z');
const PREPARED_CREDENTIAL_TTL_MS = 15 * 60 * 1000;
const ACTIVE_CREDENTIAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ACTOR_HASH = 'a'.repeat(64);
const EXPECTED_DISPLAY_NAME = 'management-program-install-01';
const RAW_CODE = Buffer.alloc(32, 7).toString('base64url');
const ENROLLMENT_CODE = Buffer.alloc(32, 9).toString('base64url');
const DIFFERENT_ENROLLMENT_CODE = Buffer.alloc(32, 10).toString('base64url');
const ENROLLMENT_ATTEMPT_ID = Buffer.alloc(16, 11).toString('base64url');
const DIFFERENT_ENROLLMENT_ATTEMPT_ID = Buffer.alloc(16, 12).toString('base64url');
const REFRESH_CREDENTIAL = Buffer.alloc(32, 13).toString('base64url');
const DIFFERENT_REFRESH_CREDENTIAL = Buffer.alloc(32, 14).toString('base64url');

function makeConfig(currentHashKeyVersion = 2) {
  return loadDeviceAuthConfig({
    environment: 'prd',
    environments: {
      prd: {
        currentHashKeyVersion,
        credentialPepperKeyring: {
          '1': 'synthetic-device-auth-prd-v1-pepper-0123456789',
          '2': 'synthetic-device-auth-prd-v2-pepper-0123456789',
        },
      },
    },
  });
}

function makePrisma() {
  const tx = {
    deviceEnrollment: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({ id: 'enrollment-001' }),
    },
  };

  return {
    tx,
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  };
}

function makeEnrollmentPrisma(enrollment: Record<string, unknown>) {
  const tx = {
    deviceEnrollment: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    integrationDevice: {
      create: jest.fn().mockResolvedValue({ id: 'device-001' }),
    },
    deviceRefreshCredential: {
      create: jest.fn().mockResolvedValue({ id: 'refresh-001' }),
    },
    deviceCredentialAuditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-001' }),
    },
  };

  return {
    tx,
    deviceEnrollment: {
      findFirst: jest.fn().mockResolvedValue(enrollment),
    },
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  };
}

function makeStatusPrisma(
  enrollment: Record<string, unknown>,
  refreshCredential: Record<string, unknown> | null
) {
  return {
    deviceEnrollment: {
      findFirst: jest.fn().mockResolvedValue(enrollment),
    },
    deviceRefreshCredential: {
      findFirst: jest.fn().mockResolvedValue(refreshCredential),
    },
  };
}

function getActiveStatusExpiryLowerBound(query: unknown): Date | null {
  if (typeof query !== 'object' || query === null) {
    return null;
  }

  const where = (query as { where?: unknown }).where;
  if (typeof where !== 'object' || where === null) {
    return null;
  }

  const and = (where as { AND?: unknown }).AND;
  if (!Array.isArray(and) || and.length !== 1 || typeof and[0] !== 'object' || and[0] === null) {
    return null;
  }

  const or = (and[0] as { OR?: unknown }).OR;
  if (!Array.isArray(or)) {
    return null;
  }

  for (const condition of or) {
    if (typeof condition !== 'object' || condition === null) {
      continue;
    }

    const expiresAt = (condition as { expiresAt?: unknown }).expiresAt;
    if (typeof expiresAt !== 'object' || expiresAt === null) {
      continue;
    }

    const lowerBound = (expiresAt as { gt?: unknown }).gt;
    if (lowerBound instanceof Date) {
      return lowerBound;
    }
  }

  return null;
}

function makeExpiryAwareStatusPrisma(
  enrollment: Record<string, unknown>,
  refreshCredential: Record<string, unknown> | null
) {
  return {
    deviceEnrollment: {
      findFirst: jest.fn().mockResolvedValue(enrollment),
    },
    deviceRefreshCredential: {
      findFirst: jest.fn().mockImplementation((query: unknown) => {
        const expiresAt = refreshCredential?.expiresAt;
        const lowerBound = getActiveStatusExpiryLowerBound(query);

        if (
          refreshCredential === null ||
          !(expiresAt instanceof Date) ||
          lowerBound === null ||
          expiresAt.getTime() <= lowerBound.getTime()
        ) {
          return null;
        }

        return refreshCredential;
      }),
    },
  };
}

function makeApprovalPrisma() {
  const tx = {
    integrationDevice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'device-001',
        environment: 'prd',
        programType: 'management_program',
        capabilityProfile: 'standard',
        credentialVersion: 1,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    deviceRefreshCredential: {
      findMany: jest.fn().mockResolvedValue([{ id: 'refresh-001' }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    deviceCredentialAuditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-002' }),
    },
  };

  return {
    tx,
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  };
}

function loadServiceModule(): Record<string, unknown> {
  try {
    return require('./device-enrollment.service') as Record<string, unknown>;
  } catch {
    return {};
  }
}

interface DeviceEnrollmentServiceLike {
  createEnrollmentCode(input: unknown): Promise<unknown>;
  enroll(input: unknown): Promise<unknown>;
  getEnrollmentStatus(input: unknown): Promise<unknown>;
  approveEnrollment(input: unknown): Promise<unknown>;
}

function createServiceUnderTest(
  prisma: unknown,
  config = makeConfig(),
  overrides: Partial<{
    now: () => Date;
    randomBytes: (size: number) => Buffer;
    preparedCredentialTtlMs: number;
    activeCredentialTtlMs: number;
    auditLogTtlMs: number;
    randomId: () => string;
  }> = {}
): DeviceEnrollmentServiceLike {
  const DeviceEnrollmentService = loadServiceModule().DeviceEnrollmentService;
  if (typeof DeviceEnrollmentService !== 'function') {
    throw new Error('DeviceEnrollmentService is not implemented');
  }

  return new (DeviceEnrollmentService as new (
    prisma: unknown,
    config: ReturnType<typeof makeConfig>,
    options: {
      readonly now: () => Date;
      readonly randomBytes: (size: number) => Buffer;
      readonly preparedCredentialTtlMs: number;
      readonly activeCredentialTtlMs: number;
      readonly auditLogTtlMs: number;
      readonly randomId?: () => string;
    }
  ) => DeviceEnrollmentServiceLike)(prisma, config, {
    now: () => NOW,
    randomBytes: (size) => Buffer.alloc(size, 7),
    preparedCredentialTtlMs: 15 * 60 * 1000,
    activeCredentialTtlMs: ACTIVE_CREDENTIAL_TTL_MS,
    auditLogTtlMs: 24 * 60 * 60 * 1000,
    ...overrides,
  });
}

describe('DeviceEnrollmentService', () => {
  it('requires an explicit active credential TTL policy', () => {
    const module = loadServiceModule();
    const DeviceEnrollmentService = module.DeviceEnrollmentService;

    expect(typeof DeviceEnrollmentService).toBe('function');
    if (typeof DeviceEnrollmentService !== 'function') {
      return;
    }

    expect(
      () =>
        new (DeviceEnrollmentService as new (
          prisma: unknown,
          config: ReturnType<typeof makeConfig>,
          options: unknown
        ) => unknown)(makePrisma(), makeConfig(), {
          now: () => NOW,
          randomBytes: (size: number) => Buffer.alloc(size, 7),
          preparedCredentialTtlMs: 15 * 60 * 1000,
          auditLogTtlMs: 24 * 60 * 60 * 1000,
        })
    ).toThrow('DEVICE_ENROLLMENT_INVALID');
  });

  it('creates a ten-minute hash-only enrollment code from injected server dependencies', async () => {
    const module = loadServiceModule();
    const DeviceEnrollmentService = module.DeviceEnrollmentService;

    expect(typeof DeviceEnrollmentService).toBe('function');
    if (typeof DeviceEnrollmentService !== 'function') {
      return;
    }

    const prisma = makePrisma();
    const service = new (DeviceEnrollmentService as new (
      prisma: unknown,
      config: ReturnType<typeof makeConfig>,
      options: {
        readonly now: () => Date;
        readonly randomBytes: (size: number) => Buffer;
        readonly preparedCredentialTtlMs: number;
        readonly activeCredentialTtlMs: number;
        readonly auditLogTtlMs: number;
      }
    ) => {
      createEnrollmentCode(input: unknown): Promise<unknown>;
    })(prisma, makeConfig(), {
      now: () => NOW,
      randomBytes: (size) => Buffer.alloc(size, 7),
      preparedCredentialTtlMs: 15 * 60 * 1000,
      activeCredentialTtlMs: ACTIVE_CREDENTIAL_TTL_MS,
      auditLogTtlMs: 24 * 60 * 60 * 1000,
    });

    const result = await service.createEnrollmentCode({
      programType: 'management_program',
      capabilityProfile: 'standard',
      expectedDisplayName: EXPECTED_DISPLAY_NAME,
      actorHash: ACTOR_HASH,
    });

    expect(result).toEqual({
      enrollmentCode: RAW_CODE,
      enrollmentId: 'enrollment-001',
      environment: 'prd',
      programType: 'management_program',
      capabilityProfile: 'standard',
      expiresAt: new Date(NOW.getTime() + 10 * 60 * 1000),
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.tx.deviceEnrollment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { invalidatedAt: NOW },
        where: expect.objectContaining({
          environment: 'prd',
          programType: 'management_program',
          capabilityProfile: 'standard',
          consumedAt: null,
          invalidatedAt: null,
          expiresAt: { gt: NOW },
        }),
      })
    );
    expect(prisma.tx.deviceEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          environment: 'prd',
          programType: 'management_program',
          capabilityProfile: 'standard',
          approvalPolicy: 'pending_approval',
          actorHash: ACTOR_HASH,
          expiresAt: new Date(NOW.getTime() + 10 * 60 * 1000),
        }),
      })
    );

    const persistedArguments = JSON.stringify([
      prisma.tx.deviceEnrollment.updateMany.mock.calls,
      prisma.tx.deviceEnrollment.create.mock.calls,
    ]);
    expect(persistedArguments).not.toContain(RAW_CODE);
    expect(persistedArguments).not.toContain(EXPECTED_DISPLAY_NAME);
  });

  it('retries a serialization conflict with the same generated enrollment code', async () => {
    const module = loadServiceModule();
    const DeviceEnrollmentService = module.DeviceEnrollmentService;

    expect(typeof DeviceEnrollmentService).toBe('function');
    if (typeof DeviceEnrollmentService !== 'function') {
      return;
    }

    const prisma = makePrisma();
    let transactionAttempt = 0;
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof prisma.tx) => Promise<unknown>) => {
        transactionAttempt += 1;
        if (transactionAttempt === 1) {
          throw { code: 'P2034' };
        }

        return callback(prisma.tx);
      }
    );
    const randomBytes = jest.fn((size: number) => Buffer.alloc(size, 7));
    const service = new (DeviceEnrollmentService as new (
      prisma: unknown,
      config: ReturnType<typeof makeConfig>,
      options: {
        readonly now: () => Date;
        readonly randomBytes: (size: number) => Buffer;
        readonly preparedCredentialTtlMs: number;
        readonly activeCredentialTtlMs: number;
        readonly auditLogTtlMs: number;
      }
    ) => {
      createEnrollmentCode(input: unknown): Promise<unknown>;
    })(prisma, makeConfig(), {
      now: () => NOW,
      randomBytes,
      preparedCredentialTtlMs: 15 * 60 * 1000,
      activeCredentialTtlMs: ACTIVE_CREDENTIAL_TTL_MS,
      auditLogTtlMs: 24 * 60 * 60 * 1000,
    });

    await expect(
      service.createEnrollmentCode({
        programType: 'management_program',
        capabilityProfile: 'standard',
        expectedDisplayName: EXPECTED_DISPLAY_NAME,
        actorHash: ACTOR_HASH,
      })
    ).resolves.toMatchObject({ enrollmentCode: RAW_CODE });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(randomBytes).toHaveBeenCalledTimes(1);
    expect(prisma.tx.deviceEnrollment.create).toHaveBeenCalledTimes(1);
  });

  it('re-evaluates enrollment-code expiry on a transaction retry and returns the persisted expiry', async () => {
    const prisma = makePrisma();
    let transactionAttempt = 0;
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof prisma.tx) => Promise<unknown>) => {
        const result = await callback(prisma.tx);
        transactionAttempt += 1;
        if (transactionAttempt === 1) {
          throw { code: 'P2034' };
        }

        return result;
      }
    );
    const now = jest.fn<Date, []>().mockReturnValueOnce(NOW).mockReturnValueOnce(RETRY_NOW);
    const randomBytes = jest.fn((size: number) => Buffer.alloc(size, 7));
    const service = createServiceUnderTest(prisma, makeConfig(), { now, randomBytes });

    await expect(
      service.createEnrollmentCode({
        programType: 'management_program',
        capabilityProfile: 'standard',
        expectedDisplayName: EXPECTED_DISPLAY_NAME,
        actorHash: ACTOR_HASH,
      })
    ).resolves.toMatchObject({
      enrollmentCode: RAW_CODE,
      expiresAt: new Date(RETRY_NOW.getTime() + 10 * 60 * 1000),
    });
    expect(randomBytes).toHaveBeenCalledTimes(1);
    expect(prisma.tx.deviceEnrollment.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { invalidatedAt: RETRY_NOW },
        where: expect.objectContaining({ expiresAt: { gt: RETRY_NOW } }),
      })
    );
    expect(prisma.tx.deviceEnrollment.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expiresAt: new Date(RETRY_NOW.getTime() + 10 * 60 * 1000),
        }),
      })
    );
  });

  it('replaces a rare enrollment-code hash collision with a fresh generated code', async () => {
    const module = loadServiceModule();
    const DeviceEnrollmentService = module.DeviceEnrollmentService;

    expect(typeof DeviceEnrollmentService).toBe('function');
    if (typeof DeviceEnrollmentService !== 'function') {
      return;
    }

    const prisma = makePrisma();
    prisma.tx.deviceEnrollment.create
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockResolvedValueOnce({ id: 'enrollment-002' });
    const firstCode = Buffer.alloc(32, 7).toString('base64url');
    const secondCode = Buffer.alloc(32, 8).toString('base64url');
    const randomBytes = jest
      .fn<Buffer, [number]>()
      .mockReturnValueOnce(Buffer.alloc(32, 7))
      .mockReturnValueOnce(Buffer.alloc(32, 8));
    const service = new (DeviceEnrollmentService as new (
      prisma: unknown,
      config: ReturnType<typeof makeConfig>,
      options: {
        readonly now: () => Date;
        readonly randomBytes: (size: number) => Buffer;
        readonly preparedCredentialTtlMs: number;
        readonly activeCredentialTtlMs: number;
        readonly auditLogTtlMs: number;
      }
    ) => {
      createEnrollmentCode(input: unknown): Promise<unknown>;
    })(prisma, makeConfig(), {
      now: () => NOW,
      randomBytes,
      preparedCredentialTtlMs: 15 * 60 * 1000,
      activeCredentialTtlMs: ACTIVE_CREDENTIAL_TTL_MS,
      auditLogTtlMs: 24 * 60 * 60 * 1000,
    });

    await expect(
      service.createEnrollmentCode({
        programType: 'management_program',
        capabilityProfile: 'standard',
        expectedDisplayName: EXPECTED_DISPLAY_NAME,
        actorHash: ACTOR_HASH,
      })
    ).resolves.toMatchObject({
      enrollmentCode: secondCode,
      enrollmentId: 'enrollment-002',
    });

    expect(randomBytes).toHaveBeenCalledTimes(2);
    expect(prisma.tx.deviceEnrollment.create).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(prisma.tx.deviceEnrollment.create.mock.calls)).not.toContain(firstCode);
    expect(JSON.stringify(prisma.tx.deviceEnrollment.create.mock.calls)).not.toContain(secondCode);
  });

  it('fails closed when its injected enrollment-code source is not exactly 32 bytes', async () => {
    const prisma = makePrisma();
    const service = createServiceUnderTest(prisma, makeConfig(), {
      randomBytes: () => Buffer.alloc(64, 7),
    });

    await expect(
      service.createEnrollmentCode({
        programType: 'management_program',
        capabilityProfile: 'standard',
        expectedDisplayName: EXPECTED_DISPLAY_NAME,
        actorHash: ACTOR_HASH,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ENROLLMENT_UNAVAILABLE' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects short, noncanonical, or obviously repeated client proofs before lookup', async () => {
    const prisma = {
      deviceEnrollment: {
        findFirst: jest.fn(),
      },
    };
    const service = createServiceUnderTest(prisma);
    const invalidInputs = [
      { enrollmentAttemptId: 'x', refreshCredential: REFRESH_CREDENTIAL },
      { enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID, refreshCredential: 'x' },
      { enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID, refreshCredential: 'A'.repeat(43) },
      {
        enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
        refreshCredential: Buffer.alloc(64, 15).toString('base64url'),
      },
    ];

    for (const input of invalidInputs) {
      await expect(
        service.enroll({
          enrollmentCode: ENROLLMENT_CODE,
          enrollmentAttemptId: input.enrollmentAttemptId,
          displayName: EXPECTED_DISPLAY_NAME,
          refreshCredential: input.refreshCredential,
        })
      ).rejects.toMatchObject({ code: 'DEVICE_ENROLLMENT_INVALID' });
    }
    expect(prisma.deviceEnrollment.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'enrollment code',
      enrollmentCode: 'AB'.repeat(5_000),
      enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
      refreshCredential: REFRESH_CREDENTIAL,
    },
    {
      label: 'enrollment attempt',
      enrollmentCode: ENROLLMENT_CODE,
      enrollmentAttemptId: 'AB'.repeat(5_000),
      refreshCredential: REFRESH_CREDENTIAL,
    },
    {
      label: 'refresh credential',
      enrollmentCode: ENROLLMENT_CODE,
      enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
      refreshCredential: 'AB'.repeat(5_000),
    },
  ])(
    'rejects oversized $label before base64 decoding or lookup',
    async ({ label: _label, ...input }) => {
      const prisma = {
        deviceEnrollment: {
          findFirst: jest.fn(),
        },
      };
      const oversizedValue = Object.values(input).find(
        (value) => typeof value === 'string' && value.length === 10_000
      );
      const bufferFrom = jest.spyOn(Buffer, 'from');
      const service = createServiceUnderTest(prisma);

      try {
        await expect(
          service.enroll({
            ...input,
            displayName: EXPECTED_DISPLAY_NAME,
          })
        ).rejects.toMatchObject({ code: 'DEVICE_ENROLLMENT_INVALID' });
        expect(bufferFrom).not.toHaveBeenCalledWith(oversizedValue, 'base64url');
        expect(prisma.deviceEnrollment.findFirst).not.toHaveBeenCalled();
      } finally {
        bufferFrom.mockRestore();
      }
    }
  );

  it.each([
    {
      label: 'enrollment code and refresh credential',
      enrollmentCode: ENROLLMENT_CODE,
      enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
      refreshCredential: ENROLLMENT_CODE,
    },
    {
      label: 'enrollment attempt and refresh credential',
      enrollmentCode: ENROLLMENT_CODE,
      enrollmentAttemptId: REFRESH_CREDENTIAL,
      refreshCredential: REFRESH_CREDENTIAL,
    },
    {
      label: 'enrollment code and attempt',
      enrollmentCode: ENROLLMENT_CODE,
      enrollmentAttemptId: ENROLLMENT_CODE,
      refreshCredential: REFRESH_CREDENTIAL,
    },
  ])('rejects cross-purpose reuse of $label before lookup', async ({ label: _label, ...input }) => {
    const prisma = {
      deviceEnrollment: {
        findFirst: jest.fn(),
      },
    };
    const service = createServiceUnderTest(prisma);

    await expect(
      service.enroll({
        ...input,
        displayName: EXPECTED_DISPLAY_NAME,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ENROLLMENT_INVALID' });
    expect(prisma.deviceEnrollment.findFirst).not.toHaveBeenCalled();
  });

  it('rejects owner, host, and metadata fields instead of silently collecting them', async () => {
    const codePrisma = makePrisma();
    const codeService = createServiceUnderTest(codePrisma);

    await expect(
      codeService.createEnrollmentCode({
        programType: 'management_program',
        capabilityProfile: 'standard',
        expectedDisplayName: EXPECTED_DISPLAY_NAME,
        actorHash: ACTOR_HASH,
        ownerReference: 'not-collected',
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ENROLLMENT_INVALID' });
    expect(codePrisma.$transaction).not.toHaveBeenCalled();

    const config = makeConfig();
    const storedCodeHash = hashDeviceCredential(config, ENROLLMENT_CODE);
    const storedDisplayNameHash = hashDeviceCredential(config, EXPECTED_DISPLAY_NAME);
    const enrollmentPrisma = makeEnrollmentPrisma({
      id: 'enrollment-001',
      environment: 'prd',
      programType: 'management_program',
      capabilityProfile: 'standard',
      enrollmentCodeHash: storedCodeHash.credentialHash,
      hashKeyVersion: storedCodeHash.hashKeyVersion,
      expectedDisplayNameHash: storedDisplayNameHash.credentialHash,
    });
    const enrollmentService = createServiceUnderTest(enrollmentPrisma, config);

    await expect(
      enrollmentService.enroll({
        enrollmentCode: ENROLLMENT_CODE,
        enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
        displayName: EXPECTED_DISPLAY_NAME,
        refreshCredential: REFRESH_CREDENTIAL,
        hostname: 'not-collected',
        metadata: { not: 'collected' },
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ENROLLMENT_INVALID' });
    expect(enrollmentPrisma.deviceEnrollment.findFirst).not.toHaveBeenCalled();
    expect(enrollmentPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts a ValidationPipe-style DTO instance while still using only its allowed own fields', async () => {
    class CreateEnrollmentCodeDto {
      public readonly programType = 'management_program';
      public readonly capabilityProfile = 'standard';
      public readonly expectedDisplayName = EXPECTED_DISPLAY_NAME;
      public readonly actorHash = ACTOR_HASH;
    }

    const prisma = makePrisma();
    const service = createServiceUnderTest(prisma);

    await expect(
      service.createEnrollmentCode(new CreateEnrollmentCodeDto())
    ).resolves.toMatchObject({
      enrollmentId: 'enrollment-001',
      environment: 'prd',
    });
  });

  it('requires the exact HMAC-SHA256 actor hash shape before writing enrollment state', async () => {
    const prisma = makePrisma();
    const service = createServiceUnderTest(prisma);

    await expect(
      service.createEnrollmentCode({
        programType: 'management_program',
        capabilityProfile: 'standard',
        expectedDisplayName: EXPECTED_DISPLAY_NAME,
        actorHash: 'b'.repeat(128),
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ENROLLMENT_INVALID' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a non-SemVer app version before looking up an enrollment', async () => {
    const prisma = {
      deviceEnrollment: {
        findFirst: jest.fn(),
      },
    };
    const service = createServiceUnderTest(prisma);

    await expect(
      service.enroll({
        enrollmentCode: ENROLLMENT_CODE,
        enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
        displayName: EXPECTED_DISPLAY_NAME,
        refreshCredential: REFRESH_CREDENTIAL,
        appVersion: 'hello',
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ENROLLMENT_INVALID' });
    expect(prisma.deviceEnrollment.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a SemVer app version longer than twenty characters before lookup', async () => {
    const prisma = {
      deviceEnrollment: {
        findFirst: jest.fn(),
      },
    };
    const service = createServiceUnderTest(prisma);

    await expect(
      service.enroll({
        enrollmentCode: ENROLLMENT_CODE,
        enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
        displayName: EXPECTED_DISPLAY_NAME,
        refreshCredential: REFRESH_CREDENTIAL,
        appVersion: `1.2.3+${'a'.repeat(15)}`,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ENROLLMENT_INVALID' });
    expect(prisma.deviceEnrollment.findFirst).not.toHaveBeenCalled();
  });

  it('consumes a retained-version code with an indexed OR lookup and atomically creates pending credentials', async () => {
    const module = loadServiceModule();
    const DeviceEnrollmentService = module.DeviceEnrollmentService;

    expect(typeof DeviceEnrollmentService).toBe('function');
    if (typeof DeviceEnrollmentService !== 'function') {
      return;
    }

    const v1Config = makeConfig(1);
    const storedEnrollmentCodeHash = hashDeviceCredential(v1Config, ENROLLMENT_CODE);
    const storedDisplayNameHash = hashDeviceCredential(v1Config, EXPECTED_DISPLAY_NAME);
    const prisma = makeEnrollmentPrisma({
      id: 'enrollment-001',
      environment: 'prd',
      programType: 'management_program',
      capabilityProfile: 'standard',
      enrollmentCodeHash: storedEnrollmentCodeHash.credentialHash,
      hashKeyVersion: storedEnrollmentCodeHash.hashKeyVersion,
      expectedDisplayNameHash: storedDisplayNameHash.credentialHash,
    });
    const service = new (DeviceEnrollmentService as new (
      prisma: unknown,
      config: ReturnType<typeof makeConfig>,
      options: {
        readonly now: () => Date;
        readonly randomBytes: (size: number) => Buffer;
        readonly preparedCredentialTtlMs: number;
        readonly activeCredentialTtlMs: number;
        readonly auditLogTtlMs: number;
        readonly randomId?: () => string;
      }
    ) => {
      enroll?(input: unknown): Promise<unknown>;
    })(prisma, makeConfig(), {
      now: () => NOW,
      randomBytes: (size) => Buffer.alloc(size, 7),
      preparedCredentialTtlMs: 15 * 60 * 1000,
      activeCredentialTtlMs: ACTIVE_CREDENTIAL_TTL_MS,
      auditLogTtlMs: 24 * 60 * 60 * 1000,
      randomId: () => 'device-001',
    });
    const enroll = service.enroll;

    expect(typeof enroll).toBe('function');
    if (typeof enroll !== 'function') {
      return;
    }

    const result = await enroll.call(service, {
      enrollmentCode: ENROLLMENT_CODE,
      enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
      displayName: EXPECTED_DISPLAY_NAME,
      refreshCredential: REFRESH_CREDENTIAL,
      appVersion: '1.2.3',
    });

    const currentEnrollmentCodeHash = hashDeviceCredential(makeConfig(), ENROLLMENT_CODE);
    const currentDisplayNameHash = hashDeviceCredential(makeConfig(), EXPECTED_DISPLAY_NAME);
    const currentAttemptHash = hashDeviceCredential(makeConfig(), ENROLLMENT_ATTEMPT_ID);
    const currentRefreshHash = hashDeviceCredential(makeConfig(), REFRESH_CREDENTIAL);

    expect(result).toEqual({
      deviceId: 'device-001',
      state: 'pending_approval',
      environment: 'prd',
      programType: 'management_program',
      capabilityProfile: 'standard',
      credentialVersion: 1,
    });
    expect(prisma.deviceEnrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          environment: 'prd',
          consumedAt: null,
          invalidatedAt: null,
          expiresAt: { gt: NOW },
          OR: [
            {
              hashKeyVersion: 1,
              enrollmentCodeHash: storedEnrollmentCodeHash.credentialHash,
            },
            {
              hashKeyVersion: 2,
              enrollmentCodeHash: currentEnrollmentCodeHash.credentialHash,
            },
          ],
        }),
      })
    );
    expect(prisma.tx.deviceEnrollment.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'enrollment-001',
          environment: 'prd',
          hashKeyVersion: 1,
          enrollmentCodeHash: storedEnrollmentCodeHash.credentialHash,
          consumedAt: null,
          invalidatedAt: null,
          expiresAt: { gt: NOW },
        }),
        data: expect.objectContaining({
          consumedAt: NOW,
          enrollmentCodeHash: currentEnrollmentCodeHash.credentialHash,
          expectedDisplayNameHash: currentDisplayNameHash.credentialHash,
          candidateCredentialHash: currentRefreshHash.credentialHash,
          consumedAttemptHash: currentAttemptHash.credentialHash,
          hashKeyVersion: 2,
        }),
      })
    );
    expect(prisma.tx.deviceEnrollment.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'enrollment-001',
          environment: 'prd',
          deviceId: null,
          consumedAt: NOW,
          invalidatedAt: null,
        }),
        data: { deviceId: 'device-001' },
      })
    );
    expect(prisma.tx.integrationDevice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'device-001',
          environment: 'prd',
          programType: 'management_program',
          capabilityProfile: 'standard',
          displayName: EXPECTED_DISPLAY_NAME,
          appVersion: '1.2.3',
          status: 'pending_approval',
          credentialVersion: 1,
        }),
      })
    );
    expect(prisma.tx.deviceRefreshCredential.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deviceId: 'device-001',
          credentialHash: currentRefreshHash.credentialHash,
          hashKeyVersion: 2,
          status: 'prepared',
          credentialVersion: 1,
          expiresAt: new Date(NOW.getTime() + 15 * 60 * 1000),
        }),
      })
    );
    expect(prisma.tx.deviceCredentialAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deviceId: 'device-001',
          enrollmentId: 'enrollment-001',
          refreshCredentialId: 'refresh-001',
          action: 'device_enrolled',
        }),
      })
    );

    const enrollmentAndAuditArguments = JSON.stringify([
      prisma.tx.deviceEnrollment.updateMany.mock.calls,
      prisma.tx.deviceCredentialAuditLog.create.mock.calls,
    ]);
    expect(enrollmentAndAuditArguments).not.toContain(ENROLLMENT_CODE);
    expect(enrollmentAndAuditArguments).not.toContain(ENROLLMENT_ATTEMPT_ID);
    expect(enrollmentAndAuditArguments).not.toContain(REFRESH_CREDENTIAL);
    expect(enrollmentAndAuditArguments).not.toContain(EXPECTED_DISPLAY_NAME);
  });

  it('re-evaluates enrollment expiry and credential TTL at the retry transaction time', async () => {
    const config = makeConfig();
    const storedCodeHash = hashDeviceCredential(config, ENROLLMENT_CODE);
    const storedDisplayNameHash = hashDeviceCredential(config, EXPECTED_DISPLAY_NAME);
    const prisma = makeEnrollmentPrisma({
      id: 'enrollment-001',
      environment: 'prd',
      programType: 'management_program',
      capabilityProfile: 'standard',
      enrollmentCodeHash: storedCodeHash.credentialHash,
      hashKeyVersion: storedCodeHash.hashKeyVersion,
      expectedDisplayNameHash: storedDisplayNameHash.credentialHash,
    });
    let transactionAttempt = 0;
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof prisma.tx) => Promise<unknown>) => {
        const result = await callback(prisma.tx);
        transactionAttempt += 1;
        if (transactionAttempt === 1) {
          throw { code: 'P2034' };
        }

        return result;
      }
    );
    const now = jest
      .fn<Date, []>()
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce(RETRY_NOW);
    const service = createServiceUnderTest(prisma, config, {
      now,
      randomId: () => 'device-001',
    });

    await expect(
      service.enroll({
        enrollmentCode: ENROLLMENT_CODE,
        enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
        displayName: EXPECTED_DISPLAY_NAME,
        refreshCredential: REFRESH_CREDENTIAL,
      })
    ).resolves.toMatchObject({ deviceId: 'device-001' });

    expect(prisma.tx.deviceEnrollment.updateMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({ expiresAt: { gt: RETRY_NOW } }),
        data: expect.objectContaining({ consumedAt: RETRY_NOW }),
      })
    );
    expect(prisma.tx.deviceRefreshCredential.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expiresAt: new Date(RETRY_NOW.getTime() + 15 * 60 * 1000),
        }),
      })
    );
    expect(prisma.tx.deviceCredentialAuditLog.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expiresAt: new Date(RETRY_NOW.getTime() + 24 * 60 * 60 * 1000),
        }),
      })
    );
  });

  it('normalizes an enrollment lookup failure to one safe unavailable code', async () => {
    const module = loadServiceModule();
    const DeviceEnrollmentService = module.DeviceEnrollmentService;

    expect(typeof DeviceEnrollmentService).toBe('function');
    if (typeof DeviceEnrollmentService !== 'function') {
      return;
    }

    const prisma = {
      deviceEnrollment: {
        findFirst: jest.fn().mockRejectedValue(new Error(ENROLLMENT_CODE)),
      },
    };
    const service = new (DeviceEnrollmentService as new (
      prisma: unknown,
      config: ReturnType<typeof makeConfig>,
      options: {
        readonly now: () => Date;
        readonly randomBytes: (size: number) => Buffer;
        readonly preparedCredentialTtlMs: number;
        readonly activeCredentialTtlMs: number;
        readonly auditLogTtlMs: number;
      }
    ) => {
      enroll(input: unknown): Promise<unknown>;
    })(prisma, makeConfig(), {
      now: () => NOW,
      randomBytes: (size) => Buffer.alloc(size, 7),
      preparedCredentialTtlMs: 15 * 60 * 1000,
      activeCredentialTtlMs: ACTIVE_CREDENTIAL_TTL_MS,
      auditLogTtlMs: 24 * 60 * 60 * 1000,
    });

    await expect(
      service.enroll({
        enrollmentCode: ENROLLMENT_CODE,
        enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
        displayName: EXPECTED_DISPLAY_NAME,
        refreshCredential: REFRESH_CREDENTIAL,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ENROLLMENT_UNAVAILABLE' });
    await service
      .enroll({
        enrollmentCode: ENROLLMENT_CODE,
        enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
        displayName: EXPECTED_DISPLAY_NAME,
        refreshCredential: REFRESH_CREDENTIAL,
      })
      .catch((error: unknown) => {
        expect(String(error)).not.toContain(ENROLLMENT_CODE);
        expect(JSON.stringify(error)).not.toContain(ENROLLMENT_CODE);
      });
  });

  it('returns pending status only to the matching retained-version attempt and refresh proof', async () => {
    const module = loadServiceModule();
    const DeviceEnrollmentService = module.DeviceEnrollmentService;

    expect(typeof DeviceEnrollmentService).toBe('function');
    if (typeof DeviceEnrollmentService !== 'function') {
      return;
    }

    const v1Config = makeConfig(1);
    const oldAttemptHash = hashDeviceCredential(v1Config, ENROLLMENT_ATTEMPT_ID);
    const oldRefreshHash = hashDeviceCredential(v1Config, REFRESH_CREDENTIAL);
    const prisma = makeStatusPrisma(
      {
        id: 'enrollment-001',
        hashKeyVersion: 1,
        consumedAttemptHash: oldAttemptHash.credentialHash,
        candidateCredentialHash: oldRefreshHash.credentialHash,
      },
      {
        id: 'refresh-001',
        deviceId: 'device-001',
        hashKeyVersion: 1,
        credentialHash: oldRefreshHash.credentialHash,
        status: 'prepared',
        credentialVersion: 1,
        device: {
          id: 'device-001',
          environment: 'prd',
          programType: 'management_program',
          capabilityProfile: 'standard',
          status: 'pending_approval',
          credentialVersion: 1,
        },
      }
    );
    const service = new (DeviceEnrollmentService as new (
      prisma: unknown,
      config: ReturnType<typeof makeConfig>,
      options: {
        readonly now: () => Date;
        readonly randomBytes: (size: number) => Buffer;
        readonly preparedCredentialTtlMs: number;
        readonly activeCredentialTtlMs: number;
        readonly auditLogTtlMs: number;
      }
    ) => {
      getEnrollmentStatus?(input: unknown): Promise<unknown>;
    })(prisma, makeConfig(), {
      now: () => NOW,
      randomBytes: (size) => Buffer.alloc(size, 7),
      preparedCredentialTtlMs: 15 * 60 * 1000,
      activeCredentialTtlMs: ACTIVE_CREDENTIAL_TTL_MS,
      auditLogTtlMs: 24 * 60 * 60 * 1000,
    });
    const getEnrollmentStatus = service.getEnrollmentStatus;

    expect(typeof getEnrollmentStatus).toBe('function');
    if (typeof getEnrollmentStatus !== 'function') {
      return;
    }

    const result = await getEnrollmentStatus.call(service, {
      enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
      refreshCredential: REFRESH_CREDENTIAL,
    });
    const currentAttemptHash = hashDeviceCredential(makeConfig(), ENROLLMENT_ATTEMPT_ID);
    const currentRefreshHash = hashDeviceCredential(makeConfig(), REFRESH_CREDENTIAL);

    expect(result).toEqual({
      deviceId: 'device-001',
      state: 'pending_approval',
      environment: 'prd',
      programType: 'management_program',
      capabilityProfile: 'standard',
      credentialVersion: 1,
    });
    expect(prisma.deviceRefreshCredential.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          device: { is: { environment: 'prd' } },
          OR: [
            {
              hashKeyVersion: 1,
              credentialHash: oldRefreshHash.credentialHash,
            },
            {
              hashKeyVersion: 2,
              credentialHash: currentRefreshHash.credentialHash,
            },
          ],
          AND: [
            {
              OR: [
                {
                  status: { in: ['prepared', 'active'] },
                  revokedAt: null,
                  expiresAt: { gt: NOW },
                },
                {
                  status: 'revoked',
                  revokedAt: { not: null },
                },
              ],
            },
          ],
        }),
      })
    );
    expect(prisma.deviceEnrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deviceId: 'device-001',
          environment: 'prd',
          consumedAt: { not: null },
          invalidatedAt: null,
          OR: [
            {
              hashKeyVersion: 1,
              consumedAttemptHash: oldAttemptHash.credentialHash,
            },
            {
              hashKeyVersion: 2,
              consumedAttemptHash: currentAttemptHash.credentialHash,
            },
          ],
        }),
      })
    );
    expect(JSON.stringify(result)).not.toContain(ENROLLMENT_ATTEMPT_ID);
    expect(JSON.stringify(result)).not.toContain(REFRESH_CREDENTIAL);
    expect(JSON.stringify(result)).not.toContain(EXPECTED_DISPLAY_NAME);
  });

  it('returns active after the prepared TTL when the approved credential remains within active TTL', async () => {
    const config = makeConfig();
    const storedAttemptHash = hashDeviceCredential(config, ENROLLMENT_ATTEMPT_ID);
    const storedRefreshHash = hashDeviceCredential(config, REFRESH_CREDENTIAL);
    const statusNow = new Date(NOW.getTime() + PREPARED_CREDENTIAL_TTL_MS + 1);
    const prisma = makeExpiryAwareStatusPrisma(
      {
        id: 'enrollment-001',
        hashKeyVersion: 2,
        consumedAttemptHash: storedAttemptHash.credentialHash,
        candidateCredentialHash: storedRefreshHash.credentialHash,
      },
      {
        id: 'refresh-001',
        deviceId: 'device-001',
        hashKeyVersion: 2,
        credentialHash: storedRefreshHash.credentialHash,
        status: 'active',
        credentialVersion: 1,
        revokedAt: null,
        expiresAt: new Date(NOW.getTime() + ACTIVE_CREDENTIAL_TTL_MS),
        device: {
          id: 'device-001',
          environment: 'prd',
          programType: 'management_program',
          capabilityProfile: 'standard',
          status: 'active',
          credentialVersion: 1,
          revokedAt: null,
        },
      }
    );
    const service = createServiceUnderTest(prisma, config, { now: () => statusNow });

    await expect(
      service.getEnrollmentStatus({
        enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
        refreshCredential: REFRESH_CREDENTIAL,
      })
    ).resolves.toEqual({
      deviceId: 'device-001',
      state: 'active',
      environment: 'prd',
      programType: 'management_program',
      capabilityProfile: 'standard',
      credentialVersion: 1,
    });
  });

  it('rejects an approved active credential after its active TTL expires', async () => {
    const config = makeConfig();
    const storedAttemptHash = hashDeviceCredential(config, ENROLLMENT_ATTEMPT_ID);
    const storedRefreshHash = hashDeviceCredential(config, REFRESH_CREDENTIAL);
    const statusNow = new Date(NOW.getTime() + ACTIVE_CREDENTIAL_TTL_MS + 1);
    const prisma = makeExpiryAwareStatusPrisma(
      {
        id: 'enrollment-001',
        hashKeyVersion: 2,
        consumedAttemptHash: storedAttemptHash.credentialHash,
        candidateCredentialHash: storedRefreshHash.credentialHash,
      },
      {
        id: 'refresh-001',
        deviceId: 'device-001',
        hashKeyVersion: 2,
        credentialHash: storedRefreshHash.credentialHash,
        status: 'active',
        credentialVersion: 1,
        revokedAt: null,
        expiresAt: new Date(NOW.getTime() + ACTIVE_CREDENTIAL_TTL_MS),
        device: {
          id: 'device-001',
          environment: 'prd',
          programType: 'management_program',
          capabilityProfile: 'standard',
          status: 'active',
          credentialVersion: 1,
          revokedAt: null,
        },
      }
    );
    const service = createServiceUnderTest(prisma, config, { now: () => statusNow });

    await expect(
      service.getEnrollmentStatus({
        enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
        refreshCredential: REFRESH_CREDENTIAL,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ENROLLMENT_INVALID' });
    expect(prisma.deviceEnrollment.findFirst).not.toHaveBeenCalled();
  });

  it('returns revoked after a credential-version bump only with both revoked proofs', async () => {
    const config = makeConfig();
    const storedAttemptHash = hashDeviceCredential(config, ENROLLMENT_ATTEMPT_ID);
    const storedRefreshHash = hashDeviceCredential(config, REFRESH_CREDENTIAL);
    const prisma = makeStatusPrisma(
      {
        id: 'enrollment-001',
        hashKeyVersion: 2,
        consumedAttemptHash: storedAttemptHash.credentialHash,
        candidateCredentialHash: storedRefreshHash.credentialHash,
      },
      {
        id: 'refresh-001',
        deviceId: 'device-001',
        hashKeyVersion: 2,
        credentialHash: storedRefreshHash.credentialHash,
        status: 'revoked',
        credentialVersion: 1,
        revokedAt: NOW,
        device: {
          id: 'device-001',
          environment: 'prd',
          programType: 'management_program',
          capabilityProfile: 'standard',
          status: 'revoked',
          credentialVersion: 2,
          revokedAt: NOW,
        },
      }
    );
    const service = createServiceUnderTest(prisma, config);

    await expect(
      service.getEnrollmentStatus({
        enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
        refreshCredential: REFRESH_CREDENTIAL,
      })
    ).resolves.toEqual({
      deviceId: 'device-001',
      state: 'revoked',
      environment: 'prd',
      programType: 'management_program',
      capabilityProfile: 'standard',
      credentialVersion: 2,
    });
  });

  it('rejects a status row unless the attempt proof itself verifies', async () => {
    const module = loadServiceModule();
    const DeviceEnrollmentService = module.DeviceEnrollmentService;

    expect(typeof DeviceEnrollmentService).toBe('function');
    if (typeof DeviceEnrollmentService !== 'function') {
      return;
    }

    const config = makeConfig();
    const storedAttemptHash = hashDeviceCredential(config, ENROLLMENT_ATTEMPT_ID);
    const storedRefreshHash = hashDeviceCredential(config, REFRESH_CREDENTIAL);
    const prisma = makeStatusPrisma(
      {
        id: 'enrollment-001',
        hashKeyVersion: 2,
        consumedAttemptHash: storedAttemptHash.credentialHash,
        candidateCredentialHash: storedRefreshHash.credentialHash,
      },
      {
        id: 'refresh-001',
        deviceId: 'device-001',
        hashKeyVersion: 2,
        credentialHash: storedRefreshHash.credentialHash,
        status: 'prepared',
        credentialVersion: 1,
        device: {
          id: 'device-001',
          environment: 'prd',
          programType: 'management_program',
          capabilityProfile: 'standard',
          status: 'pending_approval',
          credentialVersion: 1,
        },
      }
    );
    const service = new (DeviceEnrollmentService as new (
      prisma: unknown,
      config: ReturnType<typeof makeConfig>,
      options: {
        readonly now: () => Date;
        readonly randomBytes: (size: number) => Buffer;
        readonly preparedCredentialTtlMs: number;
        readonly activeCredentialTtlMs: number;
        readonly auditLogTtlMs: number;
      }
    ) => {
      getEnrollmentStatus(input: unknown): Promise<unknown>;
    })(prisma, config, {
      now: () => NOW,
      randomBytes: (size) => Buffer.alloc(size, 7),
      preparedCredentialTtlMs: 15 * 60 * 1000,
      activeCredentialTtlMs: ACTIVE_CREDENTIAL_TTL_MS,
      auditLogTtlMs: 24 * 60 * 60 * 1000,
    });

    await expect(
      service.getEnrollmentStatus({
        enrollmentAttemptId: DIFFERENT_ENROLLMENT_ATTEMPT_ID,
        refreshCredential: REFRESH_CREDENTIAL,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ENROLLMENT_INVALID' });
  });

  it.each([
    {
      label: 'code',
      enrollmentCode: DIFFERENT_ENROLLMENT_CODE,
      displayName: EXPECTED_DISPLAY_NAME,
    },
    {
      label: 'display name',
      enrollmentCode: ENROLLMENT_CODE,
      displayName: 'different-display-name',
    },
  ])('rejects a mismatched $label before starting an enrollment transaction', async (input) => {
    const config = makeConfig();
    const storedCodeHash = hashDeviceCredential(config, ENROLLMENT_CODE);
    const storedDisplayNameHash = hashDeviceCredential(config, EXPECTED_DISPLAY_NAME);
    const prisma = makeEnrollmentPrisma({
      id: 'enrollment-001',
      environment: 'prd',
      programType: 'management_program',
      capabilityProfile: 'standard',
      enrollmentCodeHash: storedCodeHash.credentialHash,
      hashKeyVersion: storedCodeHash.hashKeyVersion,
      expectedDisplayNameHash: storedDisplayNameHash.credentialHash,
    });
    const service = createServiceUnderTest(prisma, config, { randomId: () => 'device-001' });

    await expect(
      service.enroll({
        enrollmentCode: input.enrollmentCode,
        enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
        displayName: input.displayName,
        refreshCredential: REFRESH_CREDENTIAL,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ENROLLMENT_INVALID' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.tx.integrationDevice.create).not.toHaveBeenCalled();
    expect(prisma.tx.deviceRefreshCredential.create).not.toHaveBeenCalled();
  });

  it('rejects a wrong refresh proof without echoing it from enrollment status', async () => {
    const config = makeConfig();
    const storedAttemptHash = hashDeviceCredential(config, ENROLLMENT_ATTEMPT_ID);
    const storedRefreshHash = hashDeviceCredential(config, REFRESH_CREDENTIAL);
    const prisma = makeStatusPrisma(
      {
        hashKeyVersion: 2,
        consumedAttemptHash: storedAttemptHash.credentialHash,
        candidateCredentialHash: storedRefreshHash.credentialHash,
      },
      {
        id: 'refresh-001',
        deviceId: 'device-001',
        hashKeyVersion: 2,
        credentialHash: storedRefreshHash.credentialHash,
        status: 'prepared',
        credentialVersion: 1,
        device: {
          id: 'device-001',
          environment: 'prd',
          programType: 'management_program',
          capabilityProfile: 'standard',
          status: 'pending_approval',
          credentialVersion: 1,
        },
      }
    );
    const service = createServiceUnderTest(prisma, config);
    const wrongRefreshCredential = DIFFERENT_REFRESH_CREDENTIAL;

    await expect(
      service.getEnrollmentStatus({
        enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
        refreshCredential: wrongRefreshCredential,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ENROLLMENT_INVALID' });
    await service
      .getEnrollmentStatus({
        enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
        refreshCredential: wrongRefreshCredential,
      })
      .catch((error: unknown) => {
        expect(String(error)).not.toContain(wrongRefreshCredential);
        expect(JSON.stringify(error)).not.toContain(wrongRefreshCredential);
      });
  });

  it('returns one invalid code on a concurrent enrollment CAS miss without creating an orphan device', async () => {
    const config = makeConfig();
    const storedCodeHash = hashDeviceCredential(config, ENROLLMENT_CODE);
    const storedDisplayNameHash = hashDeviceCredential(config, EXPECTED_DISPLAY_NAME);
    const prisma = makeEnrollmentPrisma({
      id: 'enrollment-001',
      environment: 'prd',
      programType: 'management_program',
      capabilityProfile: 'standard',
      enrollmentCodeHash: storedCodeHash.credentialHash,
      hashKeyVersion: storedCodeHash.hashKeyVersion,
      expectedDisplayNameHash: storedDisplayNameHash.credentialHash,
    });
    prisma.tx.deviceEnrollment.updateMany.mockResolvedValueOnce({ count: 0 });
    const service = createServiceUnderTest(prisma, config, { randomId: () => 'device-001' });

    await expect(
      service.enroll({
        enrollmentCode: ENROLLMENT_CODE,
        enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
        displayName: EXPECTED_DISPLAY_NAME,
        refreshCredential: REFRESH_CREDENTIAL,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ENROLLMENT_INVALID' });
    expect(prisma.tx.integrationDevice.create).not.toHaveBeenCalled();
    expect(prisma.tx.deviceRefreshCredential.create).not.toHaveBeenCalled();
    expect(prisma.tx.deviceCredentialAuditLog.create).not.toHaveBeenCalled();
  });

  it('keeps safe-canary enrollment pending and returns no access token or permission set', async () => {
    const config = makeConfig();
    const storedCodeHash = hashDeviceCredential(config, ENROLLMENT_CODE);
    const storedDisplayNameHash = hashDeviceCredential(config, EXPECTED_DISPLAY_NAME);
    const prisma = makeEnrollmentPrisma({
      id: 'enrollment-001',
      environment: 'prd',
      programType: 'management_program',
      capabilityProfile: 'safe_canary',
      enrollmentCodeHash: storedCodeHash.credentialHash,
      hashKeyVersion: storedCodeHash.hashKeyVersion,
      expectedDisplayNameHash: storedDisplayNameHash.credentialHash,
    });
    const service = createServiceUnderTest(prisma, config, { randomId: () => 'device-001' });

    const result = await service.enroll({
      enrollmentCode: ENROLLMENT_CODE,
      enrollmentAttemptId: ENROLLMENT_ATTEMPT_ID,
      displayName: EXPECTED_DISPLAY_NAME,
      refreshCredential: REFRESH_CREDENTIAL,
    });

    expect(result).toEqual({
      deviceId: 'device-001',
      state: 'pending_approval',
      environment: 'prd',
      programType: 'management_program',
      capabilityProfile: 'safe_canary',
      credentialVersion: 1,
    });
    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('permissions');
  });

  it('atomically approves one pending device and its prepared credential', async () => {
    const module = loadServiceModule();
    const DeviceEnrollmentService = module.DeviceEnrollmentService;

    expect(typeof DeviceEnrollmentService).toBe('function');
    if (typeof DeviceEnrollmentService !== 'function') {
      return;
    }

    const prisma = makeApprovalPrisma();
    const service = new (DeviceEnrollmentService as new (
      prisma: unknown,
      config: ReturnType<typeof makeConfig>,
      options: {
        readonly now: () => Date;
        readonly randomBytes: (size: number) => Buffer;
        readonly preparedCredentialTtlMs: number;
        readonly activeCredentialTtlMs: number;
        readonly auditLogTtlMs: number;
      }
    ) => {
      approveEnrollment?(input: unknown): Promise<unknown>;
    })(prisma, makeConfig(), {
      now: () => NOW,
      randomBytes: (size) => Buffer.alloc(size, 7),
      preparedCredentialTtlMs: 15 * 60 * 1000,
      activeCredentialTtlMs: ACTIVE_CREDENTIAL_TTL_MS,
      auditLogTtlMs: 24 * 60 * 60 * 1000,
    });
    const approveEnrollment = service.approveEnrollment;

    expect(typeof approveEnrollment).toBe('function');
    if (typeof approveEnrollment !== 'function') {
      return;
    }

    const result = await approveEnrollment.call(service, {
      deviceId: 'device-001',
      actorHash: ACTOR_HASH,
    });

    expect(result).toEqual({
      deviceId: 'device-001',
      state: 'active',
      environment: 'prd',
      programType: 'management_program',
      capabilityProfile: 'standard',
      credentialVersion: 1,
    });
    expect(prisma.tx.integrationDevice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'device-001',
          environment: 'prd',
          status: 'pending_approval',
          approvedAt: null,
          revokedAt: null,
        },
      })
    );
    expect(prisma.tx.deviceRefreshCredential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deviceId: 'device-001',
          status: 'prepared',
          credentialVersion: 1,
          revokedAt: null,
          expiresAt: { gt: NOW },
        },
        take: 2,
      })
    );
    expect(prisma.tx.integrationDevice.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'device-001',
        environment: 'prd',
        status: 'pending_approval',
        credentialVersion: 1,
        approvedAt: null,
        revokedAt: null,
      },
      data: {
        status: 'active',
        approvedAt: NOW,
        approvedByActorHash: ACTOR_HASH,
      },
    });
    expect(prisma.tx.deviceRefreshCredential.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'refresh-001',
        deviceId: 'device-001',
        status: 'prepared',
        credentialVersion: 1,
        revokedAt: null,
        expiresAt: { gt: NOW },
      },
      data: {
        status: 'active',
        actorHash: ACTOR_HASH,
        expiresAt: new Date(NOW.getTime() + ACTIVE_CREDENTIAL_TTL_MS),
      },
    });
    expect(prisma.tx.deviceCredentialAuditLog.create).toHaveBeenCalledWith({
      data: {
        deviceId: 'device-001',
        refreshCredentialId: 'refresh-001',
        action: 'device_enrollment_approved',
        actorHash: ACTOR_HASH,
        expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
      },
    });
  });

  it('re-evaluates active credential expiry and audit time on an approval retry', async () => {
    const prisma = makeApprovalPrisma();
    let transactionAttempt = 0;
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof prisma.tx) => Promise<unknown>) => {
        const result = await callback(prisma.tx);
        transactionAttempt += 1;
        if (transactionAttempt === 1) {
          throw { code: 'P2034' };
        }

        return result;
      }
    );
    const now = jest.fn<Date, []>().mockReturnValueOnce(NOW).mockReturnValueOnce(RETRY_NOW);
    const service = createServiceUnderTest(prisma, makeConfig(), { now });

    await expect(
      service.approveEnrollment({
        deviceId: 'device-001',
        actorHash: ACTOR_HASH,
      })
    ).resolves.toMatchObject({ state: 'active' });

    expect(prisma.tx.integrationDevice.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approvedAt: RETRY_NOW }),
      })
    );
    expect(prisma.tx.deviceRefreshCredential.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ expiresAt: { gt: RETRY_NOW } }),
        data: expect.objectContaining({
          expiresAt: new Date(RETRY_NOW.getTime() + ACTIVE_CREDENTIAL_TTL_MS),
        }),
      })
    );
    expect(prisma.tx.deviceCredentialAuditLog.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expiresAt: new Date(RETRY_NOW.getTime() + 24 * 60 * 60 * 1000),
        }),
      })
    );
  });

  it('reports a double-approve CAS miss as a fixed conflict without activating a credential', async () => {
    const prisma = makeApprovalPrisma();
    prisma.tx.integrationDevice.updateMany.mockResolvedValueOnce({ count: 0 });
    const service = createServiceUnderTest(prisma);

    await expect(
      service.approveEnrollment({
        deviceId: 'device-001',
        actorHash: ACTOR_HASH,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ENROLLMENT_CONFLICT' });
    expect(prisma.tx.deviceRefreshCredential.updateMany).not.toHaveBeenCalled();
    expect(prisma.tx.deviceCredentialAuditLog.create).not.toHaveBeenCalled();
  });

  it('rejects before audit when prepared credential activation loses its CAS race', async () => {
    const prisma = makeApprovalPrisma();
    const transactionCallbackErrors: unknown[] = [];
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof prisma.tx) => Promise<unknown>) => {
        try {
          return await callback(prisma.tx);
        } catch (error) {
          transactionCallbackErrors.push(error);
          throw error;
        }
      }
    );
    prisma.tx.deviceRefreshCredential.updateMany.mockResolvedValueOnce({ count: 0 });
    const service = createServiceUnderTest(prisma);

    await expect(
      service.approveEnrollment({
        deviceId: 'device-001',
        actorHash: ACTOR_HASH,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ENROLLMENT_CONFLICT' });

    expect(prisma.tx.integrationDevice.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.tx.deviceRefreshCredential.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.tx.deviceCredentialAuditLog.create).not.toHaveBeenCalled();
    expect(transactionCallbackErrors).toHaveLength(1);
    expect(transactionCallbackErrors[0]).toMatchObject({ code: 'DEVICE_ENROLLMENT_CONFLICT' });
  });
});
