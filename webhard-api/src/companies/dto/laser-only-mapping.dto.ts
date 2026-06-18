import { IsString, IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLaserOnlyMappingDto {
  @IsString()
  folderName: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  companyId?: number;
}

export class LinkCompanyDto {
  @Type(() => Number)
  @IsInt()
  companyId: number;
}

export interface LaserOnlyMappingDto {
  id: number;
  folder_name: string;
  company_id: number | null;
  company_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_contact_count?: number;
}
