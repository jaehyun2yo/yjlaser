import { IsString, IsOptional, IsIn, IsDateString } from 'class-validator';

export const BOOKING_STATUS_VALUES = ['pending', 'confirmed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUS_VALUES)[number];

export class UpdateBookingDto {
  @IsOptional()
  @IsDateString()
  visitDate?: string;

  @IsOptional()
  @IsString()
  visitTimeSlot?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  contactId?: string | null;

  @IsOptional()
  @IsIn([...BOOKING_STATUS_VALUES])
  status?: BookingStatus;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  adminNote?: string;

  @IsOptional()
  @IsString()
  deliveryMethod?: string | null;

  @IsOptional()
  @IsString()
  deliveryName?: string | null;

  @IsOptional()
  @IsString()
  deliveryPhone?: string | null;

  @IsOptional()
  @IsString()
  deliveryAddress?: string | null;
}
