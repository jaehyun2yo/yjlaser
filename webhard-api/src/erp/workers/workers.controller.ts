import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { WorkersService } from './workers.service';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { CreateWorkerDto, UpdateWorkerDto, PinLoginDto } from './dto/worker.dto';

@Controller('erp/workers')
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  /**
   * POST /erp/workers/pin-login - PIN login with IP validation (no auth required)
   */
  @Post('pin-login')
  async pinLogin(@Body() dto: PinLoginDto, @Req() req: Request) {
    // Extract client IP from request headers (set by middleware or proxy)
    const clientIp =
      (req.headers['x-client-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.headers['x-real-ip'] as string) ||
      req.ip ||
      '0.0.0.0';

    const userAgent = req.headers['user-agent'] || undefined;

    // Inject IP and user agent into DTO
    dto.ipAddress = clientIp;
    dto.userAgent = userAgent;

    return this.workersService.pinLogin(dto);
  }

  /**
   * GET /erp/workers - Get all workers (admin only)
   */
  @Get()
  @UseGuards(SessionAuthGuard, AdminGuard)
  async getWorkers(@Query('activeOnly') activeOnly?: string) {
    return this.workersService.getWorkers(activeOnly === 'true');
  }

  /**
   * GET /erp/workers/:id - Get single worker (admin only)
   */
  @Get(':id')
  @UseGuards(SessionAuthGuard, AdminGuard)
  async getWorker(@Param('id', ParseUUIDPipe) id: string) {
    return this.workersService.getWorker(id);
  }

  /**
   * POST /erp/workers - Create new worker (admin only)
   */
  @Post()
  @UseGuards(SessionAuthGuard, AdminGuard)
  async createWorker(@Body() dto: CreateWorkerDto) {
    return this.workersService.createWorker(dto);
  }

  /**
   * PATCH /erp/workers/:id - Update worker (admin only)
   */
  @Patch(':id')
  @UseGuards(SessionAuthGuard, AdminGuard)
  async updateWorker(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkerDto) {
    return this.workersService.updateWorker(id, dto);
  }

  /**
   * DELETE /erp/workers/:id - Delete worker (admin only)
   */
  @Delete(':id')
  @UseGuards(SessionAuthGuard, AdminGuard)
  async deleteWorker(@Param('id', ParseUUIDPipe) id: string) {
    await this.workersService.deleteWorker(id);
    return { success: true };
  }
}
