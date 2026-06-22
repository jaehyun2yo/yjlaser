import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { formatLogEvent, hashIdentifier } from '../common/logging/log-event';
import { AccountRecoveryMailDispatcher } from './account-recovery-mail.dispatcher';
import { AccountRecoveryRateLimitService } from './account-recovery-rate-limit.service';
import { AccountRecoveryTiming } from './account-recovery-timing.service';
import {
  AccountRecoveryMailAllowanceInput,
  AccountRecoveryRequestContext,
} from './account-recovery.types';
import { ConfirmPasswordResetDto, RequestPasswordResetDto } from './dto/password-reset.dto';

export interface PasswordResetResponse {
  success: true;
  message: string;
}

const GENERIC_RESET_MESSAGE =
  '입력하신 정보가 일치하면 이메일로 비밀번호 재설정 링크가 전송됩니다.';

const PASSWORD_RESET_SUCCESS_MESSAGE = '비밀번호가 재설정되었습니다.';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly resetTokenTtlMinutes = 30;
  private readonly bcryptSaltRounds = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailDispatcher: AccountRecoveryMailDispatcher,
    private readonly configService: ConfigService,
    private readonly rateLimitService: AccountRecoveryRateLimitService,
    private readonly timing: AccountRecoveryTiming
  ) {}

  async requestReset(
    dto: RequestPasswordResetDto,
    context?: AccountRecoveryRequestContext
  ): Promise<PasswordResetResponse> {
    if (!this.mailDispatcher.canSendEmail()) {
      throw new ServiceUnavailableException('Password reset email is not configured');
    }

    const startedAt = Date.now();
    const username = dto.username.trim();
    const requestedEmail = this.normalizeEmail(dto.email);
    const recoveryContext = context || this.buildFallbackContext(username, requestedEmail);
    const correlationId = this.buildRecoveryCorrelationId(recoveryContext);

    try {
      const company = await this.prisma.company.findUnique({
        where: { username },
        select: {
          id: true,
          companyName: true,
          managerEmail: true,
          status: true,
          isApproved: true,
        },
      });

      if (
        !company ||
        !this.isRecoverableCompany(company) ||
        this.normalizeEmail(company.managerEmail) !== requestedEmail
      ) {
        this.logPasswordResetRequestRejected(
          recoveryContext,
          correlationId,
          'unmatched_credentials'
        );
        return this.genericResetResponse();
      }

      const canSendMail = await this.canSendRecoveryMail({
        flow: recoveryContext.flow,
        companyId: company.id,
        fingerprint: recoveryContext.fingerprint,
      });

      if (!canSendMail) {
        return this.genericResetResponse();
      }

      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = this.hashToken(rawToken);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.resetTokenTtlMinutes * 60 * 1000);

      const tokenStored = await this.storeResetToken({
        companyId: company.id,
        tokenHash,
        expiresAt,
        now,
        correlationId,
        flow: recoveryContext.flow,
      });

      if (!tokenStored) {
        return this.genericResetResponse();
      }

      this.mailDispatcher.sendPasswordResetLink({
        companyId: company.id,
        to: company.managerEmail,
        companyName: company.companyName,
        resetLink: this.buildResetLink(rawToken, recoveryContext),
        expiresAt,
        fingerprint: recoveryContext.fingerprint,
      });

      this.logPasswordResetLinkIssued(company.id, expiresAt, recoveryContext, correlationId);

      return this.genericResetResponse();
    } finally {
      await this.timing.waitForMinimum(startedAt);
    }
  }

  async confirmReset(dto: ConfirmPasswordResetDto): Promise<PasswordResetResponse> {
    const token = dto.token.trim();
    if (!token) {
      throw new BadRequestException('Invalid password reset token');
    }

    this.assertPasswordPolicy(dto.password);

    const tokenHash = this.hashToken(token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    const now = new Date();
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= now) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptSaltRounds);

    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          id: resetToken.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        throw new BadRequestException('Invalid or expired password reset token');
      }

      await tx.company.update({
        where: { id: resetToken.companyId },
        data: {
          passwordHash,
          updatedAt: now,
        },
      });
    });

    this.logPasswordResetCompleted(resetToken.companyId, tokenHash);

    return {
      success: true,
      message: PASSWORD_RESET_SUCCESS_MESSAGE,
    };
  }

  private genericResetResponse(): PasswordResetResponse {
    return {
      success: true,
      message: GENERIC_RESET_MESSAGE,
    };
  }

  private async canSendRecoveryMail(input: AccountRecoveryMailAllowanceInput): Promise<boolean> {
    try {
      const allowance = await this.rateLimitService.checkMailAllowance(input);
      return allowance.canSendMail;
    } catch {
      return false;
    }
  }

  private async storeResetToken(input: {
    companyId: number;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
    correlationId: string;
    flow: string;
  }): Promise<boolean> {
    try {
      await this.prisma.$transaction([
        this.prisma.passwordResetToken.updateMany({
          where: { companyId: input.companyId, usedAt: null },
          data: { usedAt: input.now },
        }),
        this.prisma.passwordResetToken.create({
          data: {
            companyId: input.companyId,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
          },
        }),
      ]);

      return true;
    } catch (error) {
      this.logPasswordResetTokenStorageFailed(
        input.companyId,
        input.correlationId,
        input.flow,
        this.classifyTokenStorageFailure(error)
      );
      return false;
    }
  }

  private classifyTokenStorageFailure(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2021') {
      return 'password_reset_tokens_missing';
    }

    return 'token_storage_failed';
  }

  private buildResetLink(token: string, context?: AccountRecoveryRequestContext): string {
    const siteUrl = this.resolveResetBaseUrl(context);
    const url = new URL('/reset-password', siteUrl);
    url.hash = new URLSearchParams({ token }).toString();
    return url.toString();
  }

  private resolveResetBaseUrl(context?: AccountRecoveryRequestContext): string {
    if (process.env.NODE_ENV === 'development' && context?.frontendOrigin) {
      const localOrigin = this.parseLocalOrigin(context.frontendOrigin);
      if (localOrigin) {
        return localOrigin;
      }
    }

    return (
      this.configService.get<string>('NEXT_PUBLIC_SITE_URL') ||
      this.configService.get<string>('FRONTEND_URL') ||
      'https://www.yjlaser.net'
    );
  }

  private parseLocalOrigin(origin: string): string | null {
    try {
      const parsed = new URL(origin);
      const hostname = parsed.hostname.toLowerCase();
      if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) {
        return null;
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return null;
      }

      return parsed.origin;
    } catch {
      return null;
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildRecoveryCorrelationId(context: AccountRecoveryRequestContext): string {
    return `password-reset-${hashIdentifier(`${context.flow}:${context.fingerprint}`)}`;
  }

  private buildTokenCorrelationId(tokenHash: string): string {
    return `password-reset-${hashIdentifier(tokenHash)}`;
  }

  private logPasswordResetRequestRejected(
    context: AccountRecoveryRequestContext,
    correlationId: string,
    reason: string
  ): void {
    this.logger.warn(
      formatLogEvent({
        level: 'warn',
        project: 'company_site',
        component: PasswordResetService.name,
        feature: 'auth',
        event: 'password_reset_request_rejected',
        action: 'request_password_reset',
        status: 'failure',
        channel: 'security',
        correlation_id: correlationId,
        actor_type: 'account_recovery_request',
        actor_id_hash: hashIdentifier(context.fingerprint),
        metadata: {
          reason,
          flow: context.flow,
        },
      })
    );
  }

  private logPasswordResetLinkIssued(
    companyId: number,
    expiresAt: Date,
    context: AccountRecoveryRequestContext,
    correlationId: string
  ): void {
    this.logger.log(
      formatLogEvent({
        level: 'info',
        project: 'company_site',
        component: PasswordResetService.name,
        feature: 'auth',
        event: 'password_reset_link_issued',
        action: 'issue_password_reset_link',
        status: 'success',
        channel: 'security',
        correlation_id: correlationId,
        actor_type: 'company',
        actor_id_hash: hashIdentifier(companyId),
        target_type: 'password_reset_token',
        target_id_hash: hashIdentifier(companyId),
        metadata: {
          flow: context.flow,
          expiresAt: expiresAt.toISOString(),
        },
      })
    );
  }

  private logPasswordResetTokenStorageFailed(
    companyId: number,
    correlationId: string,
    flow: string,
    reason: string
  ): void {
    this.logger.error(
      formatLogEvent({
        level: 'error',
        project: 'company_site',
        component: PasswordResetService.name,
        feature: 'auth',
        event: 'password_reset_token_storage_failed',
        action: 'store_password_reset_token',
        status: 'failure',
        channel: 'security',
        correlation_id: correlationId,
        actor_type: 'company',
        actor_id_hash: hashIdentifier(companyId),
        target_type: 'password_reset_token',
        target_id_hash: hashIdentifier(companyId),
        metadata: {
          reason,
          flow,
        },
      })
    );
  }

  private logPasswordResetCompleted(companyId: number, tokenHash: string): void {
    this.logger.log(
      formatLogEvent({
        level: 'info',
        project: 'company_site',
        component: PasswordResetService.name,
        feature: 'auth',
        event: 'password_reset_completed',
        action: 'confirm_password_reset',
        status: 'success',
        channel: 'security',
        correlation_id: this.buildTokenCorrelationId(tokenHash),
        actor_type: 'company',
        actor_id_hash: hashIdentifier(companyId),
        target_type: 'password_reset_token',
        target_id_hash: hashIdentifier(companyId),
        metadata: {
          result: 'password_updated',
        },
      })
    );
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private isRecoverableCompany(company: { status: string | null; isApproved: boolean }): boolean {
    return company.status === 'active' && company.isApproved;
  }

  private buildFallbackContext(username: string, email: string): AccountRecoveryRequestContext {
    return {
      flow: 'find-password',
      ip: 'unknown',
      fingerprint: this.hashToken(`find-password:${username.toLowerCase()}:${email}`),
    };
  }

  private assertPasswordPolicy(password: string): void {
    if (password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const classes = [
      /[a-z]/.test(password),
      /[A-Z]/.test(password),
      /\d/.test(password),
      /[^A-Za-z0-9]/.test(password),
    ].filter(Boolean).length;

    if (classes < 3) {
      throw new BadRequestException('Password does not meet complexity policy');
    }
  }
}
