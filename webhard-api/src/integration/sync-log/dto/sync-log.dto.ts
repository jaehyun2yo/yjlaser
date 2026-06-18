import { IsString, IsOptional, IsInt, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum SyncLogStatus {
  SYNCED = 'synced',
  COMPANY_NOT_FOUND = 'company_not_found',
  API_ERROR = 'api_error',
  DUPLICATE = 'duplicate',
  SKIPPED = 'skipped',
}

export class CreateSyncLogDto {
  @IsString()
  filename: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsEnum(SyncLogStatus)
  status: SyncLogStatus;

  @IsOptional()
  @IsInt()
  contactId?: number;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsString()
  md5Hash?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class SyncLogQueryDto {
  @IsOptional()
  @IsEnum(SyncLogStatus)
  status?: SyncLogStatus;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number = 50;
}
