import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { DeliveryCompaniesService } from './delivery-companies.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { CreateDeliveryCompanyDto } from './dto/create-delivery-company.dto';
import { UpdateDeliveryCompanyDto } from './dto/update-delivery-company.dto';

@Controller('delivery-companies')
@UseGuards(ApiKeyGuard)
export class DeliveryCompaniesController {
  private readonly logger = new Logger(DeliveryCompaniesController.name);

  constructor(private readonly deliveryCompaniesService: DeliveryCompaniesService) {}

  @Get()
  async findByCompanyId(@Query('companyId', ParseBigIntPipe) companyId: bigint) {
    return this.deliveryCompaniesService.findByCompanyId(companyId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateDeliveryCompanyDto) {
    return this.deliveryCompaniesService.create(dto);
  }

  @Patch(':id')
  async update(@Param('id', ParseBigIntPipe) id: bigint, @Body() dto: UpdateDeliveryCompanyDto) {
    return this.deliveryCompaniesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.deliveryCompaniesService.delete(id);
  }
}
