import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountRecoveryMailDispatcher } from './account-recovery-mail.dispatcher';
import { AccountRecoveryRateLimitService } from './account-recovery-rate-limit.service';
import { AccountRecoveryTiming } from './account-recovery-timing.service';
import {
  AccountRecoveryMailAllowanceInput,
  AccountRecoveryRequestContext,
} from './account-recovery.types';
import { FindIdRequestDto } from './dto/find-id.dto';
import { PasswordResetResponse } from './password-reset.service';

const FIND_ID_SUCCESS_MESSAGE =
  '입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 아이디 안내를 보냈습니다.';

@Injectable()
export class FindIdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailDispatcher: AccountRecoveryMailDispatcher,
    private readonly rateLimitService: AccountRecoveryRateLimitService,
    private readonly timing: AccountRecoveryTiming
  ) {}

  async requestReminder(
    dto: FindIdRequestDto,
    context: AccountRecoveryRequestContext
  ): Promise<PasswordResetResponse> {
    if (!this.mailDispatcher.canSendEmail()) {
      throw new ServiceUnavailableException('Account recovery email is not configured');
    }

    const startedAt = Date.now();

    try {
      const companyName = dto.companyName.trim();
      const requestedEmail = this.normalizeEmail(dto.email);
      const requestedPhone = this.normalizePhone(dto.phone);

      const companies = await this.prisma.company.findMany({
        where: { companyName },
        select: {
          id: true,
          companyName: true,
          username: true,
          managerEmail: true,
          managerPhone: true,
          status: true,
          isApproved: true,
        },
      });
      const company = companies.find(
        (candidate) =>
          this.isRecoverableCompany(candidate) &&
          this.normalizeEmail(candidate.managerEmail) === requestedEmail &&
          this.normalizePhone(candidate.managerPhone) === requestedPhone
      );

      if (!company) {
        return this.genericResponse();
      }

      const canSendMail = await this.canSendRecoveryMail({
        flow: context.flow,
        companyId: company.id,
        fingerprint: context.fingerprint,
      });

      if (canSendMail) {
        this.mailDispatcher.sendUsernameReminder({
          companyId: company.id,
          to: company.managerEmail,
          companyName: company.companyName,
          username: company.username,
          fingerprint: context.fingerprint,
        });
      }

      return this.genericResponse();
    } finally {
      await this.timing.waitForMinimum(startedAt);
    }
  }

  private genericResponse(): PasswordResetResponse {
    return {
      success: true,
      message: FIND_ID_SUCCESS_MESSAGE,
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

  private isRecoverableCompany(company: { status: string | null; isApproved: boolean }): boolean {
    return company.status === 'active' && company.isApproved;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }
}
