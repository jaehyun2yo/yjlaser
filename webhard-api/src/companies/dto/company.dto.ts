import { IsString, IsOptional, IsInt, IsBoolean, IsEnum, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CompanyQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isApproved?: boolean;
}

export class UpdateCompanyStatusDto {
  @IsEnum(['active', 'inactive', 'pending'])
  status: string;
}

export class UpdateWebhardAccessDto {
  @IsBoolean()
  allowed: boolean;
}

export class UpdateLaserOnlyDto {
  @IsBoolean()
  laserOnly: boolean;
}

export class ApproveCompanyDto {
  @IsOptional()
  @IsString()
  approvedBy?: string;
}

export class RejectCompanyDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateCompanyProfileDto {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  businessRegistrationNumber?: string;

  @IsOptional()
  @IsString()
  representativeName?: string;

  @IsOptional()
  @IsString()
  businessType?: string;

  @IsOptional()
  @IsString()
  businessCategory?: string;

  @IsOptional()
  @IsString()
  businessAddress?: string;

  @IsOptional()
  @IsString()
  businessRegistrationFileUrl?: string;

  @IsOptional()
  @IsString()
  businessRegistrationFileName?: string;

  @IsOptional()
  @IsString()
  managerName?: string;

  @IsOptional()
  @IsString()
  managerPosition?: string;

  @IsOptional()
  @IsString()
  managerPhone?: string;

  @IsOptional()
  @IsString()
  managerEmail?: string;

  @IsOptional()
  @IsString()
  accountantName?: string;

  @IsOptional()
  @IsString()
  accountantPhone?: string;

  @IsOptional()
  @IsString()
  accountantEmail?: string;

  @IsOptional()
  @IsString()
  accountantFax?: string;

  @IsOptional()
  @IsBoolean()
  quoteMethodEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  quoteMethodFax?: boolean;

  @IsOptional()
  @IsBoolean()
  quoteMethodSms?: boolean;

  @IsOptional()
  @IsString()
  passwordHash?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsBoolean()
  isApproved?: boolean;

  @IsOptional()
  @IsString()
  approvedAt?: string;

  @IsOptional()
  @IsString()
  approvedBy?: string;

  @IsOptional()
  @IsBoolean()
  webhardAccess?: boolean;

  @IsOptional()
  @IsBoolean()
  laserOnly?: boolean;
}

export class CheckDuplicateUsernameDto {
  @IsString()
  username: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  excludeId?: number;
}

export class CheckDuplicateBusinessNumberDto {
  @IsString()
  businessRegistrationNumber: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  excludeId?: number;
}

export class CreateCompanyDto {
  @IsString()
  companyName: string;

  @IsString()
  username: string;

  @IsString()
  passwordHash: string;

  @IsString()
  businessRegistrationNumber: string;

  @IsString()
  representativeName: string;

  @IsString()
  businessAddress: string;

  @IsString()
  managerName: string;

  @IsString()
  managerPosition: string;

  @IsString()
  managerPhone: string;

  @IsString()
  managerEmail: string;

  @IsOptional()
  @IsString()
  businessType?: string;

  @IsOptional()
  @IsString()
  businessCategory?: string;

  @IsOptional()
  @IsString()
  accountantName?: string;

  @IsOptional()
  @IsString()
  accountantPhone?: string;

  @IsOptional()
  @IsString()
  accountantEmail?: string;

  @IsOptional()
  @IsString()
  accountantFax?: string;

  @IsOptional()
  @IsBoolean()
  quoteMethodEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  quoteMethodFax?: boolean;

  @IsOptional()
  @IsBoolean()
  quoteMethodSms?: boolean;

  @IsOptional()
  @IsString()
  businessRegistrationFileUrl?: string;

  @IsOptional()
  @IsString()
  businessRegistrationFileName?: string;
}
