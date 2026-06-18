import { IsString, IsOptional } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  visitDate: string;

  @IsString()
  visitTimeSlot: string;

  @IsString()
  companyName: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsOptional()
  @IsString()
  deliveryMethod?: string;

  @IsOptional()
  @IsString()
  deliveryName?: string;

  @IsOptional()
  @IsString()
  deliveryPhone?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;
}
