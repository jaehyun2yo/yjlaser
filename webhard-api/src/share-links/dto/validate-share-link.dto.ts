import { IsString } from 'class-validator';

export class ValidateShareLinkDto {
  @IsString()
  token: string;
}
