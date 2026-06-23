import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import type { EventEnvelopeDto } from './dto/event-envelope.dto';
import { EventsService } from './events.service';

const successEnvelope: EventEnvelopeDto = {
  idempotency_key: 'management_program:outbox-128:worker.ping',
  attempt_no: 1,
  event_type: 'worker.ping',
  event_version: 1,
  source_worker: 'management_program',
  source_version: '1.46.37',
  occurred_at: '2026-06-19T09:25:00+09:00',
  order_id: '11111111-1111-4111-8111-111111111111',
  job_id: 'job-004',
  result: 'success',
  processed_count: 1,
  payload: {
    heartbeat: true,
    token: 'raw-token',
  },
};

const failedEnvelope: EventEnvelopeDto = {
  idempotency_key: 'management_program:outbox-129:worker.failed',
  attempt_no: 1,
  event_type: 'worker.failed',
  event_version: 1,
  source_worker: 'management_program',
  source_version: '1.46.37',
  occurred_at: '2026-06-19T09:26:00+09:00',
  order_id: '11111111-1111-4111-8111-111111111111',
  job_id: 'job-005',
  result: 'failed',
  processed_count: 0,
  payload: {
    reason: 'send failed',
  },
  error: {
    code: 'WORKER_FAILED',
    message: 'worker failed',
    retryable: true,
  },
};

const legacyNestingEvent = {
  orderId: '11111111-1111-4111-8111-111111111111',
  eventType: 'nesting_completed',
  source: 'management_program',
  data: {
    plywood_usage: [{ item_id: 'item-001', quantity: 2 }],
  },
};

function makeSuccessPrisma() {
  const tx = {
    jobEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'evt-log-success-001' }),
      update: jest.fn(),
    },
  };

  return {
    executeWithRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
    $transaction: jest.fn((callback: (transactionClient: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  };
}

function makeFailurePrisma() {
  const tx = {
    jobEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'evt-log-failed-001' }),
      update: jest.fn().mockResolvedValue({ id: 'evt-log-failed-001' }),
    },
    jobFailure: {
      create: jest.fn().mockResolvedValue({ id: 'fail-log-001' }),
    },
  };

  return {
    executeWithRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
    $transaction: jest.fn((callback: (transactionClient: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  };
}

function makeThrowingPrisma() {
  return {
    executeWithRetry: jest.fn().mockRejectedValue(new Error('token=raw-token')),
  };
}

function makeLegacyAutoStockOutFailurePrisma() {
  return {
    executeWithRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
    order: {
      findUnique: jest.fn().mockResolvedValue({ status: 'nesting_queued' }),
    },
    orderEvent: {
      create: jest.fn().mockResolvedValue({
        id: 'order-event-log-001',
        orderId: legacyNestingEvent.orderId,
        eventType: legacyNestingEvent.eventType,
        fromStatus: 'nesting_queued',
        toStatus: 'nesting_complete',
        source: legacyNestingEvent.source,
        actorName: null,
        data: legacyNestingEvent.data,
        message: null,
        createdAt: new Date('2026-06-19T09:30:00+09:00'),
      }),
    },
    $transaction: jest.fn().mockRejectedValue(new Error('token=raw-token path=C:\\Users\\jaehy')),
  };
}

function makeOrdersService() {
  return {
    updateOrderStatus: jest.fn().mockResolvedValue(undefined),
  };
}

function hashIdempotencyKey(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function makeService(prisma: object) {
  return new EventsService(prisma as PrismaService, {} as OrdersService);
}

describe('EventsService logging', () => {
  let debugSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    debugSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('성공 이벤트 처리 start/success 로그에 elapsed, count, idempotency hash를 남긴다', async () => {
    const service = makeService(makeSuccessPrisma());

    await service.createEvent(successEnvelope);

    const debugMessages = debugSpy.mock.calls.map(([message]) => String(message)).join('\n');

    expect(debugMessages).toContain('Job event create started');
    expect(debugMessages).toContain('Job event create succeeded');
    expect(debugMessages).toContain(
      `idempotencyKeyHash=${hashIdempotencyKey(successEnvelope.idempotency_key)}`
    );
    expect(debugMessages).toContain('sourceWorker=management_program');
    expect(debugMessages).toContain('eventType=worker.ping');
    expect(debugMessages).toContain('processedCount=1');
    expect(debugMessages).toMatch(/elapsedMs=\d+/);
    expect(debugMessages).not.toContain(successEnvelope.idempotency_key);
    expect(debugMessages).not.toContain('raw-token');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('실패 이벤트 처리 failure 로그에 failureId, errorCode, elapsed, idempotency hash를 남긴다', async () => {
    const service = makeService(makeFailurePrisma());

    await service.createEvent(failedEnvelope);

    const warnMessages = warnSpy.mock.calls.map(([message]) => String(message)).join('\n');

    expect(warnMessages).toContain('Job event create failed');
    expect(warnMessages).toContain('failureId=fail-log-001');
    expect(warnMessages).toContain('errorCode=WORKER_FAILED');
    expect(warnMessages).toContain(
      `idempotencyKeyHash=${hashIdempotencyKey(failedEnvelope.idempotency_key)}`
    );
    expect(warnMessages).toContain('sourceWorker=management_program');
    expect(warnMessages).toContain('eventType=worker.failed');
    expect(warnMessages).toMatch(/elapsedMs=\d+/);
    expect(warnMessages).not.toContain(failedEnvelope.idempotency_key);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('예외 발생 로그에는 elapsed와 error type만 남기고 raw key/message를 남기지 않는다', async () => {
    const service = makeService(makeThrowingPrisma());

    await expect(service.createEvent(successEnvelope)).rejects.toThrow('token=raw-token');

    const errorMessages = errorSpy.mock.calls.map(([message]) => String(message)).join('\n');

    expect(errorMessages).toContain('Job event create errored');
    expect(errorMessages).toContain(
      `idempotencyKeyHash=${hashIdempotencyKey(successEnvelope.idempotency_key)}`
    );
    expect(errorMessages).toContain('error=Error');
    expect(errorMessages).toMatch(/elapsedMs=\d+/);
    expect(errorMessages).not.toContain(successEnvelope.idempotency_key);
    expect(errorMessages).not.toContain('raw-token');
  });

  it('자동 출고 실패 로그에는 error type만 남기고 raw error message를 남기지 않는다', async () => {
    const service = new EventsService(
      makeLegacyAutoStockOutFailurePrisma() as unknown as PrismaService,
      makeOrdersService() as unknown as OrdersService
    );

    await service.createEvent(legacyNestingEvent);

    const warnMessages = warnSpy.mock.calls.map(([message]) => String(message)).join('\n');

    expect(warnMessages).toContain('Auto stock out failed');
    expect(warnMessages).toContain(`orderId=${legacyNestingEvent.orderId}`);
    expect(warnMessages).toContain('error=Error');
    expect(warnMessages).not.toContain('raw-token');
    expect(warnMessages).not.toContain('C:\\Users\\jaehy');
  });
});
