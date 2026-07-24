import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthService } from '../../auth/auth.service';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ApiKeyService } from '../auth/api-key.service';
import { DeviceEndpointPolicyGuard } from '../auth/device-endpoint-policy.guard';
import { IntegrationPrincipalSourceGuard } from '../auth/integration-principal-source.guard';
import { DeviceBearerGuard } from '../device-auth/device-bearer.guard';
import { DeviceBearerRequestSourceGuard } from '../device-auth/device-bearer-request-source.guard';
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
    parsed_direction: 'DEPOSIT',
    parsed_category: '입금',
    parsed_amount_won: 123000,
    parsed_counterparty: '테스트거래처',
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
    deleteTestNotifications: jest.fn(),
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
        Reflector,
        ApiKeyGuard,
        IntegrationPrincipalSourceGuard,
        DeviceEndpointPolicyGuard,
        {
          provide: DeviceBearerRequestSourceGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
        {
          provide: DeviceBearerGuard,
          useValue: {
            canActivate: jest.fn((context: ExecutionContext) => {
              const req = context.switchToHttp().getRequest();
              const state = req.headers['x-test-device-state'];
              if (['revoked', 'stale', 'wrong_environment'].includes(state)) {
                throw new UnauthorizedException(`synthetic ${state}`);
              }
              req.deviceAuthInfo = {
                deviceId: 'device-1',
                environment: 'prd',
                programType: req.headers['x-test-program'] ?? 'management_program',
                capabilityProfile: req.headers['x-test-capability'] ?? 'standard',
                permissions: String(req.headers['x-test-permissions'] ?? '')
                  .split(',')
                  .filter(Boolean),
                credentialVersion: 4,
              };
              return true;
            }),
          },
        },
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
    service.deleteTestNotifications.mockResolvedValue({ deleted: 1 });
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

    await request(app.getHttpServer())
      .delete('/integration/bank-notifications/test-notifications')
      .set('X-API-Key', COLLECTOR_KEY)
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

  it('accepts management key on test notification cleanup endpoint', async () => {
    const response = await request(app.getHttpServer())
      .delete('/integration/bank-notifications/test-notifications')
      .set('X-API-Key', MANAGEMENT_KEY)
      .expect(200);

    expect(response.body).toEqual({ deleted: 1 });
    expect(service.deleteTestNotifications).toHaveBeenCalledWith();
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

  it.each([
    ['get', '/integration/bank-notifications', 'bank-notification/read', 200, 'list'],
    [
      'patch',
      '/integration/bank-notifications/mark-processed',
      'bank-notification/manage',
      200,
      'markProcessed',
    ],
    [
      'post',
      '/integration/bank-notifications/backup-batches',
      'bank-notification/manage',
      201,
      'createBackupBatch',
    ],
  ] as const)(
    'allows exact device tuple for %s %s and rejects all mismatches',
    async (method, path, permission, status, serviceMethod) => {
      await deviceRequest(method, path, permission, {}).expect(status);
      expect(service[serviceMethod]).toHaveBeenCalledTimes(1);

      const denied: Array<Record<string, string>> = [
        { 'X-Test-Program': 'external_webhard_sync' },
        { 'X-Test-Program': 'nesting_program' },
        { 'X-Test-Permissions': '' },
        { 'X-Test-Capability': 'safe_canary' },
        { 'X-Test-Device-State': 'revoked' },
        { 'X-Test-Device-State': 'stale' },
        { 'X-Test-Device-State': 'wrong_environment' },
        { 'X-API-Key': MANAGEMENT_KEY },
      ];
      for (const headers of denied) {
        jest.clearAllMocks();
        await deviceRequest(method, path, permission, headers).expect((res) => {
          if (![401, 403].includes(res.status)) throw new Error(`expected deny, got ${res.status}`);
        });
        expect(service[serviceMethod]).not.toHaveBeenCalled();
      }
    }
  );

  it.each([
    ['post', '/integration/bank-notifications'],
    ['delete', '/integration/bank-notifications/test-notifications'],
    ['delete', '/integration/bank-notifications/retention'],
  ] as const)('holds %s %s before all service writes', async (method, path) => {
    await deviceRequest(method, path, 'bank-notification/manage', {}).expect(403);
    expect(Object.values(service).every((mock) => mock.mock.calls.length === 0)).toBe(true);
  });

  function deviceRequest(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    permission: string,
    headers: Record<string, string>
  ) {
    const agent = request(app.getHttpServer());
    const call =
      method === 'get'
        ? agent.get(path)
        : method === 'post'
          ? agent.post(path)
          : method === 'patch'
            ? agent.patch(path)
            : agent.delete(path);
    call.set('Authorization', 'Bearer synthetic.jwt.token');
    call.set('X-Test-Permissions', headers['X-Test-Permissions'] ?? permission);
    for (const [name, value] of Object.entries(headers)) call.set(name, value);
    const body = path.endsWith('/mark-processed')
      ? { event_ids: ['ibk-controller-event-1'] }
      : path.endsWith('/backup-batches')
        ? {
            year: 2026,
            file_name: 'bank-notifications-2026.jsonl',
            sha256: 'a'.repeat(64),
            event_count: 1,
            posted_from: '2026-01-01T00:00:00.000Z',
            posted_to: '2026-12-31T23:59:59.999Z',
            event_ids: ['ibk-controller-event-1'],
          }
        : {};
    call.send(body);
    return call;
  }
});
