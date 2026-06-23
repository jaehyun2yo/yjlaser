import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  PipeTransform,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { formatLogEvent, generateCorrelationId } from '../../common/logging/log-event';
import { LogEventBatchDto } from './dto/log-event.dto';
import { scanRawLogPayload } from './raw-sensitive-scanner';

@Injectable()
export class LogEventRequestPipe implements PipeTransform {
  private readonly logger = new Logger(LogEventRequestPipe.name);

  transform(value: unknown): LogEventBatchDto {
    const payload = this.toPayload(value);
    const scanResult = scanRawLogPayload(payload);

    if (!scanResult.ok) {
      this.logPayloadRejected(scanResult.code, {
        reason: scanResult.reason,
        match_count: scanResult.match_count,
      });
      throw new BadRequestException({
        code: scanResult.code,
        message: scanResult.code,
        reason: scanResult.reason,
        match_count: scanResult.match_count,
      });
    }

    if (Array.isArray(payload.events) && payload.events.length > 100) {
      this.logPayloadRejected('LOG_BATCH_TOO_LARGE', {
        reason: 'batch_too_large',
        event_count: payload.events.length,
      });
      throw new PayloadTooLargeException({
        code: 'LOG_BATCH_TOO_LARGE',
        message: 'LOG_BATCH_TOO_LARGE',
      });
    }

    const dto = plainToInstance(LogEventBatchDto, payload);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    if (errors.length > 0) {
      this.logPayloadRejected('LOG_INVALID_REQUEST', {
        reason: 'validation_failed',
        validation_error_count: errors.length,
      });
      throw new BadRequestException({
        code: 'LOG_INVALID_REQUEST',
        message: 'LOG_INVALID_REQUEST',
        validation_error_count: errors.length,
      });
    }

    return dto;
  }

  private toPayload(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.logPayloadRejected('LOG_INVALID_REQUEST', {
        reason: 'body_not_object',
      });
      throw new BadRequestException({
        code: 'LOG_INVALID_REQUEST',
        message: 'LOG_INVALID_REQUEST',
      });
    }

    return value as Record<string, unknown>;
  }

  private logPayloadRejected(errorCode: string, metadata: Record<string, unknown>): void {
    this.logger.warn(
      formatLogEvent({
        level: 'warn',
        project: 'company_site',
        component: LogEventRequestPipe.name,
        feature: 'log_ingestion',
        event: 'log_event_payload_rejected',
        action: 'validate',
        status: 'failure',
        channel: 'security',
        correlation_id: generateCorrelationId('log-ingestion'),
        error_code: errorCode,
        count: typeof metadata.match_count === 'number' ? metadata.match_count : undefined,
        metadata,
      })
    );
  }
}
