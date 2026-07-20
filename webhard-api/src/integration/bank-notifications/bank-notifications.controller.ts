import { Body, Controller, Delete, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { DeviceEndpointPolicyGuard } from '../auth/device-endpoint-policy.guard';
import { IntegrationPrincipalSourceGuard } from '../auth/integration-principal-source.guard';
import { RequireDeviceEndpointPolicy } from '../auth/require-device-endpoint-policy.decorator';
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
@UseGuards(IntegrationPrincipalSourceGuard, DeviceEndpointPolicyGuard)
export class BankNotificationsController {
  constructor(private readonly service: BankNotificationsService) {}

  @Post()
  @RequireIntegrationPermission('bank-notification/write')
  collect(@Body() dto: CollectBankNotificationDto) {
    return this.service.collect(dto);
  }

  @Get()
  @RequireIntegrationPermission('bank-notification/read')
  @RequireDeviceEndpointPolicy('GET', '/integration/bank-notifications')
  list(@Query() query: ListBankNotificationsQueryDto) {
    return this.service.list(query);
  }

  @Patch('mark-processed')
  @RequireIntegrationPermission('bank-notification/manage')
  @RequireDeviceEndpointPolicy('PATCH', '/integration/bank-notifications/mark-processed')
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
  @RequireDeviceEndpointPolicy('POST', '/integration/bank-notifications/backup-batches')
  createBackupBatch(@Body() dto: CreateBackupBatchDto) {
    return this.service.createBackupBatch(dto);
  }

  @Delete('retention')
  @RequireIntegrationPermission('bank-notification/manage')
  deleteRetention(@Query() query: DeleteRetentionDto) {
    return this.service.deleteBackedUpRetention(query);
  }
}
