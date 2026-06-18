import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { NestingTaskStatus } from './dto/nesting-task.dto';
import { NestingTasksService } from './nesting-tasks.service';

interface MockPrisma {
  executeWithRetry: jest.Mock;
  nestingTask: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
}

function makePrisma(): MockPrisma {
  return {
    executeWithRetry: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
    nestingTask: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

function buildService() {
  const prisma = makePrisma();
  const service = new NestingTasksService(prisma as never);

  return { service, prisma };
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ntask_abc123',
    orderId: 'order_456',
    status: 'pending',
    priority: 1,
    dxfFileUrls: ['https://files.example/drawing-1.dxf'],
    sheetWidth: 1220,
    sheetHeight: 2440,
    options: {
      algorithm: 'auto',
      optimization_mode: 'balanced',
      gap: 3,
    },
    createdAt: new Date('2026-03-25T10:30:00.000Z'),
    ...overrides,
  };
}

describe('NestingTasksService.getPendingTasks', () => {
  it('pending 작업을 우선순위와 생성일 순서로 조회하고 클라이언트 계약 필드로 반환한다', async () => {
    const { service, prisma } = buildService();
    prisma.nestingTask.findMany.mockResolvedValue([makeTask()]);

    const result = await service.getPendingTasks({ limit: 10 });

    expect(prisma.nestingTask.findMany).toHaveBeenCalledWith({
      where: { status: 'pending' },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      take: 10,
    });
    expect(result).toEqual({
      tasks: [
        {
          task_id: 'ntask_abc123',
          order_id: 'order_456',
          created_at: '2026-03-25T10:30:00.000Z',
          priority: 1,
          dxf_file_urls: ['https://files.example/drawing-1.dxf'],
          sheet_width: 1220,
          sheet_height: 2440,
          options: {
            algorithm: 'auto',
            optimization_mode: 'balanced',
            gap: 3,
          },
        },
      ],
    });
  });

  it('limit이 비어 있거나 범위를 벗어나면 1~100 사이로 보정한다', async () => {
    const { service, prisma } = buildService();
    prisma.nestingTask.findMany.mockResolvedValue([]);

    await service.getPendingTasks({});
    await service.getPendingTasks({ limit: 0 });
    await service.getPendingTasks({ limit: 500 });

    expect(prisma.nestingTask.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ take: 10 })
    );
    expect(prisma.nestingTask.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ take: 1 })
    );
    expect(prisma.nestingTask.findMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ take: 100 })
    );
  });
});

describe('NestingTasksService.updateStatus', () => {
  it('pending 작업을 in_progress로 전환하고 응답 계약을 반환한다', async () => {
    const { service, prisma } = buildService();
    prisma.nestingTask.findUnique.mockResolvedValue(makeTask({ status: 'pending' }));
    prisma.nestingTask.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.updateStatus('ntask_abc123', {
      status: NestingTaskStatus.IN_PROGRESS,
      message: 'worker started',
    });

    expect(prisma.nestingTask.updateMany).toHaveBeenCalledWith({
      where: { id: 'ntask_abc123', status: 'pending' },
      data: {
        status: 'in_progress',
        message: 'worker started',
      },
    });
    expect(result).toEqual({
      success: true,
      task_id: 'ntask_abc123',
      status: NestingTaskStatus.IN_PROGRESS,
    });
  });

  it('다른 워커가 먼저 상태를 바꾸면 충돌로 반환한다', async () => {
    const { service, prisma } = buildService();
    prisma.nestingTask.findUnique.mockResolvedValue(makeTask({ status: 'pending' }));
    prisma.nestingTask.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateStatus('ntask_abc123', { status: NestingTaskStatus.IN_PROGRESS })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('없는 작업은 404 예외로 반환한다', async () => {
    const { service, prisma } = buildService();
    prisma.nestingTask.findUnique.mockResolvedValue(null);

    await expect(
      service.updateStatus('ntask_missing', { status: NestingTaskStatus.IN_PROGRESS })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('허용되지 않는 상태 전이는 400 예외로 막는다', async () => {
    const { service, prisma } = buildService();
    prisma.nestingTask.findUnique.mockResolvedValue(makeTask({ status: 'completed' }));

    await expect(
      service.updateStatus('ntask_abc123', { status: NestingTaskStatus.PENDING })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.nestingTask.updateMany).not.toHaveBeenCalled();
  });
});

describe('NestingTasksService.reportResult', () => {
  it('네스팅 결과 수치를 저장하고 성공 응답을 반환한다', async () => {
    const { service, prisma } = buildService();
    prisma.nestingTask.findUnique.mockResolvedValue(makeTask({ status: 'in_progress' }));
    prisma.nestingTask.update.mockResolvedValue(makeTask());

    const result = await service.reportResult('ntask_abc123', {
      total_sheets: 2,
      total_usage_rate: 82.7,
      unplaced_count: 0,
    });

    expect(prisma.nestingTask.update).toHaveBeenCalledWith({
      where: { id: 'ntask_abc123' },
      data: {
        totalSheets: 2,
        totalUsageRate: 82.7,
        unplacedCount: 0,
        resultReportedAt: expect.any(Date),
      },
    });
    expect(result).toEqual({
      success: true,
      task_id: 'ntask_abc123',
    });
  });
});
