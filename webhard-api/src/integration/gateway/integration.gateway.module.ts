import { Module } from '@nestjs/common';
import { IntegrationGateway } from './integration.gateway';
import { ApiKeyModule } from '../auth/api-key.module';

@Module({
  imports: [ApiKeyModule],
  providers: [IntegrationGateway],
  exports: [IntegrationGateway],
})
export class IntegrationGatewayModule {}
