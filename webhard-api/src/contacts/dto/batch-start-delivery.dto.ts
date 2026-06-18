import { IsArray, IsString, IsOptional, ArrayMinSize, IsNumber, Min } from 'class-validator';

export class BatchStartDeliveryDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  contactIds: string[];

  @IsOptional()
  @IsString()
  deliveryProofImage?: string;

  @IsOptional()
  @IsString()
  deliveryProofOriginalName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryProofFileSize?: number;

  @IsOptional()
  @IsString()
  deliveryProofMimeType?: string;

  @IsOptional()
  @IsString()
  actorType?: string;

  @IsOptional()
  @IsString()
  actorName?: string;
}
