import { IsArray, IsString, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class BatchOperationDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  ids: string[];
}

export interface BatchOperationResult {
  success: boolean;
  processed: number;
  failed: number;
  errors?: string[];
  durationMs: number;
}
