import { Module, forwardRef } from '@nestjs/common';
import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';
import { FolderPathService } from './folder-path.service';
import { WebhardConfigService } from './webhard-config.service';
import { FolderTemplateService } from './folder-template.service';
import { DriveProvisioningService } from './drive-provisioning.service';
import { AuthModule } from '../auth/auth.module';
import { ApiKeyModule } from '../integration/auth/api-key.module';
import { ContactsModule } from '../contacts/contacts.module';
import { StorageModule } from '../storage/storage.module';
import { DeviceAuthModule } from '../integration/device-auth/device-auth.module';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { IntegrationPrincipalSourceGuard } from '../integration/auth/integration-principal-source.guard';
import { DeviceEndpointPolicyGuard } from '../integration/auth/device-endpoint-policy.guard';

@Module({
  imports: [
    AuthModule,
    ApiKeyModule,
    StorageModule,
    DeviceAuthModule,
    forwardRef(() => ContactsModule),
  ],
  controllers: [FoldersController],
  providers: [
    FoldersService,
    FolderPathService,
    WebhardConfigService,
    FolderTemplateService,
    DriveProvisioningService,
    ApiKeyGuard,
    IntegrationPrincipalSourceGuard,
    DeviceEndpointPolicyGuard,
  ],
  exports: [
    FoldersService,
    FolderPathService,
    WebhardConfigService,
    FolderTemplateService,
    DriveProvisioningService,
  ],
})
export class FoldersModule {}
