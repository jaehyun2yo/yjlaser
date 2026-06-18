import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class FindIdRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  companyName: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(9)
  @MaxLength(15)
  phone: string;
}
