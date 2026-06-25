import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthService } from '../../auth/auth.service';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { ContactTimelineService } from '../../contacts/contact-timeline.service';
import { ContactsService } from '../../contacts/contacts.service';
import { NumberService } from '../../number/number.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ApiKeyService } from '../auth/api-key.service';
import {
  getDefaultIntegrationPermissions,
  type IntegrationWorkerType,
} from '../auth/integration-permissions';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

const MANAGEMENT_PROGRAM_KEY = 'management-program-key';
const EXTERNAL_WEBHARD_KEY = 'external-webhard-key';
const ORDER_ID = 'order-001';
const CONTACT_ID = '11111111-2222-4333-8444-555555555555';
const INQUIRY_NUMBER = '260619-O-001';
const WORK_NUMBER = '260619-F-001';

function makeOrder() {
  const now = new Date('2026-06-19T09:00:00Z');
  return {
    id: ORDER_ID,
    contactId: BigInt(123),
    inquiryNumber: INQUIRY_NUMBER,
    companyName: '원컴퍼니',
    customerName: null,
    customerPhone: null,
    title: '타임라인 조회 주문',
    description: null,
    orderType: 'standard',
    status: 'received',
    productionStatus: 'DXF_READY',
    confirmationStatus: 'CONFIRMED',
    classificationStatus: 'CLASSIFIED',
    nestingStatus: null,
    billingStatus: null,
    priority: 'normal',
    drawingFileCount: 0,
    webhardFolderId: null,
    dxfClassifiedCount: 0,
    dxfTotalPrice: 0,
    nestingSheetCount: null,
    nestingUtilization: null,
    receivedAt: now,
    confirmedAt: null,
    cuttingStartedAt: null,
    cuttingCompletedAt: null,
    postProcessingStartedAt: null,
    postProcessingCompletedAt: null,
    deliveredAt: null,
    scheduledAutoCompleteAt: null,
    deliveryMethod: null,
    deliveryAddress: null,
    deliveryNote: null,
    memo: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeOrderEvent() {
  return {
    id: 'order-event-001',
    orderId: ORDER_ID,
    contactId: CONTACT_ID,
    inquiryNumber: INQUIRY_NUMBER,
    workNumber: WORK_NUMBER,
    eventType: 'status_changed',
    fromStatus: 'received',
    toStatus: 'drawing',
    source: 'admin',
    actorName: '관리자',
    data: null,
    message: '상태 변경',
    createdAt: new Date('2026-06-19T09:03:00Z'),
  };
}

function makeJobEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-event-001',
    idempotencyKey: 'management_program:outbox-1',
    eventType: 'drawing.classified',
    eventVersion: 1,
    sourceWorker: 'management_program',
    sourceVersion: '1.2.3',
    orderId: ORDER_ID,
    contactId: CONTACT_ID,
    inquiryNumber: INQUIRY_NUMBER,
    workNumber: WORK_NUMBER,
    jobId: 'job-001',
    integrationRunId: null,
    workerLocalId: 'local-001',
    result: 'success',
    occurredAt: new Date('2026-06-19T09:05:00Z'),
    receivedAt: new Date('2026-06-19T09:05:02Z'),
    durationMs: 250,
    processedCount: 1,
    payload: { raw: 'worker-payload' },
    stateApplyStatus: 'applied',
    failureId: null,
    orderEventId: 'order-event-derived',
    createdAt: new Date('2026-06-19T09:05:03Z'),
    ...overrides,
  };
}

function makePrisma() {
  return {
    executeWithRetry: jest.fn((fn: () => unknown) => fn()),
    order: {
      findUnique: jest.fn().mockResolvedValue(makeOrder()),
    },
    orderEvent: {
      findMany: jest.fn().mockResolvedValue([makeOrderEvent()]),
    },
    jobEvent: {
      findMany: jest.fn().mockResolvedValue([makeJobEvent()]),
    },
    contact: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: CONTACT_ID,
          inquiryNumber: INQUIRY_NUMBER,
          workNumber: WORK_NUMBER,
        },
      ]),
    },
  };
}

