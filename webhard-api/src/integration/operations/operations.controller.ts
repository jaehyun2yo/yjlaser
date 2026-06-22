import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequireIntegrationPermission } from '../auth/require-integration-permission.decorator';
import { OperationsService } from './operations.service';

@Controller('integration/operations')
@UseGuards(ApiKeyGuard)
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('failures')
  @RequireIntegrationPermission('operation/read')
  async getFailures(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.operationsService.getUnresolvedFailures({ cursor, limit });
  }
}
