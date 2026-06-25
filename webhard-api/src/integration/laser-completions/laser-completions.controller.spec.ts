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
  let validateKey: jest.Mock;

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
    validateKey = jest.fn().mockResolvedValue(null);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [LaserCompletionsController],
      providers: [
        ApiKeyGuard,
        { provide: LaserCompletionsService, useValue: service },
        { provide: ApiKeyService, useValue: { validateKey } },
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

  it('nesting_program + contact/process-stage:write 권한만 laser completion을 실행할 수 있다', async () => {
    validateKey.mockResolvedValueOnce({
      id: 'key-nesting',
      programType: 'nesting_program',
      permissions: ['contact/process-stage:write'],
    });

    await request(app.getHttpServer())
      .post('/integration/laser-completions')
      .set('X-API-Key', 'nesting-key')
      .send({ workNumbers: ['260409-F-001'] })
      .expect(201);

    expect(service.completeByWorkNumbers).toHaveBeenCalledWith({
      workNumbers: ['260409-F-001'],
    });
  });

  it('stage 권한이 없는 외부웹하드 key는 service 호출 전에 거부한다', async () => {
    validateKey.mockResolvedValueOnce({
      id: 'key-external',
      programType: 'external_webhard_sync',
      permissions: ['file/register', 'event/write'],
    });

    await request(app.getHttpServer())
      .post('/integration/laser-completions')
      .set('X-API-Key', 'external-key')
      .send({ workNumbers: ['260409-F-001'] })
      .expect(403);

    expect(service.completeByWorkNumbers).not.toHaveBeenCalled();
  });

  it('stage 권한이 있어도 nesting_program이 아니면 service 호출 전에 거부한다', async () => {
    validateKey.mockResolvedValueOnce({
      id: 'key-management',
      programType: 'management_program',
      permissions: ['contact/process-stage:write'],
    });

    await request(app.getHttpServer())
      .post('/integration/laser-completions')
      .set('X-API-Key', 'management-key')
      .send({ workNumbers: ['260409-F-001'] })
      .expect(403);

    expect(service.completeByWorkNumbers).not.toHaveBeenCalled();
  });
});
