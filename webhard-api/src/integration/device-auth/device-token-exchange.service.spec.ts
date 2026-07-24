import { loadDeviceAuthConfig } from './device-auth.config';
import { hashDeviceCredential } from './device-credential-hash';
import * as deviceTokenExchangeHashModule from './device-token-exchange-hash';
import * as deviceTokenExchangeServiceModule from './device-token-exchange.service';

const NOW = new Date('2026-07-20T00:00:00.000Z');
const DEVICE_ID = '8b3d9a4e-5c66-4c89-a813-4f33fd70fd21';
const REFRESH_CREDENTIAL = Buffer.alloc(32, 7).toString('base64url');
const NEXT_REFRESH_CREDENTIAL = Buffer.alloc(32, 8).toString('base64url');
const CHANGED_REFRESH_CREDENTIAL = Buffer.alloc(32, 9).toString('base64url');
const ZERO_REFRESH_CREDENTIAL = Buffer.alloc(32).toString('base64url');
const REFRESH_REQUEST_ID = Buffer.alloc(16, 10).toString('base64url');
const ACTIVE_CREDENTIAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUDIT_LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface DeviceTokenExchangeInputLike {
  readonly deviceId: string;
  readonly refreshCredential: string;
  readonly nextRefreshCredential: string;
  readonly refreshRequestId: string;
}

interface DeviceTokenExchangeResultLike {
  readonly deviceId: string;
  readonly environment: string;
  readonly programType: string;
  readonly capabilityProfile: string;
  readonly credentialVersion: number;
  readonly accessToken: string;
  readonly refreshCredentialAction: 'replace_with_candidate' | 'keep_current';
  readonly rotation?: { readonly id: string; readonly deadlineAt: string };
}

interface DeviceTokenExchangeServiceLike {
  exchange(input: unknown): Promise<DeviceTokenExchangeResultLike>;
}

interface DeviceTokenExchangeHasherLike {
  digest(requestId: string): string;
  verify(requestId: string, digest: string): boolean;
}

interface DeviceTokenExchangeServiceModule {
  readonly DeviceTokenExchangeService?: unknown;
  readonly DeviceTokenExchangeError?: unknown;
}

interface DeviceTokenExchangeHashModule {
  readonly DeviceTokenExchangeRequestHasher?: unknown;
}

interface DeviceRow {
  readonly id: string;
  readonly environment: string;
  readonly programType: string;
  readonly capabilityProfile: string;
  readonly status: string;
  readonly credentialVersion: number;
  readonly revokedAt: Date | null;
}

