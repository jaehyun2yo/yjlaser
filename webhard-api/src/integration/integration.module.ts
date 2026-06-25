import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from './orders/orders.module';
import { EventsModule } from './events/events.module';
import { ProgramsModule } from './programs/programs.module';
import { DeliveryModule } from './delivery/delivery.module';
import { InventoryModule } from './inventory/inventory.module';
import { IntegrationGatewayModule } from './gateway/integration.gateway.module';
import { SyncLogModule } from './sync-log/sync-log.module';
import { IntegrationDrawingRevisionsModule } from './drawing-revisions/drawing-revisions.module';
import { DxfMatchModule } from './dxf-match/dxf-match.module';
import { LaserCompletionsModule } from './laser-completions/laser-completions.module';
import { NestingTasksModule } from './nesting-tasks/nesting-tasks.module';
import { IntegrationFilesModule } from './files/files.module';
import { OperationsModule } from './operations/operations.module';
import { ApiKeyModule } from './auth/api-key.module';
import { ApiKeyController } from './auth/api-key.controller';
import { FileTransferController } from './file-transfer/file-transfer.controller';
import { LogEventsModule } from './log-events/log-events.module';
import { IntegrationContactsModule } from './contacts/contacts.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ApiKeyModule,
    OrdersModule,
    EventsModule,
    ProgramsModule,
    DeliveryModule,
    InventoryModule,
    IntegrationGatewayModule,
    SyncLogModule,
    IntegrationDrawingRevisionsModule,
    DxfMatchModule,
    LaserCompletionsModule,
    NestingTasksModule,
    IntegrationFilesModule,
    OperationsModule,
    LogEventsModule,
    IntegrationContactsModule,
  ],
  controllers: [ApiKeyController, FileTransferController],
  exports: [
    ApiKeyModule,
    OrdersModule,
    EventsModule,
    ProgramsModule,
    DeliveryModule,
    InventoryModule,
    IntegrationGatewayModule,
    SyncLogModule,
    IntegrationDrawingRevisionsModule,
    DxfMatchModule,
    LaserCompletionsModule,
    NestingTasksModule,
    IntegrationFilesModule,
    OperationsModule,
    LogEventsModule,
    IntegrationContactsModule,
  ],
})
export class IntegrationModule {}
