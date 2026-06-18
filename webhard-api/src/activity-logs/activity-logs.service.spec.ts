import { ActivityLogsService } from './activity-logs.service';

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
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

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
