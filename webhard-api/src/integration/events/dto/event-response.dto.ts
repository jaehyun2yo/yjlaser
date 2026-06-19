import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const EVENT_STATE_APPLY_STATUSES = ['failed'] as const;
export type EventStateApplyStatus = (typeof EVENT_STATE_APPLY_STATUSES)[number];

export class EventAppliedStateChangeDto {
  @IsString()
  @MaxLength(50)
  target: string;

  @IsString()
  @MaxLength(255)
  id: string;

  @IsString()
  @MaxLength(100)
  field: string;

  @IsDefined()
  value: unknown;
}

export class EventResponseErrorDto {
  @IsString()
  @MaxLength(100)
  code: string;

  @IsString()
  @MaxLength(1000)
  message: string;

  @IsOptional()
  @IsBoolean()
  retryable?: boolean;
}

export class EventAcceptedResponseDto {
  @IsString()
  @MaxLength(255)
  event_id: string;

  @Equals(false)
  duplicate: false;

  @Equals(true)
  accepted: true;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventAppliedStateChangeDto)
  applied_state_changes: EventAppliedStateChangeDto[];
}

export class EventDuplicateResponseDto {
  @IsString()
  @MaxLength(255)
  event_id: string;

  @Equals(true)
  duplicate: true;

  @Equals(true)
  accepted: true;

  @IsArray()
  @ArrayMaxSize(0)
  applied_state_changes: [];
}

export class EventFailureResponseDto {
  @IsString()
  @MaxLength(255)
  event_id: string;

  @Equals(false)
  duplicate: false;

  @Equals(false)
  accepted: false;

  @Equals('failed')
  state_apply_status: EventStateApplyStatus;

  @IsString()
  @MaxLength(255)
  failure_id: string;

  @IsArray()
  @ArrayMaxSize(0)
  applied_state_changes: [];

  @IsDefined()
  @ValidateNested()
  @Type(() => EventResponseErrorDto)
  error: EventResponseErrorDto;
}

export class EventDuplicateFailureResponseDto {
  @IsString()
  @MaxLength(255)
  event_id: string;

  @Equals(true)
  duplicate: true;

  @Equals(false)
  accepted: false;

  @Equals('failed')
  state_apply_status: EventStateApplyStatus;

  @IsString()
  @MaxLength(255)
  failure_id: string;

  @IsArray()
  @ArrayMaxSize(0)
  applied_state_changes: [];

  @IsDefined()
  @ValidateNested()
  @Type(() => EventResponseErrorDto)
  error: EventResponseErrorDto;
}

export type EventResponseDto =
  | EventAcceptedResponseDto
  | EventDuplicateResponseDto
  | EventFailureResponseDto
  | EventDuplicateFailureResponseDto;
