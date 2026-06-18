import { IsOptional, IsInt, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { FileResponseDto } from './file.dto';

// Request DTOs
export class GetNewFilesQueryDto {
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
  @IsIn(['created_at', 'date', 'name', 'size', 'updated_at', 'uploaded_by'])
  sortBy?: string = 'created_at';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

// Response DTOs
export interface NewFileResponseDto extends FileResponseDto {
  folder_path: string | null;
  uploader_display_name: string;
}

export interface NewFilesListResponseDto {
  files: NewFileResponseDto[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
