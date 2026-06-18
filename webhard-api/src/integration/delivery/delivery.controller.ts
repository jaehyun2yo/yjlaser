import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { DeliveryService } from './delivery.service';
import {
  CreateDeliveryDto,
  UpdateDeliveryDto,
  UpdateDeliveryStatusDto,
  DeliveryQueryDto,
} from './dto/delivery.dto';

@Controller('integration/deliveries')
@UseGuards(ApiKeyGuard)
export class DeliveryController {
  constructor(private deliveryService: DeliveryService) {}

  @Get('schedule')
  async getSchedule(@Query('dateFrom') dateFrom: string, @Query('dateTo') dateTo: string) {
    return this.deliveryService.getDeliverySchedule(dateFrom, dateTo);
  }

  @Get()
  async getDeliveries(@Query() query: DeliveryQueryDto) {
    return this.deliveryService.getDeliveries(query);
  }

  @Get(':id')
  async getDelivery(@Param('id') id: string) {
    return this.deliveryService.getDelivery(id);
  }

  @Post()
  async createDelivery(@Body() dto: CreateDeliveryDto) {
    return this.deliveryService.createDelivery(dto);
  }

  @Patch(':id')
  async updateDelivery(@Param('id') id: string, @Body() dto: UpdateDeliveryDto) {
    return this.deliveryService.updateDelivery(id, dto);
  }

  @Patch(':id/status')
  async updateDeliveryStatus(@Param('id') id: string, @Body() dto: UpdateDeliveryStatusDto) {
    return this.deliveryService.updateDeliveryStatus(id, dto);
  }
}
