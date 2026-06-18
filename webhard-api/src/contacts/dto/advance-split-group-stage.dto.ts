import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class AdvanceSplitGroupStageDto {
  @IsString()
  nextStage!: string;

  @IsOptional()
  @IsBoolean()
  forceComplete?: boolean;

  @IsOptional()
  @IsString()
  actorType?: string;

  @IsOptional()
  @IsString()
  actorName?: string;
}
