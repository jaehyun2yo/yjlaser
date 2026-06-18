import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { EventsService } from './events.service';
import { CreateEventDto, BatchCreateEventDto, EventQueryDto } from './dto/event.dto';

@Controller('integration/events')
@UseGuards(ApiKeyGuard)
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Post()
  async createEvent(@Body() dto: CreateEventDto) {
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
