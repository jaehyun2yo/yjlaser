import { Controller, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { IsString, IsOptional } from 'class-validator';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { DxfMatchService } from './dxf-match.service';

export class DxfMatchUploadDto {
  @IsString()
  fileName!: string;

  @IsString()
  fileUrl!: string;

  @IsOptional()
  @IsString()
  actorName?: string;
}

@Controller('integration/dxf-match')
@UseGuards(ApiKeyGuard)
export class DxfMatchController {
  constructor(private dxfMatchService: DxfMatchService) {}

  @Post('upload')
  async matchAndUpload(@Body() dto: DxfMatchUploadDto) {
    const result = await this.dxfMatchService.matchAndUpload(dto);

    if (!result.matched) {
      throw new BadRequestException(result.error);
    }

    return result;
  }
}
