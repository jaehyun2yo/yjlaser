import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { UpsertPushSubscriptionDto } from './dto/upsert-push-subscription.dto';
import { DeletePushSubscriptionDto } from './dto/delete-push-subscription.dto';

@Controller('push-subscriptions')
@UseGuards(ApiKeyGuard)
export class PushSubscriptionsController {
  private readonly logger = new Logger(PushSubscriptionsController.name);

  constructor(private readonly pushSubscriptionsService: PushSubscriptionsService) {}

  @Get()
  async findByWorkerId(@Query('workerId') workerId: string) {
    return this.pushSubscriptionsService.findByWorkerId(workerId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async upsert(@Body() dto: UpsertPushSubscriptionDto) {
    return this.pushSubscriptionsService.upsert(dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async delete(@Body() dto: DeletePushSubscriptionDto) {
    return this.pushSubscriptionsService.delete(dto.workerId, dto.endpoint);
  }
}
