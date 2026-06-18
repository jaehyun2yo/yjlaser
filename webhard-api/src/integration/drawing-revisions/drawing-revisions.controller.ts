import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
  IsUUID,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { DrawingRevisionService } from '../../contacts/drawing-revision.service';

class IntegrationRevisionFileDto {
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

export class IntegrationCreateDrawingRevisionDto {
  @IsUUID()
  contactId!: string;

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
  @Type(() => IntegrationRevisionFileDto)
  files!: IntegrationRevisionFileDto[];

  @IsOptional()
  @IsString()
  processStage?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  actorName?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

@Controller('integration/drawing-revisions')
@UseGuards(ApiKeyGuard)
export class IntegrationDrawingRevisionsController {
  constructor(private drawingRevisionService: DrawingRevisionService) {}

  @Post()
  async createDrawingRevision(@Body() dto: IntegrationCreateDrawingRevisionDto) {
    const result = await this.drawingRevisionService.createRevision(
      dto.contactId,
      {
        reason: dto.reason,
        reasonDetail: dto.reasonDetail,
        files: dto.files,
        processStage: dto.processStage,
        note: dto.note,
        isPublic: dto.isPublic,
        source: 'integration',
      },
      {
        actorType: 'external',
        actorName: dto.actorName ?? 'external-program',
      }
    );

    return {
      success: true,
      revision: {
        id: result.revision.id,
        version: result.revision.version,
        createdAt: result.revision.createdAt,
      },
      webhardWarning: result.webhardWarning,
    };
  }
}
