import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { MachinesService } from './machines.service';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { CreateMachineDto, UpdateMachineDto } from './dto/machine.dto';

@Controller('erp/machines')
@UseGuards(SessionAuthGuard)
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  /**
   * GET /erp/machines - Get all machines
   */
  @Get()
  async getMachines(@Query('activeOnly') activeOnly?: string) {
    return this.machinesService.getMachines(activeOnly === 'true');
  }

  /**
   * GET /erp/machines/:id - Get single machine
   */
  @Get(':id')
  async getMachine(@Param('id', ParseUUIDPipe) id: string) {
    return this.machinesService.getMachine(id);
  }

  /**
   * POST /erp/machines - Create new machine (admin only)
   */
  @Post()
  @UseGuards(AdminGuard)
  async createMachine(@Body() dto: CreateMachineDto) {
    return this.machinesService.createMachine(dto);
  }

  /**
   * PATCH /erp/machines/:id - Update machine (admin only)
   */
  @Patch(':id')
  @UseGuards(AdminGuard)
  async updateMachine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMachineDto,
  ) {
    return this.machinesService.updateMachine(id, dto);
  }

  /**
   * DELETE /erp/machines/:id - Delete machine (admin only)
   */
  @Delete(':id')
  @UseGuards(AdminGuard)
  async deleteMachine(@Param('id', ParseUUIDPipe) id: string) {
    await this.machinesService.deleteMachine(id);
    return { success: true };
  }
}
