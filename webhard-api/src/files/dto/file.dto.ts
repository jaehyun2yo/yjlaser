import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsUUID,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  Min,
  ValidateNested,
  IsIn,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

// Response DTOs
export interface FileResponseDto {
  id: string;
  name: string;
  original_name: string;
  size: number;
  mime_type: string;
  path: string;
  folder_id: string | null;
  company_id: number | null;
  uploaded_by: string;
  inquiry_number: string | null;
  is_downloaded: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: number | null;
  storage_provider?: 'r2' | 'google_drive';
  companies?: {
    company_name: string;
    manager_name?: string | null;
  } | null;
}

export interface FileListResponseDto {
  files: FileResponseDto[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Request DTOs
export class GetFilesQueryDto {
  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  companyId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @IsIn(['created_at', 'date', 'name', 'size', 'updated_at'])
  sortBy?: string = 'created_at';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeDeleted?: boolean = false;
}

export class SearchFilesQueryDto {
  @IsString()
  query: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  companyId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;
}

export class CreatePresignedUrlDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  filename: string;

  @IsString()
  @MaxLength(200)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*$/, {
    message: 'Invalid MIME type format',
  })
  contentType: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  size?: number;

  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  companyId?: number;
}

export class ConfirmUploadDto {
  @IsString()
  @MaxLength(1000)
  key: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  name: string;

  @IsString()
  @MaxLength(500)
  originalName: string;

  @IsInt()
  @Type(() => Number)
  size: number;

  @IsString()
  @MaxLength(200)
  mimeType: string;

  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  companyId?: number;

  @IsOptional()
  @IsString()
  inquiryNumber?: string;

  @IsOptional()
  @IsString()
  driveFileId?: string;

  @IsOptional()
  @IsString()
  driveUploadProof?: string;

  @IsOptional()
  @IsIn(['google_drive', 'r2'])
  storageProvider?: 'google_drive' | 'r2';
}

export class BatchUploadDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  files: CreatePresignedUrlDto[];
}

export class BatchConfirmUploadDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ConfirmUploadDto)
  files: ConfirmUploadDto[];
}

export class RenameFileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  name: string;
}

export class MoveFileDto {
  @IsOptional()
  @IsUUID()
  folderId?: string | null;
}

export class BatchMoveFilesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  fileIds: string[];

  @IsOptional()
  @IsUUID()
  targetFolderId?: string | null;
}

export class BatchDeleteFilesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  fileIds: string[];
}

export interface PresignedUrlResponseDto {
  url: string;
  key: string;
  expiresAt: string;
  fileName?: string;
  /**
   * task 26: 서버 측 routing 결과 — 외부웹하드 경로 + 가입 업체 매칭 시 업체 폴더 id 로 교체.
   * routing 미발동 또는 root 업로드 (folderId 미지정) 시 요청값 echo 또는 null.
   * 구버전 client 호환을 위해 옵셔널.
   */
  folderId?: string | null;
  /**
   * task 26: routing 발동 여부. true 면 응답의 `folderId` / `key` 가 업체 폴더 기준으로 교체된 것.
   */
  redirected?: boolean;
  provider?: 'google_drive' | 'r2';
  uploadUrl?: string;
  uploadHeaders?: Record<string, string>;
  driveFileId?: string;
  driveFileIdRequired?: boolean;
}

export interface BatchPresignedUrlResponseDto {
  urls: PresignedUrlResponseDto[];
}

export class InitiateMultipartDto {
  @IsString()
  @MaxLength(1000)
  @Matches(/^(?!.*\.\.)(?!.*\/\/)(?!.*\\)[^\x00-\x1f\\]+$/, {
    message: 'Key must not contain path traversal sequences or control characters',
  })
  key: string;

  @IsString()
  @MaxLength(200)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*$/, {
    message: 'Invalid MIME type format',
  })
  contentType: string;
}

export class MultipartPresignDto {
  @IsString()
  @MaxLength(1000)
  key: string;

  @IsString()
  @MaxLength(1000)
  uploadId: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  partNumber: number;
}

export class DownloadZipDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  fileIds: string[];
}
