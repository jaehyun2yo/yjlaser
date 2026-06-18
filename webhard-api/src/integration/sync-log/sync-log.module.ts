import { Module } from '@nestjs/common';
import { SyncLogController } from './sync-log.controller';
import { SyncLogService } from './sync-log.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApiKeyModule } from '../auth/api-key.module';

@Module({
  imports: [PrismaModule, ApiKeyModule],
  controllers: [SyncLogController],
  providers: [SyncLogService],
  exports: [SyncLogService],
})
export class SyncLogModule {}
