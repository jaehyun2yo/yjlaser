import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RevisionFileDto {
  @IsString()
  url!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsNumber()
  size?: number;

  @IsOptional()
  @IsString()
  mimeType?: string;
}

class UploadFileDto {
  @IsString()
  name!: string;

  @IsString()
  mimeType!: string;

  @IsOptional()
  @IsNumber()
  size?: number;
}

export class CreateDrawingRevisionDto {
  @IsString()
  @IsIn([
    'domuson_fit',
    'sample_revision',
    'field_correction',
    'laser_processing',
    'initial',
    'revision_request',
    'other',
  ])
  reason!: string;

  @IsOptional()
  @IsString()
  reasonDetail?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RevisionFileDto)
  files!: RevisionFileDto[];

  @IsOptional()
  @IsString()
  processStage?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsIn(['stage_change', 'manual', 'auto_initial', 'integration'])
  source?: string;

  @IsOptional()
  @IsString()
  @IsIn(['admin', 'worker', 'company'])
  actorType?: string;

  @IsOptional()
  @IsString()
  actorName?: string;
}

export class GetDrawingRevisionUploadUrlsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UploadFileDto)
  files!: UploadFileDto[];
}

export class UpdateDrawingRevisionVisibilityDto {
  @IsBoolean()
  isPublic!: boolean;
}
