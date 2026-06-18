import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateActivityLogDto {
  @IsString()
  actorType: string;

  @IsString()
  actorId: string;

  @IsOptional()
  @IsString()
  actorName?: string;

  @IsString()
  action: string;

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
