import { IsNumber, IsString, IsOptional } from 'class-validator';

export class CreateFeedbackDto {
  @IsNumber()
  companyId: number;

  @IsString()
  companyName: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  categoryOther?: string;

  @IsOptional()
  @IsString()
  companyEmail?: string;
}
