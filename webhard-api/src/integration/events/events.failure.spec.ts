import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { OrdersService } from '../orders/orders.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

const envelopeWithStateEffect = {
  idempotency_key: 'management_program:outbox-125:drawing.classified',
  attempt_no: 1,
  event_type: 'drawing.classified',
  event_version: 1,
  source_worker: 'management_program',
  source_version: '1.46.37',
  occurred_at: '2026-06-19T09:10:00+09:00',
  order_id: '11111111-1111-4111-8111-111111111111',
  job_id: 'job-001',
  result: 'success',
  processed_count: 1,
  payload: {
    classification_status: 'CLASSIFIED',
  },
};

const envelopeWithWorkerFailure = {
  idempotency_key: 'management_program:outbox-126:invoice.failed',
  attempt_no: 1,
  event_type: 'invoice.failed',
  event_version: 1,
  source_worker: 'management_program',
  source_version: '1.46.37',
  occurred_at: '2026-06-19T09:15:00+09:00',
  order_id: '11111111-1111-4111-8111-111111111111',
  contact_id: '11111111-2222-4333-8444-555555555555',
  inquiry_number: '260619-O-001',
  work_number: '260619-F-001',
  job_id: 'job-002',
  result: 'failed',
  processed_count: 0,
  payload: {
    invoice_id: 'invoice-001',
  },
  error: {
    code: 'POPBILL_FAILED',
    message: 'popbill send failed',
    retryable: true,
  },
};

const legacyStatusEvent = {
  orderId: '11111111-1111-4111-8111-111111111111',
  eventType: 'file_classified',
  source: 'management_program',
};

function makeEnvelopeFailurePrisma() {
  const tx = {
    jobEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'evt-001' }),
      update: jest.fn().mockResolvedValue({ id: 'evt-001' }),
    },
    order: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    jobFailure: {
      create: jest.fn().mockResolvedValue({ id: 'fail-001' }),
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

function makeWorkerFailurePrisma() {
  const tx = {
    jobEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'evt-worker-failed-001' }),
      update: jest.fn().mockResolvedValue({ id: 'evt-worker-failed-001' }),
    },
    order: {
      updateMany: jest.fn(),
    },
    jobFailure: {
      create: jest.fn().mockResolvedValue({ id: 'fail-worker-001' }),
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

function makeDuplicateWorkerFailurePrisma() {
  const tx = {
    jobEvent: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'evt-worker-failed-001',
        stateApplyStatus: 'failed',
        failureId: 'fail-worker-001',
        failure: {
          errorCode: 'POPBILL_FAILED',
          message: 'popbill send failed',
          retryable: true,
        },
      }),
      create: jest.fn(),
      update: jest.fn(),
    },
    order: {
      updateMany: jest.fn(),
    },
    jobFailure: {
      create: jest.fn(),
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

function makeLegacyFailurePrisma() {
  return {
    executeWithRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
    order: {
      findUnique: jest.fn().mockResolvedValue({ status: 'drawing_received' }),
    },
    orderEvent: {
      create: jest.fn().mockResolvedValue({
        id: 'order-event-001',
        orderId: legacyStatusEvent.orderId,
        eventType: legacyStatusEvent.eventType,
        fromStatus: 'drawing_received',
        toStatus: 'file_classified',
        source: legacyStatusEvent.source,
        actorName: null,
        data: null,
        message: null,
        createdAt: new Date('2026-06-19T09:10:00+09:00'),
      }),
    },
  };
}

async function createApp(prisma: object, ordersService: object) {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    controllers: [EventsController],
    providers: [
      EventsService,
      { provide: PrismaService, useValue: prisma },
      { provide: OrdersService, useValue: ordersService },
    ],
  })
    .overrideGuard(ApiKeyGuard)
    .useValue({ canActivate: jest.fn().mockReturnValue(true) })
    .compile();

  const app = moduleFixture.createNestApplication();
  await app.init();
  return app;
}

