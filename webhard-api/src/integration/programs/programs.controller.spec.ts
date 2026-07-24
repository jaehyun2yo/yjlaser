import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AuthService } from '../../auth/auth.service';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ApiKeyService } from '../auth/api-key.service';
import { ProgramsAccessGuard } from './programs-access.guard';
import { ProgramsController } from './programs.controller';
import { ProgramsService } from './programs.service';

const EVENT_WRITE_KEY = 'event-write-key';
const OPERATION_READ_KEY = 'operation-read-key';
const LEGACY_ALL_KEY = 'legacy-all-key';
const OTHER_KEY = 'other-key';
const ADMIN_SESSION_COOKIE = 'admin-session-token';
const COMPANY_SESSION_COOKIE = 'company-session-token';
const WORKER_SESSION_COOKIE = 'worker-session-token';
const HOSTILE_HOSTNAME = 'DESKTOP-PRIVATE-01';
const HOSTILE_METADATA = {
  apiKey: 'raw-api-key',
  localPath: 'C:\\Users\\operator\\customer.dxf',
  hardware: { serial: 'private-serial' },
};

type HeartbeatUpsertInput = {
  update: {
    status: string;
    version?: string;
    lastSeenAt: Date;
  };
  create: {
    programType: string;
    instanceName: string;
    status: string;
    version: string | null;
    lastSeenAt: Date;
  };
};

function makePrisma() {
  return {
    executeWithRetry: jest.fn((operation: () => unknown) => operation()),
    programHeartbeat: {
      upsert: jest.fn(async (input: HeartbeatUpsertInput) => ({
        id: 'heartbeat-001',
        ...input.create,
      })),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'heartbeat-001',
          programType: 'management_program',
          instanceName: 'management-01',
          status: 'online',
          version: '1.2.3',
          hostname: HOSTILE_HOSTNAME,
          metadata: HOSTILE_METADATA,
          lastSeenAt: new Date(),
          createdAt: new Date('2026-07-19T00:00:00.000Z'),
        },
      ]),
    },
  };
}

function createApiKeyResult(rawKey: string) {
  const permissionsByKey = new Map<string, string[]>([
    [EVENT_WRITE_KEY, ['event/write']],
    [OPERATION_READ_KEY, ['operation/read']],
    [LEGACY_ALL_KEY, ['all']],
    [OTHER_KEY, ['file/register']],
  ]);
  const permissions = permissionsByKey.get(rawKey);

  if (!permissions) {
    return null;
  }

  return {
    id: `key-${rawKey}`,
    programType: 'legacy_program',
    permissions,
  };
}

