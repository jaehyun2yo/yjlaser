/**
 * PIN Brute-Force 방어 테스트
 * FEAT-011: 5회 실패/5분 차단, IP별 독립 카운팅
 */

import { AccessLogsService } from '../../access-logs/access-logs.service';
import { AccessLogAction } from '../../access-logs/dto/access-log.dto';
import { WorkersService } from '../workers.service';

function makePrisma() {
  return {
    executeWithRetry: jest.fn((fn: () => unknown) => fn()),
    workerAccessLog: {
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    erpWorker: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

function makeAccessLogsService() {
  return {
    getPinRateLimitStatus: jest.fn().mockResolvedValue({
      isRateLimited: false,
      retryAfterSeconds: 0,
      failedAttempts: 0,
    }),
    createLog: jest.fn().mockResolvedValue(undefined),
  };
}

describe('AccessLogsService — PIN brute-force rate limit', () => {
  const TEST_IP = '192.168.1.100';

  let prisma: ReturnType<typeof makePrisma>;
  let service: AccessLogsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AccessLogsService(prisma as never);
  });

  it('5분 안에 실패 5회가 있으면 차단 상태와 남은 시간을 반환', async () => {
    const baseTime = new Date('2026-05-13T10:00:00.000Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(baseTime);
    prisma.workerAccessLog.count.mockResolvedValueOnce(5);
    prisma.workerAccessLog.findFirst.mockResolvedValueOnce({
      createdAt: new Date(baseTime - 2 * 60 * 1000),
    });

    const status = await service.getPinRateLimitStatus(TEST_IP);

    expect(status).toEqual({
      isRateLimited: true,
      retryAfterSeconds: 180,
      failedAttempts: 5,
    });
    expect(prisma.workerAccessLog.count).toHaveBeenCalledWith({
      where: {
        ipAddress: TEST_IP,
        action: AccessLogAction.LOGIN_FAILED,
        createdAt: { gte: new Date(baseTime - 5 * 60 * 1000) },
      },
    });
    expect(prisma.workerAccessLog.findFirst).toHaveBeenCalledWith({
      where: {
        ipAddress: TEST_IP,
        action: AccessLogAction.LOGIN_FAILED,
        createdAt: { gte: new Date(baseTime - 5 * 60 * 1000) },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
  });

  it('실패가 5회 미만이면 차단하지 않고 남은 시간을 0으로 반환', async () => {
    prisma.workerAccessLog.count.mockResolvedValueOnce(4);

    await expect(service.getPinRateLimitStatus(TEST_IP)).resolves.toEqual({
      isRateLimited: false,
      retryAfterSeconds: 0,
      failedAttempts: 4,
    });
    expect(prisma.workerAccessLog.findFirst).not.toHaveBeenCalled();
  });
});

describe('WorkersService — PIN 로그인 brute-force 방어 통합', () => {
  const TEST_IP = '192.168.1.100';

  let prisma: ReturnType<typeof makePrisma>;
  let accessLogsService: ReturnType<typeof makeAccessLogsService>;
  let service: WorkersService;

  beforeEach(() => {
    prisma = makePrisma();
    accessLogsService = makeAccessLogsService();
    service = new WorkersService(prisma as never, accessLogsService as never);
  });

  it('rate limited IP는 worker 조회 전에 차단 응답과 retry 시간을 반환', async () => {
    accessLogsService.getPinRateLimitStatus.mockResolvedValueOnce({
      isRateLimited: true,
      retryAfterSeconds: 241,
      failedAttempts: 5,
    });

    const result = await service.pinLogin({
      name: '홍길동',
      pin: '1234',
      ipAddress: TEST_IP,
      userAgent: 'Mozilla/5.0',
    });

    expect(result).toMatchObject({
      success: false,
      worker: null,
      reason: 'rate_limited',
      retry_after_seconds: 241,
    });
    expect(prisma.erpWorker.findFirst).not.toHaveBeenCalled();
    expect(accessLogsService.createLog).toHaveBeenCalledWith({
      ipAddress: TEST_IP,
      userAgent: 'Mozilla/5.0',
      action: AccessLogAction.LOGIN_FAILED,
      success: false,
      metadata: {
        reason: 'rate_limited',
        failedAttempts: 5,
        retryAfterSeconds: 241,
      },
    });
  });

  it('잘못된 PIN 실패는 IP별 login_failed 로그로 기록한다', async () => {
    const result = await service.pinLogin({
      name: '홍길동',
      pin: '9999',
      ipAddress: TEST_IP,
    });

    expect(result).toMatchObject({
      success: false,
      worker: null,
      reason: 'invalid_credentials',
    });
    expect(accessLogsService.createLog).toHaveBeenCalledWith({
      ipAddress: TEST_IP,
      userAgent: undefined,
      action: AccessLogAction.LOGIN_FAILED,
      success: false,
      metadata: { reason: 'invalid_credentials', attemptedName: '홍길동' },
    });
  });
});
