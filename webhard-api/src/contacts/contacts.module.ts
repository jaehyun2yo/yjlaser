import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { ContactsGateway } from './contacts.gateway';
import { ContactTimelineService } from './contact-timeline.service';
import { ContactFolderSyncService } from './contact-folder-sync.service';
import { DrawingRevisionService } from './drawing-revision.service';
import { ApiKeyModule } from '../integration/auth/api-key.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { NumberModule } from '../number/number.module';
import { MailModule } from '../mail/mail.module';
import { FoldersModule } from '../folders/folders.module';
import { WorkerAccessModule } from '../worker-access/worker-access.module';

@Module({
  imports: [
    PrismaModule,
    ApiKeyModule,
    AuthModule,
    StorageModule,
    NumberModule,
    MailModule,
    forwardRef(() => FoldersModule),
    WorkerAccessModule,
  ],
  controllers: [ContactsController],
  providers: [
    ContactsService,
    ContactsGateway,
    ContactTimelineService,
    ContactFolderSyncService,
    DrawingRevisionService,
  ],
  exports: [
    ContactsService,
    ContactsGateway,
    ContactTimelineService,
    ContactFolderSyncService,
    DrawingRevisionService,
  ],
})
export class ContactsModule {}
