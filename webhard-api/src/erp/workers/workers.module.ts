import { Module } from '@nestjs/common';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';
import { AuthModule } from '../../auth/auth.module';
import { AccessLogsModule } from '../access-logs/access-logs.module';

@Module({
  imports: [AuthModule, AccessLogsModule],
  controllers: [WorkersController],
  providers: [WorkersService],
  exports: [WorkersService],
})
export class WorkersModule {}
