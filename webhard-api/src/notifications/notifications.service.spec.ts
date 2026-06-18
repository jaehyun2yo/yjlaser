import { NotificationsService } from './notifications.service';

function makeNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notification-1',
    userType: 'admin',
    userId: null,
    type: 'file_uploaded',
    title: '새 파일 업로드',
    message: '테스트 파일이 업로드되었습니다.',
    metadata: { link: '/webhard' },
    isRead: false,
    readAt: null,
    createdAt: new Date('2026-05-15T00:00:00.000Z'),
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    executeWithRetry: jest.fn((fn: () => unknown) => fn()),
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const gateway = {
    emitNotificationUpdated: jest.fn(),
    emitAllNotificationsRead: jest.fn(),
  };
  const service = new NotificationsService(prisma as never, gateway as never);
  return { service, prisma, gateway };
}

describe('NotificationsService categories', () => {
  it('웹하드 카테고리는 파일 업로드와 웹하드 매칭 알림만 조회한다', async () => {
    const { service, prisma } = makeService();
    prisma.notification.findMany.mockResolvedValueOnce([
      makeNotification({ type: 'file_uploaded' }),
    ]);

    const result = await service.getNotifications('admin', null, 20, 0, false, 'webhard');

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userType: 'admin',
          type: {
            in: ['file_uploaded', 'webhard_company_mismatch', 'webhard_classify_failed'],
          },
        }),
      })
    );
    expect(result[0]).toMatchObject({
      type: 'file_uploaded',
      category: 'webhard',
    });
  });

  it('업체 승인 필요 알림은 통합관리 카테고리로 분류한다', async () => {
    const { service, prisma } = makeService();
    prisma.notification.findMany.mockResolvedValueOnce([
      makeNotification({ type: 'company_approval_pending', title: '업체 승인 필요' }),
    ]);

    const result = await service.getNotifications('admin', null, 20, 0, false, 'integration');

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: expect.objectContaining({
            in: expect.arrayContaining(['company_approval_pending']),
          }),
        }),
      })
    );
    expect(result[0]).toMatchObject({
      type: 'company_approval_pending',
      category: 'integration',
    });
  });

  it('카테고리별 읽지 않은 알림 수 요약을 반환한다', async () => {
    const { service, prisma } = makeService();
    prisma.notification.groupBy.mockResolvedValueOnce([
      { type: 'file_uploaded', _count: { _all: 2 } },
      { type: 'booking_created', _count: { _all: 1 } },
      { type: 'worker_note_added', _count: { _all: 3 } },
    ]);

    await expect(service.getUnreadSummary('admin', null)).resolves.toEqual({
      all: 6,
      webhard: 2,
      integration: 1,
      workManagement: 3,
    });
  });
});
