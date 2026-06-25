import { Module } from '@nestjs/common';
import { ContactsModule } from '../../contacts/contacts.module';
import { ApiKeyModule } from '../auth/api-key.module';
import { IntegrationContactsController } from './contacts.controller';

@Module({
  imports: [ApiKeyModule, ContactsModule],
  controllers: [IntegrationContactsController],
})
export class IntegrationContactsModule {}
