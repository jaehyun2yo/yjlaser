import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { OrdersService } from '../orders/orders.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

const validEnvelope = {
  idempotency_key: 'management_program:outbox-123:worker.ping',
  attempt_no: 1,
  event_type: 'worker.ping',
  event_version: 1,
  source_worker: 'management_program',
  source_version: '1.46.37',
  occurred_at: '2026-06-19T09:00:00+09:00',
  order_id: 'order-001',
  job_id: 'job-001',
  integration_run_id: 'run-001',
  worker_local_id: 'outbox-123',
  result: 'success',
  duration_ms: 1234,
  processed_count: 1,
  payload: {
    heartbeat: true,
  },
};

function makePrisma() {
  const createdEvent = {
    id: 'evt-001',
    idempotencyKey: validEnvelope.idempotency_key,
  };
  const jobEvent = {
    findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(createdEvent),
    create: jest.fn().mockResolvedValue(createdEvent),
  };

  return {
    executeWithRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
    $transaction: jest.fn((callback: (tx: { jobEvent: typeof jobEvent }) => Promise<unknown>) =>
      callback({ jobEvent })
    ),
    jobEvent,
  };
}

describe('EventsController idempotency', () => {
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

  it('같은 idempotency_key 재전송은 duplicate 응답을 반환하고 JobEvent를 추가 생성하지 않는다', async () => {
    const first = await request(app.getHttpServer())
      .post('/integration/events')
      .send(validEnvelope)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/integration/events')
      .send(validEnvelope)
      .expect(201);

    expect(first.body).toEqual({
      event_id: 'evt-001',
      duplicate: false,
      accepted: true,
      applied_state_changes: [],
    });
    expect(second.body).toEqual({
      event_id: 'evt-001',
      duplicate: true,
      accepted: true,
      applied_state_changes: [],
    });
    expect(prisma.jobEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.jobEvent.findUnique).toHaveBeenCalledTimes(2);
  });
});
