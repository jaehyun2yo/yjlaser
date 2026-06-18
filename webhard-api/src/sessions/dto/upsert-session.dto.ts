import { IsString, IsNumber, IsOptional } from 'class-validator';

export class UpsertSessionDto {
  @IsString()
  userType: string;

  @IsNumber()
  userId: number;

  @IsString()
  username: string;

  @IsOptional()
  @IsString()
  companyName?: string;
}
