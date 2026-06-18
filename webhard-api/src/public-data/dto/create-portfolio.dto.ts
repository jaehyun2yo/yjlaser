import { IsString, IsOptional } from 'class-validator';

export class CreatePortfolioDto {
  @IsString()
  title: string;

  @IsString()
  field: string;

  @IsString()
  purpose: string;

  @IsString()
  type: string;

  @IsString()
  format: string;

  @IsString()
  size: string;

  @IsString()
  paper: string;

  @IsString()
  printing: string;

  @IsString()
  finishing: string;

  @IsString()
  description: string;

  @IsOptional()
  images?: unknown;
}
