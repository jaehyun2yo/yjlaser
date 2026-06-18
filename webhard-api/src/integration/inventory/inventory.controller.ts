import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { InventoryService } from './inventory.service';
import {
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
  StockInDto,
  StockOutDto,
  StockAdjustDto,
  InventoryQueryDto,
  TransactionQueryDto,
} from './dto/inventory.dto';

@Controller('integration/inventory')
@UseGuards(ApiKeyGuard)
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get('alerts')
  async getLowStockAlerts() {
    return this.inventoryService.getLowStockAlerts();
  }

  @Get('items')
  async getItems(@Query() query: InventoryQueryDto) {
    return this.inventoryService.getItems(query);
  }

  @Get('items/:id')
  async getItem(@Param('id') id: string) {
    return this.inventoryService.getItem(id);
  }

  @Post('items')
  async createItem(@Body() dto: CreateInventoryItemDto) {
    return this.inventoryService.createItem(dto);
  }

  @Patch('items/:id')
  async updateItem(@Param('id') id: string, @Body() dto: UpdateInventoryItemDto) {
    return this.inventoryService.updateItem(id, dto);
  }

  @Post('items/:id/in')
  async stockIn(@Param('id') id: string, @Body() dto: StockInDto) {
    return this.inventoryService.stockIn(id, dto);
  }

  @Post('items/:id/out')
  async stockOut(@Param('id') id: string, @Body() dto: StockOutDto) {
    return this.inventoryService.stockOut(id, dto);
  }

  @Post('items/:id/adjust')
  async stockAdjust(@Param('id') id: string, @Body() dto: StockAdjustDto) {
    return this.inventoryService.stockAdjust(id, dto);
  }

  @Get('items/:id/transactions')
  async getTransactions(@Param('id') id: string, @Query() query: TransactionQueryDto) {
    return this.inventoryService.getTransactions(id, query);
  }
}
