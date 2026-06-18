import { IsString, IsOptional, IsInt, IsBoolean, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetNotificationsDto {
  @IsString()
  userType: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  unreadOnly?: boolean;
}

export class MarkNotificationReadDto {
  @IsString()
  notificationId: string;
}

export class MarkAllReadDto {
  @IsString()
  userType: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;
}

export class GetUnreadCountDto {
  @IsString()
  userType: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;
}
