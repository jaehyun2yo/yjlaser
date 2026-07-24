import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequireIntegrationPermission } from '../auth/require-integration-permission.decorator';
import { ProgramsAccessGuard } from './programs-access.guard';
import { ProgramsService } from './programs.service';
import { HeartbeatDto } from './dto/program.dto';

@Controller('integration/programs')
@UseGuards(ApiKeyGuard, ProgramsAccessGuard)
export class ProgramsController {
  constructor(private programsService: ProgramsService) {}

  @Post('heartbeat')
  @RequireIntegrationPermission('event/write')
  async heartbeat(@Body() dto: HeartbeatDto) {
    return this.programsService.receiveHeartbeat(dto);
  }

  @Get()
  @RequireIntegrationPermission('operation/read')
  async listPrograms() {
    return this.programsService.listPrograms();
  }
}
