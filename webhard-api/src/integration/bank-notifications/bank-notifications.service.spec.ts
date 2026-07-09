import { Logger } from '@nestjs/common';
import { BankNotificationsService } from './bank-notifications.service';

function makeCollectDto(input: Record<string, unknown> = {}) {
  return {
    event_id: 'ibk-event-1',
    device_id: 'dedicated-phone-raw-id',
    source_package: 'com.ibk.android',
    notification_key: 'raw-notification-key',
    posted_at: '2026-06-29T01:02:03.000Z',
    raw_title: 'IBK기업은행',
    raw_text: '입금 123,000원 테스트거래처',
    raw_big_text: '입금 123,000원 테스트거래처 잔액 9,999,999원',
    raw_payload: { template: 'account-deposit' },
    parsed_direction: 'DEPOSIT',
    parsed_category: '입금',
    parsed_amount_won: 123000,
    parsed_counterparty: '테스트거래처',
    ...input,
  };
}

function makeRecommendedCollectDto(input: Record<string, unknown> = {}) {
  return {
    event_id: 'ibk-event-recommended-1',
    device_id: 'dev-4a5f2e9d6a8c1b00',
    source_app: 'bank_tracker',
    posted_at: '2026-06-29T01:02:03.000Z',
    raw_title: 'IBK기업은행',
    raw_text: '입금 123,000원 테스트거래처',
    raw_big_text: null,
    ...input,
  };
}

function makePrismaMock() {
  return {
    bankNotificationEvent: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    bankNotificationBackupBatch: {
      create: jest.fn(),
    },
  };
}

function serializeLoggerCalls(...spies: jest.SpyInstance[]): string {
  return JSON.stringify(
    spies.flatMap((spy) =>
      spy.mock.calls.flatMap((call: unknown[]) => call.map((value: unknown) => String(value)))
    )
  );
}

