import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

@Injectable()
export class RecoveryApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = this.getHeaderValue(request, 'x-account-recovery-key');
    const expectedKey = this.getExpectedKey(request);

    if (!providedKey || !expectedKey || !this.safeCompare(providedKey, expectedKey)) {
      throw new ForbiddenException('Invalid account recovery key');
    }

    return true;
  }

  private getHeaderValue(request: Request, headerName: string): string {
    const value = request.headers[headerName];
    if (Array.isArray(value)) {
      return value[0] || '';
    }

    return typeof value === 'string' ? value : '';
  }

  private getExpectedKey(request: Request): string {
    const configuredKey = this.configService.get<string>('ACCOUNT_RECOVERY_API_KEY')?.trim();
    if (configuredKey) {
      return configuredKey;
    }

    return '';
  }

  private safeCompare(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
