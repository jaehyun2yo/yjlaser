import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateShareLinkDto {
  @IsString()
  token: string;

  @IsString()
  filePath: string;

  @IsString()
  fileName: string;

  @IsOptional()
  @IsString()
  webhardFileId?: string;

  @IsOptional()
  @IsNumber()
  companyId?: number;

  @IsNumber()
  createdBy: number;

  @IsString()
  expiresAt: string;

  @IsOptional()
  @IsNumber()
  maxDownloads?: number;
}
