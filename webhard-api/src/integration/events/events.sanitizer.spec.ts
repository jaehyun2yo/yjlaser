import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import {
  sanitizeIntegrationEventData,
  sanitizeIntegrationEventText,
} from '../../common/sensitive-data-sanitizer.util';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { OrdersService } from '../orders/orders.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

const envelopeWithSensitiveData = {
  idempotency_key: 'management_program:outbox-127:worker.failed',
  attempt_no: 1,
  event_type: 'worker.failed',
  event_version: 1,
  source_worker: 'management_program',
  source_version: '1.46.37',
  occurred_at: '2026-06-19T09:20:00+09:00',
  order_id: '11111111-1111-4111-8111-111111111111',
  job_id: 'job-003',
  result: 'failed',
  processed_count: 0,
  payload: {
    safe_status: 'FAILED',
    file_id: 'file-1',
    token: 'raw-token',
    nested: {
      apiKey: 'raw-api-key',
      localPath: 'C:\\Users\\jaehy\\customer\\drawing.dxf',
      item_count: 1,
    },
    notes: ['safe note', 'downloadUrl=https://drive.example.com/file?token=raw-url-token'],
    customer_note: '홍길동 010-1234-5678',
  },
  error: {
    code: 'WORKER_FAILED',
    message:
      'worker failed token=raw-token url=https://drive.example.com/file?token=raw-url-token phone=010-1234-5678',
    retryable: true,
  },
};

function makePrisma() {
  const tx = {
    jobEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'evt-sensitive-001' }),
      update: jest.fn().mockResolvedValue({ id: 'evt-sensitive-001' }),
    },
    jobFailure: {
      create: jest.fn().mockResolvedValue({ id: 'fail-sensitive-001' }),
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

describe('EventsController sanitizer', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('event payload와 worker failure message에서 민감값을 제거한다', async () => {
    const prisma = makePrisma();
    app = await createApp(prisma);

    const response = await request(app.getHttpServer())
      .post('/integration/events')
      .send(envelopeWithSensitiveData)
      .expect(201);

    const persistedPayload = prisma.tx.jobEvent.create.mock.calls[0][0].data.payload;
    const serializedPayload = JSON.stringify(persistedPayload);
    const persistedFailureMessage = prisma.tx.jobFailure.create.mock.calls[0][0].data.message;

    expect(persistedPayload).toMatchObject({
      safe_status: 'FAILED',
      file_id: 'file-1',
      token: '[REDACTED]',
      nested: {
        apiKey: '[REDACTED]',
        localPath: '[REDACTED]',
        item_count: 1,
      },
      customer_note: '[REDACTED]',
    });
    expect(serializedPayload).toContain('safe note');
    expect(serializedPayload).not.toContain('raw-token');
    expect(serializedPayload).not.toContain('raw-api-key');
    expect(serializedPayload).not.toContain('drive.example.com');
    expect(serializedPayload).not.toContain('010-1234-5678');
    expect(serializedPayload).not.toContain('C:\\Users\\jaehy');

    expect(persistedFailureMessage).not.toContain('raw-token');
    expect(persistedFailureMessage).not.toContain('drive.example.com');
    expect(persistedFailureMessage).not.toContain('010-1234-5678');
    expect(response.body.error.message).toBe(persistedFailureMessage);
  });
});

describe('sanitizeIntegrationEventData', () => {
  it('safe 값은 유지하고 민감 key와 문자열 패턴을 redaction한다', () => {
    const sanitized = sanitizeIntegrationEventData({
      status: 'CLASSIFIED',
      order_id: 'order-1',
      token: 'raw-token',
      nested: {
        apiKey: 'raw-api-key',
        download: 'url=https://drive.example.com/file?token=raw-url-token',
      },
    });

    const serialized = JSON.stringify(sanitized);

    expect(sanitized).toMatchObject({
      status: 'CLASSIFIED',
      order_id: 'order-1',
      token: '[REDACTED]',
      nested: {
        apiKey: '[REDACTED]',
        download: 'url=[REDACTED_URL]',
      },
    });
    expect(serialized).not.toContain('raw-token');
    expect(serialized).not.toContain('raw-api-key');
    expect(serialized).not.toContain('drive.example.com');
  });
});

describe('sanitizeIntegrationEventText', () => {
  it('message 문자열의 secret assignment, URL, 전화번호를 redaction한다', () => {
    const sanitized = sanitizeIntegrationEventText(
      'failed token=raw-token url=https://drive.example.com/file?token=raw-url-token phone=010-1234-5678'
    );

    expect(sanitized).toBe('failed token=[REDACTED] url=[REDACTED_URL] phone=[REDACTED_PHONE]');
  });
});
