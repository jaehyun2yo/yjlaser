import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MachineResponseDto,
  MachineListResponseDto,
  CreateMachineDto,
  UpdateMachineDto,
} from './dto/machine.dto';

@Injectable()
export class MachinesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all machines
   */
  async getMachines(activeOnly: boolean = false): Promise<MachineListResponseDto> {
    const where = activeOnly ? { status: 'active' } : {};

    const machines = await this.prisma.executeWithRetry(
      () =>
        this.prisma.machine.findMany({
          where,
          orderBy: [{ type: 'asc' }, { name: 'asc' }],
        }),
      { operationName: 'getMachines' },
    );

    return {
      machines: machines.map(this.mapToDto),
      total: machines.length,
    };
  }

  /**
   * Get machine by ID
   */
  async getMachine(id: string): Promise<MachineResponseDto> {
    const machine = await this.prisma.executeWithRetry(
      () => this.prisma.machine.findUnique({ where: { id } }),
      { operationName: 'getMachine' },
    );

    if (!machine) {
      throw new NotFoundException('Machine not found');
    }

    return this.mapToDto(machine);
  }

  /**
   * Create new machine
   */
  async createMachine(dto: CreateMachineDto): Promise<MachineResponseDto> {
    // Check for duplicate name
    const existing = await this.prisma.machine.findFirst({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Machine with this name already exists');
    }

    const machine = await this.prisma.executeWithRetry(
      () =>
        this.prisma.machine.create({
          data: {
            name: dto.name,
            type: dto.type,
            description: dto.description,
          },
        }),
      { operationName: 'createMachine' },
    );

    return this.mapToDto(machine);
  }

  /**
   * Update machine
   */
  async updateMachine(id: string, dto: UpdateMachineDto): Promise<MachineResponseDto> {
    const existing = await this.prisma.machine.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Machine not found');
    }

    // Check for duplicate name if name is being updated
    if (dto.name && dto.name !== existing.name) {
      const duplicate = await this.prisma.machine.findFirst({
        where: { name: dto.name, id: { not: id } },
      });
      if (duplicate) {
        throw new ConflictException('Machine with this name already exists');
      }
    }

    const machine = await this.prisma.executeWithRetry(
      () =>
        this.prisma.machine.update({
          where: { id },
          data: {
            name: dto.name,
            type: dto.type,
            status: dto.status,
            description: dto.description,
          },
        }),
      { operationName: 'updateMachine' },
    );

    return this.mapToDto(machine);
  }

  /**
   * Delete machine
   */
  async deleteMachine(id: string): Promise<void> {
    const existing = await this.prisma.machine.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Machine not found');
    }

    await this.prisma.executeWithRetry(
      () => this.prisma.machine.delete({ where: { id } }),
      { operationName: 'deleteMachine' },
    );
  }

  /**
   * Map database model to DTO
   */
  private mapToDto = (machine: {
    id: string;
    name: string;
    type: string;
    status: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): MachineResponseDto => ({
    id: machine.id,
    name: machine.name,
    type: machine.type,
    status: machine.status,
    description: machine.description,
    created_at: machine.createdAt.toISOString(),
    updated_at: machine.updatedAt.toISOString(),
  });
}
