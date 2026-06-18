import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ApiKeyModule } from '../integration/auth/api-key.module';
import { SyncLogModule } from '../integration/sync-log/sync-log.module';
import { GoogleDriveStorageProvider } from './google-drive-storage.provider';
import { StorageRepairService } from './storage-repair.service';
import { StorageReconciliationService } from './storage-reconciliation.service';
import { StorageDriveWebhookController } from './storage-drive-webhook.controller';

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule, ApiKeyModule, SyncLogModule],
  controllers: [StorageController, StorageDriveWebhookController],
  providers: [
    StorageService,
    GoogleDriveStorageProvider,
    StorageRepairService,
    StorageReconciliationService,
  ],
  exports: [
    StorageService,
    GoogleDriveStorageProvider,
    StorageRepairService,
    StorageReconciliationService,
  ],
})
export class StorageModule {}
