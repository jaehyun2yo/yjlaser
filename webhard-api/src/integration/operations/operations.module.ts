import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApiKeyModule } from '../auth/api-key.module';
import { OperationsAccessGuard } from './operations-access.guard';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [PrismaModule, ApiKeyModule],
  controllers: [OperationsController],
  providers: [OperationsService, OperationsAccessGuard],
  exports: [OperationsService],
})
export class OperationsModule {}
