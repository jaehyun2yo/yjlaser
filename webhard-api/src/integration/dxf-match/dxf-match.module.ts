import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ContactsModule } from '../../contacts/contacts.module';
import { ApiKeyModule } from '../auth/api-key.module';
import { DxfMatchController } from './dxf-match.controller';
import { DxfMatchService } from './dxf-match.service';

@Module({
  imports: [PrismaModule, ContactsModule, ApiKeyModule],
  controllers: [DxfMatchController],
  providers: [DxfMatchService],
})
export class DxfMatchModule {}
