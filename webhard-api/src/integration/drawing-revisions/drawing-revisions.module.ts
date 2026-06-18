import { Module } from '@nestjs/common';
import { ContactsModule } from '../../contacts/contacts.module';
import { ApiKeyModule } from '../auth/api-key.module';
import { IntegrationDrawingRevisionsController } from './drawing-revisions.controller';

@Module({
  imports: [ContactsModule, ApiKeyModule],
  controllers: [IntegrationDrawingRevisionsController],
})
export class IntegrationDrawingRevisionsModule {}
