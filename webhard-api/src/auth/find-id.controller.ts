import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AccountRecoveryRateLimitService } from './account-recovery-rate-limit.service';
import { buildAccountRecoveryContext } from './account-recovery-context';
import { FindIdRequestDto } from './dto/find-id.dto';
import { RecoveryApiKeyGuard } from './guards/recovery-api-key.guard';
import { FindIdService } from './find-id.service';
import { PasswordResetResponse } from './password-reset.service';

@Controller('auth/find-id')
@UseGuards(RecoveryApiKeyGuard)
export class FindIdController {
  constructor(
    private readonly findIdService: FindIdService,
    private readonly rateLimitService: AccountRecoveryRateLimitService
  ) {}

  @Post('request')
  @HttpCode(HttpStatus.OK)
  async requestReminder(
    @Body() dto: FindIdRequestDto,
    @Req() request: Request
  ): Promise<PasswordResetResponse> {
    const context = buildAccountRecoveryContext(request, 'find-id');
    await this.rateLimitService.checkPreLookup(context);
    return this.findIdService.requestReminder(dto, context);
  }
}
