import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AccountRecoveryRateLimitService } from './account-recovery-rate-limit.service';
import { buildAccountRecoveryContext } from './account-recovery-context';
import { ConfirmPasswordResetDto, RequestPasswordResetDto } from './dto/password-reset.dto';
import { RecoveryApiKeyGuard } from './guards/recovery-api-key.guard';
import { PasswordResetResponse, PasswordResetService } from './password-reset.service';

@Controller('auth/password-reset')
@UseGuards(RecoveryApiKeyGuard)
export class PasswordResetController {
  constructor(
    private readonly passwordResetService: PasswordResetService,
    private readonly rateLimitService: AccountRecoveryRateLimitService
  ) {}

  @Post('request')
  @HttpCode(HttpStatus.OK)
  async requestReset(
    @Body() dto: RequestPasswordResetDto,
    @Req() request: Request
  ): Promise<PasswordResetResponse> {
    const context = buildAccountRecoveryContext(request, 'find-password');
    await this.rateLimitService.checkPreLookup(context);
    return this.passwordResetService.requestReset(dto, context);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirmReset(@Body() dto: ConfirmPasswordResetDto): Promise<PasswordResetResponse> {
    return this.passwordResetService.confirmReset(dto);
  }
}
