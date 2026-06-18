import { IsBoolean } from 'class-validator';

export class ToggleStageCompletedDto {
  @IsBoolean()
  stageCompleted!: boolean;
}