interface CredentialRow {
  readonly id: string;
  readonly deviceId: string;
  readonly credentialHash: string;
  readonly hashKeyVersion: number;
  readonly status: string;
  readonly credentialVersion: number;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

interface ExchangeRow {
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
  readonly previous: CredentialRow;
  readonly successor: CredentialRow;
  readonly device: DeviceRow;
}

function loadServiceModule(): DeviceTokenExchangeServiceModule {
  return deviceTokenExchangeServiceModule;
}

function loadHasherModule(): DeviceTokenExchangeHashModule {
  return deviceTokenExchangeHashModule;
}

function makeConfig() {
  return loadDeviceAuthConfig({
    environment: 'dev',
    environments: {
      dev: {
        currentHashKeyVersion: 2,
        credentialPepperKeyring: {
          '1': 'synthetic-token-exchange-pepper-v1-0123456789',
          '2': 'synthetic-token-exchange-pepper-v2-0123456789',
        },
      },
    },
  });
}

function makeHasher(): DeviceTokenExchangeHasherLike {
  const HasherConstructor = loadHasherModule().DeviceTokenExchangeRequestHasher;
  if (typeof HasherConstructor !== 'function') {
    throw new Error('DeviceTokenExchangeRequestHasher is not implemented');
  }

  return new (HasherConstructor as new (
    environment: 'dev',
    secret: string
  ) => DeviceTokenExchangeHasherLike)(
    'dev',
    'synthetic-token-exchange-request-hmac-secret-0123456789'
  );
}

function makeDevice(overrides: Partial<DeviceRow> = {}): DeviceRow {
  return {
    id: DEVICE_ID,
    environment: 'dev',
    programType: 'external_webhard_sync',
    capabilityProfile: 'standard',
    status: 'active',
    credentialVersion: 1,
    revokedAt: null,
    ...overrides,
  };
}

function makeCredential(
  rawCredential: string,
  overrides: Partial<CredentialRow> = {}
): CredentialRow {
  const hashedCredential = hashDeviceCredential(makeConfig(), rawCredential);
  return {
    id: 'credential-current',
    deviceId: DEVICE_ID,
    credentialHash: hashedCredential.credentialHash,
    hashKeyVersion: hashedCredential.hashKeyVersion,
    status: 'active',
    credentialVersion: 1,
    expiresAt: new Date(NOW.getTime() + ACTIVE_CREDENTIAL_TTL_MS),
    revokedAt: null,
    ...overrides,
  };
}

function makeCompletedExchange(overrides: Partial<ExchangeRow> = {}): ExchangeRow {
  const previous = makeCredential(REFRESH_CREDENTIAL, {
    id: 'credential-previous',
    status: 'revoked',
    credentialVersion: 1,
    revokedAt: NOW,
  });
  const successor = makeCredential(NEXT_REFRESH_CREDENTIAL, {
    id: 'credential-successor',
    credentialVersion: 2,
  });
  const device = makeDevice({ credentialVersion: 2 });
  const requestIdDigest = makeHasher().digest(REFRESH_REQUEST_ID);

  return {
    id: 'exchange-001',
    deviceId: DEVICE_ID,
    previousCredentialId: previous.id,
    successorCredentialId: successor.id,
    requestIdDigest,
    credentialVersion: 2,
    status: 'completed',
    completedAt: NOW,
    recoverableUntil: successor.expiresAt,
    revokedAt: null,
    previous,
    successor,
    device,
    ...overrides,
  };
}

function makePrisma(
  options: {
    readonly exchange?: ExchangeRow | null;
    readonly device?: DeviceRow | null;
    readonly currentCredentials?: readonly CredentialRow[];
    readonly successor?: CredentialRow;
  } = {}
) {
  const currentCredential = makeCredential(REFRESH_CREDENTIAL);
  const successor =
    options.successor ??
    makeCredential(NEXT_REFRESH_CREDENTIAL, {
      id: 'credential-successor',
      credentialVersion: 2,
    });
  const transaction = {
    integrationDevice: {
      findFirst: jest.fn().mockResolvedValue(options.device ?? makeDevice()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    deviceRefreshCredential: {
      findMany: jest.fn().mockResolvedValue(options.currentCredentials ?? [currentCredential]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue(successor),
    },
    deviceCredentialRotation: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    deviceTokenExchange: {
      create: jest.fn().mockResolvedValue({ id: 'exchange-001' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    deviceCredentialAuditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-001' }),
    },
  };
  const prisma = {
    deviceTokenExchange: {
      findFirst: jest.fn().mockResolvedValue(options.exchange ?? null),
    },
    transaction,
    $transaction: jest.fn(async (callback: (client: typeof transaction) => Promise<unknown>) =>
      callback(transaction)
    ),
  };

  return prisma;
}

function makeAccessTokenService() {
  return {
    issue: jest.fn().mockResolvedValue('newly-issued-access-token'),
  };
}

function createService(
  prisma: unknown,
  accessTokenService: { readonly issue: jest.Mock },
  options: Partial<{
    readonly now: () => Date;
    readonly activeCredentialTtlMs: number;
    readonly auditLogTtlMs: number;
    readonly rotationRuntimeEnabled: boolean;
  }> = {}
): DeviceTokenExchangeServiceLike {
  const ServiceConstructor = loadServiceModule().DeviceTokenExchangeService;
  if (typeof ServiceConstructor !== 'function') {
    throw new Error('DeviceTokenExchangeService is not implemented');
  }

  return new (ServiceConstructor as new (
    prismaService: unknown,
    deviceAuthConfig: ReturnType<typeof makeConfig>,
    exchangeOptions: {
      readonly activeCredentialTtlMs: number;
      readonly auditLogTtlMs: number;
      readonly now?: () => Date;
    },
    accessTokenIssuer: { readonly issue: jest.Mock },
    requestHasher: DeviceTokenExchangeHasherLike,
    rotationOptions: { readonly rotationRuntimeEnabled: boolean }
  ) => DeviceTokenExchangeServiceLike)(
    prisma,
    makeConfig(),
    {
      activeCredentialTtlMs: ACTIVE_CREDENTIAL_TTL_MS,
      auditLogTtlMs: AUDIT_LOG_TTL_MS,
      now: () => NOW,
      ...options,
    },
    accessTokenService,
    makeHasher(),
    { rotationRuntimeEnabled: options.rotationRuntimeEnabled ?? true }
  );
}

function makeInput(
  overrides: Partial<DeviceTokenExchangeInputLike> = {}
): DeviceTokenExchangeInputLike {
  return {
    deviceId: DEVICE_ID,
    refreshCredential: REFRESH_CREDENTIAL,
    nextRefreshCredential: NEXT_REFRESH_CREDENTIAL,
    refreshRequestId: REFRESH_REQUEST_ID,
    ...overrides,
  };
}

async function expectExchangeError(
  action: () => Promise<unknown>,
  code: string,
  sensitiveValues: readonly string[] = []
): Promise<void> {
  const ErrorConstructor = loadServiceModule().DeviceTokenExchangeError;
  try {
    await action();
    throw new Error('Expected token exchange to fail closed');
  } catch (error: unknown) {
    if (typeof ErrorConstructor !== 'function') {
      throw error;
    }

    expect(error).toBeInstanceOf(ErrorConstructor as new (...args: never[]) => Error);
    expect((error as { readonly code?: unknown }).code).toBe(code);
    for (const sensitiveValue of sensitiveValues) {
      expect(String(error)).not.toContain(sensitiveValue);
      expect(JSON.stringify(error)).not.toContain(sensitiveValue);
    }
  }
}

describe('DeviceTokenExchangeService', () => {
  it('replaces an active credential transactionally and mints a standard access token only after commit', async () => {
    const prisma = makePrisma();
    const accessTokenService = makeAccessTokenService();
    const service = createService(prisma, accessTokenService);

    await expect(service.exchange(makeInput())).resolves.toMatchObject({
      deviceId: DEVICE_ID,
      environment: 'dev',
      programType: 'external_webhard_sync',
      capabilityProfile: 'standard',
      credentialVersion: 2,
      accessToken: 'newly-issued-access-token',
      refreshCredentialAction: 'replace_with_candidate',
    });
    expect(accessTokenService.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: DEVICE_ID,
        environment: 'dev',
        programType: 'external_webhard_sync',
        capabilityProfile: 'standard',
        permissions: [
          'folder/read',
          'folder/write',
          'folder/move',
          'file/read',
          'file/write',
          'file/move',
        ],
        credentialVersion: 2,
      })
    );
    expect(accessTokenService.issue.mock.calls[0][0].permissions).not.toContain('all');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(prisma.transaction.deviceRefreshCredential.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deviceId: DEVICE_ID,
          status: 'active',
          credentialVersion: 2,
          expiresAt: new Date(NOW.getTime() + ACTIVE_CREDENTIAL_TTL_MS),
        }),
      })
    );
    expect(prisma.transaction.deviceTokenExchange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deviceId: DEVICE_ID,
          previousCredentialId: 'credential-current',
          successorCredentialId: 'credential-successor',
          credentialVersion: 2,
          status: 'completed',
          completedAt: NOW,
          recoverableUntil: new Date(NOW.getTime() + ACTIVE_CREDENTIAL_TTL_MS),
        }),
      })
    );
    const successorInput = prisma.transaction.deviceRefreshCredential.create.mock.calls[0][0];
    const exchangeInput = prisma.transaction.deviceTokenExchange.create.mock.calls[0][0];
    expect(exchangeInput.data.recoverableUntil).toEqual(successorInput.data.expiresAt);
    const auditInput = prisma.transaction.deviceCredentialAuditLog.create.mock.calls[0][0];
    expect(auditInput).toMatchObject({
      data: expect.objectContaining({
        deviceId: DEVICE_ID,
        refreshCredentialId: 'credential-successor',
        action: 'refresh_credential_replaced',
        expiresAt: new Date(NOW.getTime() + AUDIT_LOG_TTL_MS),
      }),
    });
    expect(JSON.stringify(auditInput)).not.toContain(REFRESH_CREDENTIAL);
    expect(JSON.stringify(auditInput)).not.toContain(NEXT_REFRESH_CREDENTIAL);
    expect(accessTokenService.issue.mock.invocationCallOrder[0]).toBeGreaterThan(
      prisma.transaction.deviceCredentialAuditLog.create.mock.invocationCallOrder[0]
    );
  });

  it.each([
    ['unexpected key', { ...makeInput(), extra: 'not-allowed' }],
    ['uppercase device id', makeInput({ deviceId: DEVICE_ID.toUpperCase() })],
    [
      'too short current credential',
      makeInput({ refreshCredential: Buffer.alloc(31, 1).toString('base64url') }),
    ],
    [
      'padded candidate credential',
      makeInput({ nextRefreshCredential: `${NEXT_REFRESH_CREDENTIAL}=` }),
    ],
    [
      'too short request id',
      makeInput({ refreshRequestId: Buffer.alloc(15, 1).toString('base64url') }),
    ],
    [
      'too long request id',
      makeInput({ refreshRequestId: Buffer.alloc(65, 1).toString('base64url') }),
    ],
    ['noncanonical request id', makeInput({ refreshRequestId: `${REFRESH_REQUEST_ID}=` })],
  ])('rejects an invalid exact input shape or canonical identifier: %s', async (_label, input) => {
    const prisma = makePrisma();
    const accessTokenService = makeAccessTokenService();
    const service = createService(prisma, accessTokenService);

    await expectExchangeError(() => service.exchange(input), 'DEVICE_TOKEN_EXCHANGE_INVALID', [
      REFRESH_CREDENTIAL,
      NEXT_REFRESH_CREDENTIAL,
      REFRESH_REQUEST_ID,
    ]);
    expect(prisma.deviceTokenExchange.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(accessTokenService.issue).not.toHaveBeenCalled();
  });

  it.each([
    ['same predecessor and successor', makeInput({ nextRefreshCredential: REFRESH_CREDENTIAL })],
    ['same predecessor and request id', makeInput({ refreshRequestId: REFRESH_CREDENTIAL })],
  ])(
    'rejects raw value reuse for $0 before looking up or writing any state',
    async (_label, input) => {
      const prisma = makePrisma();
      const accessTokenService = makeAccessTokenService();
      const service = createService(prisma, accessTokenService);

      await expectExchangeError(() => service.exchange(input), 'DEVICE_TOKEN_EXCHANGE_INVALID', [
        REFRESH_CREDENTIAL,
      ]);
      expect(prisma.deviceTokenExchange.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(accessTokenService.issue).not.toHaveBeenCalled();
    }
  );

  it('accepts an all-zero canonical Base64URL refresh credential', async () => {
    const prisma = makePrisma({
      currentCredentials: [makeCredential(ZERO_REFRESH_CREDENTIAL)],
    });
    const accessTokenService = makeAccessTokenService();
    const service = createService(prisma, accessTokenService);

    await expect(
      service.exchange(makeInput({ refreshCredential: ZERO_REFRESH_CREDENTIAL }))
    ).resolves.toMatchObject({ credentialVersion: 2 });
    expect(accessTokenService.issue).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'pending device',
      makeDevice({ status: 'pending_approval' }),
      makeCredential(REFRESH_CREDENTIAL),
      'DEVICE_TOKEN_EXCHANGE_INVALID',
    ],
    [
      'revoked device',
      makeDevice({ status: 'revoked', revokedAt: NOW }),
      makeCredential(REFRESH_CREDENTIAL),
      'DEVICE_TOKEN_EXCHANGE_REVOKED',
    ],
    [
      'expired credential',
      makeDevice(),
      makeCredential(REFRESH_CREDENTIAL, { expiresAt: NOW }),
      'DEVICE_TOKEN_EXCHANGE_INVALID',
    ],
    [
      'wrong selected environment',
      makeDevice({ environment: 'stg' }),
      makeCredential(REFRESH_CREDENTIAL),
      'DEVICE_TOKEN_EXCHANGE_INVALID',
    ],
  ])(
    'rejects a $0 without changing credentials',
    async (_label, device, credential, expectedCode) => {
      const prisma = makePrisma({ device, currentCredentials: [credential] });
      const accessTokenService = makeAccessTokenService();
      const service = createService(prisma, accessTokenService);

      await expectExchangeError(() => service.exchange(makeInput()), expectedCode);
      expect(prisma.transaction.deviceRefreshCredential.updateMany).not.toHaveBeenCalled();
      expect(prisma.transaction.integrationDevice.updateMany).not.toHaveBeenCalled();
      expect(prisma.transaction.deviceRefreshCredential.create).not.toHaveBeenCalled();
      expect(prisma.transaction.deviceTokenExchange.create).not.toHaveBeenCalled();
      expect(prisma.transaction.deviceCredentialAuditLog.create).not.toHaveBeenCalled();
      expect(accessTokenService.issue).not.toHaveBeenCalled();
    }
  );

  it('returns keep_current with a current-version JWT for a requested or prepared rotation with zero successor writes', async () => {
    const prisma = makePrisma();
    const deadlineAt = new Date('2026-07-20T00:15:00.000Z');
    prisma.transaction.deviceCredentialRotation.findFirst.mockResolvedValue({
      id: 'rotation-001',
      deviceId: DEVICE_ID,
      status: 'requested',
      deadlineAt,
      baseCredentialVersion: 1,
      predecessorCredentialId: 'credential-current',
      candidateCredentialId: null,
    });
    const accessTokenService = makeAccessTokenService();
    const service = createService(prisma, accessTokenService);

    await expect(service.exchange(makeInput())).resolves.toMatchObject({
      deviceId: DEVICE_ID,
      credentialVersion: 1,
      accessToken: 'newly-issued-access-token',
      refreshCredentialAction: 'keep_current',
      rotation: { id: 'rotation-001', deadlineAt: deadlineAt.toISOString() },
    });
    expect(prisma.transaction.deviceRefreshCredential.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.integrationDevice.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceRefreshCredential.create).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceTokenExchange.create).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceCredentialAuditLog.create).not.toHaveBeenCalled();
    expect(accessTokenService.issue).toHaveBeenCalledWith(
      expect.objectContaining({ credentialVersion: 1 })
    );
  });

  it('does not query rotation columns or emit a directive when rotation runtime is disabled', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.findFirst.mockRejectedValue(
      new Error('rotation columns unavailable')
    );
    const service = createService(prisma, makeAccessTokenService(), {
      rotationRuntimeEnabled: false,
    });

    await expect(service.exchange(makeInput())).resolves.toMatchObject({
      credentialVersion: 2,
      refreshCredentialAction: 'replace_with_candidate',
    });
    expect(prisma.transaction.deviceCredentialRotation.findFirst).not.toHaveBeenCalled();
  });

  it('expires an overdue live rotation at deadline equality before performing the ordinary replacement', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.findFirst.mockResolvedValue({
      id: 'rotation-001',
      deviceId: DEVICE_ID,
      status: 'requested',
      deadlineAt: NOW,
      baseCredentialVersion: 1,
      predecessorCredentialId: 'credential-current',
      candidateCredentialId: null,
    });
    const service = createService(prisma, makeAccessTokenService());

    await expect(service.exchange(makeInput())).resolves.toMatchObject({
      credentialVersion: 2,
      refreshCredentialAction: 'replace_with_candidate',
    });
    expect(prisma.transaction.deviceCredentialRotation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'expired', expiredAt: NOW } })
    );
  });

  it('rejects a legacy incompatible live rotation with the exact rotation code and zero credential writes', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceCredentialRotation.findFirst.mockResolvedValue({
      id: 'rotation-001',
      deviceId: DEVICE_ID,
      status: 'requested',
      deadlineAt: new Date(NOW.getTime() + 60_000),
      baseCredentialVersion: null,
      predecessorCredentialId: null,
      candidateCredentialId: null,
    });
    const service = createService(prisma, makeAccessTokenService());

    await expectExchangeError(() => service.exchange(makeInput()), 'DEVICE_ROTATION_INCOMPATIBLE');
    expect(prisma.transaction.deviceRefreshCredential.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.integrationDevice.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceRefreshCredential.create).not.toHaveBeenCalled();
  });

  it('retries a serializable P2034 failure once before minting the access token', async () => {
    const prisma = makePrisma();
    prisma.$transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce(
        async (callback: (client: typeof prisma.transaction) => Promise<unknown>) =>
          callback(prisma.transaction)
      );
    const accessTokenService = makeAccessTokenService();
    const service = createService(prisma, accessTokenService);

    await expect(service.exchange(makeInput())).resolves.toMatchObject({ credentialVersion: 2 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(accessTokenService.issue).toHaveBeenCalledTimes(1);
  });

  it('rolls back and reports a conflict when the predecessor compare-and-swap misses', async () => {
    const prisma = makePrisma();
    prisma.transaction.deviceRefreshCredential.updateMany.mockResolvedValue({ count: 0 });
    const accessTokenService = makeAccessTokenService();
    const service = createService(prisma, accessTokenService);

    await expectExchangeError(
      () => service.exchange(makeInput()),
      'DEVICE_TOKEN_EXCHANGE_CONFLICT'
    );
    expect(prisma.transaction.integrationDevice.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceRefreshCredential.create).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceTokenExchange.create).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceCredentialAuditLog.create).not.toHaveBeenCalled();
    expect(accessTokenService.issue).not.toHaveBeenCalled();
  });

  it('recovers a concurrent same-request exchange after a P2002 unique constraint failure', async () => {
    const exchange = makeCompletedExchange();
    const prisma = makePrisma();
    prisma.deviceTokenExchange.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(exchange);
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    const accessTokenService = makeAccessTokenService();
    const service = createService(prisma, accessTokenService);

    await expect(service.exchange(makeInput())).resolves.toMatchObject({
      credentialVersion: 2,
      accessToken: 'newly-issued-access-token',
    });
    expect(prisma.deviceTokenExchange.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(accessTokenService.issue).toHaveBeenCalledTimes(1);
  });

  it('recovers a concurrent same-request exchange after P2034 retry finds no predecessor', async () => {
    const exchange = makeCompletedExchange();
    const prisma = makePrisma();
    prisma.deviceTokenExchange.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(exchange);
    prisma.$transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce(
        async (callback: (client: typeof prisma.transaction) => Promise<unknown>) =>
          callback(prisma.transaction)
      );
    prisma.transaction.deviceRefreshCredential.findMany.mockResolvedValue([]);
    const accessTokenService = makeAccessTokenService();
    const service = createService(prisma, accessTokenService);

    await expect(service.exchange(makeInput())).resolves.toMatchObject({
      credentialVersion: 2,
      accessToken: 'newly-issued-access-token',
    });
    expect(prisma.deviceTokenExchange.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(accessTokenService.issue).toHaveBeenCalledTimes(1);
  });

  it('recovers a concurrent same-request exchange after its predecessor is no longer active', async () => {
    const exchange = makeCompletedExchange();
    const prisma = makePrisma();
    prisma.deviceTokenExchange.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(exchange);
    prisma.transaction.deviceRefreshCredential.findMany.mockResolvedValue([]);
    const accessTokenService = makeAccessTokenService();
    const service = createService(prisma, accessTokenService);

    await expect(service.exchange(makeInput())).resolves.toMatchObject({
      credentialVersion: 2,
      accessToken: 'newly-issued-access-token',
    });
    expect(prisma.deviceTokenExchange.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(accessTokenService.issue).toHaveBeenCalledTimes(1);
  });

  it('rejects changed raw input after a concurrent same-request exchange is re-read', async () => {
    const exchange = makeCompletedExchange();
    const prisma = makePrisma();
    prisma.deviceTokenExchange.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(exchange);
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    const accessTokenService = makeAccessTokenService();
    const service = createService(prisma, accessTokenService);

    await expectExchangeError(
      () => service.exchange(makeInput({ nextRefreshCredential: CHANGED_REFRESH_CREDENTIAL })),
      'DEVICE_TOKEN_EXCHANGE_INVALID'
    );
    expect(prisma.deviceTokenExchange.findFirst).toHaveBeenCalledTimes(2);
    expect(accessTokenService.issue).not.toHaveBeenCalled();
  });

  it('recovers a response-loss replay with the same raw predecessor and successor by minting a fresh JWT without writes', async () => {
    const exchange = makeCompletedExchange();
    const prisma = makePrisma({ exchange });
    const accessTokenService = makeAccessTokenService();
    const service = createService(prisma, accessTokenService);

    await expect(service.exchange(makeInput())).resolves.toMatchObject({
      deviceId: DEVICE_ID,
      credentialVersion: 2,
      accessToken: 'newly-issued-access-token',
      refreshCredentialAction: 'replace_with_candidate',
    });
    expect(accessTokenService.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialVersion: 2,
        permissions: [
          'folder/read',
          'folder/write',
          'folder/move',
          'file/read',
          'file/write',
          'file/move',
        ],
      })
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceRefreshCredential.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceTokenExchange.create).not.toHaveBeenCalled();
  });

  it.each([
    ['changed predecessor', makeInput({ refreshCredential: CHANGED_REFRESH_CREDENTIAL })],
    ['changed successor', makeInput({ nextRefreshCredential: CHANGED_REFRESH_CREDENTIAL })],
  ])('rejects a same-request replay with a $0', async (_label, input) => {
    const prisma = makePrisma({ exchange: makeCompletedExchange() });
    const accessTokenService = makeAccessTokenService();
    const service = createService(prisma, accessTokenService);

    await expectExchangeError(() => service.exchange(input), 'DEVICE_TOKEN_EXCHANGE_INVALID');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceRefreshCredential.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceTokenExchange.create).not.toHaveBeenCalled();
    expect(accessTokenService.issue).not.toHaveBeenCalled();
  });

  it('expires only a completed exchange after its successor refresh credential expiry', async () => {
    const expiredAt = new Date(NOW.getTime() - 1);
    const prisma = makePrisma({
      exchange: makeCompletedExchange({
        recoverableUntil: expiredAt,
        successor: makeCredential(NEXT_REFRESH_CREDENTIAL, {
          id: 'credential-successor',
          credentialVersion: 2,
          expiresAt: expiredAt,
        }),
      }),
    });
    const accessTokenService = makeAccessTokenService();
    const service = createService(prisma, accessTokenService);

    await expectExchangeError(() => service.exchange(makeInput()), 'DEVICE_TOKEN_EXCHANGE_INVALID');
    expect(prisma.transaction.deviceTokenExchange.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'exchange-001',
        status: 'completed',
        revokedAt: null,
      }),
      data: { status: 'expired' },
    });
    expect(prisma.transaction.deviceRefreshCredential.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.integrationDevice.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceRefreshCredential.create).not.toHaveBeenCalled();
    expect(prisma.transaction.deviceTokenExchange.create).not.toHaveBeenCalled();
    expect(accessTokenService.issue).not.toHaveBeenCalled();
  });

  it.each([
    [
      'revoked exchange',
      makeCompletedExchange({ status: 'revoked', revokedAt: NOW }),
      'DEVICE_TOKEN_EXCHANGE_REVOKED',
    ],
    [
      'expired exchange',
      makeCompletedExchange({ status: 'expired' }),
      'DEVICE_TOKEN_EXCHANGE_INVALID',
    ],
  ])('rejects a $0 without minting a token', async (_label, exchange, expectedCode) => {
    const prisma = makePrisma({ exchange });
    const accessTokenService = makeAccessTokenService();
    const service = createService(prisma, accessTokenService);

    await expectExchangeError(() => service.exchange(makeInput()), expectedCode);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(accessTokenService.issue).not.toHaveBeenCalled();
  });

  it('reports signer failure as unavailable after persisting a recoverable exchange', async () => {
    const prisma = makePrisma();
    const accessTokenService = makeAccessTokenService();
    accessTokenService.issue.mockRejectedValue(new Error('signer unavailable'));
    const service = createService(prisma, accessTokenService);

    await expectExchangeError(
      () => service.exchange(makeInput()),
      'DEVICE_TOKEN_EXCHANGE_UNAVAILABLE',
      [REFRESH_CREDENTIAL, NEXT_REFRESH_CREDENTIAL]
    );
    expect(prisma.transaction.deviceTokenExchange.create).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.deviceCredentialAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it('maps database unavailability to the safe unavailable code', async () => {
    const prisma = makePrisma();
    prisma.deviceTokenExchange.findFirst.mockRejectedValue(new Error('database unavailable'));
    const accessTokenService = makeAccessTokenService();
    const service = createService(prisma, accessTokenService);

    await expectExchangeError(
      () => service.exchange(makeInput()),
      'DEVICE_TOKEN_EXCHANGE_UNAVAILABLE'
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(accessTokenService.issue).not.toHaveBeenCalled();
  });

  it('issues an empty permission set for safe_canary without consulting legacy all permissions', async () => {
    const prisma = makePrisma({
      device: makeDevice({ capabilityProfile: 'safe_canary' }),
    });
    const accessTokenService = makeAccessTokenService();
    const service = createService(prisma, accessTokenService);

    await expect(service.exchange(makeInput())).resolves.toMatchObject({
      capabilityProfile: 'safe_canary',
      credentialVersion: 2,
    });
    expect(accessTokenService.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityProfile: 'safe_canary',
        permissions: [],
      })
    );
  });
});
