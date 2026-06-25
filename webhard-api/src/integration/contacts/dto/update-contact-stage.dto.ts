import { IsDefined, IsIn, IsOptional, IsString } from 'class-validator';
import { PROCESS_STAGE_ORDER } from '../../../contacts/constants/process-stages';

export class IntegrationUpdateContactStageDto {
  @IsDefined()
  @IsIn(PROCESS_STAGE_ORDER)
  processStage!: string;

  @IsOptional()
  @IsString()
  actorName?: string;
}
