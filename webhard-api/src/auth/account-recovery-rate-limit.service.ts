import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatLogEvent, generateCorrelationId } from '../common/logging/log-event';
import {
  AccountRecoveryMailAllowance,
  AccountRecoveryMailAllowanceInput,
  AccountRecoveryRequestContext,
} from './account-recovery.types';

interface UpstashPipelineResult {
  result?: unknown;
  error?: string;
}

type AccountRecoveryRateLimitOperation = 'fixed_window' | 'cooldown';

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
    const result = await this.upstashPipeline(
      [
        ['INCR', key],
        ['EXPIRE', key, String(ttlSeconds), 'NX'],
      ],
      'fixed_window'
    );
    const count = Number(result[0]?.result || 0);

    return count <= limit;
  }

  private async setCooldown(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.upstashPipeline(
      [['SET', key, '1', 'EX', String(ttlSeconds), 'NX']],
      'cooldown'
    );
    return result[0]?.result === 'OK';
  }

  private async upstashPipeline(
    commands: string[][],
    operation: AccountRecoveryRateLimitOperation
  ): Promise<UpstashPipelineResult[]> {
    const url = this.configService.get<string>('UPSTASH_REDIS_REST_URL');
    const token = this.configService.get<string>('UPSTASH_REDIS_REST_TOKEN');
    const fingerprintSecret = this.configService.get<string>('ACCOUNT_RECOVERY_RATE_LIMIT_SECRET');

    if (!url || !token || !fingerprintSecret) {
      this.logRateLimitFailure({
        errorCode: 'ACCOUNT_RECOVERY_RATE_LIMIT_CONFIG_MISSING',
        reason: 'config_missing',
        operation,
        commandCount: commands.length,
      });
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
        this.logRateLimitFailure({
          errorCode: 'ACCOUNT_RECOVERY_RATE_LIMIT_UPSTASH_HTTP_ERROR',
          reason: 'upstash_http_error',
          operation,
          commandCount: commands.length,
          upstashStatus: response.status,
        });
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }

      const data = (await response.json()) as unknown;
      if (!Array.isArray(data)) {
        this.logRateLimitFailure({
          errorCode: 'ACCOUNT_RECOVERY_RATE_LIMIT_UPSTASH_INVALID_RESPONSE',
          reason: 'upstash_invalid_response',
          operation,
          commandCount: commands.length,
        });
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }

      const results = data as UpstashPipelineResult[];
      if (results.some((item) => item.error)) {
        this.logRateLimitFailure({
          errorCode: 'ACCOUNT_RECOVERY_RATE_LIMIT_UPSTASH_COMMAND_ERROR',
          reason: 'upstash_command_error',
          operation,
          commandCount: commands.length,
        });
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }

      return results;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logRateLimitFailure({
        errorCode: 'ACCOUNT_RECOVERY_RATE_LIMIT_UPSTASH_REQUEST_FAILED',
        reason: 'upstash_request_failed',
        operation,
        commandCount: commands.length,
        error,
      });
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
  }

  private logRateLimitFailure(input: {
    errorCode: string;
    reason: string;
    operation: AccountRecoveryRateLimitOperation;
    commandCount: number;
    upstashStatus?: number;
    error?: unknown;
  }): void {
    const errorType = input.error instanceof Error ? input.error.name : undefined;
    this.logger.error(
      formatLogEvent({
        level: 'error',
        project: 'company_site',
        component: AccountRecoveryRateLimitService.name,
        feature: 'auth',
        event: 'account_recovery_rate_limit_failed',
        action: 'enforce_rate_limit',
        status: 'failure',
        channel: 'security',
        correlation_id: generateCorrelationId('account-recovery'),
        count: input.commandCount,
        error_code: input.errorCode,
        error_type: errorType,
        metadata: {
          reason: input.reason,
          operation: input.operation,
          command_count: input.commandCount,
          upstash_status: input.upstashStatus,
          error_type: errorType,
        },
      })
    );
  }
}
