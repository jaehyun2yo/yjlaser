import { Module } from '@nestjs/common';
import { FilesModule } from '../../files/files.module';
import { ApiKeyModule } from '../auth/api-key.module';
import { IntegrationFilesController } from './files.controller';
import { IntegrationFilesService } from './files.service';

@Module({
  imports: [ApiKeyModule, FilesModule],
  controllers: [IntegrationFilesController],
  providers: [IntegrationFilesService],
  exports: [IntegrationFilesService],
})
export class IntegrationFilesModule {}
