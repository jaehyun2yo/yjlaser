import { Module } from '@nestjs/common';
import { PushSubscriptionsController } from './push-subscriptions.controller';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeyModule } from '../integration/auth/api-key.module';

@Module({
  imports: [PrismaModule, ApiKeyModule],
  controllers: [PushSubscriptionsController],
  providers: [PushSubscriptionsService],
  exports: [PushSubscriptionsService],
})
export class PushSubscriptionsModule {}
