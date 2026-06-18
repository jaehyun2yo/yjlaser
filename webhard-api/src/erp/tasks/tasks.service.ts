import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TaskResponseDto,
  TaskListResponseDto,
  KanbanResponseDto,
  KanbanColumnDto,
  GetTasksQueryDto,
  GetTodayTasksQueryDto,
  CreateTaskDto,
  UpdateTaskDto,
  UpdateTaskStatusDto,
  ReorderTasksDto,
  TaskStatus,
} from './dto/task.dto';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get tasks list with pagination and filters
   */
  async getTasks(query: GetTasksQueryDto): Promise<TaskListResponseDto> {
    const {
      status,
      priority,
      taskType,
      assignedTo,
      contactId,
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'desc',
      dateFrom,
      dateTo,
    } = query;

    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (taskType) where.taskType = taskType;
    if (assignedTo) where.assignedTo = assignedTo;
    if (contactId) where.contactId = BigInt(contactId);

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo);
    }

    const [total, tasks] = await this.prisma.executeWithRetry(
      () =>
        Promise.all([
          this.prisma.task.count({ where }),
          this.prisma.task.findMany({
            where,
            include: {
              machine: {
                select: { name: true },
              },
            },
            orderBy: this.buildOrderBy(sortBy, sortOrder),
            skip: (page - 1) * limit,
            take: limit,
          }),
        ]),
      { operationName: 'getTasks' }
    );

    return {
      tasks: tasks.map(this.mapToDto),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  /**
   * Get today's tasks for mobile workers
   */
  async getTodayTasks(query: GetTodayTasksQueryDto): Promise<TaskResponseDto[]> {
    const { workerName, status } = query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where: Record<string, unknown> = {
      status: { not: TaskStatus.CANCELLED },
    };

    if (workerName) where.assignedTo = workerName;
    if (status) where.status = status;

    // Get tasks that are: created today, in progress, or have due date today
    const tasks = await this.prisma.executeWithRetry(
      () =>
        this.prisma.task.findMany({
          where: {
            ...where,
            OR: [{ createdAt: { gte: today } }, { status: TaskStatus.IN_PROGRESS }],
          },
          include: {
            machine: {
              select: { name: true },
            },
          },
          orderBy: [{ priority: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
        }),
      { operationName: 'getTodayTasks' }
    );

    return tasks.map(this.mapToDto);
  }

  /**
   * Get kanban board data
   */
  async getKanbanData(query: GetTasksQueryDto): Promise<KanbanResponseDto> {
    const { priority, taskType, assignedTo, dateFrom, dateTo } = query;

    const where: Record<string, unknown> = {
      status: { not: TaskStatus.CANCELLED },
    };

    if (priority) where.priority = priority;
    if (taskType) where.taskType = taskType;
    if (assignedTo) where.assignedTo = assignedTo;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo);
    }

    const tasks = await this.prisma.executeWithRetry(
      () =>
        this.prisma.task.findMany({
          where,
          include: {
            machine: {
              select: { name: true },
            },
          },
          orderBy: [{ priority: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
        }),
      { operationName: 'getKanbanData' }
    );

    const taskDtos = tasks.map(this.mapToDto);

    // Group by status
    const columns: KanbanColumnDto[] = [
      {
        status: 'pending',
        title: '대기',
        tasks: taskDtos.filter((t) => t.status === 'pending'),
        count: taskDtos.filter((t) => t.status === 'pending').length,
      },
      {
        status: 'in_progress',
        title: '진행중',
        tasks: taskDtos.filter((t) => t.status === 'in_progress'),
        count: taskDtos.filter((t) => t.status === 'in_progress').length,
      },
      {
        status: 'completed',
        title: '완료',
        tasks: taskDtos.filter((t) => t.status === 'completed'),
        count: taskDtos.filter((t) => t.status === 'completed').length,
      },
    ];

    return {
      columns,
      stats: {
        total: taskDtos.length,
        pending: columns[0].count,
        in_progress: columns[1].count,
        completed: columns[2].count,
        urgent: taskDtos.filter((t) => t.priority === 'urgent' && t.status !== 'completed').length,
      },
    };
  }

  /**
   * Get single task by ID
   */
  async getTask(id: string): Promise<TaskResponseDto> {
    const task = await this.prisma.executeWithRetry(
      () =>
        this.prisma.task.findUnique({
          where: { id },
          include: {
            machine: {
              select: { name: true },
            },
          },
        }),
      { operationName: 'getTask' }
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return this.mapToDto(task);
  }

  /**
   * Create a new task
   */
  async createTask(dto: CreateTaskDto): Promise<TaskResponseDto> {
    // Get max sort order for new task
    const maxSortOrder = await this.prisma.executeWithRetry(
      () =>
        this.prisma.task.aggregate({
          _max: { sortOrder: true },
          where: { status: 'pending' },
        }),
      { operationName: 'createTask.maxSortOrder' }
    );

    const task = await this.prisma.executeWithRetry(
      () =>
        this.prisma.task.create({
          data: {
            title: dto.title,
            description: dto.description,
            contactId: dto.contactId ? BigInt(dto.contactId) : null,
            taskType: dto.taskType,
            priority: dto.priority || 'normal',
            machineId: dto.machineId,
            assignedTo: dto.assignedTo,
            estimatedDuration: dto.estimatedDuration,
            memo: dto.memo,
            sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
          },
          include: {
            machine: {
              select: { name: true },
            },
          },
        }),
      { operationName: 'createTask' }
    );

    return this.mapToDto(task);
  }

  /**
   * Update task details
   */
  async updateTask(id: string, dto: UpdateTaskDto): Promise<TaskResponseDto> {
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const task = await this.prisma.executeWithRetry(
      () =>
        this.prisma.task.update({
          where: { id },
          data: {
            title: dto.title,
            description: dto.description,
            taskType: dto.taskType,
            priority: dto.priority,
            machineId: dto.machineId,
            assignedTo: dto.assignedTo,
            estimatedDuration: dto.estimatedDuration,
            memo: dto.memo,
          },
          include: {
            machine: {
              select: { name: true },
            },
          },
        }),
      { operationName: 'updateTask' }
    );

    return this.mapToDto(task);
  }

  /**
   * Update task status with time tracking
   */
  async updateTaskStatus(id: string, dto: UpdateTaskStatusDto): Promise<TaskResponseDto> {
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const updateData: Record<string, unknown> = {
      status: dto.status,
    };

    // Start work: record started_at
    if (dto.status === TaskStatus.IN_PROGRESS && existing.status === 'pending') {
      updateData.startedAt = new Date();
      if (dto.workerName) {
        updateData.assignedTo = dto.workerName;
      }
    }

    // Complete work: record completed_at and calculate duration
    if (dto.status === TaskStatus.COMPLETED && existing.status === 'in_progress') {
      const now = new Date();
      updateData.completedAt = now;
      if (existing.startedAt) {
        updateData.actualDuration = Math.floor(
          (now.getTime() - existing.startedAt.getTime()) / 60000
        );
      }
    }

    const task = await this.prisma.executeWithRetry(
      () =>
        this.prisma.task.update({
          where: { id },
          data: updateData,
          include: {
            machine: {
              select: { name: true },
            },
          },
        }),
      { operationName: 'updateTaskStatus' }
    );

    // Task에 연결된 Order가 있으면 이벤트 기록
    if (existing.orderId) {
      try {
        await this.prisma.orderEvent.create({
          data: {
            orderId: existing.orderId,
            eventType: 'task_status_changed',
            fromStatus: existing.status,
            toStatus: dto.status,
            source: 'erp_task',
            actorName: dto.workerName ?? null,
            data: {
              taskId: id,
              taskTitle: existing.title,
              taskType: existing.taskType,
            },
            message: `작업 '${existing.title}' 상태 변경: ${existing.status} → ${dto.status}`,
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to create order event for task ${id}: ${err}`);
      }
    }

    return this.mapToDto(task);
  }

  /**
   * Reorder tasks (drag and drop)
   */
  async reorderTasks(dto: ReorderTasksDto): Promise<{ success: boolean }> {
    if (dto.tasks.length === 0) {
      throw new BadRequestException('No tasks to reorder');
    }

    await this.prisma.executeWithRetry(
      () =>
        this.prisma.$transaction(
          dto.tasks.map((task) =>
            this.prisma.task.update({
              where: { id: task.id },
              data: {
                sortOrder: task.sortOrder,
                status: task.status,
              },
            })
          )
        ),
      { operationName: 'reorderTasks' }
    );

    return { success: true };
  }

  /**
   * Delete a task
   */
  async deleteTask(id: string): Promise<void> {
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    await this.prisma.executeWithRetry(() => this.prisma.task.delete({ where: { id } }), {
      operationName: 'deleteTask',
    });
  }

  /**
   * Batch delete tasks
   */
  async batchDeleteTasks(taskIds: string[]): Promise<{ deleted: number }> {
    const result = await this.prisma.executeWithRetry(
      () =>
        this.prisma.task.deleteMany({
          where: { id: { in: taskIds } },
        }),
      { operationName: 'batchDeleteTasks' }
    );

    return { deleted: result.count };
  }

  /**
   * Build order by clause
   */
  private buildOrderBy(
    sortBy: string,
    sortOrder: 'asc' | 'desc'
  ): Record<string, 'asc' | 'desc'>[] {
    const fieldMap: Record<string, string> = {
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      title: 'title',
      priority: 'priority',
      status: 'status',
      sort_order: 'sortOrder',
    };

    const field = fieldMap[sortBy] || 'createdAt';
    return [{ [field]: sortOrder }];
  }

  /**
   * Map database model to DTO
   */
  private mapToDto = (task: {
    id: string;
    contactId: bigint | null;
    title: string;
    description: string | null;
    taskType: string | null;
    status: string;
    priority: string;
    machineId: string | null;
    assignedTo: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    estimatedDuration: number | null;
    actualDuration: number | null;
    sortOrder: number;
    orderId: string | null;
    memo: string | null;
    createdAt: Date;
    updatedAt: Date;
    machine?: { name: string } | null;
  }): TaskResponseDto => ({
    id: task.id,
    contact_id: task.contactId ? Number(task.contactId) : null,
    title: task.title,
    description: task.description,
    task_type: task.taskType,
    status: task.status,
    priority: task.priority,
    machine_id: task.machineId,
    machine_name: task.machine?.name ?? null,
    assigned_to: task.assignedTo,
    started_at: task.startedAt?.toISOString() ?? null,
    completed_at: task.completedAt?.toISOString() ?? null,
    estimated_duration: task.estimatedDuration,
    actual_duration: task.actualDuration,
    sort_order: task.sortOrder,
    order_id: task.orderId,
    memo: task.memo,
    created_at: task.createdAt.toISOString(),
    updated_at: task.updatedAt.toISOString(),
  });
}
