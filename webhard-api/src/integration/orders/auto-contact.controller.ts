import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { OrdersService } from './orders.service';

@Controller('integration/contacts')
@UseGuards(ApiKeyGuard)
export class AutoContactController {
  constructor(private ordersService: OrdersService) {}

  @Post('auto')
  async createAutoContact(
    @Body()
    dto: {
      inquiry_title: string;
      company_name: string;
      phone?: string;
      email?: string;
      drawing_notes?: string;
    }
  ) {
    return this.ordersService.createAutoContact({
      inquiry_title: dto.inquiry_title,
      company_name: dto.company_name,
      phone: dto.phone || '-',
      email: dto.email || 'auto@yjlaser.com',
      drawing_notes: dto.drawing_notes || '',
    });
  }
}
