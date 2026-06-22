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
  'management_program',
  'external_webhard_sync',
  'laser_nesting',
  'computeroff',
] as const;

export const LOG_SEVERITIES = ['debug', 'info', 'warn', 'error'] as const;

export type LogProject = (typeof LOG_PROJECTS)[number];
export type LogSeverity = (typeof LOG_SEVERITIES)[number];

export class LogEventDto {
  @IsIn([1])
  schema_version!: 1;

  @IsString()
  @MaxLength(100)
  event_id!: string;

  @IsString()
  @MaxLength(100)
  trace_id!: string;

  @IsISO8601()
  occurred_at!: string;

  @IsIn(LOG_PROJECTS)
  project!: LogProject;

  @IsString()
  @MaxLength(80)
  subsystem!: string;

  @IsString()
  @MaxLength(120)
  event_type!: string;

  @IsIn(LOG_SEVERITIES)
  severity!: LogSeverity;

  @IsString()
  @MaxLength(240)
  message!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(86_400_000)
  elapsed_ms?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  processed_count?: number;

  @IsString()
  @MaxLength(128)
  payload_hash!: string;

  @IsString()
  @MaxLength(40)
  hash_key_version!: string;
}

export class LogEventBatchDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LogEventDto)
  events!: LogEventDto[];
}
