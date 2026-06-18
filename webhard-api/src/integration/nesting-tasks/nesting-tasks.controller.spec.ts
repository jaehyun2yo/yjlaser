import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthService } from '../../auth/auth.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ApiKeyService } from '../auth/api-key.service';
import { NestingTasksController } from './nesting-tasks.controller';
import { NestingTasksService } from './nesting-tasks.service';

describe('NestingTasksController API key 인증', () => {
  let app: INestApplication;
  let service: jest.Mocked<
    Pick<NestingTasksService, 'getPendingTasks' | 'updateStatus' | 'reportResult'>
  >;

  beforeAll(async () => {
    service = {
      getPendingTasks: jest.fn().mockResolvedValue({ tasks: [] }),
      updateStatus: jest.fn().mockResolvedValue({
        success: true,
        task_id: 'ntask_abc123',
        status: 'in_progress',
      }),
      reportResult: jest.fn().mockResolvedValue({
        success: true,
        task_id: 'ntask_abc123',
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [NestingTasksController],
      providers: [
        ApiKeyGuard,
        { provide: NestingTasksService, useValue: service },
        { provide: ApiKeyService, useValue: { validateKey: jest.fn().mockResolvedValue(null) } },
        { provide: AuthService, useValue: { verifySession: jest.fn().mockReturnValue(null) } },
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

  it('X-API-Key가 없으면 pending 조회를 401로 거부하고 서비스 호출을 막는다', async () => {
    await request(app.getHttpServer()).get('/integration/nesting-tasks/pending').expect(401);

    expect(service.getPendingTasks).not.toHaveBeenCalled();
  });
});
