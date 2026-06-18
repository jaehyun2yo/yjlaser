import { IsOptional, IsArray, IsUUID, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

// Request DTOs
export class MarkDownloadedDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  fileIds?: string[];

  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  markAll?: boolean;
}

// Response DTOs
export interface MarkDownloadedResponseDto {
  success: boolean;
  updatedCount: number;
}
