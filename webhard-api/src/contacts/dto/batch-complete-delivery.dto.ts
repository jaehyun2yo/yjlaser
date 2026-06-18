import { IsArray, IsString, IsOptional, ArrayMinSize } from 'class-validator';

export class BatchCompleteDeliveryDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  contactIds: string[];

  @IsOptional()
  @IsString()
  deliveryCompleteImage?: string;

  @IsOptional()
  @IsString()
  actorType?: string;

  @IsOptional()
  @IsString()
  actorName?: string;
}
