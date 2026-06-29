import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApiKeyModule } from '../auth/api-key.module';
import { BankNotificationsController } from './bank-notifications.controller';
import { BankNotificationsService } from './bank-notifications.service';

@Module({
  imports: [PrismaModule, ApiKeyModule],
  controllers: [BankNotificationsController],
  providers: [BankNotificationsService],
  exports: [BankNotificationsService],
})
export class BankNotificationsModule {}
