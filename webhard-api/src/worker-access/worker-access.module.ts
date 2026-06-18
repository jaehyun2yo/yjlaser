import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkerContactAccessService } from './worker-contact-access.service';

@Module({
  imports: [PrismaModule],
  providers: [WorkerContactAccessService],
  exports: [WorkerContactAccessService],
})
export class WorkerAccessModule {}
