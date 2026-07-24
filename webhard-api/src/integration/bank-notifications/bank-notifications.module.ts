import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApiKeyModule } from '../auth/api-key.module';
import { BankNotificationsController } from './bank-notifications.controller';
import { BankNotificationsService } from './bank-notifications.service';
import { DeviceAuthModule } from '../device-auth/device-auth.module';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { IntegrationPrincipalSourceGuard } from '../auth/integration-principal-source.guard';
import { DeviceEndpointPolicyGuard } from '../auth/device-endpoint-policy.guard';

@Module({
  imports: [PrismaModule, ApiKeyModule, DeviceAuthModule],
  controllers: [BankNotificationsController],
  providers: [
    BankNotificationsService,
    ApiKeyGuard,
    IntegrationPrincipalSourceGuard,
    DeviceEndpointPolicyGuard,
  ],
  exports: [BankNotificationsService],
})
export class BankNotificationsModule {}
