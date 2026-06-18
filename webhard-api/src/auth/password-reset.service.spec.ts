import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccountRecoveryMailDispatcher } from './account-recovery-mail.dispatcher';
import { AccountRecoveryRateLimitService } from './account-recovery-rate-limit.service';
import { AccountRecoveryTiming } from './account-recovery-timing.service';
import { PasswordResetService } from './password-reset.service';

interface PasswordResetMailInput {
  to: string;
  companyName: string;
  resetLink: string;
  expiresAt: Date;
}

interface PrismaMock {
  company: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  passwordResetToken: {
    updateMany: jest.Mock;
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
}

interface DispatcherMock {
  canSendEmail: jest.Mock<boolean, []>;
  sendPasswordResetLink: jest.Mock<void, [PasswordResetMailInput]>;
}

interface RateLimitMock {
  checkMailAllowance: jest.Mock<Promise<{ canSendMail: boolean }>, [Record<string, unknown>]>;
}

interface TimingMock {
  waitForMinimum: jest.Mock<Promise<void>, [number]>;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function makePrismaMock(): PrismaMock {
  const prisma = {
    company: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    passwordResetToken: {
      updateMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  prisma.$transaction.mockImplementation(async (operation: unknown) => {
    if (typeof operation === 'function') {
      const callback = operation as (tx: PrismaMock) => Promise<unknown>;
      return callback(prisma);
    }

    return Promise.all(operation as Array<Promise<unknown>>);
  });

  return prisma;
}

function makeService(overrides?: { siteUrl?: string; mailCanSend?: boolean }) {
  const prisma = makePrismaMock();
  const dispatcher: DispatcherMock = {
    canSendEmail: jest.fn(() => overrides?.mailCanSend ?? true),
    sendPasswordResetLink: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'NEXT_PUBLIC_SITE_URL' ? (overrides?.siteUrl ?? 'https://www.yjlaser.net') : undefined
    ),
  };
  const rateLimit: RateLimitMock = {
    checkMailAllowance: jest.fn().mockResolvedValue({ canSendMail: true }),
  };
  const timing: TimingMock = {
    waitForMinimum: jest.fn().mockResolvedValue(undefined),
  };

  const service = new PasswordResetService(
    prisma as unknown as PrismaService,
    dispatcher as unknown as AccountRecoveryMailDispatcher,
    config as unknown as ConfigService,
    rateLimit as unknown as AccountRecoveryRateLimitService,
    timing as unknown as AccountRecoveryTiming
  );

  return { service, prisma, dispatcher, config, rateLimit, timing };
}

describe('PasswordResetService', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('requestReset()', () => {
    it('업체 계정과 이메일이 일치하면 기존 미사용 토큰을 무효화하고 reset link를 발송한다', async () => {
      const { service, prisma, dispatcher, rateLimit, timing } = makeService();
      prisma.company.findUnique.mockResolvedValue({
        id: 7,
        username: 'acme',
        companyName: 'ACME목형',
        managerEmail: 'manager@example.com',
        status: 'active',
        isApproved: true,
      });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.passwordResetToken.create.mockResolvedValue({ id: 'reset-token-id' });

      const result = await service.requestReset(
        {
          username: ' acme ',
          email: 'MANAGER@example.com ',
        },
        { flow: 'find-password', ip: '1.2.3.4', fingerprint: 'fingerprint-hash' }
      );

      expect(result).toEqual({
        success: true,
        message: '입력하신 정보가 일치하면 이메일로 비밀번호 재설정 링크가 전송됩니다.',
      });
      expect(prisma.company.findUnique).toHaveBeenCalledWith({
        where: { username: 'acme' },
        select: {
          id: true,
          companyName: true,
          managerEmail: true,
          status: true,
          isApproved: true,
        },
      });
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { companyId: 7, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
        data: {
          companyId: 7,
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        },
      });
      expect(prisma.company.update).not.toHaveBeenCalled();

      expect(rateLimit.checkMailAllowance).toHaveBeenCalledWith({
        flow: 'find-password',
        companyId: 7,
        fingerprint: 'fingerprint-hash',
      });
      expect(timing.waitForMinimum).toHaveBeenCalledWith(expect.any(Number));

      const mailInput = dispatcher.sendPasswordResetLink.mock.calls[0]?.[0];
      expect(mailInput).toBeDefined();
      expect(mailInput).toMatchObject({
        to: 'manager@example.com',
        companyName: 'ACME목형',
      });

      const link = new URL(mailInput.resetLink);
      const token = new URLSearchParams(link.hash.slice(1)).get('token');
      expect(link.searchParams.get('token')).toBeNull();
      expect(token).toBeTruthy();
      expect(prisma.passwordResetToken.create.mock.calls[0]?.[0].data.tokenHash).toBe(
        hashToken(token ?? '')
      );
    });

    it('development localhost 요청 origin이 있으면 env의 production URL 대신 dev origin으로 reset link를 만든다', async () => {
      process.env.NODE_ENV = 'development';
      const { service, prisma, dispatcher } = makeService({
        siteUrl: 'https://www.yjlaser.net',
      });
      prisma.company.findUnique.mockResolvedValue({
        id: 7,
        username: 'acme',
        companyName: 'ACME목형',
        managerEmail: 'manager@example.com',
        status: 'active',
        isApproved: true,
      });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.passwordResetToken.create.mockResolvedValue({ id: 'reset-token-id' });

      await service.requestReset(
        {
          username: 'acme',
          email: 'manager@example.com',
        },
        {
          flow: 'find-password',
          ip: '127.0.0.1',
          fingerprint: 'fingerprint-hash',
          frontendOrigin: 'http://127.0.0.1:3101',
        }
      );

      const mailInput = dispatcher.sendPasswordResetLink.mock.calls[0]?.[0];
      expect(new URL(mailInput.resetLink).origin).toBe('http://127.0.0.1:3101');
    });

    it('production에서는 request origin을 무시하고 설정된 site URL로 reset link를 만든다', async () => {
      process.env.NODE_ENV = 'production';
      const { service, prisma, dispatcher } = makeService({
        siteUrl: 'https://www.yjlaser.net',
      });
      prisma.company.findUnique.mockResolvedValue({
        id: 7,
        username: 'acme',
        companyName: 'ACME목형',
        managerEmail: 'manager@example.com',
        status: 'active',
        isApproved: true,
      });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.passwordResetToken.create.mockResolvedValue({ id: 'reset-token-id' });

      await service.requestReset(
        {
          username: 'acme',
          email: 'manager@example.com',
        },
        {
          flow: 'find-password',
          ip: '1.2.3.4',
          fingerprint: 'fingerprint-hash',
          frontendOrigin: 'http://127.0.0.1:3101',
        }
      );

      const mailInput = dispatcher.sendPasswordResetLink.mock.calls[0]?.[0];
      expect(new URL(mailInput.resetLink).origin).toBe('https://www.yjlaser.net');
    });

    it('계정 정보가 일치하지 않으면 동일한 성공 응답만 반환하고 토큰과 메일을 만들지 않는다', async () => {
      const { service, prisma, dispatcher } = makeService();
      prisma.company.findUnique.mockResolvedValue({
        id: 7,
        username: 'acme',
        companyName: 'ACME목형',
        managerEmail: 'manager@example.com',
        status: 'active',
        isApproved: true,
      });

      const result = await service.requestReset({
        username: 'acme',
        email: 'other@example.com',
      });

      expect(result.success).toBe(true);
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(dispatcher.sendPasswordResetLink).not.toHaveBeenCalled();
    });

    it('post-lookup 발송 제한 초과는 reset token과 메일을 만들지 않고 generic success를 유지한다', async () => {
      const { service, prisma, dispatcher, rateLimit } = makeService();
      prisma.company.findUnique.mockResolvedValue({
        id: 7,
        username: 'acme',
        companyName: 'ACME목형',
        managerEmail: 'manager@example.com',
        status: 'active',
        isApproved: true,
      });
      rateLimit.checkMailAllowance.mockResolvedValue({ canSendMail: false });

      const result = await service.requestReset(
        {
          username: 'acme',
          email: 'manager@example.com',
        },
        { flow: 'find-password', ip: '1.2.3.4', fingerprint: 'fingerprint-hash' }
      );

      expect(result.success).toBe(true);
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(dispatcher.sendPasswordResetLink).not.toHaveBeenCalled();
    });

    it('post-lookup 발송 제한 저장소 실패도 reset token과 메일을 만들지 않고 generic success를 유지한다', async () => {
      const { service, prisma, dispatcher, rateLimit } = makeService();
      prisma.company.findUnique.mockResolvedValue({
        id: 7,
        username: 'acme',
        companyName: 'ACME목형',
        managerEmail: 'manager@example.com',
        status: 'active',
        isApproved: true,
      });
      rateLimit.checkMailAllowance.mockRejectedValue(
        new ServiceUnavailableException('limit unavailable')
      );

      const result = await service.requestReset(
        {
          username: 'acme',
          email: 'manager@example.com',
        },
        { flow: 'find-password', ip: '1.2.3.4', fingerprint: 'fingerprint-hash' }
      );

      expect(result).toEqual({
        success: true,
        message: '입력하신 정보가 일치하면 이메일로 비밀번호 재설정 링크가 전송됩니다.',
      });
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(dispatcher.sendPasswordResetLink).not.toHaveBeenCalled();
    });

    it('reset token 테이블이 없으면 500을 내지 않고 generic success를 유지한다', async () => {
      const { service, prisma, dispatcher } = makeService();
      prisma.company.findUnique.mockResolvedValue({
        id: 7,
        username: 'acme',
        companyName: 'ACME목형',
        managerEmail: 'manager@example.com',
        status: 'active',
        isApproved: true,
      });
      prisma.$transaction.mockRejectedValue({ code: 'P2021' });

      const result = await service.requestReset(
        {
          username: 'acme',
          email: 'manager@example.com',
        },
        { flow: 'find-password', ip: '1.2.3.4', fingerprint: 'fingerprint-hash' }
      );

      expect(result).toEqual({
        success: true,
        message: '입력하신 정보가 일치하면 이메일로 비밀번호 재설정 링크가 전송됩니다.',
      });
      expect(dispatcher.sendPasswordResetLink).not.toHaveBeenCalled();
    });

    it('메일 전송이 비활성화된 환경이면 계정 조회 전 실패해 계정 존재 여부를 노출하지 않는다', async () => {
      const { service, prisma } = makeService({ mailCanSend: false });

      await expect(
        service.requestReset({ username: 'acme', email: 'manager@example.com' })
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(prisma.company.findUnique).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmReset()', () => {
    it('유효한 토큰이면 새 비밀번호 해시를 저장하고 토큰을 사용 처리한다', async () => {
      const { service, prisma } = makeService();
      const token = 'raw-reset-token';
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-token-id',
        companyId: 7,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        usedAt: null,
      });
      prisma.company.update.mockResolvedValue({ id: 7 });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.confirmReset({
        token,
        password: 'NewStrong1!',
      });

      expect(result).toEqual({
        success: true,
        message: '비밀번호가 재설정되었습니다.',
      });
      expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashToken(token) },
      });
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: {
          passwordHash: expect.stringMatching(/^\$2[aby]\$/),
          updatedAt: expect.any(Date),
        },
      });
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'reset-token-id',
          usedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('만료되었거나 사용된 토큰이면 비밀번호를 변경하지 않는다', async () => {
      const { service, prisma } = makeService();
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-token-id',
        companyId: 7,
        tokenHash: hashToken('expired-token'),
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      });

      await expect(
        service.confirmReset({ token: 'expired-token', password: 'NewStrong1!' })
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.company.update).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.update).not.toHaveBeenCalled();
    });

    it('새 비밀번호가 정책을 만족하지 않으면 토큰 조회 없이 거절한다', async () => {
      const { service, prisma } = makeService();

      await expect(
        service.confirmReset({ token: 'valid-token', password: 'short' })
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
      expect(prisma.company.update).not.toHaveBeenCalled();
    });
  });
});
