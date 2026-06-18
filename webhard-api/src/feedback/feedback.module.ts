import { Module } from '@nestjs/common';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { FeedbackGateway } from './feedback.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ApiKeyModule } from '../integration/auth/api-key.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, AuthModule, ApiKeyModule, MailModule],
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackGateway],
  exports: [FeedbackService, FeedbackGateway],
})
export class FeedbackModule {}
