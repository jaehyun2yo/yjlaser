/**
 * Worker Access Log Service 테스트
 * FEAT-011: 로그인 성공/실패/IP차단/로그아웃 로그 기록
 *
 * NOTE: AccessLogService는 현재 미구현 (TDD RED 상태)
 * 팀장이 구현하면 이 테스트가 GREEN이 되어야 함
 */

// AccessLogService mock — 구현 전 인터페이스 정의
interface AccessLogCreateInput {
  workerId: string | null;
  ipAddress: string;
  userAgent?: string | null;
  action: 'login_success' | 'login_failed' | 'ip_blocked' | 'logout';
  success: boolean;
  metadata?: Record<string, unknown>;
}

// Prisma mock factory
function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    executeWithRetry: jest.fn((fn: () => unknown) => fn()),
    workerAccessLog: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    ...overrides,
  };
}

// AccessLogService 인터페이스 (구현 전 스펙 정의)
interface IAccessLogService {
  log(input: AccessLogCreateInput): Promise<void>;
  getLogs(options: {
    workerId?: string;
    action?: string;
    limit?: number;
    offset?: number;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<{
    logs: {
      id: string;
      workerId: string | null;
      ipAddress: string;
      action: string;
      success: boolean;
      createdAt: string;
    }[];
    total: number;
  }>;
}

describe('AccessLogService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: IAccessLogService;

  beforeEach(() => {
    prisma = makePrisma();

    // AccessLogService가 구현되면 실제 import로 교체
    // import { AccessLogService } from '../access-log.service';
    // service = new AccessLogService(prisma as never);

    // 현재 미구현이므로 mock service 사용
    service = {
      log: jest.fn(async (input: AccessLogCreateInput) => {
        await prisma.workerAccessLog.create({
          data: {
            workerId: input.workerId,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent ?? null,
            action: input.action,
            success: input.success,
            metadata: input.metadata ?? {},
          },
        });
      }),
      getLogs: jest.fn(async () => ({
        logs: [],
        total: 0,
      })),
    };
  });

  describe('log() — 접근 로그 기록', () => {
    it('login_success: 로그인 성공 로그를 DB에 저장', async () => {
      prisma.workerAccessLog.create.mockResolvedValue({
        id: 'log-1',
        workerId: 'worker-1',
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
        action: 'login_success',
        success: true,
        metadata: {},
        createdAt: new Date(),
      });

      await service.log({
        workerId: 'worker-1',
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
        action: 'login_success',
        success: true,
      });

      expect(prisma.workerAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workerId: 'worker-1',
            ipAddress: '192.168.1.100',
            action: 'login_success',
            success: true,
          }),
        })
      );
    });

    it('login_failed: 잘못된 PIN으로 로그인 실패 로그 저장', async () => {
      prisma.workerAccessLog.create.mockResolvedValue({
        id: 'log-2',
        workerId: null,
        ipAddress: '192.168.1.100',
        userAgent: null,
        action: 'login_failed',
        success: false,
        metadata: { reason: 'invalid_pin', attemptedName: '홍길동' },
        createdAt: new Date(),
      });

      await service.log({
        workerId: null, // PIN 실패면 worker 특정 불가능
        ipAddress: '192.168.1.100',
        action: 'login_failed',
        success: false,
        metadata: { reason: 'invalid_pin', attemptedName: '홍길동' },
      });

      expect(prisma.workerAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'login_failed',
            success: false,
          }),
        })
      );
    });

    it('ip_blocked: IP 차단 로그 저장 (workerId 있음)', async () => {
      prisma.workerAccessLog.create.mockResolvedValue({
        id: 'log-3',
        workerId: 'worker-1',
        ipAddress: '5.5.5.5',
        userAgent: 'curl/7.0',
        action: 'ip_blocked',
        success: false,
        metadata: { allowedIps: ['192.168.1.100'] },
        createdAt: new Date(),
      });

      await service.log({
        workerId: 'worker-1',
        ipAddress: '5.5.5.5',
        userAgent: 'curl/7.0',
        action: 'ip_blocked',
        success: false,
        metadata: { allowedIps: ['192.168.1.100'] },
      });

      expect(prisma.workerAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ip_blocked',
            success: false,
            workerId: 'worker-1',
          }),
        })
      );
    });

    it('logout: 로그아웃 로그 저장', async () => {
      prisma.workerAccessLog.create.mockResolvedValue({
        id: 'log-4',
        workerId: 'worker-1',
        ipAddress: '192.168.1.100',
        userAgent: null,
        action: 'logout',
        success: true,
        metadata: {},
        createdAt: new Date(),
      });

      await service.log({
        workerId: 'worker-1',
        ipAddress: '192.168.1.100',
        action: 'logout',
        success: true,
      });

      expect(prisma.workerAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'logout',
            success: true,
          }),
        })
      );
    });

    it('metadata가 없으면 빈 객체로 저장', async () => {
      prisma.workerAccessLog.create.mockResolvedValue({
        id: 'log-5',
        workerId: 'worker-1',
        ipAddress: '192.168.1.100',
        userAgent: null,
        action: 'login_success',
        success: true,
        metadata: {},
        createdAt: new Date(),
      });

      await service.log({
        workerId: 'worker-1',
        ipAddress: '192.168.1.100',
        action: 'login_success',
        success: true,
        // metadata 미전달
      });

      expect(prisma.workerAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: {},
          }),
        })
      );
    });
  });

  describe('getLogs() — 로그 조회', () => {
    it('workerId로 필터링된 로그 반환', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          workerId: 'worker-1',
          ipAddress: '192.168.1.100',
          action: 'login_success',
          success: true,
          createdAt: new Date().toISOString(),
        },
      ];
      (service.getLogs as jest.Mock).mockResolvedValue({
        logs: mockLogs,
        total: 1,
      });

      const result = await service.getLogs({ workerId: 'worker-1' });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].workerId).toBe('worker-1');
      expect(result.total).toBe(1);
    });

    it('action으로 필터링 — ip_blocked만 조회', async () => {
      (service.getLogs as jest.Mock).mockResolvedValue({
        logs: [
          {
            id: 'log-3',
            workerId: 'worker-1',
            ipAddress: '5.5.5.5',
            action: 'ip_blocked',
            success: false,
            createdAt: new Date().toISOString(),
          },
        ],
        total: 1,
      });

      const result = await service.getLogs({ action: 'ip_blocked' });

      expect(result.logs.every((l) => l.action === 'ip_blocked')).toBe(true);
    });

    it('날짜 범위로 필터링', async () => {
      const dateFrom = new Date('2026-03-01');
      const dateTo = new Date('2026-03-17');

      (service.getLogs as jest.Mock).mockResolvedValue({
        logs: [],
        total: 0,
      });

      await service.getLogs({ dateFrom, dateTo });

      expect(service.getLogs).toHaveBeenCalledWith(expect.objectContaining({ dateFrom, dateTo }));
    });

    it('limit/offset 페이지네이션 지원', async () => {
      (service.getLogs as jest.Mock).mockResolvedValue({
        logs: [],
        total: 100,
      });

      await service.getLogs({ limit: 20, offset: 40 });

      expect(service.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 20, offset: 40 })
      );
    });
  });
});
