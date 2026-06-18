import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';

@Controller('erp/dashboard')
@UseGuards(SessionAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /erp/dashboard - Get dashboard statistics
   */
  @Get()
  async getDashboardStats() {
    return this.dashboardService.getDashboardStats();
  }
}
