import { Controller, Get } from '@nestjs/common';
import { Public } from '../integration/auth/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * GET /api/v1/health
   * Basic health check — public, no auth required.
   */
  @Public()
  @Get()
  check() {
    return this.healthService.getBasicHealth();
  }

  /**
   * GET /api/v1/health/detailed
   * Detailed health check — requires API key auth (default guard).
   * Includes database status and memory usage.
   */
  @Get('detailed')
  async detailed() {
    return this.healthService.getDetailedHealth();
  }
}
