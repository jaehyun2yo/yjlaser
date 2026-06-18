import { IsString, IsNumber } from 'class-validator';

export class DeleteSessionDto {
  @IsString()
  userType: string;

  @IsNumber()
  userId: number;
}
