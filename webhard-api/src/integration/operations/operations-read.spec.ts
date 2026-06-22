import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthService } from '../../auth/auth.service';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ApiKeyService } from '../auth/api-key.service';
import {
  getDefaultIntegrationPermissions,
  type IntegrationWorkerType,
} from '../auth/integration-permissions';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

const ADMIN_DASHBOARD_KEY = 'admin-dashboard-key';
const MANAGEMENT_PROGRAM_KEY = 'management-program-key';

function collectLogText(spy: jest.SpyInstance): string {
  return spy.mock.calls.map(([message]) => String(message)).join('\n');
}

function makeFailure(id: string, createdAt: string) {
  return {
    id,
    jobId: `job-${id}`,
    orderId: `order-${id}`,
    sourceWorker: 'management_program',
    eventType: 'invoice.failed',
    errorCode: 'POPBILL_FAILED',
    message: 'Sanitized failure message',
    retryable: true,
    retryCount: 1,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    lastEventId: `event-${id}`,
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
    lastEvent: {
      id: `event-${id}`,
      eventType: 'invoice.failed',
      sourceWorker: 'management_program',
      occurredAt: new Date(createdAt),
      result: 'failed',
      stateApplyStatus: 'failed',
    },
  };
}

function makeHeartbeat(
  id: string,
  overrides: {
    programType: string;
    instanceName: string;
    status?: string;
    lastSeenAgeMs: number;
  }
) {
  const now = Date.now();
  const lastSeenAt = new Date(now - overrides.lastSeenAgeMs);

  return {
    id,
    programType: overrides.programType,
    instanceName: overrides.instanceName,
    status: overrides.status ?? 'online',
    version: '1.0.0',
    hostname: `host-${id}`,
    lastSeenAt,
    metadata: { raw: 'not exposed' },
    createdAt: new Date(now - 60 * 60 * 1000),
    updatedAt: lastSeenAt,
  };
}

function makePrisma() {
  return {
    executeWithRetry: jest.fn((fn: () => unknown) => fn()),
    jobFailure: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          makeFailure('failure-003', '2026-06-19T09:03:00Z'),
          makeFailure('failure-002', '2026-06-19T09:02:00Z'),
          makeFailure('failure-001', '2026-06-19T09:01:00Z'),
        ]),
    },
    programHeartbeat: {
      findMany: jest.fn().mockImplementation(() =>
        Promise.resolve([
          makeHeartbeat('heartbeat-online', {
            programType: 'external_webhard_sync',
            instanceName: 'sync-01',
            lastSeenAgeMs: 60 * 1000,
          }),
          makeHeartbeat('heartbeat-late', {
            programType: 'management_program',
            instanceName: 'management-01',
            lastSeenAgeMs: 3 * 60 * 1000,
          }),
          makeHeartbeat('heartbeat-offline-age', {
            programType: 'nesting_program',
            instanceName: 'nesting-01',
            lastSeenAgeMs: 11 * 60 * 1000,
          }),
          makeHeartbeat('heartbeat-offline-status', {
            programType: 'management_program',
            instanceName: 'management-02',
            status: 'offline',
            lastSeenAgeMs: 30 * 1000,
          }),
        ])
      ),
    },
  };
}

