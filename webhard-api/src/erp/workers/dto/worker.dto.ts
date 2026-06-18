import { IsString, IsOptional, IsBoolean, IsArray, Length, Matches, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';

export enum WorkerRole {
  FIELD_WORKER = 'field_worker',
  OFFICE_WORKER = 'office_worker',
  SUPERVISOR = 'supervisor',
  MANAGER = 'manager',
}

// Response DTOs
export class WorkerResponseDto {
  id: string;
  name: string;
  role: string;
  worker_type: string | null;
  is_active: boolean;
  allowed_ips: string[];
  last_login_at: string | null;
  created_at: string;
}

export class WorkerListResponseDto {
  workers: WorkerResponseDto[];
  total: number;
}

export class PinLoginResponseDto {
  success: boolean;
  worker: {
    id: string;
    name: string;
    role: string;
    worker_type?: string | null;
  } | null;
  token?: string;
  message?: string;
  reason?: 'rate_limited' | 'invalid_credentials' | 'ip_blocked';
  retry_after_seconds?: number;
}

// Request DTOs
export class CreateWorkerDto {
  @IsString()
  @Length(2, 100)
  name: string;

  @IsString()
  @Length(4, 6)
  @Matches(/^\d{4,6}$/, { message: 'PIN must be 4-6 digits' })
  pin: string;

  @IsOptional()
  @IsEnum(WorkerRole)
  role?: WorkerRole = WorkerRole.FIELD_WORKER;

  @IsOptional()
  @IsString()
  workerType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedIps?: string[];
}

export class UpdateWorkerDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(4, 6)
  @Matches(/^\d{4,6}$/, { message: 'PIN must be 4-6 digits' })
  pin?: string;

  @IsOptional()
  @IsEnum(WorkerRole)
  role?: WorkerRole;

  @IsOptional()
  @IsString()
  workerType?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedIps?: string[];
}

export class PinLoginDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @Length(4, 6)
  @Matches(/^\d{4,6}$/, { message: 'PIN must be 4-6 digits' })
  pin: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
