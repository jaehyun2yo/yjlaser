import { Module } from '@nestjs/common';
import { ContactsModule } from '../../contacts/contacts.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApiKeyModule } from '../auth/api-key.module';
import { LaserCompletionsController } from './laser-completions.controller';
import { LaserCompletionsService } from './laser-completions.service';

@Module({
  imports: [PrismaModule, ApiKeyModule, ContactsModule],
  controllers: [LaserCompletionsController],
  providers: [LaserCompletionsService],
  exports: [LaserCompletionsService],
})
export class LaserCompletionsModule {}
