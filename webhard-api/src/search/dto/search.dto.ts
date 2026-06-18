import { IsString, IsOptional, IsInt, Min, MinLength, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { FileResponseDto } from '../../files/dto/file.dto';
import { FolderResponseDto } from '../../folders/dto/folder.dto';

// Search type enum
export type SearchType = 'all' | 'file' | 'folder';

// Request DTOs
export class SearchQueryDto {
  @IsString()
  @MinLength(1, { message: 'Search query cannot be empty' })
  q: string;

  @IsOptional()
  @IsString()
  @IsIn(['all', 'file', 'folder'], { message: 'type must be all, file, or folder' })
  type?: SearchType = 'all';

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

// Response DTOs
export interface SearchResponseDto {
  files: FileResponseDto[];
  folders: FolderResponseDto[];
  total: number;
}
