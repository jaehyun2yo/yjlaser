import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountRecoveryMailAllowance,
  AccountRecoveryMailAllowanceInput,
  AccountRecoveryRequestContext,
} from './account-recovery.types';

interface UpstashPipelineResult {
  result?: unknown;
  error?: string;
}

const RATE_LIMIT_MESSAGE = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
const UNAVAILABLE_MESSAGE = '계정 복구 요청을 처리할 수 없습니다. 관리자에게 문의해주세요.';

@Injectable()
export class AccountRecoveryRateLimitService {
  private readonly logger = new Logger(AccountRecoveryRateLimitService.name);

  constructor(private readonly configService: ConfigService) {}

  async checkPreLookup(context: AccountRecoveryRequestContext): Promise<void> {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    const [ipAllowed, fingerprintAllowed] = await Promise.all([
      this.incrementFixedWindow(`pre:${context.flow}:ip:${context.ip}`, 15 * 60, 5),
      this.incrementFixedWindow(
        `pre:${context.flow}:fingerprint:${context.fingerprint}`,
        60 * 60,
        3
      ),
    ]);

    if (!ipAllowed || !fingerprintAllowed) {
      throw new HttpException(RATE_LIMIT_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async checkMailAllowance(
    input: AccountRecoveryMailAllowanceInput
  ): Promise<AccountRecoveryMailAllowance> {
    if (process.env.NODE_ENV !== 'production') {
      return { canSendMail: true };
    }

    const cooldownAllowed = await this.setCooldown(
      `send:${input.flow}:cooldown:${input.companyId}`,
      10 * 60
    );
    const dayAllowed = await this.incrementFixedWindow(
      `send:${input.flow}:day:${input.companyId}`,
      24 * 60 * 60,
      5
    );

    return { canSendMail: cooldownAllowed && dayAllowed };
  }

  private async incrementFixedWindow(
    key: string,
    ttlSeconds: number,
    limit: number
  ): Promise<boolean> {
    const result = await this.upstashPipeline([
      ['INCR', key],
      ['EXPIRE', key, String(ttlSeconds), 'NX'],
    ]);
    const count = Number(result[0]?.result || 0);

    return count <= limit;
  }

  private async setCooldown(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.upstashPipeline([['SET', key, '1', 'EX', String(ttlSeconds), 'NX']]);
    return result[0]?.result === 'OK';
  }

  private async upstashPipeline(commands: string[][]): Promise<UpstashPipelineResult[]> {
    const url = this.configService.get<string>('UPSTASH_REDIS_REST_URL');
    const token = this.configService.get<string>('UPSTASH_REDIS_REST_TOKEN');
    const fingerprintSecret = this.configService.get<string>('ACCOUNT_RECOVERY_RATE_LIMIT_SECRET');

    if (!url || !token || !fingerprintSecret) {
      this.logger.error('Account recovery Upstash config is missing');
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }

    try {
      const response = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
      });

      if (!response.ok) {
        this.logger.error('Account recovery Upstash pipeline failed', {
          status: response.status,
        });
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }

      const data = (await response.json()) as unknown;
      if (!Array.isArray(data)) {
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }

      const results = data as UpstashPipelineResult[];
      if (results.some((item) => item.error)) {
        this.logger.error('Account recovery Upstash command returned error');
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }

      return results;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.error('Account recovery Upstash request failed', error);
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
  }
}
