import { IsOptional, IsInt, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

// Request DTOs
export class GetBadgeCountsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  companyId?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeFolderCounts?: boolean = true;
}

// Response DTOs
export interface BadgeCountsResponseDto {
  totalCount: number;
  companyId?: number;
  folderCounts?: Record<string, number>;
}
