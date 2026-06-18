import { Module, forwardRef } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { LaserOnlyMappingService } from './laser-only-mapping.service';
import { FolderAliasService } from './folder-alias.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeyModule } from '../integration/auth/api-key.module';
import { ContactsModule } from '../contacts/contacts.module';
import { FoldersModule } from '../folders/folders.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    PrismaModule,
    ApiKeyModule,
    ContactsModule,
    forwardRef(() => FoldersModule),
    StorageModule,
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService, LaserOnlyMappingService, FolderAliasService],
  exports: [CompaniesService, LaserOnlyMappingService, FolderAliasService],
})
export class CompaniesModule {}
