import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AccessLogsService } from './access-logs.service';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { AccessLogQueryDto } from './dto/access-log.dto';

@Controller('erp/access-logs')
@UseGuards(SessionAuthGuard, AdminGuard)
export class AccessLogsController {
  constructor(private readonly accessLogsService: AccessLogsService) {}

  /**
   * GET /erp/access-logs - Get access logs (admin only)
   */
  @Get()
  async getLogs(@Query() query: AccessLogQueryDto) {
    return this.accessLogsService.getLogs(query);
  }

  /**
   * GET /erp/access-logs/stats - Get access log statistics (admin only)
   */
  @Get('stats')
  async getStats() {
    return this.accessLogsService.getStats();
  }
}
