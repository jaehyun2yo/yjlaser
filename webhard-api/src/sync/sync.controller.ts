import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { SyncService } from './sync.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { UpdateSyncStateDto } from './dto/update-sync-state.dto';

@Controller('sync')
@UseGuards(ApiKeyGuard)
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  constructor(private readonly syncService: SyncService) {}

  /**
   * POST /api/v1/sync/state
   * 동기화 상태 upsert
   */
  @Post('state')
  @HttpCode(HttpStatus.OK)
  async updateSyncState(@Body() dto: UpdateSyncStateDto) {
    return this.syncService.updateSyncState(dto);
  }

  /**
   * GET /api/v1/sync/state
   * 동기화 상태 조회
   */
  @Get('state')
  async getSyncState(@Query('companyId', ParseIntPipe) companyId: number) {
    return this.syncService.getSyncState(companyId);
  }
}
