import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { ApiKeyService } from './api-key.service';

/**
 * ApiKeyModule — ApiKeyService와 ApiKeyGuard의 의존성을 공유 모듈로 제공
 * files, folders, trash, search 등 외부 프로그램 API Key 인증이 필요한 모듈에서 import
 */
@Module({
  imports: [PrismaModule, AuthModule],
  providers: [ApiKeyService],
  exports: [ApiKeyService, AuthModule],
})
export class ApiKeyModule {}
