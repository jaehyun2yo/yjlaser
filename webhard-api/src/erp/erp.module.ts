import { Module } from '@nestjs/common';
import { TasksModule } from './tasks/tasks.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { WorkersModule } from './workers/workers.module';
import { MachinesModule } from './machines/machines.module';
import { AccessLogsModule } from './access-logs/access-logs.module';

@Module({
  imports: [TasksModule, DashboardModule, WorkersModule, MachinesModule, AccessLogsModule],
  exports: [TasksModule, DashboardModule, WorkersModule, MachinesModule, AccessLogsModule],
})
export class ErpModule {}
