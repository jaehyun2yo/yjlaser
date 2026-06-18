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

@Module({
  imports: [AuthModule, ApiKeyModule, StorageModule, forwardRef(() => ContactsModule)],
  controllers: [FoldersController],
  providers: [
    FoldersService,
    FolderPathService,
    WebhardConfigService,
    FolderTemplateService,
    DriveProvisioningService,
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
