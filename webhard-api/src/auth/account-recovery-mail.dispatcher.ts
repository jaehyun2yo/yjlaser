import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountRecoveryFlow } from './account-recovery.types';

export interface UsernameReminderMailInput {
  companyId: number;
  to: string;
  companyName: string;
  username: string;
  fingerprint: string;
}

export interface PasswordResetLinkMailInput {
  companyId: number;
  to: string;
  companyName: string;
  resetLink: string;
  expiresAt: Date;
  fingerprint: string;
}

@Injectable()
export class AccountRecoveryMailDispatcher {
  private readonly logger = new Logger(AccountRecoveryMailDispatcher.name);

  constructor(
    private readonly mailService: MailService,
    private readonly prisma: PrismaService
  ) {}

  canSendEmail(): boolean {
    return this.mailService.canSendEmail();
  }

  sendUsernameReminder(input: UsernameReminderMailInput): void {
    void this.mailService
      .sendUsernameReminder({
        to: input.to,
        companyName: input.companyName,
        username: input.username,
      })
      .catch((error: unknown) => {
        this.recordFailure({
          flow: 'find-id',
          companyId: input.companyId,
          fingerprint: input.fingerprint,
          error,
        });
      });
  }

  sendPasswordResetLink(input: PasswordResetLinkMailInput): void {
    void this.mailService
      .sendPasswordResetLink({
        to: input.to,
        companyName: input.companyName,
        resetLink: input.resetLink,
        expiresAt: input.expiresAt,
      })
      .catch((error: unknown) => {
        this.recordFailure({
          flow: 'find-password',
          companyId: input.companyId,
          fingerprint: input.fingerprint,
          error,
        });
      });
  }

  private recordFailure(input: {
    flow: AccountRecoveryFlow;
    companyId: number;
    fingerprint: string;
    error: unknown;
  }): void {
    const reason = this.classifyFailure(input.error);
    this.logger.error('Account recovery mail dispatch failed', {
      flow: input.flow,
      companyId: input.companyId,
      fingerprint: input.fingerprint,
      reason,
    });

    void this.prisma.notification
      .create({
        data: {
          userType: 'admin',
          userId: null,
          type: 'account_recovery_mail_failed',
          title: '계정 복구 메일 발송 실패',
          message: '계정 복구 메일 발송에 실패했습니다.',
          metadata: {
            flow: input.flow,
            companyId: input.companyId,
            fingerprint: input.fingerprint,
            reason,
          },
        },
      })
      .catch((error: unknown) => {
        this.logger.error('Failed to create account recovery failure notification', error);
      });
  }

  private classifyFailure(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'mail_delivery_failed';
    }

    if (/not configured|recipient not set/i.test(error.message)) {
      return 'mail_configuration_error';
    }

    return 'mail_delivery_failed';
  }
}
