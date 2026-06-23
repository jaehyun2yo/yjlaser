import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountRecoveryMailDispatcher } from './account-recovery-mail.dispatcher';
import { Logger } from '@nestjs/common';
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

describe('AccountRecoveryMailDispatcher', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('메일 실패 notification metadata에 raw SMTP error와 raw email을 저장하지 않는다', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
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

    const event = findJsonLogEvent(errorSpy, 'account_recovery_mail_dispatch_failed');
    expect(event).toMatchObject({
      level: 'error',
      project: 'company_site',
      component: 'AccountRecoveryMailDispatcher',
      feature: 'auth',
      action: 'dispatch_mail',
      status: 'failure',
      channel: 'security',
      actor_id_hash: hashIdentifier(7),
      target_id_hash: hashIdentifier('fingerprint-hash'),
      error_type: 'Error',
      metadata: {
        flow: 'find-id',
        reason: 'mail_delivery_failed',
      },
    });

    const logPayload = serializeLoggerCalls(errorSpy);
    expect(logPayload).not.toContain('manager@example.com');
    expect(logPayload).not.toContain('reset-token');
    expect(logPayload).not.toContain('fingerprint-hash');
  });
});
