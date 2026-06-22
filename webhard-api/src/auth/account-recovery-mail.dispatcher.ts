import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountRecoveryFlow } from './account-recovery.types';
import { formatLogEvent, generateCorrelationId, hashIdentifier } from '../common/logging/log-event';

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
  private readonly logFeature = 'auth';

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
    this.logger.error(
      this.formatDispatcherEvent({
        event: 'account_recovery_mail_dispatch_failed',
        action: 'dispatch_mail',
        status: 'failure',
        channel: 'security',
        companyId: input.companyId,
        fingerprint: input.fingerprint,
        errorType: input.error instanceof Error ? input.error.name : typeof input.error,
        metadata: {
          flow: input.flow,
          reason,
        },
      })
    );

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
        this.logger.error(
          this.formatDispatcherEvent({
            event: 'account_recovery_mail_failure_notification_failed',
            action: 'create_notification',
            status: 'failure',
            channel: 'error',
            companyId: input.companyId,
            fingerprint: input.fingerprint,
            errorType: error instanceof Error ? error.name : typeof error,
            metadata: {
              flow: input.flow,
              reason,
            },
          })
        );
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

  private formatDispatcherEvent(input: {
    event: string;
    action: string;
    status: 'failure';
    channel: 'security' | 'error';
    companyId: number;
    fingerprint: string;
    errorType: string;
    metadata: Record<string, unknown>;
  }): string {
    return formatLogEvent({
      level: 'error',
      project: 'company_site',
      component: AccountRecoveryMailDispatcher.name,
      feature: this.logFeature,
      event: input.event,
      action: input.action,
      status: input.status,
      channel: input.channel,
      correlation_id: generateCorrelationId('account-recovery-mail'),
      actor_type: 'company',
      actor_id_hash: hashIdentifier(input.companyId),
      target_type: 'account_recovery_fingerprint',
      target_id_hash: hashIdentifier(input.fingerprint),
      error_type: input.errorType,
      metadata: input.metadata,
    });
  }
}