describe('BankNotificationsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores a new notification event without logging raw bank text', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const prisma = makePrismaMock();
    prisma.bankNotificationEvent.create.mockResolvedValue({
      id: 'bank-event-db-id',
      eventId: 'ibk-event-1',
    });
    const service = new BankNotificationsService(prisma as never);

    const result = await service.collect(makeCollectDto());

    expect(result).toEqual({ event_id: 'ibk-event-1', status: 'accepted', id: 'bank-event-db-id' });
    expect(prisma.bankNotificationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: 'ibk-event-1',
        sourcePackage: 'com.ibk.android',
        rawTitle: 'IBK기업은행',
        rawText: '입금 123,000원 테스트거래처',
        rawBigText: '입금 123,000원 테스트거래처 잔액 9,999,999원',
        rawPayload: expect.objectContaining({
          template: 'account-deposit',
          parsed_direction: 'DEPOSIT',
          parsed_category: '입금',
          parsed_amount_won: 123000,
          parsed_counterparty: '테스트거래처',
        }),
        payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        deviceIdHash: expect.not.stringContaining('dedicated-phone-raw-id'),
        notificationKeyHash: expect.not.stringContaining('raw-notification-key'),
      }),
    });
    expect(serializeLoggerCalls(logSpy)).not.toContain('입금 123,000원');
    expect(serializeLoggerCalls(logSpy)).not.toContain('dedicated-phone-raw-id');
    expect(serializeLoggerCalls(logSpy)).not.toContain('raw-notification-key');
  });

  it('stores the recommended minimal bank tracker payload with safe defaults', async () => {
    const prisma = makePrismaMock();
    prisma.bankNotificationEvent.create.mockResolvedValue({
      id: 'bank-event-db-id',
      eventId: 'ibk-event-recommended-1',
    });
    const service = new BankNotificationsService(prisma as never);

    const result = await service.collect(makeRecommendedCollectDto() as never);

    expect(result).toEqual({
      event_id: 'ibk-event-recommended-1',
      status: 'accepted',
      id: 'bank-event-db-id',
    });
    expect(prisma.bankNotificationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: 'ibk-event-recommended-1',
        sourcePackage: 'bank_tracker',
        rawTitle: 'IBK기업은행',
        rawText: '입금 123,000원 테스트거래처',
        rawBigText: null,
        rawPayload: { source_app: 'bank_tracker' },
        notificationKeyHash: expect.not.stringContaining('ibk-event-recommended-1'),
      }),
    });
  });

  it('ignores codex test notifications and deletes existing test marker rows', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const prisma = makePrismaMock();
    prisma.bankNotificationEvent.deleteMany.mockResolvedValue({ count: 1 });
    const service = new BankNotificationsService(prisma as never);

    const result = await service.collect(
      makeCollectDto({
        event_id: 'ibk-test-event',
        raw_text:
          '[입금] 789,000원 주식회사마루크리에 -> 내입출금통장 잔액 7,777,777원 CODEx-PROD-20260708020205',
        parsed_amount_won: 789000,
        parsed_counterparty: '주식회사마루크리에',
      })
    );

    expect(result).toEqual({
      event_id: 'ibk-test-event',
      status: 'ignored_test_notification',
      id: 'ibk-test-event',
    });
    expect(prisma.bankNotificationEvent.create).not.toHaveBeenCalled();
    expect(prisma.bankNotificationEvent.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        deletedAt: null,
        OR: expect.arrayContaining([
          { rawTitle: expect.objectContaining({ contains: 'CODEX-PROD-' }) },
          { rawText: expect.objectContaining({ contains: 'CODEX-PROD-' }) },
          { rawBigText: expect.objectContaining({ contains: 'CODEX-PROD-' }) },
        ]),
      }),
    });
    expect(serializeLoggerCalls(logSpy)).not.toContain('주식회사마루크리에');
    expect(serializeLoggerCalls(logSpy)).not.toContain('789,000원');
  });

  it('returns duplicate for same event_id and same payload hash', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const prisma = makePrismaMock();
    prisma.bankNotificationEvent.create.mockRejectedValueOnce({ code: 'P2002' });
    prisma.bankNotificationEvent.findUnique.mockResolvedValueOnce({
      id: 'existing-id',
      payloadHash: 'same',
    });
    const service = new BankNotificationsService(prisma as never);
    jest.spyOn(service, 'hashCollectPayload').mockReturnValue('same');

    const result = await service.collect(makeCollectDto());

    expect(result).toEqual({ event_id: 'ibk-event-1', status: 'duplicate', id: 'existing-id' });
  });

  it('returns duplicate for same event_id even when payload hash changed', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const prisma = makePrismaMock();
    prisma.bankNotificationEvent.create.mockRejectedValueOnce({ code: 'P2002' });
    prisma.bankNotificationEvent.findUnique.mockResolvedValueOnce({
      id: 'existing-id',
      payloadHash: 'different',
    });
    const service = new BankNotificationsService(prisma as never);
    jest.spyOn(service, 'hashCollectPayload').mockReturnValue('current');

    const result = await service.collect(makeCollectDto());

    expect(result).toEqual({ event_id: 'ibk-event-1', status: 'duplicate', id: 'existing-id' });
  });

  it('marks returned new events as fetched when listing', async () => {
    const prisma = makePrismaMock();
    prisma.bankNotificationEvent.findMany.mockResolvedValue([
      {
        id: 'new-id',
        eventId: 'ibk-event-new',
        status: 'new',
        rawPayload: {
          parsed_direction: 'DEPOSIT',
          parsed_category: '입금',
          parsed_amount_won: 123000,
          parsed_counterparty: '테스트거래처',
        },
      },
      { id: 'fetched-id', eventId: 'ibk-event-fetched', status: 'fetched' },
    ]);
    prisma.bankNotificationEvent.updateMany.mockResolvedValue({ count: 1 });
    const service = new BankNotificationsService(prisma as never);

    const result = await service.list({ status: 'new', limit: 50, offset: 100 });

    expect(result).toEqual({
      count: 2,
      events: [
        {
          id: 'new-id',
          event_id: 'ibk-event-new',
          status: 'fetched',
          raw_payload: {
            parsed_direction: 'DEPOSIT',
            parsed_category: '입금',
            parsed_amount_won: 123000,
            parsed_counterparty: '테스트거래처',
          },
          parsed_direction: 'DEPOSIT',
          parsed_category: '입금',
          parsed_amount_won: 123000,
          parsed_counterparty: '테스트거래처',
        },
        { id: 'fetched-id', event_id: 'ibk-event-fetched', status: 'fetched' },
      ],
    });
    expect(prisma.bankNotificationEvent.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['new-id'] }, status: 'new' },
      data: { status: 'fetched', fetchedAt: expect.any(Date) },
    });
    expect(prisma.bankNotificationEvent.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, status: 'new' },
      orderBy: { postedAt: 'asc' },
      take: 50,
      skip: 100,
    });
  });

  it('rejects retention deletion without backup batch', async () => {
    const service = new BankNotificationsService(makePrismaMock() as never);

    await expect(service.deleteBackedUpRetention({ older_than_days: 365 })).rejects.toThrow(
      'BANK_NOTIFICATION_BACKUP_REQUIRED'
    );
  });

  it('marks selected events as processed', async () => {
    const prisma = makePrismaMock();
    prisma.bankNotificationEvent.updateMany.mockResolvedValue({ count: 2 });
    const service = new BankNotificationsService(prisma as never);

    const result = await service.markProcessed({ event_ids: ['ibk-event-1', 'ibk-event-2'] });

    expect(result).toEqual({ updated: 2 });
    expect(prisma.bankNotificationEvent.updateMany).toHaveBeenCalledWith({
      where: { eventId: { in: ['ibk-event-1', 'ibk-event-2'] }, deletedAt: null },
      data: { status: 'processed', processedAt: expect.any(Date) },
    });
  });

  it('deletes codex test notification marker rows on request', async () => {
    const prisma = makePrismaMock();
    prisma.bankNotificationEvent.deleteMany.mockResolvedValue({ count: 2 });
    const service = new BankNotificationsService(prisma as never);

    const result = await service.deleteTestNotifications();

    expect(result).toEqual({ deleted: 2 });
    expect(prisma.bankNotificationEvent.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        deletedAt: null,
        OR: expect.arrayContaining([
          { rawTitle: expect.objectContaining({ contains: 'CODEX-PROD-' }) },
          { rawText: expect.objectContaining({ contains: 'CODEX-PROD-' }) },
          { rawBigText: expect.objectContaining({ contains: 'CODEX-PROD-' }) },
        ]),
      }),
    });
  });

  it('creates a backup batch and attaches backed up events', async () => {
    const prisma = makePrismaMock();
    prisma.bankNotificationBackupBatch.create.mockResolvedValue({ id: 'backup-batch-id' });
    prisma.bankNotificationEvent.updateMany.mockResolvedValue({ count: 2 });
    const service = new BankNotificationsService(prisma as never);

    const result = await service.createBackupBatch({
      year: 2026,
      file_name: 'bank-notifications-2026.jsonl',
      sha256: 'a'.repeat(64),
      event_count: 2,
      posted_from: '2026-01-01T00:00:00.000Z',
      posted_to: '2026-12-31T23:59:59.999Z',
      event_ids: ['ibk-event-1', 'ibk-event-2'],
    });

    expect(result).toEqual({ id: 'backup-batch-id' });
    expect(prisma.bankNotificationBackupBatch.create).toHaveBeenCalledWith({
      data: {
        year: 2026,
        fileName: 'bank-notifications-2026.jsonl',
        sha256: 'a'.repeat(64),
        eventCount: 2,
        postedFrom: new Date('2026-01-01T00:00:00.000Z'),
        postedTo: new Date('2026-12-31T23:59:59.999Z'),
      },
    });
    expect(prisma.bankNotificationEvent.updateMany).toHaveBeenCalledWith({
      where: { eventId: { in: ['ibk-event-1', 'ibk-event-2'] }, deletedAt: null },
      data: { backupBatchId: 'backup-batch-id' },
    });
  });

  it('rejects backup batch registration when event count does not match event ids', async () => {
    const service = new BankNotificationsService(makePrismaMock() as never);

    await expect(
      service.createBackupBatch({
        year: 2026,
        file_name: 'bank-notifications-2026.jsonl',
        sha256: 'a'.repeat(64),
        event_count: 2,
        posted_from: '2026-01-01T00:00:00.000Z',
        posted_to: '2026-12-31T23:59:59.999Z',
        event_ids: ['ibk-event-1'],
      })
    ).rejects.toThrow('BANK_NOTIFICATION_BACKUP_EVENT_COUNT_MISMATCH');
  });

  it('deletes only events tied to a registered backup batch and older than retention', async () => {
    const prisma = makePrismaMock();
    prisma.bankNotificationEvent.deleteMany.mockResolvedValue({ count: 3 });
    const service = new BankNotificationsService(prisma as never);

    const result = await service.deleteBackedUpRetention({
      backup_batch_id: 'backup-batch-id',
      older_than_days: 365,
    });

    expect(result).toEqual({ deleted: 3 });
    expect(prisma.bankNotificationEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        backupBatchId: 'backup-batch-id',
        postedAt: { lte: expect.any(Date) },
      },
    });
  });

  it('rejects retention deletion below the 365 day minimum', async () => {
    const service = new BankNotificationsService(makePrismaMock() as never);

    await expect(
      service.deleteBackedUpRetention({
        backup_batch_id: 'backup-batch-id',
        older_than_days: 364,
      })
    ).rejects.toThrow('BANK_NOTIFICATION_RETENTION_MINIMUM_DAYS');
  });
});
