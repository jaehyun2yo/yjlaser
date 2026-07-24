import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { BadgeCountsService } from './badge-counts.service';
import { ZipService } from './zip.service';
import { StorageModule } from '../storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { ApiKeyModule } from '../integration/auth/api-key.module';
import { OrdersModule } from '../integration/orders/orders.module';
import { FoldersModule } from '../folders/folders.module';
import { SyncLogModule } from '../integration/sync-log/sync-log.module';
import { WorkerAccessModule } from '../worker-access/worker-access.module';
import { DeviceAuthModule } from '../integration/device-auth/device-auth.module';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { IntegrationPrincipalSourceGuard } from '../integration/auth/integration-principal-source.guard';
import { DeviceEndpointPolicyGuard } from '../integration/auth/device-endpoint-policy.guard';

@Module({
  imports: [
    StorageModule,
    AuthModule,
    ApiKeyModule,
    OrdersModule,
    FoldersModule,
    SyncLogModule,
    WorkerAccessModule,
    DeviceAuthModule,
  ],
  controllers: [FilesController],
  providers: [
    FilesService,
    BadgeCountsService,
    ZipService,
    ApiKeyGuard,
    IntegrationPrincipalSourceGuard,
    DeviceEndpointPolicyGuard,
  ],
  exports: [FilesService, BadgeCountsService],
})
export class FilesModule {}
