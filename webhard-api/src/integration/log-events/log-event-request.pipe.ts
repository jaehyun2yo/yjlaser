import { BadRequestException, Injectable, Logger, PipeTransform } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LogEventBatchDto } from './dto/log-event.dto';
import { scanRawLogPayload } from './raw-sensitive-scanner';

@Injectable()
export class LogEventRequestPipe implements PipeTransform {
  private readonly logger = new Logger(LogEventRequestPipe.name);

  transform(value: unknown): LogEventBatchDto {
    const payload = this.toPayload(value);
    const scanResult = scanRawLogPayload(payload);

    if (!scanResult.ok) {
      this.logger.warn(
        `Log event raw payload rejected: code=${scanResult.code}, reason=${scanResult.reason}, matchCount=${scanResult.match_count}`
      );
      throw new BadRequestException({
        code: scanResult.code,
        message: scanResult.code,
        reason: scanResult.reason,
        match_count: scanResult.match_count,
      });
    }

    const dto = plainToInstance(LogEventBatchDto, payload);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    if (errors.length > 0) {
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
      throw new BadRequestException({
        code: 'LOG_INVALID_REQUEST',
        message: 'LOG_INVALID_REQUEST',
      });
    }

    return value as Record<string, unknown>;
  }
}
