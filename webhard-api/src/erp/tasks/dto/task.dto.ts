import { IsString, IsOptional, IsEnum, IsInt, IsUUID, Min, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum TaskPriority {
  URGENT = 'urgent',
  NORMAL = 'normal',
  LOW = 'low',
}

export enum TaskType {
  DRAWING = 'drawing',
  SAMPLE = 'sample',
  LASER = 'laser',
  CUTTING = 'cutting',
  CREASING = 'creasing',
  DELIVERY = 'delivery',
}

// Response DTOs
export class TaskResponseDto {
  id: string;
  contact_id: number | null;
  title: string;
  description: string | null;
  task_type: string | null;
  status: string;
  priority: string;
  machine_id: string | null;
  machine_name: string | null;
  assigned_to: string | null;
  started_at: string | null;
  completed_at: string | null;
  estimated_duration: number | null;
  actual_duration: number | null;
  sort_order: number;
  order_id: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
  // Related contact info
  contact?: {
    product_name: string | null;
    company_name: string | null;
    due_date: string | null;
  } | null;
}

export class TaskListResponseDto {
  tasks: TaskResponseDto[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export class KanbanColumnDto {
  status: string;
  title: string;
  tasks: TaskResponseDto[];
  count: number;
}

export class KanbanResponseDto {
  columns: KanbanColumnDto[];
  stats: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    urgent: number;
  };
}

// Request DTOs
export class GetTasksQueryDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsEnum(TaskType)
  taskType?: TaskType;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  contactId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  sortBy?: string = 'created_at';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}

export class GetTodayTasksQueryDto {
  @IsOptional()
  @IsString()
  workerName?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}

export class CreateTaskDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  contactId?: number;

  @IsOptional()
  @IsEnum(TaskType)
  taskType?: TaskType;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority = TaskPriority.NORMAL;

  @IsOptional()
  @IsUUID()
  machineId?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedDuration?: number;

  @IsOptional()
  @IsString()
  memo?: string;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskType)
  taskType?: TaskType;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsUUID()
  machineId?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedDuration?: number;

  @IsOptional()
  @IsString()
  memo?: string;
}

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  status: TaskStatus;

  @IsOptional()
  @IsString()
  workerName?: string;
}

export class ReorderTaskDto {
  @IsUUID()
  id: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder: number;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}

export class ReorderTasksDto {
  @IsArray()
  @Type(() => ReorderTaskDto)
  tasks: ReorderTaskDto[];
}

export class BatchDeleteTasksDto {
  @IsArray()
  @IsUUID('4', { each: true })
  taskIds: string[];
}
