import { BadRequestException } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';

function makeController() {
  const service = {
    getNotifications: jest.fn().mockResolvedValue([]),
    getUnreadCount: jest.fn().mockResolvedValue(0),
    getUnreadSummary: jest.fn().mockResolvedValue({
      all: 0,
      webhard: 0,
      integration: 0,
      workManagement: 0,
    }),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  };
  const controller = new NotificationsController(service as never);
  return { controller, service };
}

describe('NotificationsController query parsing', () => {
  it('treats a missing admin userId as null instead of rejecting the request', async () => {
    const { controller, service } = makeController();

    await expect(
      controller.getNotifications('admin', undefined, 10, 0, undefined, undefined)
    ).resolves.toEqual({ notifications: [] });

    expect(service.getNotifications).toHaveBeenCalledWith('admin', null, 10, 0, false, 'all');
  });

  it('treats a missing unread-count userId as null instead of rejecting the request', async () => {
    const { controller, service } = makeController();

    await expect(controller.getUnreadCount('admin', undefined, undefined)).resolves.toEqual({
      count: 0,
    });

    expect(service.getUnreadCount).toHaveBeenCalledWith('admin', null, 'all');
  });

  it('rejects a non-numeric userId when the query parameter is present', async () => {
    const { controller } = makeController();

    await expect(controller.getUnreadSummary('company', 'abc')).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});
