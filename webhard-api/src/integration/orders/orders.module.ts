import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { AutoContactController } from './auto-contact.controller';
import { OrdersService } from './orders.service';
import { AutoDeliveryService } from './auto-delivery.service';
import { AutoContactService } from './auto-contact.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApiKeyModule } from '../auth/api-key.module';
import { FoldersModule } from '../../folders/folders.module';
import { NumberModule } from '../../number/number.module';
import { ContactsModule } from '../../contacts/contacts.module';
import { CompaniesModule } from '../../companies/companies.module';
import { SyncLogModule } from '../sync-log/sync-log.module';

@Module({
  imports: [
    PrismaModule,
    ApiKeyModule,
    FoldersModule,
    NumberModule,
    ContactsModule,
    CompaniesModule,
    SyncLogModule,
  ],
  controllers: [OrdersController, AutoContactController],
  providers: [OrdersService, AutoDeliveryService, AutoContactService],
  exports: [OrdersService, AutoContactService],
})
export class OrdersModule {}
