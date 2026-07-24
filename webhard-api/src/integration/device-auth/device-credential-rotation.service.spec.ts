import { Prisma } from '@prisma/client';
import { loadDeviceAuthConfig } from './device-auth.config';
import { hashDeviceCredential } from './device-credential-hash';
import * as deviceCredentialRotationServiceModule from './device-credential-rotation.service';

const NOW = new Date('2026-07-20T01:00:00.000Z');
const DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const ROTATION_ID = '22222222-2222-4222-8222-222222222222';
const PREDECESSOR_ID = '33333333-3333-4333-8333-333333333333';
const CANDIDATE_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_HASH = 'a'.repeat(64);
const DEADLINE = new Date('2026-07-20T01:15:00.000Z');
const AUDIT_EXPIRY = new Date('2026-08-19T01:00:00.000Z');
const REFRESH_CREDENTIAL = Buffer.alloc(32, 7).toString('base64url');
const CANDIDATE_CREDENTIAL = Buffer.alloc(32, 8).toString('base64url');
const PRINCIPAL = {
  deviceId: DEVICE_ID,
  environment: 'dev',
  programType: 'nesting_program',
  capabilityProfile: 'standard',
  permissions: ['event/write'],
  credentialVersion: 7,
} as const;

interface RotationServiceLike {
  prepare(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  ack(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  requestRotation(input: {
    readonly deviceId: string;
    readonly actorHash: string;
    readonly now: Date;
  }): Promise<Record<string, unknown>>;
  getRotation(input: {
    readonly deviceId: string;
    readonly rotationId: string;
    readonly now: Date;
  }): Promise<Record<string, unknown>>;
  cancelRotation(input: {
    readonly deviceId: string;
    readonly rotationId: string;
    readonly actorHash: string;
    readonly now: Date;
  }): Promise<Record<string, unknown>>;
}

function device(overrides: Record<string, unknown> = {}) {
  return {
    id: DEVICE_ID,
    environment: 'dev',
    status: 'active',
    capabilityProfile: 'standard',
    credentialVersion: 7,
    revokedAt: null,
    ...overrides,
  };
}

function predecessor(overrides: Record<string, unknown> = {}) {
  return {
    id: PREDECESSOR_ID,
    deviceId: DEVICE_ID,
    status: 'active',
    credentialVersion: 7,
    expiresAt: new Date('2026-08-19T01:00:00.000Z'),
    revokedAt: null,
    ...overrides,
  };
}

function rotation(overrides: Record<string, unknown> = {}) {
  return {
    id: ROTATION_ID,
    deviceId: DEVICE_ID,
    status: 'requested',
    deadlineAt: DEADLINE,
    baseCredentialVersion: 7,
    predecessorCredentialId: PREDECESSOR_ID,
    candidateCredentialId: null,
    ...overrides,
  };
}

function makePrisma() {
  const config = loadDeviceAuthConfig({
    environment: 'dev',
    environments: {
      dev: {
        currentHashKeyVersion: 1,
        credentialPepperKeyring: { '1': 'synthetic-rotation-pepper-0123456789' },
      },
    },
  });
  const predecessorHash = hashDeviceCredential(config, REFRESH_CREDENTIAL);
  const transaction = {
    integrationDevice: {
      findFirst: jest.fn().mockResolvedValue(device()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    deviceRefreshCredential: {
      findFirst: jest.fn().mockResolvedValue({
        ...predecessor(),
        ...predecessorHash,
      }),
      create: jest.fn().mockResolvedValue({ id: CANDIDATE_ID }),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    deviceCredentialRotation: {
      findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValue(rotation()),
      create: jest.fn().mockResolvedValue(rotation()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    deviceCredentialAuditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-safe-id' }),
    },
    deviceTokenExchange: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return {
    transaction,
    $transaction: jest.fn(
      async (callback: (client: typeof transaction) => Promise<Record<string, unknown>>) =>
        callback(transaction)
    ),
  };
}

function createService(
  prisma: ReturnType<typeof makePrisma>,
  accessTokenService: { readonly issue: jest.Mock } = {
    issue: jest.fn().mockResolvedValue('rotation-access-token'),
  }
): RotationServiceLike {
  const Service = deviceCredentialRotationServiceModule.DeviceCredentialRotationService;
  if (typeof Service !== 'function') {
    throw new Error('DeviceCredentialRotationService is not implemented');
  }

  return new Service(
    prisma as unknown as ConstructorParameters<typeof Service>[0],
    loadDeviceAuthConfig({
      environment: 'dev',
      environments: {
        dev: {
          currentHashKeyVersion: 1,
          credentialPepperKeyring: { '1': 'synthetic-rotation-pepper-0123456789' },
        },
      },
    }),
    {
      rotationDeadlineSeconds: 900,
      rotationAckRecoverySeconds: 120,
      rotationRuntimeEnabled: true,
    },
    {
      auditLogTtlMs: 30 * 24 * 60 * 60 * 1000,
      activeCredentialTtlMs: 30 * 24 * 60 * 60 * 1000,
    },
    accessTokenService
  ) as unknown as RotationServiceLike;
}

function expectRotationCode(error: unknown, code: string): void {
  expect(error).toEqual(expect.objectContaining({ code }));
}

describe('DeviceCredentialRotationService admin lifecycle', () => {
  it('exposes the bearer prepare transition', () => {
    const service = createService(makePrisma());
    expect(typeof (service as unknown as { readonly prepare?: unknown }).prepare).toBe('function');
  });

  it('exposes the bearer ACK transition', () => {
    const service = createService(makePrisma());
    expect(typeof service.ack).toBe('function');
  });

  it('persists the candidate before returning prepared and is idempotent for the same proof', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.findFirst = jest
      .fn()
      .mockResolvedValueOnce(rotation())
      .mockResolvedValueOnce(rotation({ status: 'prepared', candidateCredentialId: CANDIDATE_ID }));
    const candidateHash = hashDeviceCredential(
      loadDeviceAuthConfig({
        environment: 'dev',
        environments: {
          dev: {
            currentHashKeyVersion: 1,
            credentialPepperKeyring: { '1': 'synthetic-rotation-pepper-0123456789' },
          },
        },
      }),
      CANDIDATE_CREDENTIAL
    );
    prisma.transaction.deviceRefreshCredential.findFirst
      .mockResolvedValueOnce({
        ...predecessor(),
        ...hashDeviceCredential(
          loadDeviceAuthConfig({
            environment: 'dev',
            environments: {
              dev: {
                currentHashKeyVersion: 1,
                credentialPepperKeyring: { '1': 'synthetic-rotation-pepper-0123456789' },
              },
            },
          }),
          REFRESH_CREDENTIAL
        ),
      })
      .mockResolvedValueOnce({
        ...predecessor(),
        ...hashDeviceCredential(
          loadDeviceAuthConfig({
            environment: 'dev',
            environments: {
              dev: {
                currentHashKeyVersion: 1,
                credentialPepperKeyring: { '1': 'synthetic-rotation-pepper-0123456789' },
              },
            },
          }),
          REFRESH_CREDENTIAL
        ),
      })
      .mockResolvedValueOnce({
        id: CANDIDATE_ID,
        deviceId: DEVICE_ID,
        status: 'prepared',
        credentialVersion: 8,
        revokedAt: null,
        expiresAt: AUDIT_EXPIRY,
        ...candidateHash,
      });
    const service = createService(prisma);
    const input = {
      principal: PRINCIPAL,
      rotationId: ROTATION_ID,
      refreshCredential: REFRESH_CREDENTIAL,
      candidateCredential: CANDIDATE_CREDENTIAL,
      now: NOW,
    };

    await expect(service.prepare(input)).resolves.toEqual({
      status: 'prepared',
      rotationId: ROTATION_ID,
      deadlineAt: DEADLINE.toISOString(),
    });
    await expect(service.prepare(input)).resolves.toEqual({
      status: 'prepared',
      rotationId: ROTATION_ID,
      deadlineAt: DEADLINE.toISOString(),
    });
    expect(prisma.transaction.deviceRefreshCredential.create).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.deviceCredentialAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['before', new Date('2026-07-20T01:01:59.999Z'), true],
    ['equal', new Date('2026-07-20T01:02:00.000Z'), true],
    ['after', new Date('2026-07-20T01:02:00.001Z'), false],
  ])(
    'ACK response-loss recovery is allowed %s the inclusive recovery boundary',
    async (_label, retryAt, allowed) => {
      const prisma = makePrisma();
      const candidateHash = hashDeviceCredential(
        loadDeviceAuthConfig({
          environment: 'dev',
          environments: {
            dev: {
              currentHashKeyVersion: 1,
              credentialPepperKeyring: { '1': 'synthetic-rotation-pepper-0123456789' },
            },
          },
        }),
        CANDIDATE_CREDENTIAL
      );
      prisma.transaction.deviceCredentialRotation.findFirst = jest.fn().mockResolvedValue(
        rotation({
          status: 'acknowledged',
          candidateCredentialId: CANDIDATE_ID,
          acknowledgedAt: NOW,
        })
      );
      prisma.transaction.deviceRefreshCredential.findFirst.mockResolvedValue({
        id: CANDIDATE_ID,
        deviceId: DEVICE_ID,
        status: 'active',
        credentialVersion: 8,
        revokedAt: null,
        expiresAt: AUDIT_EXPIRY,
        ...candidateHash,
      });
      prisma.transaction.integrationDevice.findFirst.mockResolvedValue(
        device({ credentialVersion: 8, programType: 'nesting_program' })
      );
      const action = createService(prisma).ack({
        principal: PRINCIPAL,
        rotationId: ROTATION_ID,
        candidateCredential: CANDIDATE_CREDENTIAL,
        now: retryAt,
      });

      if (allowed) {
        await expect(action).resolves.toMatchObject({
          status: 'acknowledged',
          rotationId: ROTATION_ID,
          credentialVersion: 8,
          accessToken: 'rotation-access-token',
        });
      } else {
        await expect(action).rejects.toMatchObject({ code: 'DEVICE_ROTATION_EXPIRED' });
      }
      expect(prisma.transaction.deviceRefreshCredential.updateMany).not.toHaveBeenCalled();
      expect(prisma.transaction.integrationDevice.updateMany).not.toHaveBeenCalled();
    }
  );

  it('ACKs prepared state exactly once, revokes predecessor exchanges, and issues version + 1 only after commit', async () => {
    const prisma = makePrisma();
    const accessTokenService = { issue: jest.fn().mockResolvedValue('rotation-access-token') };
    const candidateHash = hashDeviceCredential(
      loadDeviceAuthConfig({
        environment: 'dev',
        environments: {
          dev: {
            currentHashKeyVersion: 1,
            credentialPepperKeyring: { '1': 'synthetic-rotation-pepper-0123456789' },
          },
        },
      }),
      CANDIDATE_CREDENTIAL
    );
    prisma.transaction.deviceCredentialRotation.findFirst
      .mockReset()
      .mockResolvedValue(rotation({ status: 'prepared', candidateCredentialId: CANDIDATE_ID }));
    prisma.transaction.deviceRefreshCredential.findFirst.mockResolvedValue({
      id: CANDIDATE_ID,
      deviceId: DEVICE_ID,
      status: 'prepared',
      credentialVersion: 8,
      revokedAt: null,
      expiresAt: AUDIT_EXPIRY,
      ...candidateHash,
    });
    prisma.transaction.integrationDevice.findFirst.mockResolvedValue(
      device({ programType: 'nesting_program' })
    );

    await expect(
      createService(prisma, accessTokenService).ack({
        principal: PRINCIPAL,
        rotationId: ROTATION_ID,
        candidateCredential: CANDIDATE_CREDENTIAL,
        now: NOW,
      })
    ).resolves.toMatchObject({
      status: 'acknowledged',
      rotationId: ROTATION_ID,
      credentialVersion: 8,
      accessToken: 'rotation-access-token',
    });
    expect(prisma.transaction.deviceCredentialRotation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'acknowledged', acknowledgedAt: NOW } })
    );
    expect(prisma.transaction.integrationDevice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { credentialVersion: 8 } })
    );
    expect(prisma.transaction.deviceTokenExchange.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'revoked', revokedAt: NOW } })
    );
    expect(prisma.transaction.deviceRefreshCredential.updateMany.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({ id: PREDECESSOR_ID, status: 'active' }),
        data: { status: 'revoked', revokedAt: NOW },
      })
    );
    expect(prisma.transaction.deviceRefreshCredential.updateMany.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({ id: CANDIDATE_ID, status: 'prepared' }),
        data: { status: 'active' },
      })
    );
    expect(prisma.transaction.deviceCredentialAuditLog.create).toHaveBeenCalledWith({
      data: {
        deviceId: DEVICE_ID,
        rotationId: ROTATION_ID,
        action: 'credential_rotation_acknowledged',
        actorHash: null,
        expiresAt: AUDIT_EXPIRY,
      },
    });
    expect(accessTokenService.issue).toHaveBeenCalledWith(
      expect.objectContaining({ programType: 'nesting_program', permissions: [] })
    );
  });

  it('rejects candidate reuse before credential, rotation, or audit writes', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.findFirst = jest.fn().mockResolvedValue(rotation());
    prisma.transaction.deviceRefreshCredential.findMany.mockResolvedValue([{ id: 'already-used' }]);

    await expect(
      createService(prisma).prepare({
        principal: PRINCIPAL,
        rotationId: ROTATION_ID,
        refreshCredential: REFRESH_CREDENTIAL,
        candidateCredential: CANDIDATE_CREDENTIAL,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ROTATION_INVALID' });
    expect(prisma.transaction.deviceRefreshCredential.create).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceCredentialRotation.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceCredentialAuditLog.create).not.toHaveBeenCalled();
  });

  it('fails closed when the device is revoked inside prepare transaction', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.findFirst = jest.fn().mockResolvedValue(rotation());
    prisma.transaction.integrationDevice.findFirst.mockResolvedValue(
      device({ status: 'revoked', revokedAt: NOW })
    );

    await expect(
      createService(prisma).prepare({
        principal: PRINCIPAL,
        rotationId: ROTATION_ID,
        refreshCredential: REFRESH_CREDENTIAL,
        candidateCredential: CANDIDATE_CREDENTIAL,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ROTATION_REVOKED' });
    expect(prisma.transaction.deviceRefreshCredential.create).not.toHaveBeenCalled();
  });

  it('terminalizes an overdue prepared rotation before prepare idempotency and revokes the candidate', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.findFirst = jest
      .fn()
      .mockResolvedValue(
        rotation({ status: 'prepared', candidateCredentialId: CANDIDATE_ID, deadlineAt: NOW })
      );

    await expect(
      createService(prisma).prepare({
        principal: PRINCIPAL,
        rotationId: ROTATION_ID,
        refreshCredential: REFRESH_CREDENTIAL,
        candidateCredential: CANDIDATE_CREDENTIAL,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ROTATION_EXPIRED' });
    expect(prisma.transaction.deviceCredentialRotation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'expired', expiredAt: NOW } })
    );
    expect(prisma.transaction.deviceRefreshCredential.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: CANDIDATE_ID }),
        data: { status: 'revoked', revokedAt: NOW },
      })
    );
  });

  it('looks up the requested predecessor only through the exact active current-version predicate', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.findFirst = jest.fn().mockResolvedValue(rotation());
    await createService(prisma).prepare({
      principal: PRINCIPAL,
      rotationId: ROTATION_ID,
      refreshCredential: REFRESH_CREDENTIAL,
      candidateCredential: CANDIDATE_CREDENTIAL,
      now: NOW,
    });
    expect(prisma.transaction.deviceRefreshCredential.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: PREDECESSOR_ID,
          deviceId: DEVICE_ID,
          status: 'active',
          credentialVersion: 7,
          revokedAt: null,
          expiresAt: { gt: NOW },
        },
      })
    );
  });

  it('commits overdue ACK terminalization before returning the expired error', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.findFirst = jest
      .fn()
      .mockResolvedValue(
        rotation({ status: 'prepared', candidateCredentialId: CANDIDATE_ID, deadlineAt: NOW })
      );

    await expect(
      createService(prisma).ack({
        principal: PRINCIPAL,
        rotationId: ROTATION_ID,
        candidateCredential: CANDIDATE_CREDENTIAL,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ROTATION_EXPIRED' });
    expect(prisma.transaction.deviceCredentialRotation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'expired', expiredAt: NOW } })
    );
    expect(prisma.transaction.deviceRefreshCredential.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'revoked', revokedAt: NOW } })
    );
  });

  it('creates one requested rotation at the exact device version and writes an opaque audit row', async () => {
    const prisma = makePrisma();
    const service = createService(prisma);

    await expect(
      service.requestRotation({ deviceId: DEVICE_ID, actorHash: ACTOR_HASH, now: NOW })
    ).resolves.toEqual({
      id: ROTATION_ID,
      deviceId: DEVICE_ID,
      status: 'requested',
      deadlineAt: DEADLINE.toISOString(),
      credentialVersion: 7,
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(prisma.transaction.deviceCredentialRotation.create).toHaveBeenCalledWith({
      data: {
        deviceId: DEVICE_ID,
        status: 'requested',
        baseCredentialVersion: 7,
        predecessorCredentialId: PREDECESSOR_ID,
        actorHash: ACTOR_HASH,
        deadlineAt: DEADLINE,
      },
      select: expect.any(Object),
    });
    expect(prisma.transaction.deviceCredentialAuditLog.create).toHaveBeenCalledWith({
      data: {
        deviceId: DEVICE_ID,
        rotationId: ROTATION_ID,
        action: 'credential_rotation_requested',
        actorHash: ACTOR_HASH,
        expiresAt: AUDIT_EXPIRY,
      },
    });
    expect(
      JSON.stringify(
        await service.getRotation({ deviceId: DEVICE_ID, rotationId: ROTATION_ID, now: NOW })
      )
    ).not.toContain(ACTOR_HASH);
  });

  it('returns the same live rotation idempotently without a second state or audit write', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.findFirst = jest.fn().mockResolvedValue(rotation());
    const service = createService(prisma);

    await expect(
      service.requestRotation({ deviceId: DEVICE_ID, actorHash: ACTOR_HASH, now: NOW })
    ).resolves.toMatchObject({ id: ROTATION_ID, status: 'requested', credentialVersion: 7 });
    expect(prisma.transaction.deviceCredentialRotation.create).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceCredentialAuditLog.create).not.toHaveBeenCalled();
  });

  it('recovers a concurrent one-live unique race by retrying and returning the winner', async () => {
    const prisma = makePrisma();
    const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
    prisma.$transaction
      .mockRejectedValueOnce(p2002)
      .mockImplementationOnce(
        async (
          callback: (client: typeof prisma.transaction) => Promise<Record<string, unknown>>
        ) => {
          prisma.transaction.deviceCredentialRotation.findFirst = jest
            .fn()
            .mockResolvedValue(rotation());
          return callback(prisma.transaction);
        }
      );

    await expect(
      createService(prisma).requestRotation({
        deviceId: DEVICE_ID,
        actorHash: ACTOR_HASH,
        now: NOW,
      })
    ).resolves.toMatchObject({ id: ROTATION_ID });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('fails closed on a legacy null/null live row with zero rotation, credential, or audit writes', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.findFirst = jest
      .fn()
      .mockResolvedValue(rotation({ baseCredentialVersion: null, predecessorCredentialId: null }));

    await createService(prisma)
      .requestRotation({ deviceId: DEVICE_ID, actorHash: ACTOR_HASH, now: NOW })
      .then(() => {
        throw new Error('expected incompatible rotation');
      })
      .catch((error: unknown) => expectRotationCode(error, 'DEVICE_ROTATION_INCOMPATIBLE'));

    expect(prisma.transaction.deviceCredentialRotation.create).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceCredentialRotation.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceRefreshCredential.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceCredentialAuditLog.create).not.toHaveBeenCalled();
  });

  it.each([rotation(), rotation({ baseCredentialVersion: null, predecessorCredentialId: null })])(
    'validates the selected environment before inspecting a compatible or legacy live row',
    async (liveRow) => {
      const prisma = makePrisma();
      prisma.transaction.integrationDevice.findFirst.mockResolvedValue(null);
      prisma.transaction.deviceCredentialRotation.findFirst = jest.fn().mockResolvedValue(liveRow);

      await expect(
        createService(prisma).requestRotation({
          deviceId: DEVICE_ID,
          actorHash: ACTOR_HASH,
          now: NOW,
        })
      ).rejects.toMatchObject({ code: 'DEVICE_ROTATION_INVALID' });
      expect(prisma.transaction.deviceCredentialRotation.findFirst).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['safe_canary', device({ capabilityProfile: 'safe_canary' })],
    ['pending', device({ status: 'pending_approval' })],
    ['revoked', device({ status: 'revoked', revokedAt: NOW })],
    ['wrong environment', null],
  ])('rejects an ineligible %s device before a rotation write', async (_label, row) => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.findFirst = jest.fn().mockResolvedValue(null);
    prisma.transaction.integrationDevice.findFirst.mockResolvedValue(row);

    await expect(
      createService(prisma).requestRotation({
        deviceId: DEVICE_ID,
        actorHash: ACTOR_HASH,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ROTATION_INVALID' });
    expect(prisma.transaction.deviceCredentialRotation.create).not.toHaveBeenCalled();
  });

  it('rejects predecessor expiry before the deadline plus recovery boundary', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.findFirst = jest.fn().mockResolvedValue(null);
    prisma.transaction.deviceRefreshCredential.findFirst.mockResolvedValue(
      predecessor({ expiresAt: new Date('2026-07-20T01:16:59.999Z') })
    );

    await expect(
      createService(prisma).requestRotation({
        deviceId: DEVICE_ID,
        actorHash: ACTOR_HASH,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ROTATION_INVALID' });
  });

  it.each([new Date('2026-07-20T01:17:00.000Z'), new Date('2026-07-20T01:17:00.001Z')])(
    'accepts predecessor expiry at or after deadline plus recovery: %s',
    async (expiresAt) => {
      const prisma = makePrisma();
      prisma.transaction.deviceCredentialRotation.findFirst = jest.fn().mockResolvedValue(null);
      prisma.transaction.deviceRefreshCredential.findFirst.mockResolvedValue(
        predecessor({ expiresAt })
      );

      await expect(
        createService(prisma).requestRotation({
          deviceId: DEVICE_ID,
          actorHash: ACTOR_HASH,
          now: NOW,
        })
      ).resolves.toMatchObject({ status: 'requested', deadlineAt: DEADLINE.toISOString() });
    }
  );

  it('terminalizes equality at the deadline and revokes only the prepared candidate', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.findFirst = jest
      .fn()
      .mockResolvedValueOnce(rotation({ status: 'prepared', candidateCredentialId: CANDIDATE_ID }))
      .mockResolvedValueOnce(
        rotation({
          status: 'expired',
          candidateCredentialId: CANDIDATE_ID,
          expiredAt: DEADLINE,
        })
      );

    await expect(
      createService(prisma).getRotation({
        deviceId: DEVICE_ID,
        rotationId: ROTATION_ID,
        now: DEADLINE,
      })
    ).resolves.toMatchObject({ status: 'expired' });
    expect(prisma.transaction.deviceCredentialRotation.updateMany).toHaveBeenCalledWith({
      where: {
        id: ROTATION_ID,
        deviceId: DEVICE_ID,
        status: { in: ['requested', 'prepared'] },
        baseCredentialVersion: 7,
        deadlineAt: { lte: DEADLINE },
        device: {
          is: {
            environment: 'dev',
            status: 'active',
            capabilityProfile: 'standard',
            revokedAt: null,
            credentialVersion: 7,
          },
        },
      },
      data: { status: 'expired', expiredAt: DEADLINE },
    });
    expect(prisma.transaction.deviceRefreshCredential.updateMany).toHaveBeenCalledWith({
      where: {
        id: CANDIDATE_ID,
        deviceId: DEVICE_ID,
        status: 'prepared',
        credentialVersion: 8,
        revokedAt: null,
      },
      data: { status: 'revoked', revokedAt: DEADLINE },
    });
  });

  it('cancels prepared state by CAS, retains predecessor, and makes terminal retry idempotent', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.findFirst = jest
      .fn()
      .mockResolvedValueOnce(rotation({ status: 'prepared', candidateCredentialId: CANDIDATE_ID }))
      .mockResolvedValueOnce(
        rotation({ status: 'cancelled', candidateCredentialId: CANDIDATE_ID })
      );

    await expect(
      createService(prisma).cancelRotation({
        deviceId: DEVICE_ID,
        rotationId: ROTATION_ID,
        actorHash: ACTOR_HASH,
        now: NOW,
      })
    ).resolves.toMatchObject({ status: 'cancelled' });
    expect(prisma.transaction.deviceCredentialRotation.updateMany).toHaveBeenCalledWith({
      where: {
        id: ROTATION_ID,
        deviceId: DEVICE_ID,
        status: { in: ['requested', 'prepared'] },
        baseCredentialVersion: 7,
        deadlineAt: { gt: NOW },
        device: {
          is: {
            environment: 'dev',
            status: 'active',
            capabilityProfile: 'standard',
            revokedAt: null,
            credentialVersion: 7,
          },
        },
      },
      data: { status: 'cancelled', cancelledAt: NOW, actorHash: ACTOR_HASH },
    });
    expect(prisma.transaction.deviceRefreshCredential.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: CANDIDATE_ID }) })
    );
    expect(
      JSON.stringify(prisma.transaction.deviceRefreshCredential.updateMany.mock.calls)
    ).not.toContain(PREDECESSOR_ID);
  });

  it('does not cancel an acknowledged rotation', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.findFirst = jest
      .fn()
      .mockResolvedValue(rotation({ status: 'acknowledged', candidateCredentialId: CANDIDATE_ID }));

    await expect(
      createService(prisma).cancelRotation({
        deviceId: DEVICE_ID,
        rotationId: ROTATION_ID,
        actorHash: ACTOR_HASH,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ROTATION_IN_PROGRESS' });
    expect(prisma.transaction.deviceCredentialRotation.updateMany).not.toHaveBeenCalled();
  });

  it.each([device({ credentialVersion: 8 }), device({ status: 'revoked', revokedAt: NOW })])(
    'returns an already cancelled rotation idempotently without consulting changed device state',
    async (deviceRow) => {
      const prisma = makePrisma();
      prisma.transaction.deviceCredentialRotation.findFirst = jest
        .fn()
        .mockResolvedValue(rotation({ status: 'cancelled' }));
      prisma.transaction.integrationDevice.findFirst.mockResolvedValue(deviceRow);

      await expect(
        createService(prisma).cancelRotation({
          deviceId: DEVICE_ID,
          rotationId: ROTATION_ID,
          actorHash: ACTOR_HASH,
          now: NOW,
        })
      ).resolves.toMatchObject({ status: 'cancelled', credentialVersion: 7 });
      expect(prisma.transaction.integrationDevice.findFirst).not.toHaveBeenCalled();
      expect(prisma.transaction.deviceCredentialRotation.updateMany).not.toHaveBeenCalled();
    }
  );

  it.each([
    [device({ credentialVersion: 8 }), 'DEVICE_ROTATION_IN_PROGRESS'],
    [device({ status: 'revoked', revokedAt: NOW }), 'DEVICE_ROTATION_REVOKED'],
  ])(
    'rejects cancel before CAS when the selected device no longer matches the base',
    async (deviceRow, code) => {
      const prisma = makePrisma();
      prisma.transaction.deviceCredentialRotation.findFirst = jest
        .fn()
        .mockResolvedValue(rotation());
      prisma.transaction.integrationDevice.findFirst.mockResolvedValue(deviceRow);

      await expect(
        createService(prisma).cancelRotation({
          deviceId: DEVICE_ID,
          rotationId: ROTATION_ID,
          actorHash: ACTOR_HASH,
          now: NOW,
        })
      ).rejects.toMatchObject({ code });
      expect(prisma.transaction.deviceCredentialRotation.updateMany).not.toHaveBeenCalled();
    }
  );

  it('creates a new request when an expire CAS loser is already cancelled', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.updateMany.mockResolvedValue({ count: 0 });
    prisma.transaction.deviceCredentialRotation.findFirst = jest
      .fn()
      .mockResolvedValueOnce(rotation({ deadlineAt: NOW }))
      .mockResolvedValueOnce(rotation({ status: 'cancelled', deadlineAt: NOW }));

    await expect(
      createService(prisma).requestRotation({
        deviceId: DEVICE_ID,
        actorHash: ACTOR_HASH,
        now: NOW,
      })
    ).resolves.toMatchObject({ status: 'requested' });
    expect(prisma.transaction.deviceCredentialRotation.create).toHaveBeenCalledTimes(1);
  });

  it.each(['acknowledged', 'revoked'])(
    'returns the terminal %s summary when GET loses the expiration CAS',
    async (status) => {
      const prisma = makePrisma();
      prisma.transaction.deviceCredentialRotation.updateMany.mockResolvedValue({ count: 0 });
      prisma.transaction.deviceCredentialRotation.findFirst = jest
        .fn()
        .mockResolvedValueOnce(rotation({ deadlineAt: NOW }))
        .mockResolvedValueOnce(
          rotation({
            status,
            deadlineAt: NOW,
            ...(status === 'acknowledged' ? { candidateCredentialId: CANDIDATE_ID } : {}),
          })
        );

      await expect(
        createService(prisma).getRotation({
          deviceId: DEVICE_ID,
          rotationId: ROTATION_ID,
          now: NOW,
        })
      ).resolves.toMatchObject({ status, credentialVersion: 7 });
    }
  );

  it.each([
    ['acknowledged', 'DEVICE_ROTATION_IN_PROGRESS'],
    ['revoked', 'DEVICE_ROTATION_REVOKED'],
  ])('maps an expire CAS loser in %s to the exact terminal conflict', async (status, code) => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.updateMany.mockResolvedValue({ count: 0 });
    prisma.transaction.deviceCredentialRotation.findFirst = jest
      .fn()
      .mockResolvedValueOnce(rotation({ deadlineAt: NOW }))
      .mockResolvedValueOnce(rotation({ status, deadlineAt: NOW }));

    await expect(
      createService(prisma).requestRotation({
        deviceId: DEVICE_ID,
        actorHash: ACTOR_HASH,
        now: NOW,
      })
    ).rejects.toMatchObject({ code });
    expect(prisma.transaction.deviceCredentialRotation.create).not.toHaveBeenCalled();
  });

  it('maps an acknowledged cancel CAS loser to the exact terminal conflict', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.updateMany.mockResolvedValue({ count: 0 });
    prisma.transaction.deviceCredentialRotation.findFirst = jest
      .fn()
      .mockResolvedValueOnce(rotation())
      .mockResolvedValueOnce(
        rotation({ status: 'acknowledged', candidateCredentialId: CANDIDATE_ID })
      );
    await expect(
      createService(prisma).cancelRotation({
        deviceId: DEVICE_ID,
        rotationId: ROTATION_ID,
        actorHash: ACTOR_HASH,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ROTATION_IN_PROGRESS' });
  });

  it('returns a revoked terminal summary when cancel loses its CAS to revoke', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.updateMany.mockResolvedValue({ count: 0 });
    prisma.transaction.deviceCredentialRotation.findFirst = jest
      .fn()
      .mockResolvedValueOnce(rotation())
      .mockResolvedValueOnce(rotation({ status: 'revoked' }));

    await expect(
      createService(prisma).cancelRotation({
        deviceId: DEVICE_ID,
        rotationId: ROTATION_ID,
        actorHash: ACTOR_HASH,
        now: NOW,
      })
    ).resolves.toMatchObject({ status: 'revoked', credentialVersion: 7 });
  });

  it('retries one P2034 but maps a second serialization failure to unavailable', async () => {
    const prisma = makePrisma();
    prisma.$transaction.mockRejectedValue(
      Object.assign(new Error('serialization'), { code: 'P2034' })
    );
    await expect(
      createService(prisma).requestRotation({
        deviceId: DEVICE_ID,
        actorHash: ACTOR_HASH,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'DEVICE_ROTATION_UNAVAILABLE' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('retries one P2034 and succeeds on the second serializable transaction', async () => {
    const prisma = makePrisma();
    prisma.$transaction
      .mockRejectedValueOnce(Object.assign(new Error('serialization'), { code: 'P2034' }))
      .mockImplementationOnce(
        async (callback: (client: typeof prisma.transaction) => Promise<Record<string, unknown>>) =>
          callback(prisma.transaction)
      );
    await expect(
      createService(prisma).requestRotation({
        deviceId: DEVICE_ID,
        actorHash: ACTOR_HASH,
        now: NOW,
      })
    ).resolves.toMatchObject({ status: 'requested' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
