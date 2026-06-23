import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import type { ClassConstructor } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateEventDto } from './dto/event.dto';
import { EventEnvelopeDto } from './dto/event-envelope.dto';

@Injectable()
export class EventRequestPipe implements PipeTransform {
  transform(value: unknown): CreateEventDto | EventEnvelopeDto {
    const payload = this.toPayload(value);
    const dtoClass: ClassConstructor<CreateEventDto | EventEnvelopeDto> =
      this.isEventEnvelopePayload(payload) ? EventEnvelopeDto : CreateEventDto;
    const dto = plainToInstance(dtoClass, payload);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    return dto;
  }

  private toPayload(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new BadRequestException('Event request body must be an object');
    }

    return value as Record<string, unknown>;
  }

  private isEventEnvelopePayload(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && 'idempotency_key' in value;
  }
}
