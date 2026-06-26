import { Equals, IsBoolean, IsOptional, IsInt, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const PERMANENT_DELETE_CONFIRMATION = 'PERMANENT_DELETE';

export interface TrashFileDto {
  id: string;
  name: string;
  original_name: string;
  size: number;
  mime_type: string;
  path: string;
  folder_id: string | null;
  company_id: number | null;
  uploaded_by: string;
  is_downloaded: boolean;
  created_at: string;
  deleted_at: string;
  deleted_by: number | null;
  days_until_delete: number;
  folder_path?: string;
  companies?: {
    company_name: string;
  } | null;
}

export interface TrashListResponseDto {
  files: TrashFileDto[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export class GetTrashQueryDto {
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
}

export class PermanentDeleteApprovalDto {
  @IsBoolean()
  @Equals(true)
  confirmPermanentDelete!: boolean;

  @IsString()
  @Equals(PERMANENT_DELETE_CONFIRMATION)
  confirmationText!: typeof PERMANENT_DELETE_CONFIRMATION;
}
