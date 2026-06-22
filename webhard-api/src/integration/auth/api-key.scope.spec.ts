import { Controller, Get, INestApplication, Post, UseGuards } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthService } from '../../auth/auth.service';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyService } from './api-key.service';
import {
  getDefaultIntegrationPermissions,
  type IntegrationWorkerType,
} from './integration-permissions';
import { RequireIntegrationPermission } from './require-integration-permission.decorator';

const EXTERNAL_WEBHARD_KEY = 'external-webhard-key';
const MANAGEMENT_PROGRAM_KEY = 'management-program-key';
const ADMIN_DASHBOARD_KEY = 'admin-dashboard-key';

@Controller('integration/scope-test')
@UseGuards(ApiKeyGuard)
class IntegrationScopeTestController {
  @Post('files/register')
  @RequireIntegrationPermission('file/register')
  registerFile() {
    return { scope: 'file/register' };
  }

  @Post('events')
  @RequireIntegrationPermission('event/write')
  writeEvent() {
    return { scope: 'event/write' };
  }

  @Get('jobs')
  @RequireIntegrationPermission('job/read')
  readJobs() {
    return { scope: 'job/read' };
  }

  @Get('operations')
  @RequireIntegrationPermission('operation/read')
  readOperations() {
    return { scope: 'operation/read' };
  }
}

describe('Integration API key worker scope', () => {
  let app: INestApplication;
  let apiKeyService: jest.Mocked<Pick<ApiKeyService, 'validateKey'>>;

  beforeAll(async () => {
    const workerTypeByKey = new Map<string, IntegrationWorkerType>([
      [EXTERNAL_WEBHARD_KEY, 'external_webhard_sync'],
      [MANAGEMENT_PROGRAM_KEY, 'management_program'],
      [ADMIN_DASHBOARD_KEY, 'admin_dashboard'],
    ]);

    apiKeyService = {
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
      controllers: [IntegrationScopeTestController],
      providers: [
        ApiKeyGuard,
        { provide: ApiKeyService, useValue: apiKeyService },
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
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows external webhard sync keys to register files and rejects management program keys', async () => {
    const response = await request(app.getHttpServer())
      .post('/integration/scope-test/files/register')
      .set('X-API-Key', EXTERNAL_WEBHARD_KEY)
      .expect(201);

    expect(response.body).toEqual({ scope: 'file/register' });

    await request(app.getHttpServer())
      .post('/integration/scope-test/files/register')
      .set('X-API-Key', MANAGEMENT_PROGRAM_KEY)
      .expect(403);
  });

  it('allows management program keys to write events and read jobs', async () => {
    await request(app.getHttpServer())
      .post('/integration/scope-test/events')
      .set('X-API-Key', MANAGEMENT_PROGRAM_KEY)
      .expect(201);

    await request(app.getHttpServer())
      .get('/integration/scope-test/jobs')
      .set('X-API-Key', MANAGEMENT_PROGRAM_KEY)
      .expect(200);
  });

  it('rejects external webhard sync keys from job read endpoints', async () => {
    await request(app.getHttpServer())
      .get('/integration/scope-test/jobs')
      .set('X-API-Key', EXTERNAL_WEBHARD_KEY)
      .expect(403);
  });

  it('limits operation read endpoints to admin dashboard keys', async () => {
    await request(app.getHttpServer())
      .get('/integration/scope-test/operations')
      .set('X-API-Key', ADMIN_DASHBOARD_KEY)
      .expect(200);

    await request(app.getHttpServer())
      .get('/integration/scope-test/operations')
      .set('X-API-Key', MANAGEMENT_PROGRAM_KEY)
      .expect(403);
  });
});