describe('Integration operations read API', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof makePrisma>;
  let operationsService: OperationsService;

  beforeEach(async () => {
    prisma = makePrisma();
    const workerTypeByKey = new Map<string, IntegrationWorkerType>([
      [ADMIN_DASHBOARD_KEY, 'admin_dashboard'],
      [MANAGEMENT_PROGRAM_KEY, 'management_program'],
    ]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [OperationsController],
      providers: [
        OperationsService,
        ApiKeyGuard,
        { provide: PrismaService, useValue: prisma },
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

    operationsService = moduleFixture.get(OperationsService);
    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    jest.restoreAllMocks();
  });

  it('returns unresolved JobFailure items with cursor pagination metadata', async () => {
    const logSpy = jest.spyOn(operationsService['logger'], 'log').mockImplementation();

    const response = await request(app.getHttpServer())
      .get('/integration/operations/failures?limit=2')
      .set('X-API-Key', ADMIN_DASHBOARD_KEY)
      .expect(200);

    expect(response.body).toMatchObject({
      has_more: true,
      next_cursor: 'failure-002',
      limit: 2,
    });
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0]).toMatchObject({
      failure_id: 'failure-003',
      job_id: 'job-failure-003',
      order_id: 'order-failure-003',
      source_worker: 'management_program',
      event_type: 'invoice.failed',
      error_code: 'POPBILL_FAILED',
      message: 'Sanitized failure message',
      retryable: true,
      retry_count: 1,
      resolved_at: null,
      last_event_id: 'event-failure-003',
      last_event: {
        event_id: 'event-failure-003',
        event_type: 'invoice.failed',
        source_worker: 'management_program',
        result: 'failed',
        state_apply_status: 'failed',
      },
    });
    expect(prisma.jobFailure.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { resolvedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 3,
      })
    );

    const prismaQuery = prisma.jobFailure.findMany.mock.calls[0][0];
    expect(prismaQuery.select).not.toHaveProperty('metadata');
    expect(prismaQuery.select.lastEvent.select).not.toHaveProperty('payload');
    expect(prismaQuery.select.lastEvent.select).not.toHaveProperty('idempotencyKey');
    expect(response.body.items[0]).not.toHaveProperty('metadata');
    expect(response.body.items[0].last_event).not.toHaveProperty('payload');
    expect(response.body.items[0].last_event).not.toHaveProperty('idempotencyKey');

    const logText = collectLogText(logSpy);
    expect(logText).toContain('status=start');
    expect(logText).toContain('status=success');
    expect(logText).toContain('limit=2');
    expect(logText).toContain('hasCursor=false');
    expect(logText).toContain('count=2');
    expect(logText).toContain('hasMore=true');
    expect(logText).toMatch(/elapsedMs=\d+/);
    expect(logText).not.toContain('failure-003');
  });

  it('passes cursor and skip to Prisma when cursor is provided', async () => {
    await request(app.getHttpServer())
      .get('/integration/operations/failures?cursor=failure-002&limit=2')
      .set('X-API-Key', ADMIN_DASHBOARD_KEY)
      .expect(200);

    expect(prisma.jobFailure.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: 'failure-002' },
        skip: 1,
        take: 3,
      })
    );
  });

  it('rejects API keys without operation/read permission before querying failures', async () => {
    await request(app.getHttpServer())
      .get('/integration/operations/failures')
      .set('X-API-Key', MANAGEMENT_PROGRAM_KEY)
      .expect(403);

    expect(prisma.jobFailure.findMany).not.toHaveBeenCalled();
  });

  it('logs failures without raw cursor or error message before rethrowing', async () => {
    prisma.jobFailure.findMany.mockRejectedValueOnce(new Error('database down'));
    const logSpy = jest.spyOn(operationsService['logger'], 'log').mockImplementation();
    const errorSpy = jest.spyOn(operationsService['logger'], 'error').mockImplementation();

    await expect(
      operationsService.getUnresolvedFailures({ cursor: 'failure-secret', limit: '2' })
    ).rejects.toThrow('database down');

    const startText = collectLogText(logSpy);
    const errorText = collectLogText(errorSpy);
    expect(startText).toContain('status=start');
    expect(errorText).toContain('status=failure');
    expect(errorText).toContain('limit=2');
    expect(errorText).toContain('hasCursor=true');
    expect(errorText).toContain('errorType=Error');
    expect(errorText).toMatch(/elapsedMs=\d+/);
    expect(errorText).not.toContain('failure-secret');
    expect(errorText).not.toContain('database down');
  });

  it('returns ProgramHeartbeat items with online, late, and offline status summary', async () => {
    const logSpy = jest.spyOn(operationsService['logger'], 'log').mockImplementation();

    const response = await request(app.getHttpServer())
      .get('/integration/operations/heartbeats')
      .set('X-API-Key', ADMIN_DASHBOARD_KEY)
      .expect(200);

    expect(response.body).toMatchObject({
      summary: {
        total: 4,
        online: 1,
        late: 1,
        offline: 2,
      },
      threshold_seconds: {
        late: 120,
        offline: 600,
      },
    });
    expect(response.body.items).toHaveLength(4);
    expect(response.body.items.map((item: { status: string }) => item.status)).toEqual([
      'online',
      'late',
      'offline',
      'offline',
    ]);
    expect(response.body.items[0]).toMatchObject({
      heartbeat_id: 'heartbeat-online',
      program_type: 'external_webhard_sync',
      instance_name: 'sync-01',
      stored_status: 'online',
      version: '1.0.0',
      hostname: 'host-heartbeat-online',
    });
    expect(response.body.items[0]).not.toHaveProperty('metadata');
    expect(prisma.programHeartbeat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ programType: 'asc' }, { instanceName: 'asc' }],
        select: expect.objectContaining({
          id: true,
          programType: true,
          instanceName: true,
          status: true,
          version: true,
          hostname: true,
          lastSeenAt: true,
          createdAt: true,
          updatedAt: true,
        }),
      })
    );

    const prismaQuery = prisma.programHeartbeat.findMany.mock.calls[0][0];
    expect(prismaQuery.select).not.toHaveProperty('metadata');

    const logText = collectLogText(logSpy);
    expect(logText).toContain('operation heartbeats list status=start');
    expect(logText).toContain('operation heartbeats list status=success');
    expect(logText).toContain('count=4');
    expect(logText).toContain('online=1');
    expect(logText).toContain('late=1');
    expect(logText).toContain('offline=2');
    expect(logText).toMatch(/elapsedMs=\d+/);
    expect(logText).not.toContain('sync-01');
    expect(logText).not.toContain('host-heartbeat-online');
  });

  it('rejects heartbeat reads for API keys without operation/read permission', async () => {
    await request(app.getHttpServer())
      .get('/integration/operations/heartbeats')
      .set('X-API-Key', MANAGEMENT_PROGRAM_KEY)
      .expect(403);

    expect(prisma.programHeartbeat.findMany).not.toHaveBeenCalled();
  });

  it('logs heartbeat query failures without raw program details or error message', async () => {
    prisma.programHeartbeat.findMany.mockRejectedValueOnce(new Error('heartbeat database down'));
    const logSpy = jest.spyOn(operationsService['logger'], 'log').mockImplementation();
    const errorSpy = jest.spyOn(operationsService['logger'], 'error').mockImplementation();

    await expect(operationsService.getProgramHeartbeats()).rejects.toThrow(
      'heartbeat database down'
    );

    const startText = collectLogText(logSpy);
    const errorText = collectLogText(errorSpy);
    expect(startText).toContain('operation heartbeats list status=start');
    expect(errorText).toContain('operation heartbeats list status=failure');
    expect(errorText).toContain('errorType=Error');
    expect(errorText).toMatch(/elapsedMs=\d+/);
    expect(errorText).not.toContain('heartbeat database down');
    expect(errorText).not.toContain('sync-01');
    expect(errorText).not.toContain('host-heartbeat-online');
  });
});