describe('ProgramsController legacy heartbeat boundary', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ProgramsController],
      providers: [
        ProgramsService,
        ProgramsAccessGuard,
        ApiKeyGuard,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ApiKeyService,
          useValue: {
            validateKey: jest.fn(async (rawKey: string) => createApiKeyResult(rawKey)),
          },
        },
        {
          provide: AuthService,
          useValue: {
            verifySession: jest.fn((cookieValue: string | undefined) => {
              if (cookieValue === ADMIN_SESSION_COOKIE) {
                return { userType: 'admin', userId: 'admin', companyId: null };
              }
              if (cookieValue === COMPANY_SESSION_COOKIE) {
                return { userType: 'company', userId: 7, companyId: 7 };
              }
              return null;
            }),
            verifyWorkerSession: jest.fn((cookieValue: string | undefined) => {
              if (cookieValue === WORKER_SESSION_COOKIE) {
                return { userType: 'worker', userId: 'worker-1', companyId: null };
              }
              return null;
            }),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('allows event/write and all API keys to POST legacy heartbeats', async () => {
    await request(app.getHttpServer())
      .post('/integration/programs/heartbeat')
      .set('X-API-Key', EVENT_WRITE_KEY)
      .send({ programType: 'management_program', instanceName: 'management-01' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/integration/programs/heartbeat')
      .set('X-API-Key', LEGACY_ALL_KEY)
      .send({ programType: 'management_program', instanceName: 'management-01' })
      .expect(201);

    expect(prisma.programHeartbeat.upsert).toHaveBeenCalledTimes(2);
  });

  it('rejects session and non-write principals before POST heartbeat persistence', async () => {
    await request(app.getHttpServer())
      .post('/integration/programs/heartbeat')
      .set('Cookie', [`admin-session=${ADMIN_SESSION_COOKIE}`])
      .send({ programType: 'management_program', instanceName: 'management-01' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/integration/programs/heartbeat')
      .set('Cookie', [`company-session=${COMPANY_SESSION_COOKIE}`])
      .send({ programType: 'management_program', instanceName: 'management-01' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/integration/programs/heartbeat')
      .set('X-API-Key', OPERATION_READ_KEY)
      .send({ programType: 'management_program', instanceName: 'management-01' })
      .expect(403);

    expect(prisma.programHeartbeat.upsert).not.toHaveBeenCalled();
  });

  it('does not let a session cookie gain API-key access when both credentials are sent', async () => {
    const heartbeatResponse = await request(app.getHttpServer())
      .post('/integration/programs/heartbeat')
      .set('Cookie', [`admin-session=${ADMIN_SESSION_COOKIE}`])
      .set('X-API-Key', EVENT_WRITE_KEY)
      .send({ programType: 'management_program', instanceName: 'management-01' })
      .expect(401);

    const listResponse = await request(app.getHttpServer())
      .get('/integration/programs')
      .set('Cookie', [`company-session=${COMPANY_SESSION_COOKIE}`])
      .set('X-API-Key', OPERATION_READ_KEY)
      .expect(401);

    expect(heartbeatResponse.body).toMatchObject({ code: 'INTEGRATION_PRINCIPAL_AMBIGUOUS' });
    expect(listResponse.body).toMatchObject({ code: 'INTEGRATION_PRINCIPAL_AMBIGUOUS' });

    expect(prisma.programHeartbeat.upsert).not.toHaveBeenCalled();
    expect(prisma.programHeartbeat.findMany).not.toHaveBeenCalled();
  });

  it('allows admin sessions and operation/read or all API keys to GET programs', async () => {
    await request(app.getHttpServer())
      .get('/integration/programs')
      .set('Cookie', [`admin-session=${ADMIN_SESSION_COOKIE}`])
      .expect(200);

    await request(app.getHttpServer())
      .get('/integration/programs')
      .set('X-API-Key', OPERATION_READ_KEY)
      .expect(200);

    await request(app.getHttpServer())
      .get('/integration/programs')
      .set('X-API-Key', LEGACY_ALL_KEY)
      .expect(200);
  });

  it('rejects non-admin sessions and non-read API keys before GET program queries', async () => {
    await request(app.getHttpServer())
      .get('/integration/programs')
      .set('Cookie', [`company-session=${COMPANY_SESSION_COOKIE}`])
      .expect(403);

    await request(app.getHttpServer())
      .get('/integration/programs')
      .set('Cookie', [`erp-session=${WORKER_SESSION_COOKIE}`])
      .expect(401);

    await request(app.getHttpServer())
      .get('/integration/programs')
      .set('X-API-Key', EVENT_WRITE_KEY)
      .expect(403);

    await request(app.getHttpServer())
      .get('/integration/programs')
      .set('X-API-Key', OTHER_KEY)
      .expect(403);

    expect(prisma.programHeartbeat.findMany).not.toHaveBeenCalled();
  });

  it('accepts legacy hostname and metadata without persisting or returning them', async () => {
    await request(app.getHttpServer())
      .post('/integration/programs/heartbeat')
      .set('X-API-Key', EVENT_WRITE_KEY)
      .send({
        programType: 'management_program',
        instanceName: 'management-01',
        version: '1.2.3',
        hostname: HOSTILE_HOSTNAME,
        metadata: HOSTILE_METADATA,
      })
      .expect(201);

    const upsertInput = prisma.programHeartbeat.upsert.mock.calls[0][0];
    expect(upsertInput.update).not.toHaveProperty('hostname');
    expect(upsertInput.update).not.toHaveProperty('metadata');
    expect(upsertInput.create).not.toHaveProperty('hostname');
    expect(upsertInput.create).not.toHaveProperty('metadata');

    const response = await request(app.getHttpServer())
      .get('/integration/programs')
      .set('X-API-Key', OPERATION_READ_KEY)
      .expect(200);

    expect(response.body[0]).not.toHaveProperty('hostname');
    expect(response.body[0]).not.toHaveProperty('metadata');
    expect(JSON.stringify(response.body)).not.toContain(HOSTILE_HOSTNAME);
    expect(JSON.stringify(response.body)).not.toContain('raw-api-key');
  });
});
