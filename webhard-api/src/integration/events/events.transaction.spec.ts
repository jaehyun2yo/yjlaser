import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { OrdersService } from '../orders/orders.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

const validEnvelope = {
  idempotency_key: 'management_program:outbox-124:worker.ping',
  attempt_no: 1,
  event_type: 'worker.ping',
  event_version: 1,
  source_worker: 'management_program',
  source_version: '1.46.37',
  occurred_at: '2026-06-19T09:05:00+09:00',
  order_id: 'order-001',
  job_id: 'job-001',
  result: 'success',
  processed_count: 1,
  payload: {
    heartbeat: true,
  },
};

function makePrisma() {
  const tx = {
    jobEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'evt-transaction-001' }),
    },
  };

  return {
    tx,
    executeWithRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
    $transaction: jest.fn((callback: (transactionClient: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
    jobEvent: {
      findUnique: jest.fn(() => {
        throw new Error('root jobEvent.findUnique should not be used');
      }),
      create: jest.fn(() => {
        throw new Error('root jobEvent.create should not be used');
      }),
    },
  };
}

describe('EventsController JobEvent transaction', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        EventsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrdersService, useValue: {} },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('JobEvent duplicate check와 create를 같은 transaction client 안에서 실행한다', async () => {
    await request(app.getHttpServer())
      .post('/integration/events')
      .send(validEnvelope)
      .expect(201)
      .expect({
        event_id: 'evt-transaction-001',
        duplicate: false,
        accepted: true,
        applied_state_changes: [],
      });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.tx.jobEvent.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.tx.jobEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.jobEvent.findUnique).not.toHaveBeenCalled();
    expect(prisma.jobEvent.create).not.toHaveBeenCalled();
  });
});
