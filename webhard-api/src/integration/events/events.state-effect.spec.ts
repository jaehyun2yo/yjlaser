import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { OrdersService } from '../orders/orders.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

const nestingCompletedEnvelope = {
  idempotency_key: 'nesting_program:outbox-201:nesting.completed',
  attempt_no: 1,
  event_type: 'nesting.completed',
  event_version: 1,
  source_worker: 'nesting_program',
  source_version: '2.3.0',
  occurred_at: '2026-06-19T10:00:00+09:00',
  order_id: '11111111-1111-4111-8111-111111111111',
  job_id: 'job-nesting-001',
  result: 'success',
  processed_count: 1,
  payload: {
    nesting_status: 'NESTING_COMPLETED',
    production_status: 'LASER_READY',
  },
};

function makePrisma() {
  const tx = {
    jobEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'evt-nesting-001' }),
      update: jest.fn().mockResolvedValue({ id: 'evt-nesting-001' }),
    },
    order: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  return {
    tx,
    executeWithRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
    $transaction: jest.fn((callback: (transactionClient: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  };
}

async function createApp(prisma: object) {
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

  const app = moduleFixture.createNestApplication();
  await app.init();
  return app;
}

describe('EventsController order state effects', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('이벤트 타입 mapper에 지정된 주문 상태 축만 같은 transaction 안에서 갱신한다', async () => {
    const prisma = makePrisma();
    app = await createApp(prisma);

    const response = await request(app.getHttpServer())
      .post('/integration/events')
      .send(nestingCompletedEnvelope)
      .expect(201);

    expect(response.body).toEqual({
      event_id: 'evt-nesting-001',
      duplicate: false,
      accepted: true,
      applied_state_changes: [
        {
          target: 'order',
          id: nestingCompletedEnvelope.order_id,
          field: 'nesting_status',
          value: 'NESTING_COMPLETED',
        },
      ],
    });
    expect(prisma.tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: nestingCompletedEnvelope.order_id },
      data: { nestingStatus: 'NESTING_COMPLETED' },
    });
    expect(prisma.tx.jobEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-nesting-001' },
        data: { stateApplyStatus: 'applied' },
      })
    );
  });
});
