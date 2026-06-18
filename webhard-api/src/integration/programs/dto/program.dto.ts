import { IsString, IsOptional, IsObject } from 'class-validator';

export class HeartbeatDto {
  @IsString()
  programType: string;

  @IsString()
  instanceName: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  hostname?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
