import { Module } from '@nestjs/common';
import { ProgramsController } from './programs.controller';
import { ProgramsAccessGuard } from './programs-access.guard';
import { ProgramsService } from './programs.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApiKeyModule } from '../auth/api-key.module';

@Module({
  imports: [PrismaModule, ApiKeyModule],
  controllers: [ProgramsController],
  providers: [ProgramsService, ProgramsAccessGuard],
  exports: [ProgramsService],
})
export class ProgramsModule {}
