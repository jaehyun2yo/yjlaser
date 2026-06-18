import { Module } from '@nestjs/common';
import { DeliveryCompaniesController } from './delivery-companies.controller';
import { DeliveryCompaniesService } from './delivery-companies.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeyModule } from '../integration/auth/api-key.module';

@Module({
  imports: [PrismaModule, ApiKeyModule],
  controllers: [DeliveryCompaniesController],
  providers: [DeliveryCompaniesService],
  exports: [DeliveryCompaniesService],
})
export class DeliveryCompaniesModule {}