describe('Integration orders timeline API', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const workerTypeByKey = new Map<string, IntegrationWorkerType>([
      [MANAGEMENT_PROGRAM_KEY, 'management_program'],
      [EXTERNAL_WEBHARD_KEY, 'external_webhard_sync'],
    ]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        OrdersService,
        ApiKeyGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: NumberService, useValue: { generateNumber: jest.fn() } },
        { provide: ContactTimelineService, useValue: { recordChange: jest.fn() } },
        { provide: ContactsService, useValue: {} },
        {
          provide: ApiKeyService,
          useValue: {
            validateKey: jest.fn(async (rawKey: string) => {
              const workerType = workerTypeByKey.get(rawKey);
              if (!workerType) {
                return null;
              }

              return {
                id: `key-${workerType}`,
                programType: workerType,
                permissions: [...getDefaultIntegrationPermissions(workerType)],
              };
            }),
          },
        },
        {
          provide: AuthService,
          useValue: {
            verifySession: jest.fn().mockReturnValue(null),
            verifyWorkerSession: jest.fn().mockReturnValue(null),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns merged OrderEvent and JobEvent timeline entries for job/read API keys', async () => {
    const response = await request(app.getHttpServer())
      .get(`/integration/orders/${ORDER_ID}/timeline`)
      .set('X-API-Key', MANAGEMENT_PROGRAM_KEY)
      .expect(200);

    expect(response.body).toMatchObject({
      order_id: ORDER_ID,
      contact_id: CONTACT_ID,
      legacy_order_contact_id: 123,
      inquiry_number: INQUIRY_NUMBER,
      work_number: WORK_NUMBER,
      company_name: '원컴퍼니',
      production_status: 'DXF_READY',
      confirmation_status: 'CONFIRMED',
      classification_status: 'CLASSIFIED',
      nesting_status: null,
      billing_status: null,
    });
    expect(response.body.events.map((event: { timeline_id: string }) => event.timeline_id)).toEqual(
      ['job_event:job-event-001', 'order_event:order-event-001']
    );
    expect(response.body.events[0]).toMatchObject({
      source_model: 'job_event',
      contact_id: CONTACT_ID,
      inquiry_number: INQUIRY_NUMBER,
      work_number: WORK_NUMBER,
      event_type: 'drawing.classified',
      source_worker: 'management_program',
      result: 'success',
      state_apply_status: 'applied',
      processed_count: 1,
      duration_ms: 250,
    });
    expect(response.body.events[0]).not.toHaveProperty('payload');
    expect(response.body.events[0]).not.toHaveProperty('idempotencyKey');
  });

  it('returns Contact-only JobEvents matched through the linked Contact identity', async () => {
    prisma.jobEvent.findMany.mockResolvedValue([
      makeJobEvent({
        id: 'job-event-contact-only',
        orderId: null,
        inquiryNumber: null,
        workNumber: null,
      }),
    ]);

    const response = await request(app.getHttpServer())
      .get(`/integration/orders/${ORDER_ID}/timeline`)
      .set('X-API-Key', MANAGEMENT_PROGRAM_KEY)
      .expect(200);

    const jobEventQuery = prisma.jobEvent.findMany.mock.calls[0][0] as {
      where: { OR: Record<string, string>[] };
    };
    expect(jobEventQuery.where.OR).toEqual([
      { orderId: ORDER_ID },
      {
        AND: [
          { orderId: null },
          {
            OR: [
              { contactId: CONTACT_ID },
              { inquiryNumber: INQUIRY_NUMBER },
              { workNumber: WORK_NUMBER },
            ],
          },
        ],
      },
    ]);
    expect(response.body.events.map((event: { timeline_id: string }) => event.timeline_id)).toEqual(
      ['job_event:job-event-contact-only', 'order_event:order-event-001']
    );
    expect(response.body.events[0]).toMatchObject({
      source_model: 'job_event',
      order_id: ORDER_ID,
      contact_id: CONTACT_ID,
      inquiry_number: INQUIRY_NUMBER,
      work_number: WORK_NUMBER,
    });
  });

  it('returns 404 when the order does not exist', async () => {
    prisma.order.findUnique.mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .get('/integration/orders/missing-order/timeline')
      .set('X-API-Key', MANAGEMENT_PROGRAM_KEY)
      .expect(404);
  });

  it('rejects API keys without job/read permission before querying timeline data', async () => {
    await request(app.getHttpServer())
      .get(`/integration/orders/${ORDER_ID}/timeline`)
      .set('X-API-Key', EXTERNAL_WEBHARD_KEY)
      .expect(403);

    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });
});
