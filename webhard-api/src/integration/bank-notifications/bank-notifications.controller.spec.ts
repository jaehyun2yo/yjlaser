import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthService } from '../../auth/auth.service';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ApiKeyService } from '../auth/api-key.service';
import {
  getDefaultIntegrationPermissions,
  type IntegrationWorkerType,
} from '../auth/integration-permissions';
import { BankNotificationsController } from './bank-notifications.controller';
import { BankNotificationsService } from './bank-notifications.service';

const COLLECTOR_KEY = 'collector-key';
const MANAGEMENT_KEY = 'management-key';

function makeCollectPayload() {
  return {
    event_id: 'ibk-controller-event-1',
    device_id: 'dedicated-phone-raw-id',
    source_package: 'com.ibk.android',
    notification_key: 'raw-notification-key',
    posted_at: '2026-06-29T01:02:03.000Z',
    raw_title: 'IBK기업은행',
    raw_text: '입금 123,000원 테스트거래처',
    raw_big_text: '입금 123,000원 테스트거래처 잔액 9,999,999원',
    raw_payload: { template: 'account-deposit' },
  };
}

function makeRecommendedCollectPayload() {
  return {
    event_id: 'ibk-controller-recommended-1',
    raw_title: 'IBK기업은행',
    raw_text: '입금 123,000원 테스트거래처',
    raw_big_text: null,
    posted_at: '2026-06-29T01:02:03.000Z',
    source_app: 'bank_tracker',
    device_id: 'dev-4a5f2e9d6a8c1b00',
  };
}

describe('BankNotificationsController', () => {
  let app: INestApplication;
  const service = {
    collect: jest.fn(),
    list: jest.fn(),
    markProcessed: jest.fn(),
    createBackupBatch: jest.fn(),
    deleteBackedUpRetention: jest.fn(),
  };

  beforeAll(async () => {
    const workerTypeByKey = new Map<string, IntegrationWorkerType>([
      [COLLECTOR_KEY, 'bank_notification_collector'],
      [MANAGEMENT_KEY, 'management_program'],
    ]);

    const apiKeyService = {
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
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [BankNotificationsController],
      providers: [
        ApiKeyGuard,
        { provide: ApiKeyService, useValue: apiKeyService },
        { provide: BankNotificationsService, useValue: service },
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      })
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service.collect.mockResolvedValue({
      event_id: 'ibk-controller-event-1',
      status: 'accepted',
      id: 'bank-event-db-id',
    });
    service.list.mockResolvedValue({ count: 0, events: [] });
    service.markProcessed.mockResolvedValue({ updated: 1 });
    service.createBackupBatch.mockResolvedValue({ id: 'backup-batch-id' });
    service.deleteBackedUpRetention.mockResolvedValue({ deleted: 1 });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('accepts collector key on collect endpoint', async () => {
    const response = await request(app.getHttpServer())
      .post('/integration/bank-notifications')
      .set('X-API-Key', COLLECTOR_KEY)
      .send(makeCollectPayload())
      .expect(201);

    expect(response.body).toEqual({
      event_id: 'ibk-controller-event-1',
      status: 'accepted',
      id: 'bank-event-db-id',
    });
    expect(service.collect).toHaveBeenCalledWith(makeCollectPayload());
  });

  it('accepts the bank tracker recommended payload without Android-only fields', async () => {
    service.collect.mockResolvedValueOnce({
      event_id: 'ibk-controller-recommended-1',
      status: 'accepted',
      id: 'bank-event-db-id',
    });

    const response = await request(app.getHttpServer())
      .post('/integration/bank-notifications')
      .set('X-API-Key', COLLECTOR_KEY)
      .send(makeRecommendedCollectPayload())
      .expect(201);

    expect(response.body).toEqual({
      event_id: 'ibk-controller-recommended-1',
      status: 'accepted',
      id: 'bank-event-db-id',
    });
    expect(service.collect).toHaveBeenCalledWith(makeRecommendedCollectPayload());
  });

  it('rejects collector key on read endpoint', async () => {
    await request(app.getHttpServer())
      .get('/integration/bank-notifications')
      .set('X-API-Key', COLLECTOR_KEY)
      .expect(403);
  });

  it('accepts management key on read endpoint', async () => {
    const response = await request(app.getHttpServer())
      .get('/integration/bank-notifications')
      .query({ limit: 50, offset: 200 })
      .set('X-API-Key', MANAGEMENT_KEY)
      .expect(200);

    expect(response.body).toEqual({ count: 0, events: [] });
    expect(service.list).toHaveBeenCalledWith({ limit: 50, offset: 200 });
  });

  it('rejects collector key on manage endpoints', async () => {
    await request(app.getHttpServer())
      .patch('/integration/bank-notifications/mark-processed')
      .set('X-API-Key', COLLECTOR_KEY)
      .send({ event_ids: ['ibk-controller-event-1'] })
      .expect(403);
  });

  it('accepts management key on mark processed endpoint', async () => {
    const response = await request(app.getHttpServer())
      .patch('/integration/bank-notifications/mark-processed')
      .set('X-API-Key', MANAGEMENT_KEY)
      .send({ event_ids: ['ibk-controller-event-1'] })
      .expect(200);

    expect(response.body).toEqual({ updated: 1 });
    expect(service.markProcessed).toHaveBeenCalledWith({ event_ids: ['ibk-controller-event-1'] });
  });

  it('accepts management key on backup and retention endpoints', async () => {
    const backupPayload = {
      year: 2026,
      file_name: 'bank-notifications-2026.jsonl',
      sha256: 'a'.repeat(64),
      event_count: 1,
      posted_from: '2026-01-01T00:00:00.000Z',
      posted_to: '2026-12-31T23:59:59.999Z',
      event_ids: ['ibk-controller-event-1'],
    };

    const backupResponse = await request(app.getHttpServer())
      .post('/integration/bank-notifications/backup-batches')
      .set('X-API-Key', MANAGEMENT_KEY)
      .send(backupPayload)
      .expect(201);

    expect(backupResponse.body).toEqual({ id: 'backup-batch-id' });
    expect(service.createBackupBatch).toHaveBeenCalledWith(backupPayload);

    const retentionResponse = await request(app.getHttpServer())
      .delete('/integration/bank-notifications/retention')
      .query({ backup_batch_id: 'backup-batch-id', older_than_days: 365 })
      .set('X-API-Key', MANAGEMENT_KEY)
      .expect(200);

    expect(retentionResponse.body).toEqual({ deleted: 1 });
    expect(service.deleteBackedUpRetention).toHaveBeenCalledWith({
      backup_batch_id: 'backup-batch-id',
      older_than_days: 365,
    });
  });
});