describe('EventsController state apply failure', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('envelope 상태 적용 실패를 성공처럼 반환하지 않고 failure 응답과 JobFailure로 기록한다', async () => {
    const prisma = makeEnvelopeFailurePrisma();
    app = await createApp(prisma, {});

    const response = await request(app.getHttpServer())
      .post('/integration/events')
      .send(envelopeWithStateEffect)
      .expect(201);

    expect(response.body).toEqual({
      event_id: 'evt-001',
      duplicate: false,
      accepted: false,
      state_apply_status: 'failed',
      failure_id: 'fail-001',
      applied_state_changes: [],
      error: {
        code: 'STATE_APPLY_FAILED',
        message: 'State apply failed for event type drawing.classified',
        retryable: true,
      },
    });
    expect(prisma.tx.jobEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.tx.order.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.tx.jobFailure.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: envelopeWithStateEffect.order_id,
          jobId: envelopeWithStateEffect.job_id,
          sourceWorker: envelopeWithStateEffect.source_worker,
          eventType: envelopeWithStateEffect.event_type,
          errorCode: 'STATE_APPLY_FAILED',
          retryable: true,
          lastEventId: 'evt-001',
        }),
      })
    );
    expect(prisma.tx.jobEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-001' },
        data: {
          stateApplyStatus: 'failed',
          failureId: 'fail-001',
        },
      })
    );
  });

  it('worker가 result=failed로 보고한 이벤트를 JobFailure로 기록한다', async () => {
    const prisma = makeWorkerFailurePrisma();
    app = await createApp(prisma, {});

    const response = await request(app.getHttpServer())
      .post('/integration/events')
      .send(envelopeWithWorkerFailure)
      .expect(201);

    expect(response.body).toEqual({
      event_id: 'evt-worker-failed-001',
      duplicate: false,
      accepted: false,
      state_apply_status: 'failed',
      failure_id: 'fail-worker-001',
      applied_state_changes: [],
      error: {
        code: 'POPBILL_FAILED',
        message: 'popbill send failed',
        retryable: true,
      },
    });
    expect(prisma.tx.jobEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.tx.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.tx.jobFailure.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: envelopeWithWorkerFailure.order_id,
          contactId: envelopeWithWorkerFailure.contact_id,
          inquiryNumber: envelopeWithWorkerFailure.inquiry_number,
          workNumber: envelopeWithWorkerFailure.work_number,
          jobId: envelopeWithWorkerFailure.job_id,
          sourceWorker: envelopeWithWorkerFailure.source_worker,
          eventType: envelopeWithWorkerFailure.event_type,
          errorCode: 'POPBILL_FAILED',
          message: 'popbill send failed',
          retryable: true,
          lastEventId: 'evt-worker-failed-001',
        }),
      })
    );
    expect(prisma.tx.jobEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-worker-failed-001' },
        data: {
          stateApplyStatus: 'failed',
          failureId: 'fail-worker-001',
        },
      })
    );
  });

  it('failed JobEvent 중복 수신은 기존 failure 결과를 반환하고 부작용을 만들지 않는다', async () => {
    const prisma = makeDuplicateWorkerFailurePrisma();
    app = await createApp(prisma, {});

    const response = await request(app.getHttpServer())
      .post('/integration/events')
      .send(envelopeWithWorkerFailure)
      .expect(201);

    expect(response.body).toEqual({
      event_id: 'evt-worker-failed-001',
      duplicate: true,
      accepted: false,
      state_apply_status: 'failed',
      failure_id: 'fail-worker-001',
      applied_state_changes: [],
      error: {
        code: 'POPBILL_FAILED',
        message: 'popbill send failed',
        retryable: true,
      },
    });
    expect(prisma.tx.jobEvent.create).not.toHaveBeenCalled();
    expect(prisma.tx.jobEvent.update).not.toHaveBeenCalled();
    expect(prisma.tx.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.tx.jobFailure.create).not.toHaveBeenCalled();
  });

  it('legacy 자동 상태 전이 실패도 201 성공으로 숨기지 않는다', async () => {
    const prisma = makeLegacyFailurePrisma();
    const ordersService = {
      updateOrderStatus: jest.fn().mockRejectedValue(new Error('status transition rejected')),
    };
    app = await createApp(prisma, ordersService);

    const response = await request(app.getHttpServer())
      .post('/integration/events')
      .send(legacyStatusEvent)
      .expect(409);

    expect(response.body).toMatchObject({
      event_id: 'order-event-001',
      accepted: false,
      state_apply_status: 'failed',
      error: {
        code: 'STATE_APPLY_FAILED',
        message: 'State apply failed for event type file_classified',
        retryable: true,
      },
    });
    expect(ordersService.updateOrderStatus).toHaveBeenCalledTimes(1);
  });
});
