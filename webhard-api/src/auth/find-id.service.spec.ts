import { ServiceUnavailableException } from '@nestjs/common';
import { AccountRecoveryMailDispatcher } from './account-recovery-mail.dispatcher';
import { AccountRecoveryRateLimitService } from './account-recovery-rate-limit.service';
import { AccountRecoveryTiming } from './account-recovery-timing.service';
import { FindIdService } from './find-id.service';

interface PrismaMock {
  company: {
    findMany: jest.Mock;
  };
}

interface DispatcherMock {
  canSendEmail: jest.Mock<boolean, []>;
  sendUsernameReminder: jest.Mock<void, [Record<string, unknown>]>;
}

interface RateLimitMock {
  checkMailAllowance: jest.Mock<Promise<{ canSendMail: boolean }>, [Record<string, unknown>]>;
}

interface TimingMock {
  waitForMinimum: jest.Mock<Promise<void>, [number]>;
}

function makeService() {
  const prisma: PrismaMock = {
    company: {
      findMany: jest.fn(),
    },
  };
  const dispatcher: DispatcherMock = {
    canSendEmail: jest.fn(() => true),
    sendUsernameReminder: jest.fn(),
  };
  const rateLimit: RateLimitMock = {
    checkMailAllowance: jest.fn().mockResolvedValue({ canSendMail: true }),
  };
  const timing: TimingMock = {
    waitForMinimum: jest.fn().mockResolvedValue(undefined),
  };

  const service = new FindIdService(
    prisma as never,
    dispatcher as unknown as AccountRecoveryMailDispatcher,
    rateLimit as unknown as AccountRecoveryRateLimitService,
    timing as unknown as AccountRecoveryTiming
  );

  return { service, prisma, dispatcher, rateLimit, timing };
}

