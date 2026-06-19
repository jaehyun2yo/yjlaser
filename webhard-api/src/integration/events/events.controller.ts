import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { EventsService } from './events.service';
import { CreateEventDto, BatchCreateEventDto, EventQueryDto } from './dto/event.dto';
import type { EventEnvelopeDto } from './dto/event-envelope.dto';
import { EventRequestPipe } from './events.request.pipe';

@Controller('integration/events')
@UseGuards(ApiKeyGuard)
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Post()
  async createEvent(@Body(EventRequestPipe) dto: CreateEventDto | EventEnvelopeDto) {
    return this.eventsService.createEvent(dto);
  }

  @Post('batch')
  async createBatchEvents(@Body() dto: BatchCreateEventDto) {
    return this.eventsService.createBatchEvents(dto.events);
  }

  @Get()
  async getEvents(@Query() query: EventQueryDto) {
    return this.eventsService.getEvents(query);
  }
}
