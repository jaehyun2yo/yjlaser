import { IsString, IsOptional } from 'class-validator';

export class UpdateFeedbackDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  adminNotes?: string;
}
