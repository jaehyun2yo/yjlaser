import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CollectBankNotificationDto {
  @IsString()
  @MaxLength(120)
  event_id!: string;

  @IsString()
  @MaxLength(120)
  device_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source_app?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  source_package?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  notification_key?: string;

  @IsISO8601()
  posted_at!: string;

  @IsString()
  @MaxLength(500)
  raw_title!: string;

  @IsString()
  @MaxLength(4000)
  raw_text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  raw_big_text?: string | null;

  @IsOptional()
  @IsObject()
  raw_payload?: Record<string, unknown>;
}

export class ListBankNotificationsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @IsOptional()
  @IsISO8601()
  posted_from?: string;

  @IsOptional()
  @IsISO8601()
  posted_to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  offset?: number;
}

export class MarkProcessedDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  event_ids!: string[];
}

export class CreateBackupBatchDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(3000)
  year!: number;

  @IsString()
  @MaxLength(180)
  file_name!: string;

  @IsString()
  @MaxLength(64)
  sha256!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  event_count!: number;

  @IsISO8601()
  posted_from!: string;

  @IsISO8601()
  posted_to!: string;

  @IsArray()
  @ArrayMaxSize(10000)
  @IsString({ each: true })
  event_ids!: string[];
}

export class DeleteRetentionDto {
  @IsString()
  @MaxLength(64)
  backup_batch_id!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(365)
  @Max(3650)
  older_than_days?: number;
}
