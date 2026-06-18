import { IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

// Request DTOs
export class GetStorageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  companyId?: number;
}

// Response DTOs
export interface StorageUsageResponseDto {
  active: number;
  trash: number;
  current: number;
  max: number;
  companyId?: number;
  percentage?: number;
  activePercentage?: number;
  trashPercentage?: number;
}

export interface StorageBreakdownByCompanyDto {
  companyId: number;
  companyName: string;
  used: number;
  fileCount: number;
}

export interface StorageBreakdownByFolderDto {
  folderId: string;
  folderName: string;
  used: number;
  fileCount: number;
}

export interface StorageBreakdownResponseDto {
  total: number;
  byCompany?: StorageBreakdownByCompanyDto[];
  byFolder?: StorageBreakdownByFolderDto[];
}

// 저장공간 한도 설정 (기본값: 10GB)
export const DEFAULT_STORAGE_LIMIT = 10 * 1024 * 1024 * 1024; // 10GB in bytes
export const ADMIN_STORAGE_LIMIT = 100 * 1024 * 1024 * 1024; // 100GB in bytes
