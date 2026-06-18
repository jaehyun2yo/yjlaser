import { FeedbackService } from '../feedback.service';

// ============================================================
// Mock factories
// ============================================================

function makeFeedback(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(1),
    companyId: 5,
    companyName: '박스메이커스',
    content: '서비스가 좋습니다.',
    status: 'pending',
    createdAt: new Date('2026-03-29T00:00:00Z'),
    updatedAt: new Date('2026-03-29T00:00:00Z'),
    resolvedAt: null,
    adminNotes: null,
    companyEmail: null,
    category: null,
    categoryOther: null,
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    executeWithRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
    companyFeedback: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue(makeFeedback()),
      update: jest.fn().mockResolvedValue(makeFeedback()),
      count: jest.fn().mockResolvedValue(0),
    },
    ...overrides,
  };
}

function makeGateway() {
  return {
    emitFeedbackCreated: jest.fn(),
    emitFeedbackUpdated: jest.fn(),
  };
}

function makeMailService() {
  return {
    sendFeedbackNotification: jest.fn().mockResolvedValue(undefined),
    sendContactNotification: jest.fn().mockResolvedValue(undefined),
    sendDbFailureNotification: jest.fn().mockResolvedValue(undefined),
  };
}

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(prismaOverrides);
  const gateway = makeGateway();
  const mailService = makeMailService();
  const service = new FeedbackService(prisma as never, gateway as never, mailService as never);
  return { service, prisma, gateway, mailService };
}

// ============================================================
// findAll
// ============================================================

describe('FeedbackService.findAll', () => {
  it('피드백 목록과 total을 반환', async () => {
    const feedback = makeFeedback();
    const { service, prisma } = makeService();
    (prisma.companyFeedback.findMany as jest.Mock).mockResolvedValue([feedback]);
    (prisma.companyFeedback.count as jest.Mock).mockResolvedValue(1);

    const result = await service.findAll({});

    expect(result.total).toBe(1);
    expect(result.feedbacks).toHaveLength(1);
    expect(result.feedbacks[0].company_name).toBe('박스메이커스');
  });

  it('status 필터 전달', async () => {
    const { service, prisma } = makeService();
    (prisma.companyFeedback.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.companyFeedback.count as jest.Mock).mockResolvedValue(0);

    await service.findAll({ status: 'pending' });

    expect(prisma.companyFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'pending' } })
    );
  });

  it('companyId 필터 전달', async () => {
    const { service, prisma } = makeService();
    (prisma.companyFeedback.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.companyFeedback.count as jest.Mock).mockResolvedValue(0);

    await service.findAll({ companyId: 5 });

    expect(prisma.companyFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 5 } })
    );
  });
});

// ============================================================
// findById
// ============================================================

describe('FeedbackService.findById', () => {
  it('존재하는 피드백 반환 (snake_case)', async () => {
    const feedback = makeFeedback({ id: BigInt(42) });
    const { service, prisma } = makeService();
    (prisma.companyFeedback.findUnique as jest.Mock).mockResolvedValue(feedback);

    const result = await service.findById(BigInt(42));

    expect(result).not.toBeNull();
    expect(result?.id).toBe(42);
    expect(typeof result?.id).toBe('number');
  });

  it('존재하지 않으면 null 반환', async () => {
    const { service, prisma } = makeService();
    (prisma.companyFeedback.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await service.findById(BigInt(999));

    expect(result).toBeNull();
  });
});

// ============================================================
// create
// ============================================================

describe('FeedbackService.create', () => {
  it('피드백 생성 후 Gateway emitFeedbackCreated 호출', async () => {
    const feedback = makeFeedback();
    const { service, prisma, gateway } = makeService();
    (prisma.companyFeedback.create as jest.Mock).mockResolvedValue(feedback);

    const result = await service.create({
      companyId: 5,
      companyName: '박스메이커스',
      content: '서비스가 좋습니다.',
    });

    expect(result.status).toBe('pending');
    expect(gateway.emitFeedbackCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it('생성 시 status = "pending" 고정', async () => {
    const { service, prisma } = makeService();
    (prisma.companyFeedback.create as jest.Mock).mockResolvedValue(makeFeedback());

    await service.create({
      companyId: 5,
      companyName: '박스메이커스',
      content: '내용',
    });

    expect(prisma.companyFeedback.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending' }),
      })
    );
  });

  it('BigInt id를 Number로 변환하여 반환', async () => {
    const { service, prisma } = makeService();
    (prisma.companyFeedback.create as jest.Mock).mockResolvedValue(
      makeFeedback({ id: BigInt(99) })
    );

    const result = await service.create({
      companyId: 5,
      companyName: '박스메이커스',
      content: '내용',
    });

    expect(typeof result.id).toBe('number');
    expect(result.id).toBe(99);
  });
});

// ============================================================
// update - 상태 변경
// ============================================================

describe('FeedbackService.update', () => {
  it('status 업데이트 후 Gateway emitFeedbackUpdated 호출', async () => {
    const updated = makeFeedback({ status: 'in_progress' });
    const { service, prisma, gateway } = makeService();
    (prisma.companyFeedback.update as jest.Mock).mockResolvedValue(updated);

    const result = await service.update(BigInt(1), { status: 'in_progress' });

    expect(result.status).toBe('in_progress');
    expect(gateway.emitFeedbackUpdated).toHaveBeenCalled();
  });

  it('status = "resolved" 시 resolvedAt 자동 설정', async () => {
    const { service, prisma } = makeService();
    (prisma.companyFeedback.update as jest.Mock).mockResolvedValue(
      makeFeedback({ status: 'resolved', resolvedAt: new Date() })
    );

    await service.update(BigInt(1), { status: 'resolved' });

    const updateCall = (prisma.companyFeedback.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.resolvedAt).toBeInstanceOf(Date);
  });

  it('status가 resolved가 아닌 경우 resolvedAt 미설정', async () => {
    const { service, prisma } = makeService();
    (prisma.companyFeedback.update as jest.Mock).mockResolvedValue(
      makeFeedback({ status: 'in_progress' })
    );

    await service.update(BigInt(1), { status: 'in_progress' });

    const updateCall = (prisma.companyFeedback.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.resolvedAt).toBeUndefined();
  });

  it('adminNotes 업데이트', async () => {
    const { service, prisma } = makeService();
    (prisma.companyFeedback.update as jest.Mock).mockResolvedValue(
      makeFeedback({ adminNotes: '처리 완료' })
    );

    await service.update(BigInt(1), { adminNotes: '처리 완료' });

    const updateCall = (prisma.companyFeedback.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.adminNotes).toBe('처리 완료');
  });
});

// ============================================================
// getStatusCounts
// ============================================================

describe('FeedbackService.getStatusCounts', () => {
  it('상태별 카운트 반환', async () => {
    const { service, prisma } = makeService();
    (prisma.companyFeedback.findMany as jest.Mock).mockResolvedValue([
      { status: 'pending' },
      { status: 'pending' },
      { status: 'in_progress' },
      { status: 'resolved' },
    ]);

    const result = await service.getStatusCounts();

    expect(result).toEqual({
      pending: 2,
      in_progress: 1,
      resolved: 1,
      total: 4,
    });
  });

  it('피드백 없으면 모두 0 반환', async () => {
    const { service, prisma } = makeService();
    (prisma.companyFeedback.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.getStatusCounts();

    expect(result).toEqual({
      pending: 0,
      in_progress: 0,
      resolved: 0,
      total: 0,
    });
  });
});
