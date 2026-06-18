import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { SessionsController } from './sessions.controller';
import { AdminGuard } from '../auth/guards/admin.guard';
import { SessionUser } from '../auth/auth.service';

function makeController() {
  const service = {
    upsertSession: jest.fn().mockResolvedValue(true),
    deleteSession: jest.fn().mockResolvedValue(true),
    getSessionsCount: jest.fn(),
    getSessionsList: jest.fn(),
  };
  const controller = new SessionsController(service as never);
  return { controller, service };
}

function requestFor(user: SessionUser, apiKeyInfo?: unknown) {
  return { user, apiKeyInfo } as never;
}

describe('SessionsController session principals', () => {
  it('allows an admin session to upsert the admin heartbeat without API key auth', async () => {
    const { controller, service } = makeController();

    await expect(
      controller.upsertSession(
        { userType: 'admin', userId: 0, username: 'admin' },
        requestFor({ userType: 'admin', userId: 'admin', companyId: 0 })
      )
    ).resolves.toEqual({ success: true });

    expect(service.upsertSession).toHaveBeenCalledWith('admin', 0, 'admin', null);
  });

  it('allows a company session to upsert only its own heartbeat', async () => {
    const { controller, service } = makeController();

    await expect(
      controller.upsertSession(
        {
          userType: 'company',
          userId: 7,
          username: '7',
          companyName: '테스트거래처',
        },
        requestFor({ userType: 'company', userId: 7, companyId: 7 })
      )
    ).resolves.toEqual({ success: true });

    expect(service.upsertSession).toHaveBeenCalledWith('company', 7, '7', '테스트거래처');
  });

  it('rejects API key principals for heartbeat mutation', async () => {
    const { controller } = makeController();

    await expect(
      controller.upsertSession(
        { userType: 'admin', userId: 0, username: 'admin' },
        requestFor(
          {
            userType: 'integration',
            userId: 'api:sync',
            companyId: null,
            programType: 'sync',
          },
          { id: 'key-1' }
        )
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a company session trying to manage another company heartbeat', async () => {
    const { controller } = makeController();

    await expect(
      controller.deleteSession(
        { userType: 'company', userId: 8 },
        requestFor({ userType: 'company', userId: 7, companyId: 7 })
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps dashboard session reads admin-only', () => {
    const prototype = SessionsController.prototype;

    expect(Reflect.getMetadata(GUARDS_METADATA, prototype.getSessionsCount)).toContain(AdminGuard);
    expect(Reflect.getMetadata(GUARDS_METADATA, prototype.getSessionsList)).toContain(AdminGuard);
  });
});
