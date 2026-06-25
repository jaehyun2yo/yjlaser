import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const EVENT_ENVELOPE_RESULTS = ['success', 'failed', 'partial'] as const;
export type EventEnvelopeResult = (typeof EVENT_ENVELOPE_RESULTS)[number];

export class EventEnvelopeErrorDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @IsOptional()
  @IsBoolean()
  retryable?: boolean;
}

export class EventEnvelopeDto {
  @IsString()
  @MaxLength(255)
  idempotency_key: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  attempt_no?: number;

  @IsString()
  @MaxLength(100)
  event_type: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  event_version: number;

  @IsString()
  @MaxLength(50)
  source_worker: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source_version?: string;

  @IsDateString()
  occurred_at: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  order_id?: string;

  @IsOptional()
  @IsUUID()
  @MaxLength(100)
  contact_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  inquiry_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  work_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  file_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  drawing_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  job_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  integration_run_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  worker_local_id?: string;

  @IsIn(EVENT_ENVELOPE_RESULTS)
  result: EventEnvelopeResult;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  duration_ms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  processed_count?: number;

  @IsObject()
  payload: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ValidateIf((dto: EventEnvelopeDto) => dto.error !== undefined && dto.error !== null)
  @ValidateNested()
  @Type(() => EventEnvelopeErrorDto)
  error?: EventEnvelopeErrorDto | null;
}
