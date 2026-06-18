import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { CompanyAccessGuard } from './guards/company-access.guard';
import { RecoveryApiKeyGuard } from './guards/recovery-api-key.guard';
import { AccountRecoveryMailDispatcher } from './account-recovery-mail.dispatcher';
import { AccountRecoveryRateLimitService } from './account-recovery-rate-limit.service';
import { AccountRecoveryTiming } from './account-recovery-timing.service';
import { FindIdController } from './find-id.controller';
import { FindIdService } from './find-id.service';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule, MailModule],
  controllers: [FindIdController, PasswordResetController],
  providers: [
    AuthService,
    SessionAuthGuard,
    CompanyAccessGuard,
    RecoveryApiKeyGuard,
    AccountRecoveryMailDispatcher,
    AccountRecoveryRateLimitService,
    AccountRecoveryTiming,
    FindIdService,
    PasswordResetService,
  ],
  exports: [
    AuthService,
    SessionAuthGuard,
    CompanyAccessGuard,
    RecoveryApiKeyGuard,
    AccountRecoveryMailDispatcher,
    AccountRecoveryRateLimitService,
    AccountRecoveryTiming,
    FindIdService,
    PasswordResetService,
  ],
})
export class AuthModule {}
