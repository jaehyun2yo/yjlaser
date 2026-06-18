import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApiKeyModule } from '../auth/api-key.module';
import { NestingTasksController } from './nesting-tasks.controller';
import { NestingTasksService } from './nesting-tasks.service';

@Module({
  imports: [PrismaModule, ApiKeyModule],
  controllers: [NestingTasksController],
  providers: [NestingTasksService],
  exports: [NestingTasksService],
})
export class NestingTasksModule {}
