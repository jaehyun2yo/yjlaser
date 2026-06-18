import { IsNumber, IsString } from 'class-validator';

export class CreateDeliveryCompanyDto {
  @IsNumber()
  companyId: number;

  @IsString()
  name: string;

  @IsString()
  phone: string;

  @IsString()
  address: string;
}