describe('FindIdService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('복구 가능한 업체 정보가 모두 일치하면 아이디 안내 메일 발송을 예약하고 generic success를 반환한다', async () => {
    const { service, prisma, dispatcher, rateLimit, timing } = makeService();
    prisma.company.findMany.mockResolvedValue([
      {
        id: 7,
        companyName: '대성목형',
        username: 'daesung',
        managerEmail: 'manager@example.com',
        managerPhone: '010-1234-5678',
        status: 'active',
        isApproved: true,
      },
    ]);

    const result = await service.requestReminder(
      {
        companyName: ' 대성목형 ',
        email: 'MANAGER@example.com ',
        phone: '01012345678',
      },
      { flow: 'find-id', ip: '1.2.3.4', fingerprint: 'fingerprint-hash' }
    );

    expect(result).toEqual({
      success: true,
      message: '입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 아이디 안내를 보냈습니다.',
    });
    expect(prisma.company.findMany).toHaveBeenCalledWith({
      where: { companyName: '대성목형' },
      select: {
        id: true,
        companyName: true,
        username: true,
        managerEmail: true,
        managerPhone: true,
        status: true,
        isApproved: true,
      },
    });
    expect(rateLimit.checkMailAllowance).toHaveBeenCalledWith({
      flow: 'find-id',
      companyId: 7,
      fingerprint: 'fingerprint-hash',
    });
    expect(dispatcher.sendUsernameReminder).toHaveBeenCalledWith({
      companyId: 7,
      to: 'manager@example.com',
      companyName: '대성목형',
      username: 'daesung',
      fingerprint: 'fingerprint-hash',
    });
    expect(timing.waitForMinimum).toHaveBeenCalledWith(expect.any(Number));
  });

  it('동일 업체명이 여러 개이면 이메일/전화번호까지 일치하는 복구 가능 계정을 선택한다', async () => {
    const { service, prisma, dispatcher } = makeService();
    prisma.company.findMany.mockResolvedValue([
      {
        id: 7,
        companyName: '대성목형',
        username: 'wrong',
        managerEmail: 'other@example.com',
        managerPhone: '010-0000-0000',
        status: 'active',
        isApproved: true,
      },
      {
        id: 8,
        companyName: '대성목형',
        username: 'right-user',
        managerEmail: 'manager@example.com',
        managerPhone: '010-1234-5678',
        status: 'active',
        isApproved: true,
      },
    ]);

    await service.requestReminder(
      {
        companyName: '대성목형',
        email: 'manager@example.com',
        phone: '01012345678',
      },
      { flow: 'find-id', ip: '1.2.3.4', fingerprint: 'fingerprint-hash' }
    );

    expect(dispatcher.sendUsernameReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 8,
        username: 'right-user',
      })
    );
  });

  it('불일치하거나 승인되지 않은 업체는 같은 성공 응답을 반환하고 메일을 예약하지 않는다', async () => {
    const { service, prisma, dispatcher, rateLimit } = makeService();
    prisma.company.findMany.mockResolvedValue([
      {
        id: 7,
        companyName: '대성목형',
        username: 'daesung',
        managerEmail: 'manager@example.com',
        managerPhone: '010-1234-5678',
        status: 'pending',
        isApproved: false,
      },
    ]);

    const result = await service.requestReminder(
      {
        companyName: '대성목형',
        email: 'manager@example.com',
        phone: '01012345678',
      },
      { flow: 'find-id', ip: '1.2.3.4', fingerprint: 'fingerprint-hash' }
    );

    expect(result.success).toBe(true);
    expect(rateLimit.checkMailAllowance).not.toHaveBeenCalled();
    expect(dispatcher.sendUsernameReminder).not.toHaveBeenCalled();
  });

  it('post-lookup 발송 제한 초과는 메일만 억제하고 generic success를 유지한다', async () => {
    const { service, prisma, dispatcher, rateLimit } = makeService();
    prisma.company.findMany.mockResolvedValue([
      {
        id: 7,
        companyName: '대성목형',
        username: 'daesung',
        managerEmail: 'manager@example.com',
        managerPhone: '010-1234-5678',
        status: 'active',
        isApproved: true,
      },
    ]);
    rateLimit.checkMailAllowance.mockResolvedValue({ canSendMail: false });

    const result = await service.requestReminder(
      {
        companyName: '대성목형',
        email: 'manager@example.com',
        phone: '01012345678',
      },
      { flow: 'find-id', ip: '1.2.3.4', fingerprint: 'fingerprint-hash' }
    );

    expect(result.success).toBe(true);
    expect(dispatcher.sendUsernameReminder).not.toHaveBeenCalled();
  });

  it('post-lookup 발송 제한 저장소 실패도 메일만 억제하고 generic success를 유지한다', async () => {
    const { service, prisma, dispatcher, rateLimit } = makeService();
    prisma.company.findMany.mockResolvedValue([
      {
        id: 7,
        companyName: '대성목형',
        username: 'daesung',
        managerEmail: 'manager@example.com',
        managerPhone: '010-1234-5678',
        status: 'active',
        isApproved: true,
      },
    ]);
    rateLimit.checkMailAllowance.mockRejectedValue(
      new ServiceUnavailableException('limit unavailable')
    );

    const result = await service.requestReminder(
      {
        companyName: '대성목형',
        email: 'manager@example.com',
        phone: '01012345678',
      },
      { flow: 'find-id', ip: '1.2.3.4', fingerprint: 'fingerprint-hash' }
    );

    expect(result).toEqual({
      success: true,
      message: '입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 아이디 안내를 보냈습니다.',
    });
    expect(dispatcher.sendUsernameReminder).not.toHaveBeenCalled();
  });

  it('SMTP 전역 미설정은 계정 조회 전에 실패한다', async () => {
    const { service, prisma, dispatcher } = makeService();
    dispatcher.canSendEmail.mockReturnValue(false);

    await expect(
      service.requestReminder(
        {
          companyName: '대성목형',
          email: 'manager@example.com',
          phone: '01012345678',
        },
        { flow: 'find-id', ip: '1.2.3.4', fingerprint: 'fingerprint-hash' }
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prisma.company.findMany).not.toHaveBeenCalled();
  });
});
