import { Logger } from '@nestjs/common';
import { ActivityLogsService } from './activity-logs.service';
import { hashIdentifier } from '../common/logging/log-event';

type LoggedBackendEvent = {
  schema_version: 1;
  event: string;
  level: string;
  project: string;
  component: string;
  feature: string;
  action: string;
  status: string;
  channel: string;
  actor_id_hash?: string;
  target_id_hash?: string;
  error_type?: string;
  metadata?: Record<string, unknown>;
};

function serializeLoggerCalls(...spies: jest.SpyInstance[]): string {
  return JSON.stringify(
    spies.flatMap((spy) =>
      spy.mock.calls.flatMap((call: unknown[]) => call.map((value: unknown) => String(value)))
    )
  );
}

function findJsonLogEvent(spy: jest.SpyInstance, eventName: string): LoggedBackendEvent {
  const event = spy.mock.calls
    .flatMap((call: unknown[]) => call.map((value: unknown) => String(value)))
    .map((value) => {
      try {
        return JSON.parse(value) as Partial<LoggedBackendEvent>;
      } catch {
        return null;
      }
    })
    .find(
      (value): value is LoggedBackendEvent =>
        value?.schema_version === 1 && value.event === eventName
    );

  if (!event) {
    throw new Error(`Missing JSON log event: ${eventName}`);
  }

  return event;
}

type ActivityLogWhere = {
  action?: string;
  actorId?: string;
  createdAt?: {
    gte?: Date;
    lte?: Date;
  };
};

type ActivityLogFindManyArgs = {
  where: ActivityLogWhere;
  orderBy: { createdAt: 'desc' };
  skip: number;
  take: number;
};

type ActivityLogCountArgs = {
  where: ActivityLogWhere;
};

interface MockPrisma {
  activityLog: {
    create: jest.Mock<
      Promise<{
        id: string;
        actorType: string;
        actorId: string;
        actorName: string | null;
        action: string;
        resourceType: string | null;
        resourceId: string | null;
        details: Record<string, unknown>;
        ipAddress: string | null;
        userAgent: string | null;
        createdAt: Date;
      }>,
      [unknown]
    >;
    findMany: jest.Mock<
      Promise<
        Array<{
          id: string;
          actorType: string;
          actorId: string;
          actorName: string | null;
          action: string;
          resourceType: string | null;
          resourceId: string | null;
          details: Record<string, unknown>;
          ipAddress: string | null;
          userAgent: string | null;
          createdAt: Date;
        }>
      >,
      [ActivityLogFindManyArgs]
    >;
    count: jest.Mock<Promise<number>, [ActivityLogCountArgs]>;
  };
}

function makePrisma(): MockPrisma {
  return {
    activityLog: {
      create: jest.fn().mockResolvedValue({
        id: 'activity-log-id',
        actorType: 'company',
        actorId: 'company-5',
        actorName: null,
        action: 'UPLOAD',
        resourceType: 'file',
        resourceId: 'file-1',
        details: {},
        ipAddress: null,
        userAgent: null,
        createdAt: new Date('2026-05-09T00:00:00.000Z'),
      }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

describe('ActivityLogsService.create', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('activity log 생성 실패 로그에 raw actor, details, IP, User-Agent, error를 남기지 않는다', async () => {
    const prisma = makePrisma();
    prisma.activityLog.create.mockRejectedValue(
      new Error('db failed actor@example.com raw-token 10.0.0.1')
    );
    const service = new ActivityLogsService(
      prisma as never,
      { emitActivityCreated: jest.fn() } as never
    );
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const result = await service.create({
      actorType: 'company@example.com',
      actorId: 'manager@example.com raw-token',
      actorName: '박스메이커스 담당자',
      action: 'UPLOAD token=action-token',
      resourceType: 'file secret resource',
      resourceId: 'file-id raw-token',
      details: {
        fileName: '고객도면.dxf',
        token: 'details-token',
      },
      ipAddress: '10.0.0.1',
      userAgent: 'Mozilla raw-token',
    });

    expect(result).toEqual({ id: null, success: false });
    const event = findJsonLogEvent(errorSpy, 'activity_log_create_failed');
    expect(event).toMatchObject({
      level: 'error',
      project: 'company_site',
      component: 'ActivityLogsService',
      feature: 'activity_logs',
      action: 'create_activity_log',
      status: 'failure',
      channel: 'error',
      actor_id_hash: hashIdentifier('manager@example.com raw-token'),
      target_id_hash: hashIdentifier('file-id raw-token'),
      error_type: 'Error',
      metadata: {
        reason: 'activity_log_create_failed',
        actor_type_hash: hashIdentifier('company@example.com'),
        action_hash: hashIdentifier('UPLOAD token=action-token'),
        resource_type_hash: hashIdentifier('file secret resource'),
        details_present: true,
        ip_present: true,
        user_agent_present: true,
      },
    });

    const logPayload = serializeLoggerCalls(errorSpy);
    expect(logPayload).not.toContain('manager@example.com');
    expect(logPayload).not.toContain('company@example.com');
    expect(logPayload).not.toContain('박스메이커스');
    expect(logPayload).not.toContain('UPLOAD token=action-token');
    expect(logPayload).not.toContain('file secret resource');
    expect(logPayload).not.toContain('file-id raw-token');
    expect(logPayload).not.toContain('고객도면.dxf');
    expect(logPayload).not.toContain('details-token');
    expect(logPayload).not.toContain('10.0.0.1');
    expect(logPayload).not.toContain('Mozilla raw-token');
    expect(logPayload).not.toContain('db failed');
    expect(logPayload).not.toContain('raw-token');
  });
});

describe('ActivityLogsService.findAll', () => {
  it('startDate와 endDate를 createdAt range 조건으로 적용한다', async () => {
    const prisma = makePrisma();
    const service = new ActivityLogsService(
      prisma as never,
      { emitActivityCreated: jest.fn() } as never
    );
    const startDate = new Date('2026-05-09T00:00:00.000Z');
    const endDate = new Date('2026-05-10T00:00:00.000Z');
    const options = {
      action: 'UPLOAD',
      actorId: 'admin',
      limit: 25,
      offset: 5,
      startDate,
      endDate,
    };

    await service.findAll(options);

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith({
      where: {
        action: 'UPLOAD',
        actorId: 'admin',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: 5,
      take: 25,
    });
    expect(prisma.activityLog.count).toHaveBeenCalledWith({
      where: {
        action: 'UPLOAD',
        actorId: 'admin',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
  });
});
