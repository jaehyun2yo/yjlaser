import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequireIntegrationPermission } from '../auth/require-integration-permission.decorator';
import { OrdersService } from './orders.service';
import {
  CreateOrderDto,
  UpdateOrderDto,
  UpdateOrderStatusDto,
  UpdateProcessStageDto,
  OrderQueryDto,
  WorkshopQueryDto,
} from './dto/order.dto';

@Controller('integration/orders')
@UseGuards(ApiKeyGuard)
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get('stats')
  async getStats() {
    return this.ordersService.getOrderStats();
  }

  @Get('workshop')
  async getWorkshopOrders(@Query() query: WorkshopQueryDto) {
    return this.ordersService.getWorkshopOrders(query);
  }

  @Get()
  async getOrders(@Query() query: OrderQueryDto) {
    return this.ordersService.getOrders(query);
  }

  @Get('numbers/next')
  async getNextNumbers() {
    return this.ordersService.getNextNumbers();
  }

  @Get('companies/search')
  async searchCompany(@Query('name') name: string) {
    return this.ordersService.searchCompanyByName(name);
  }

  @Get('process-stages/list')
  async listProcessStages() {
    return {
      stages: [
        { id: 'drawing', label: '도면작업', category: 'office', order: 1 },
        { id: 'sample', label: '샘플제작 및 확인', category: 'office', order: 2 },
        { id: 'drawing_confirmed', label: '도면 확정 및 목형의뢰', category: 'field', order: 3 },
        { id: 'laser', label: '레이저 가공', category: 'field', order: 4 },
        { id: 'cutting', label: '칼 작업', category: 'field', order: 5 },
        { id: 'creasing', label: '오시작업', category: 'field', order: 6 },
        { id: 'delivery', label: '납품', category: 'field', order: 7 },
      ],
      stage_to_status: {
        drawing: 'drawing',
        sample: 'confirmed',
        drawing_confirmed: 'confirmed',
        laser: 'cutting',
        cutting: 'finishing',
        creasing: 'finishing',
        delivery: 'delivered',
      },
    };
  }

  @Get(':id')
  async getOrder(@Param('id') id: string) {
    return this.ordersService.getOrder(id);
  }

  @Post()
  async createOrder(@Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(dto);
  }

  @Patch(':id')
  async updateOrder(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.ordersService.updateOrder(id, dto);
  }

  @Patch(':id/status')
  async updateOrderStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateOrderStatus(id, dto);
  }

  @Get(':id/events')
  async getOrderEvents(@Param('id') id: string) {
    return this.ordersService.getOrderEvents(id);
  }

  @Get(':id/timeline')
  @RequireIntegrationPermission('job/read')
  async getOrderTimeline(@Param('id') id: string) {
    return this.ordersService.getOrderTimeline(id);
  }

  @Get(':id/process-stage')
  async getProcessStage(@Param('id') id: string) {
    return this.ordersService.getProcessStage(id);
  }

  @Patch(':id/process-stage')
  async updateProcessStage(@Param('id') id: string, @Body() dto: UpdateProcessStageDto) {
    return this.ordersService.updateProcessStage(id, dto);
  }
}
