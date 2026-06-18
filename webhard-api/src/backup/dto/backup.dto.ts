import { IsBoolean, IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateBackupSettingsDto {
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  @Type(() => Number)
  retentionDays?: number;

  @IsOptional()
  @IsString()
  nasPath?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  deleteAfterBackup?: boolean;
}

export class BackupHistoryQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

export interface BackupSettingsResponse {
  enabled: boolean;
  retentionDays: number;
  nasPath: string;
  deleteAfterBackup: boolean;
}

export interface BackupEligibleSummary {
  fileCount: number;
  totalSize: number;
  retentionDays: number;
}

export interface BackupExecutionResult {
  total: number;
  success: number;
  failed: number;
  skipped: boolean;
  reason?: string;
}

export interface BackupHistoryItem {
  id: string;
  fileId: string;
  fileName: string;
  originalName: string;
  fileSize: string;
  r2Key: string;
  backupPath: string;
  companyId: number | null;
  status: string;
  error: string | null;
  createdAt: string;
}

export interface BackupHistoryResponse {
  items: BackupHistoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BackupStartResult {
  status: 'started' | 'skipped' | 'already_running';
  total?: number;
  reason?: string;
}

export interface BackupStatusResponse {
  isRunning: boolean;
  total: number;
  success: number;
  failed: number;
}

export class BrowseDirectoriesQueryDto {
  @IsOptional()
  @IsString()
  path?: string;
}

export interface BrowseDirectoriesResponse {
  path: string;
  parent: string | null;
  directories: string[];
  error?: string;
}
