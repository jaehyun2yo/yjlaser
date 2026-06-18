/**
 * DashboardService unit tests
 *
 * Phase 2 DB refactoring: Raw SQL → Prisma ORM 전환 완료
 * 이 테스트는 Prisma ORM 전환 후 동일한 인터페이스로 동작하는지 검증합니다.
 *
 * 전환된 메서드:
 * - getDashboardStats: contact.count (overdue 집계, 1건)
 */

import { DashboardService, DashboardResponse } from '../dashboard.service';

// ─── Mock 타입 정의 ──────────────────────────────────────────
interface MockPrisma {
  executeWithRetry: jest.Mock;
  task: {
    groupBy: jest.Mock;
    count: jest.Mock;
    findMany: jest.Mock;
  };
  machine: {
    findMany: jest.Mock;
  };
  contact: {
    count: jest.Mock;
  };
}

function makePrisma(): MockPrisma {
  return {
    executeWithRetry: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
    task: {
      groupBy: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    machine: {
      findMany: jest.fn(),
    },
    contact: {
      count: jest.fn(),
    },
  };
}

// ──────────────────────────────────────────────────────────────
// 1. getDashboardStats — 전체 대시보드 통계
// ──────────────────────────────────────────────────────────────
describe('DashboardService.getDashboardStats', () => {
  let service: DashboardService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new DashboardService(prisma as never);
  });

  it('정상적인 대시보드 데이터 반환', async () => {
    // 병렬 Promise.all 내부 쿼리들
    const taskStats = [
      { status: 'pending', priority: 'normal', _count: 5 },
      { status: 'in_progress', priority: 'normal', _count: 3 },
      { status: 'pending', priority: 'urgent', _count: 2 },
      { status: 'completed', priority: 'normal', _count: 10 },
    ];

    const overdueContacts = [{ count: BigInt(4) }];

    const machines = [
      {
        id: 'machine-001',
        name: '레이저 1호기',
        type: 'laser',
        status: 'active',
        tasks: [{ id: 'task-001' }, { id: 'task-002' }],
      },
    ];

    const workerStats = [
      { assignedTo: '김작업자', _count: 3 },
      { assignedTo: '이작업자', _count: 1 },
    ];

    const recentCompleted = [
      {
        id: 'task-done-001',
        title: '완료 작업',
        completedAt: new Date('2026-03-20T08:00:00Z'),
        actualDuration: 120,
        assignedTo: '김작업자',
      },
    ];

    // executeWithRetry mock: 첫 번째 호출은 Promise.all 전체
    prisma.executeWithRetry.mockImplementationOnce((fn: () => Promise<unknown>) => fn());

    // Promise.all 내부 mock 설정
    prisma.task.groupBy
      .mockResolvedValueOnce(taskStats) // task status/priority 그룹
      .mockResolvedValueOnce(workerStats) // worker active tasks
      .mockResolvedValueOnce([
        // worker completed today
        { assignedTo: '김작업자', _count: 5 },
      ]);

    prisma.contact.count.mockResolvedValueOnce(4);

    prisma.machine.findMany.mockResolvedValueOnce(machines);

    prisma.task.findMany.mockResolvedValueOnce(recentCompleted);

    // completedToday count
    prisma.task.count.mockResolvedValueOnce(6);

    const result: DashboardResponse = await service.getDashboardStats();

    // stats 검증
    expect(result.stats.total_tasks).toBe(20); // 5+3+2+10
    expect(result.stats.pending_tasks).toBe(7); // 5+2
    expect(result.stats.in_progress_tasks).toBe(3);
    expect(result.stats.urgent_tasks).toBe(2); // urgent pending
    expect(result.stats.overdue_contacts).toBe(4);
    expect(result.stats.completed_today).toBe(6);

    // machines 검증
    expect(result.machines).toHaveLength(1);
    expect(result.machines[0].name).toBe('레이저 1호기');
    expect(result.machines[0].active_tasks).toBe(2);

    // workers 검증
    expect(result.workers).toHaveLength(2);
    expect(result.workers[0].name).toBe('김작업자');
    expect(result.workers[0].active_tasks).toBe(3);
    expect(result.workers[0].completed_today).toBe(5);

    // recent_completed 검증
    expect(result.recent_completed).toHaveLength(1);
    expect(result.recent_completed[0].title).toBe('완료 작업');
    expect(result.recent_completed[0].completed_at).toBe('2026-03-20T08:00:00.000Z');
    expect(result.recent_completed[0].actual_duration).toBe(120);
  });

  it('contacts overdue 0건 → overdue_contacts = 0', async () => {
    prisma.executeWithRetry.mockImplementation((fn: () => Promise<unknown>) => fn());

    prisma.task.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    prisma.contact.count.mockResolvedValueOnce(0);
    prisma.machine.findMany.mockResolvedValueOnce([]);
    prisma.task.findMany.mockResolvedValueOnce([]);
    prisma.task.count.mockResolvedValueOnce(0);

    const result = await service.getDashboardStats();

    expect(result.stats.overdue_contacts).toBe(0);
    expect(result.stats.total_tasks).toBe(0);
    expect(result.machines).toEqual([]);
    expect(result.workers).toEqual([]);
  });

  it('overdue contacts Prisma count → number 직접 반환', async () => {
    prisma.executeWithRetry.mockImplementation((fn: () => Promise<unknown>) => fn());

    prisma.task.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    // Prisma count는 직접 number 반환
    prisma.contact.count.mockResolvedValueOnce(100);
    prisma.machine.findMany.mockResolvedValueOnce([]);
    prisma.task.findMany.mockResolvedValueOnce([]);
    prisma.task.count.mockResolvedValueOnce(0);

    const result = await service.getDashboardStats();

    expect(result.stats.overdue_contacts).toBe(100);
    expect(typeof result.stats.overdue_contacts).toBe('number');
  });

  it('overdue contacts 0건 → 직접 0 반환', async () => {
    prisma.executeWithRetry.mockImplementation((fn: () => Promise<unknown>) => fn());

    prisma.task.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    // Prisma count: 0건 직접 반환
    prisma.contact.count.mockResolvedValueOnce(0);
    prisma.machine.findMany.mockResolvedValueOnce([]);
    prisma.task.findMany.mockResolvedValueOnce([]);
    prisma.task.count.mockResolvedValueOnce(0);

    const result = await service.getDashboardStats();

    expect(result.stats.overdue_contacts).toBe(0);
  });

  it('assignedTo null인 worker 통계 → 필터링', async () => {
    prisma.executeWithRetry.mockImplementation((fn: () => Promise<unknown>) => fn());

    prisma.task.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { assignedTo: null, _count: 5 }, // null은 필터됨
        { assignedTo: '김작업자', _count: 3 },
      ])
      .mockResolvedValueOnce([]);

    prisma.contact.count.mockResolvedValueOnce(0);
    prisma.machine.findMany.mockResolvedValueOnce([]);
    prisma.task.findMany.mockResolvedValueOnce([]);
    prisma.task.count.mockResolvedValueOnce(0);

    const result = await service.getDashboardStats();

    // assignedTo null은 제외
    expect(result.workers).toHaveLength(1);
    expect(result.workers[0].name).toBe('김작업자');
  });
});
