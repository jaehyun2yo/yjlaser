import { hashIdentifier } from '../../../common/logging/log-event';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { LogEventDto } from '../dto/log-event.dto';
import { PrismaLogEventRepository } from './prisma-log-event.repository';

type LogEventDelegateMock = {
  create: jest.Mock;
  findUnique: jest.Mock;
};

const ORIGINAL_ENV = {
  LOG_IDENTIFIER_HASH_SECRET: process.env.LOG_IDENTIFIER_HASH_SECRET,
  LOG_HASH_SECRET: process.env.LOG_HASH_SECRET,
  SESSION_SECRET: process.env.SESSION_SECRET,
};

function makeEvent(input?: Partial<LogEventDto>): LogEventDto {
  return {
    schema_version: 1,
    event_id: input?.event_id ?? 'evt-db-1',
    timestamp: input?.timestamp ?? '2026-06-22T00:00:00.000Z',
    level: input?.level ?? 'info',
    project: input?.project ?? 'company_site',
    component: input?.component ?? 'PrismaLogEventRepositorySpec',
    feature: input?.feature ?? 'log_collection',
    event: input?.event ?? 'repository_test',
    action: input?.action ?? 'store',
    status: input?.status ?? 'success',
    channel: input?.channel ?? 'audit',
    correlation_id: input?.correlation_id ?? 'log-20260622-000000-db',
    metadata: input?.metadata ?? { processed_count: 1 },
    hash_key_version: input?.hash_key_version ?? 'v1',
  };
}

function makeRepository(delegate: LogEventDelegateMock): PrismaLogEventRepository {
  return new PrismaLogEventRepository({ logEvent: delegate } as unknown as PrismaService);
}

function uniqueViolation(): Error & { code: string } {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

describe('PrismaLogEventRepository', () => {
  beforeEach(() => {
    process.env.LOG_IDENTIFIER_HASH_SECRET = 'test-log-identifier-hash-secret-32-bytes';
    delete process.env.LOG_HASH_SECRET;
    delete process.env.SESSION_SECRET;
    jest.useFakeTimers().setSystemTime(new Date('2026-06-23T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    restoreEnv();
    jest.restoreAllMocks();
  });

  it('stores masked structured events without raw client identifiers', async () => {
    const delegate = {
      create: jest.fn().mockResolvedValue({ id: 'log-event-1' }),
      findUnique: jest.fn(),
    };
    const repository = makeRepository(delegate);
    const authContext = { clientId: 'company-site', keyId: 'local-test-key', hashKeyVersion: 'v1' };

    await expect(
      repository.save({
        authContext,
        event: makeEvent({ channel: 'security' }),
        payloadHash: 'payload-hash-1',
      })
    ).resolves.toEqual({ status: 'accepted' });

    expect(delegate.create).toHaveBeenCalledTimes(1);
    const data = delegate.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      schemaVersion: 1,
      eventId: 'evt-db-1',
      correlationId: 'log-20260622-000000-db',
      occurredAt: new Date('2026-06-22T00:00:00.000Z'),
      clientIdHash: hashIdentifier(authContext.clientId),
      keyIdHash: hashIdentifier(authContext.keyId),
      payloadHash: 'payload-hash-1',
      retentionExpiresAt: new Date('2027-06-23T00:00:00.000Z'),
      legalHold: false,
    });
    expect(JSON.stringify(data)).not.toContain(authContext.clientId);
    expect(JSON.stringify(data)).not.toContain(authContext.keyId);
  });

  it('returns duplicate when the unique row has the same payload hash', async () => {
    const delegate = {
      create: jest.fn().mockRejectedValue(uniqueViolation()),
      findUnique: jest.fn().mockResolvedValue({ payloadHash: 'same-hash' }),
    };
    const repository = makeRepository(delegate);

    await expect(
      repository.save({
        authContext: { clientId: 'company-site', keyId: 'local-test-key', hashKeyVersion: 'v1' },
        event: makeEvent(),
        payloadHash: 'same-hash',
      })
    ).resolves.toEqual({ status: 'duplicate' });
  });

  it('returns conflict when the unique row has a different payload hash', async () => {
    const delegate = {
      create: jest.fn().mockRejectedValue(uniqueViolation()),
      findUnique: jest.fn().mockResolvedValue({ payloadHash: 'other-hash' }),
    };
    const repository = makeRepository(delegate);

    await expect(
      repository.save({
        authContext: { clientId: 'company-site', keyId: 'local-test-key', hashKeyVersion: 'v1' },
        event: makeEvent(),
        payloadHash: 'new-hash',
      })
    ).resolves.toEqual({ status: 'conflict' });
  });
});

function restoreEnv(): void {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
