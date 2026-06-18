import { SessionsService } from '../sessions.service';

// ============================================================
// Mock factories
// ============================================================

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-uuid-1',
    userType: 'admin',
    userId: 1,
    username: '관리자',
    companyName: null,
    lastActivity: new Date('2026-03-29T00:00:00Z'),
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    executeWithRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
    activeSession: {
      upsert: jest.fn().mockResolvedValue(makeSession()),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(prismaOverrides);
  const service = new SessionsService(prisma as never);
  return { service, prisma };
}

// ============================================================
// upsertSession
// ============================================================

describe('SessionsService.upsertSession', () => {
  it('성공 시 true 반환', async () => {
    const { service } = makeService();

    const result = await service.upsertSession('admin', 1, '관리자', null);

    expect(result).toBe(true);
  });

  it('Prisma 에러 발생 시 false 반환 (예외 전파 없음)', async () => {
    const { service, prisma } = makeService();
    (prisma.activeSession.upsert as jest.Mock).mockRejectedValue(new Error('DB error'));

    const result = await service.upsertSession('admin', 1, '관리자', null);

    expect(result).toBe(false);
  });

  it('올바른 where 조건으로 upsert 호출', async () => {
    const { service, prisma } = makeService();

    await service.upsertSession('company', 5, '홍길동', '박스메이커스');

    expect(prisma.activeSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userType_userId: { userType: 'company', userId: 5 } },
        create: expect.objectContaining({
          userType: 'company',
          userId: 5,
          username: '홍길동',
          companyName: '박스메이커스',
        }),
        update: expect.objectContaining({ username: '홍길동', companyName: '박스메이커스' }),
      })
    );
  });
});

// ============================================================
// deleteSession
// ============================================================

describe('SessionsService.deleteSession', () => {
  it('성공 시 true 반환', async () => {
    const { service } = makeService();

    const result = await service.deleteSession('company', 5);

    expect(result).toBe(true);
  });

  it('Prisma 에러 발생 시 false 반환', async () => {
    const { service, prisma } = makeService();
    (prisma.activeSession.deleteMany as jest.Mock).mockRejectedValue(new Error('DB error'));

    const result = await service.deleteSession('admin', 1);

    expect(result).toBe(false);
  });

  it('올바른 where 조건으로 deleteMany 호출', async () => {
    const { service, prisma } = makeService();

    await service.deleteSession('admin', 1);

    expect(prisma.activeSession.deleteMany).toHaveBeenCalledWith({
      where: { userType: 'admin', userId: 1 },
    });
  });
});

// ============================================================
// getSessionsCount
// ============================================================

describe('SessionsService.getSessionsCount', () => {
  it('total/admin/company 카운트를 반환', async () => {
    const { service, prisma } = makeService();
    (prisma.activeSession.count as jest.Mock)
      .mockResolvedValueOnce(3) // total
      .mockResolvedValueOnce(1) // admin
      .mockResolvedValueOnce(2); // company

    const result = await service.getSessionsCount();

    expect(result).toEqual({
      total_count: 3,
      admin_count: 1,
      company_count: 2,
    });
  });

  it('5분 이내 활동 기준으로 count 호출', async () => {
    const { service, prisma } = makeService();
    (prisma.activeSession.count as jest.Mock).mockResolvedValue(0);

    await service.getSessionsCount();

    // count가 3번 호출됨 (total, admin, company)
    expect(prisma.activeSession.count).toHaveBeenCalledTimes(3);
    // 첫 번째 호출: lastActivity gte 조건 있음
    const firstCall = (prisma.activeSession.count as jest.Mock).mock.calls[0][0];
    expect(firstCall.where.lastActivity).toHaveProperty('gte');
  });
});

// ============================================================
// getSessionsList
// ============================================================

describe('SessionsService.getSessionsList', () => {
  it('세션 목록을 snake_case로 반환', async () => {
    const session = makeSession({
      userType: 'admin',
      userId: 1,
      username: '관리자',
      companyName: null,
    });
    const { service, prisma } = makeService();
    (prisma.activeSession.findMany as jest.Mock).mockResolvedValue([session]);

    const result = await service.getSessionsList();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      user_type: 'admin',
      user_id: 1,
      username: '관리자',
      company_name: null,
    });
    expect(typeof result[0].last_activity).toBe('string');
  });

  it('활성 세션 없으면 빈 배열 반환', async () => {
    const { service } = makeService();

    const result = await service.getSessionsList();

    expect(result).toEqual([]);
  });
});
