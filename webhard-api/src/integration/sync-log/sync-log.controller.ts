import { BadRequestException, Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { SyncLogService } from './sync-log.service';
import { CreateSyncLogDto, SyncLogQueryDto } from './dto/sync-log.dto';

@Controller('integration/sync-logs')
@UseGuards(ApiKeyGuard)
export class SyncLogController {
  constructor(private readonly syncLogService: SyncLogService) {}

  @Post()
  async create(@Body() dto: CreateSyncLogDto) {
    return this.syncLogService.create(dto);
  }

  @Get()
  async findAll(@Query() query: SyncLogQueryDto) {
    return this.syncLogService.findAll(query);
  }

  @Get('stats')
  async getStats(@Query('date') date?: string) {
    return this.syncLogService.getStats(date);
  }

  @Get('pipeline-backlog')
  async findPipelineBacklog(@Query('limit') limit?: string) {
    const parsedLimit = limit === undefined ? undefined : Number(limit);
    if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit < 1)) {
      throw new BadRequestException('limit must be a positive integer');
    }

    return this.syncLogService.findPipelineBacklog({ limit: parsedLimit });
  }

  @Get('check-duplicate')
  async checkDuplicate(@Query('md5Hash') md5Hash: string) {
    const exists = await this.syncLogService.checkDuplicate(md5Hash);
    return { duplicate: exists };
  }
}
