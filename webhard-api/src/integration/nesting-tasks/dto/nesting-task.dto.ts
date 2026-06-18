import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum NestingTaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export class PendingNestingTasksQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
}

export class UpdateNestingTaskStatusDto {
  @IsEnum(NestingTaskStatus)
  status!: NestingTaskStatus;

  @IsOptional()
  @IsString()
  message?: string;
}

export class ReportNestingTaskResultDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  total_sheets!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total_usage_rate!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  unplaced_count!: number;
}
