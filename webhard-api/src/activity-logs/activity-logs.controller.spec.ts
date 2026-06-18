import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { ActivityLogsController } from './activity-logs.controller';
import { ActivityLogsService } from './activity-logs.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';

describe('ActivityLogsController 날짜 query', () => {
  let app: INestApplication;
  let activityLogsService: jest.Mocked<Pick<ActivityLogsService, 'findAll' | 'create'>>;

  beforeAll(async () => {
    activityLogsService = {
      findAll: jest.fn().mockResolvedValue({ logs: [], total: 0 }),
      create: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ActivityLogsController],
      providers: [{ provide: ActivityLogsService, useValue: activityLogsService }],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    activityLogsService.findAll.mockResolvedValue({ logs: [], total: 0 });
  });

  afterAll(async () => {
    await app.close();
  });

  it('valid startDate/endDate query를 Date 객체로 service에 전달한다', async () => {
    await request(app.getHttpServer())
      .get('/activity-logs')
      .query({
        startDate: '2026-05-09T00:00:00.000Z',
        endDate: '2026-05-10T00:00:00.000Z',
      })
      .expect(200);

    expect(activityLogsService.findAll).toHaveBeenCalledWith({
      action: undefined,
      actorId: undefined,
      limit: undefined,
      offset: undefined,
      startDate: new Date('2026-05-09T00:00:00.000Z'),
      endDate: new Date('2026-05-10T00:00:00.000Z'),
    });
  });

  it('invalid startDate는 400으로 거부한다', async () => {
    await request(app.getHttpServer())
      .get('/activity-logs')
      .query({ startDate: 'not-a-date' })
      .expect(400);

    expect(activityLogsService.findAll).not.toHaveBeenCalled();
  });

  it('invalid endDate는 400으로 거부한다', async () => {
    await request(app.getHttpServer())
      .get('/activity-logs')
      .query({ endDate: 'not-a-date' })
      .expect(400);

    expect(activityLogsService.findAll).not.toHaveBeenCalled();
  });
});
