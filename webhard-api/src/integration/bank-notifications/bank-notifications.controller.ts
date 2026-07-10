import { Body, Controller, Delete, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequireIntegrationPermission } from '../auth/require-integration-permission.decorator';
import { BankNotificationsService } from './bank-notifications.service';
import {
  CollectBankNotificationDto,
  CreateBackupBatchDto,
  DeleteRetentionDto,
  ListBankNotificationsQueryDto,
  MarkProcessedDto,
} from './dto/bank-notification.dto';

@Controller('integration/bank-notifications')
@UseGuards(ApiKeyGuard)
export class BankNotificationsController {
  constructor(private readonly service: BankNotificationsService) {}

  @Post()
  @RequireIntegrationPermission('bank-notification/write')
  collect(@Body() dto: CollectBankNotificationDto) {
    return this.service.collect(dto);
  }

  @Get()
  @RequireIntegrationPermission('bank-notification/read')
  list(@Query() query: ListBankNotificationsQueryDto) {
    return this.service.list(query);
  }

  @Patch('mark-processed')
  @RequireIntegrationPermission('bank-notification/manage')
  markProcessed(@Body() dto: MarkProcessedDto) {
    return this.service.markProcessed(dto);
  }

  @Delete('test-notifications')
  @RequireIntegrationPermission('bank-notification/manage')
  deleteTestNotifications() {
    return this.service.deleteTestNotifications();
  }

  @Post('backup-batches')
  @RequireIntegrationPermission('bank-notification/manage')
  createBackupBatch(@Body() dto: CreateBackupBatchDto) {
    return this.service.createBackupBatch(dto);
  }

  @Delete('retention')
  @RequireIntegrationPermission('bank-notification/manage')
  deleteRetention(@Query() query: DeleteRetentionDto) {
    return this.service.deleteBackedUpRetention(query);
  }
}
