import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
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

describe('MailService account recovery logging', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('required 계정 복구 메일 실패 로그에 raw SMTP error나 recipient email을 남기지 않는다', async () => {
    const service = new MailService({
      get: jest.fn((key: string) => {
        const values: Record<string, string | number> = {
          SMTP_HOST: 'smtp.example.com',
          SMTP_PORT: 587,
          SMTP_USER: 'service@example.com',
          SMTP_PASSWORD: 'secret',
          ADMIN_EMAIL: 'admin@example.com',
        };
        return values[key];
      }),
    } as unknown as ConfigService);
    const errorMock = jest.spyOn(LoggerLike(service), 'error').mockImplementation();
    (service as unknown as { transporter: { sendMail: jest.Mock } }).transporter = {
      sendMail: jest
        .fn()
        .mockRejectedValue(new Error('550 rejected manager@example.com reset-token')),
    };

    await expect(
      service.sendUsernameReminder({
        to: 'manager@example.com',
        companyName: '대성목형',
        username: 'daesung',
      })
    ).rejects.toThrow();

    const event = findJsonLogEvent(errorMock, 'mail_send_attempt_failed');
    expect(event).toMatchObject({
      level: 'error',
      project: 'company_site',
      component: 'MailService',
      feature: 'mail',
      action: 'send',
      status: 'retry',
      channel: 'error',
      target_id_hash: hashIdentifier('[유진레이저목형] 아이디 안내'),
      error_type: 'Error',
      metadata: {
        attempt: 1,
        max_attempts: 3,
        reason: 'mail_delivery_failed',
        required: true,
      },
    });

    const permanentEvent = findJsonLogEvent(errorMock, 'mail_send_permanently_failed');
    expect(permanentEvent).toMatchObject({
      status: 'failure',
      channel: 'error',
      metadata: {
        max_attempts: 3,
        required: true,
      },
    });

    const logPayload = serializeLoggerCalls(errorMock);
    expect(logPayload).not.toContain('manager@example.com');
    expect(logPayload).not.toContain('reset-token');
    expect(logPayload).not.toContain('대성목형');
    expect(logPayload).not.toContain('[유진레이저목형] 아이디 안내');
    expect(logPayload).toContain('mail_delivery_failed');
  });

  it('required 메일 skip 로그에 raw recipient, subject, reset link를 남기지 않는다', async () => {
    const service = new MailService({
      get: jest.fn((key: string) => {
        const values: Record<string, string | number> = {
          FROM_NAME: '유진레이저목형',
          ADMIN_EMAIL: 'admin@example.com',
          NEXT_PUBLIC_SITE_URL: 'https://www.yjlaser.net',
        };
        return values[key];
      }),
    } as unknown as ConfigService);
    const warnMock = jest.spyOn(LoggerLike(service), 'warn').mockImplementation();

    await expect(
      service.sendPasswordResetLink({
        to: 'manager@example.com',
        companyName: '대성목형',
        resetLink: 'https://www.yjlaser.net/reset?token=raw-reset-token',
        expiresAt: new Date('2026-06-22T12:00:00.000Z'),
      })
    ).rejects.toThrow('SMTP not configured');

    const event = findJsonLogEvent(warnMock, 'mail_send_skipped');
    expect(event).toMatchObject({
      level: 'warn',
      project: 'company_site',
      component: 'MailService',
      feature: 'mail',
      action: 'send',
      status: 'skipped',
      channel: 'error',
      target_id_hash: hashIdentifier('[유진레이저목형] 비밀번호 재설정 링크'),
      metadata: {
        reason: 'smtp_not_configured',
        required: true,
      },
    });

    const logPayload = serializeLoggerCalls(warnMock);
    expect(logPayload).not.toContain('manager@example.com');
    expect(logPayload).not.toContain('대성목형');
    expect(logPayload).not.toContain('raw-reset-token');
    expect(logPayload).not.toContain('[유진레이저목형] 비밀번호 재설정 링크');
  });
});

function LoggerLike(service: MailService): {
  error: jest.Mock;
  warn: jest.Mock;
} {
  return (service as unknown as { logger: { error: jest.Mock; warn: jest.Mock } }).logger;
}
