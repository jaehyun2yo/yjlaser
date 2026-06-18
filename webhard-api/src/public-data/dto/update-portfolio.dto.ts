import { IsString, IsOptional } from 'class-validator';

export class UpdatePortfolioDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  field?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  format?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  paper?: string;

  @IsOptional()
  @IsString()
  printing?: string;

  @IsOptional()
  @IsString()
  finishing?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  images?: unknown;
}
