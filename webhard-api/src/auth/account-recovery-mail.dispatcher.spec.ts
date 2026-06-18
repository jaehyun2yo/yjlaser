import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountRecoveryMailDispatcher } from './account-recovery-mail.dispatcher';

describe('AccountRecoveryMailDispatcher', () => {
  it('메일 실패 notification metadata에 raw SMTP error와 raw email을 저장하지 않는다', async () => {
    const mail = {
      canSendEmail: jest.fn(() => true),
      sendUsernameReminder: jest
        .fn()
        .mockRejectedValue(new Error('550 rejected manager@example.com reset-token')),
    };
    const prisma = {
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'notification-id' }),
      },
    };
    const dispatcher = new AccountRecoveryMailDispatcher(
      mail as unknown as MailService,
      prisma as unknown as PrismaService
    );

    dispatcher.sendUsernameReminder({
      companyId: 7,
      to: 'manager@example.com',
      companyName: '대성목형',
      username: 'daesung',
      fingerprint: 'fingerprint-hash',
    });

    await new Promise(process.nextTick);

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: {
          flow: 'find-id',
          companyId: 7,
          fingerprint: 'fingerprint-hash',
          reason: 'mail_delivery_failed',
        },
      }),
    });
    const metadata = prisma.notification.create.mock.calls[0]?.[0].data.metadata;
    expect(JSON.stringify(metadata)).not.toContain('manager@example.com');
    expect(JSON.stringify(metadata)).not.toContain('reset-token');
  });
});
