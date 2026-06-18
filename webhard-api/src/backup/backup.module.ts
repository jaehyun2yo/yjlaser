import { Module } from '@nestjs/common';
import { BackupService } from './backup.service';
import { BackupController } from './backup.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeyModule } from '../integration/auth/api-key.module';
import { StorageModule } from '../storage/storage.module';
import { BackupAdminGuard } from './backup-admin.guard';

@Module({
  imports: [PrismaModule, ApiKeyModule, StorageModule],
  controllers: [BackupController],
  providers: [BackupService, BackupAdminGuard],
  exports: [BackupService],
})
export class BackupModule {}
