import { Module } from '@nestjs/common';
import { ActivityLogsController } from './activity-logs.controller';
import { ActivityLogsService } from './activity-logs.service';
import { ActivityLogsGateway } from './activity-logs.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ApiKeyModule } from '../integration/auth/api-key.module';

@Module({
  imports: [PrismaModule, AuthModule, ApiKeyModule],
  controllers: [ActivityLogsController],
  providers: [ActivityLogsService, ActivityLogsGateway],
  exports: [ActivityLogsService, ActivityLogsGateway],
})
export class ActivityLogsModule {}
