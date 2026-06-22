import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const LOG_PROJECTS = [
  'company_site',
  'webhard_sync',
  'invoice_manager',
  'laser_nesting',
  'computeroff',
] as const;

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'critical'] as const;
export const LOG_STATUSES = [
  'start',
  'success',
  'failure',
  'skipped',
  'retry',
  'degraded',
] as const;
export const LOG_CHANNELS = ['debug', 'audit', 'security', 'perf', 'error', 'external'] as const;

export type LogProject = (typeof LOG_PROJECTS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogStatus = (typeof LOG_STATUSES)[number];
export type LogChannel = (typeof LOG_CHANNELS)[number];

export class LogEventDto {
  @IsIn([1])
  schema_version!: 1;

  @IsString()
  @MaxLength(100)
  event_id!: string;

  @IsString()
  @MaxLength(100)
  correlation_id!: string;

  @IsISO8601()
  timestamp!: string;

  @IsIn(LOG_LEVELS)
  level!: LogLevel;

  @IsIn(LOG_PROJECTS)
  project!: LogProject;

  @IsString()
  @MaxLength(80)
  component!: string;

  @IsString()
  @MaxLength(80)
  feature!: string;

  @IsString()
  @MaxLength(120)
  event!: string;

  @IsString()
  @MaxLength(80)
  action!: string;

  @IsIn(LOG_STATUSES)
  status!: LogStatus;

  @IsIn(LOG_CHANNELS)
  channel!: LogChannel;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(86_400_000)
  duration_ms?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  count?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  actor_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  actor_id_hash?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  target_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  target_id_hash?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  error_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  error_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  error_message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  hash_key_version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  span_id?: string;
}

export class LogEventBatchDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LogEventDto)
  events!: LogEventDto[];
}
