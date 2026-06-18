import { IsString, IsOptional, IsBoolean, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

// Request DTOs
export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @IsIn(['small', 'medium', 'large'], { message: 'fontSize must be small, medium, or large' })
  fontSize?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  notificationsEnabled?: boolean;

  @IsOptional()
  @IsString()
  downloadFolderPath?: string;
}

// Response DTOs
export interface SettingsResponseDto {
  userId: string;
  fontSize: string;
  notificationsEnabled: boolean;
  downloadFolderPath: string | null;
  createdAt: string;
  updatedAt: string;
}
