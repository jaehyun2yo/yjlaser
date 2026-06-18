import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class LaserCompletionSheetDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sheetIndex?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  drawingCount?: number;
}

export class CompleteLaserCompletionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  workNumbers!: string[];

  @IsOptional()
  @IsString()
  actorName?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LaserCompletionSheetDto)
  sheet?: LaserCompletionSheetDto;
}
