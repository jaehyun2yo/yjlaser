import { Module } from '@nestjs/common';
import { PublicDataController } from './public-data.controller';
import { PublicDataService } from './public-data.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeyModule } from '../integration/auth/api-key.module';

@Module({
  imports: [PrismaModule, ApiKeyModule],
  controllers: [PublicDataController],
  providers: [PublicDataService],
  exports: [PublicDataService],
})
export class PublicDataModule {}
