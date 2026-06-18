import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthService } from '../../auth/auth.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ApiKeyService } from '../auth/api-key.service';
import { LaserCompletionsController } from './laser-completions.controller';
import { LaserCompletionsService } from './laser-completions.service';

describe('LaserCompletionsController API key 인증', () => {
  let app: INestApplication;
  let service: jest.Mocked<Pick<LaserCompletionsService, 'completeByWorkNumbers'>>;

  beforeAll(async () => {
    service = {
      completeByWorkNumbers: jest.fn().mockResolvedValue({
        success: true,
        summary: {
          requested: 1,
          completed: 1,
          alreadyCompleted: 0,
          notFound: 0,
          skipped: 0,
          failed: 0,
        },
        results: [],
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [LaserCompletionsController],
      providers: [
        ApiKeyGuard,
        { provide: LaserCompletionsService, useValue: service },
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

  it('X-API-Key가 없으면 401로 거부하고 서비스 호출을 막는다', async () => {
    await request(app.getHttpServer())
      .post('/integration/laser-completions')
      .send({ workNumbers: ['260409-F-001'] })
      .expect(401);

    expect(service.completeByWorkNumbers).not.toHaveBeenCalled();
  });
});
