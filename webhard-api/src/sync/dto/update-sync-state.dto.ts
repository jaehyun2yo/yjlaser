import { IsNumber, IsString, IsOptional } from 'class-validator';

export class UpdateSyncStateDto {
  @IsNumber()
  companyId: number;

  @IsOptional()
  @IsString()
  lastSyncAt?: string;

  @IsOptional()
  @IsString()
  lastSyncHash?: string;

  @IsOptional()
  @IsNumber()
  filesSynced?: number;

  @IsOptional()
  @IsNumber()
  foldersSynced?: number;

  @IsOptional()
  @IsString()
  syncType?: string;

  @IsOptional()
  @IsString()
  syncStatus?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}
