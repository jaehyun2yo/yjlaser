import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NestingTaskStatus,
  PendingNestingTasksQueryDto,
  ReportNestingTaskResultDto,
  UpdateNestingTaskStatusDto,
} from './dto/nesting-task.dto';

const DEFAULT_PENDING_LIMIT = 10;
const MAX_PENDING_LIMIT = 100;

type NestingTaskRecord = {
  id: string;
  orderId: string;
  status: string;
  priority: number;
  dxfFileUrls: Prisma.JsonValue;
  sheetWidth: number;
  sheetHeight: number;
  options: Prisma.JsonValue;
  createdAt: Date;
};

export interface PendingNestingTaskResponseItem {
  task_id: string;
  order_id: string;
  created_at: string;
  priority: number;
  dxf_file_urls: string[];
  sheet_width: number;
  sheet_height: number;
  options: Prisma.JsonObject;
}

export interface PendingNestingTasksResponse {
  tasks: PendingNestingTaskResponseItem[];
}

export interface UpdateNestingTaskStatusResponse {
  success: true;
  task_id: string;
  status: string;
}

export interface ReportNestingTaskResultResponse {
  success: true;
  task_id: string;
}

@Injectable()
export class NestingTasksService {
  constructor(private prisma: PrismaService) {}

  async getPendingTasks(query: PendingNestingTasksQueryDto): Promise<PendingNestingTasksResponse> {
    const limit = this.normalizeLimit(query.limit);
    const tasks = await this.prisma.executeWithRetry(
      () =>
        this.prisma.nestingTask.findMany({
          where: { status: NestingTaskStatus.PENDING },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
          take: limit,
        }),
      { operationName: 'integration.nestingTasks.getPendingTasks' }
    );

    return {
      tasks: tasks.map((task) => this.toPendingResponseItem(task)),
    };
  }

  async updateStatus(
    taskId: string,
    dto: UpdateNestingTaskStatusDto
  ): Promise<UpdateNestingTaskStatusResponse> {
    const task = await this.findTaskOrThrow(taskId);
    this.assertValidTransition(task.status, dto.status);

    const updateResult = await this.prisma.executeWithRetry(
      () =>
        this.prisma.nestingTask.updateMany({
          where: {
            id: taskId,
            status: task.status,
          },
          data: {
            status: dto.status,
            message: this.normalizeMessage(dto.message),
          },
        }),
      { operationName: 'integration.nestingTasks.updateStatus' }
    );

    if (updateResult.count === 0) {
      throw new ConflictException(`Nesting task status changed before update: ${taskId}`);
    }

    return {
      success: true,
      task_id: taskId,
      status: dto.status,
    };
  }

  async reportResult(
    taskId: string,
    dto: ReportNestingTaskResultDto
  ): Promise<ReportNestingTaskResultResponse> {
    await this.findTaskOrThrow(taskId);

    await this.prisma.executeWithRetry(
      () =>
        this.prisma.nestingTask.update({
          where: { id: taskId },
          data: {
            totalSheets: dto.total_sheets,
            totalUsageRate: dto.total_usage_rate,
            unplacedCount: dto.unplaced_count,
            resultReportedAt: new Date(),
          },
        }),
      { operationName: 'integration.nestingTasks.reportResult' }
    );

    return {
      success: true,
      task_id: taskId,
    };
  }

  private async findTaskOrThrow(taskId: string): Promise<NestingTaskRecord> {
    const task = await this.prisma.executeWithRetry(
      () =>
        this.prisma.nestingTask.findUnique({
          where: { id: taskId },
        }),
      { operationName: 'integration.nestingTasks.findTask' }
    );

    if (!task) {
      throw new NotFoundException(`Nesting task not found: ${taskId}`);
    }

    return task;
  }

  private normalizeLimit(limit: number | undefined): number {
    if (limit === undefined || Number.isNaN(limit)) {
      return DEFAULT_PENDING_LIMIT;
    }

    return Math.min(MAX_PENDING_LIMIT, Math.max(1, Math.trunc(limit)));
  }

  private toPendingResponseItem(task: NestingTaskRecord): PendingNestingTaskResponseItem {
    return {
      task_id: task.id,
      order_id: task.orderId,
      created_at: task.createdAt.toISOString(),
      priority: task.priority,
      dxf_file_urls: this.toStringArray(task.dxfFileUrls),
      sheet_width: task.sheetWidth,
      sheet_height: task.sheetHeight,
      options: this.toJsonObject(task.options),
    };
  }

  private toStringArray(value: Prisma.JsonValue): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  private toJsonObject(value: Prisma.JsonValue): Prisma.JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value;
  }

  private normalizeMessage(message: string | undefined): string | null {
    const normalized = message?.trim();
    return normalized ? normalized : null;
  }

  private assertValidTransition(currentStatus: string, nextStatus: NestingTaskStatus): void {
    if (currentStatus === nextStatus) {
      return;
    }

    const allowedNextStatuses = this.allowedNextStatuses(currentStatus);
    if (!allowedNextStatuses.includes(nextStatus)) {
      throw new BadRequestException(
        `Invalid nesting task status transition: ${currentStatus} -> ${nextStatus}`
      );
    }
  }

  private allowedNextStatuses(currentStatus: string): NestingTaskStatus[] {
    if (currentStatus === NestingTaskStatus.PENDING) {
      return [NestingTaskStatus.IN_PROGRESS];
    }

    if (currentStatus === NestingTaskStatus.IN_PROGRESS) {
      return [NestingTaskStatus.COMPLETED, NestingTaskStatus.FAILED];
    }

    return [];
  }
}
