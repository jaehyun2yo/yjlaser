import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { OrdersModule } from '../orders/orders.module';
import { ApiKeyModule } from '../auth/api-key.module';
import { DeviceAuthModule } from '../device-auth/device-auth.module';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { IntegrationPrincipalSourceGuard } from '../auth/integration-principal-source.guard';
import { DeviceEndpointPolicyGuard } from '../auth/device-endpoint-policy.guard';

@Module({
  imports: [PrismaModule, ApiKeyModule, DeviceAuthModule, OrdersModule],
  controllers: [EventsController],
  providers: [
    EventsService,
    ApiKeyGuard,
    IntegrationPrincipalSourceGuard,
    DeviceEndpointPolicyGuard,
  ],
  exports: [EventsService],
})
export class EventsModule {}
