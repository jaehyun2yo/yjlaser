import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ProgramsService } from './programs.service';
import { HeartbeatDto } from './dto/program.dto';

@Controller('integration/programs')
@UseGuards(ApiKeyGuard)
export class ProgramsController {
  constructor(private programsService: ProgramsService) {}

  @Post('heartbeat')
  async heartbeat(@Body() dto: HeartbeatDto) {
    return this.programsService.receiveHeartbeat(dto);
  }

  @Get()
  async listPrograms() {
    return this.programsService.listPrograms();
  }
}
