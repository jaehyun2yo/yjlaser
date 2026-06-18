import {
  IsString,
  IsOptional,
  IsInt,
  IsUUID,
  ValidateIf,
  IsArray,
  ArrayMinSize,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

// Response DTOs
export interface FolderResponseDto {
  id: string;
  name: string;
  parent_id: string | null;
  company_id: number | null;
  path: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  companies?: {
    company_name: string;
  } | null;
  file_count?: number;
  undownloaded_count?: number;
  latest_file_created_at?: string | null;
  latest_file_uploader_display_name?: string | null;
}

export interface FolderListResponseDto {
  folders: FolderResponseDto[];
  total: number;
}

export interface FolderTreeNodeDto {
  id: string;
  name: string;
  parent_id: string | null;
  children: FolderTreeNodeDto[];
  file_count?: number;
  undownloaded_count?: number;
}

export interface FolderDetailResponseDto extends FolderResponseDto {
  subfolders: FolderResponseDto[];
  files: {
    id: string;
    name: string;
    original_name: string;
    size: number;
    mime_type: string | null;
    is_downloaded: boolean;
    created_at: string;
  }[];
}

// Request DTOs
export class GetFoldersQueryDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @ValidateIf((o) => o.companyId !== null)
  @Type(() => Number)
  @IsInt()
  companyId?: number | null;

  @IsOptional()
  @Type(() => Boolean)
  includeFileCounts?: boolean = false;

  @IsOptional()
  @Type(() => Boolean)
  includeAll?: boolean = false;
}

export class CreateFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @ValidateIf((o) => o.companyId !== null)
  @Type(() => Number)
  @IsInt()
  companyId?: number | null;
}

export class RenameFolderDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  newName?: string;
}

export class MoveFolderDto {
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

export class InitializeCompanyFoldersDto {
  @Type(() => Number)
  @IsInt()
  companyId: number;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  companyName: string;
}

// Folder template types
export interface FolderTemplateNode {
  name: string;
  children?: FolderTemplateNode[];
}

export class UpdateFolderTemplateDto {
  @IsArray()
  template: FolderTemplateNode[];
}

export class BatchDeleteFoldersDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  folderIds: string[];
}

export interface BatchDeleteStatsResponseDto {
  folderCount: number;
  fileCount: number;
}

export interface BatchDeleteResultResponseDto {
  foldersDeleted: number;
  filesDeleted: number;
  durationMs: number;
}
