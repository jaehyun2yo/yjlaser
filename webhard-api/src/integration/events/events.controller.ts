import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { DeviceEndpointPolicyGuard } from '../auth/device-endpoint-policy.guard';
import {
  CurrentIntegrationPrincipal,
  type CurrentIntegrationPrincipalValue,
} from '../auth/current-integration-principal.decorator';
import { IntegrationPrincipalSourceGuard } from '../auth/integration-principal-source.guard';
import { RequireDeviceEndpointPolicy } from '../auth/require-device-endpoint-policy.decorator';
import { EventsService } from './events.service';
import { CreateEventDto, BatchCreateEventDto, EventQueryDto } from './dto/event.dto';
import type { EventEnvelopeDto } from './dto/event-envelope.dto';
import { EventRequestPipe } from './events.request.pipe';

@Controller('integration/events')
@UseGuards(IntegrationPrincipalSourceGuard, DeviceEndpointPolicyGuard)
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Post()
  @RequireDeviceEndpointPolicy('POST', '/integration/events')
  async createEvent(
    @Body(EventRequestPipe) dto: CreateEventDto | EventEnvelopeDto,
    @CurrentIntegrationPrincipal() principal: CurrentIntegrationPrincipalValue
  ) {
    if (principal.mode === 'device_bearer') {
      return this.eventsService.createEventForDevice(dto, principal.device);
    }
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
