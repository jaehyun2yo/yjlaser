import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService account recovery logging', () => {
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

    const logPayload = JSON.stringify(errorMock.mock.calls);
    expect(logPayload).not.toContain('manager@example.com');
    expect(logPayload).not.toContain('reset-token');
    expect(logPayload).toContain('mail_delivery_failed');
  });
});

function LoggerLike(service: MailService): { error: jest.Mock } {
  return (service as unknown as { logger: { error: jest.Mock } }).logger;
}
