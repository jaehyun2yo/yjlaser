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
import { DeviceAuthModule } from '../device-auth/device-auth.module';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { IntegrationPrincipalSourceGuard } from '../auth/integration-principal-source.guard';
import { DeviceEndpointPolicyGuard } from '../auth/device-endpoint-policy.guard';

@Module({
  imports: [
    PrismaModule,
    ApiKeyModule,
    FoldersModule,
    NumberModule,
    ContactsModule,
    CompaniesModule,
    SyncLogModule,
    DeviceAuthModule,
  ],
  controllers: [OrdersController, AutoContactController],
  providers: [
    OrdersService,
    AutoDeliveryService,
    AutoContactService,
    ApiKeyGuard,
    IntegrationPrincipalSourceGuard,
    DeviceEndpointPolicyGuard,
  ],
  exports: [OrdersService, AutoContactService],
})
export class OrdersModule {}
