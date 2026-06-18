import { Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { StorageReconciliationService } from './storage-reconciliation.service';

type HeaderValue = string | string[] | undefined;

@Controller('storage')
export class StorageDriveWebhookController {
  constructor(private readonly storageReconciliationService: StorageReconciliationService) {}

  @Post('drive-change-webhook')
  @HttpCode(202)
  async handleDriveChangeWebhook(@Headers() headers: Record<string, HeaderValue>) {
    return this.storageReconciliationService.handleDriveChangeWebhook(headers);
  }
}
