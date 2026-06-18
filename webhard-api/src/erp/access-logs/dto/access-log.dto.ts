import { IsString, IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export enum AccessLogAction {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILED = 'login_failed',
  IP_BLOCKED = 'ip_blocked',
  LOGOUT = 'logout',
}

export class CreateAccessLogDto {
  @IsOptional()
  @IsString()
  workerId?: string;

  @IsString()
  ipAddress: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsEnum(AccessLogAction)
  action: AccessLogAction;

  success: boolean;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class AccessLogResponseDto {
  id: string;
  worker_id: string | null;
  worker_name: string | null;
  ip_address: string;
  user_agent: string | null;
  action: string;
  success: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export class AccessLogListResponseDto {
  logs: AccessLogResponseDto[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export class AccessLogQueryDto {
  @IsOptional()
  @IsString()
  workerId?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsEnum(AccessLogAction)
  action?: AccessLogAction;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value as string, 10))
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value as string, 10))
  limit?: number = 50;
}

export class AccessLogStatsDto {
  total_logins: number;
  successful_logins: number;
  failed_logins: number;
  blocked_attempts: number;
  unique_ips: number;
  recent_blocked_ips: string[];
}
