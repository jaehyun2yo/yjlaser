import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HeartbeatDto } from './dto/program.dto';

const OFFLINE_THRESHOLD_MS = 120 * 1000; // 120초

@Injectable()
export class ProgramsService {
  private readonly logger = new Logger(ProgramsService.name);

  constructor(private prisma: PrismaService) {}

  async receiveHeartbeat(dto: HeartbeatDto) {
    const heartbeat = await this.prisma.executeWithRetry(
      () =>
        this.prisma.programHeartbeat.upsert({
          where: {
            programType_instanceName: {
              programType: dto.programType,
              instanceName: dto.instanceName,
            },
          },
          update: {
            status: 'online',
            version: dto.version ?? undefined,
            hostname: dto.hostname ?? undefined,
            lastSeenAt: new Date(),
            metadata: dto.metadata ? (dto.metadata as object) : undefined,
          },
          create: {
            programType: dto.programType,
            instanceName: dto.instanceName,
            status: 'online',
            version: dto.version ?? null,
            hostname: dto.hostname ?? null,
            lastSeenAt: new Date(),
            metadata: dto.metadata ? (dto.metadata as object) : undefined,
          },
        }),
      { operationName: 'receiveHeartbeat' }
    );

    return {
      id: heartbeat.id,
      program_type: heartbeat.programType,
      instance_name: heartbeat.instanceName,
      status: 'online',
      last_seen_at: heartbeat.lastSeenAt.toISOString(),
    };
  }

  async listPrograms() {
    const programs = await this.prisma.executeWithRetry(
      () =>
        this.prisma.programHeartbeat.findMany({
          orderBy: { programType: 'asc' },
        }),
      { operationName: 'listPrograms' }
    );

    const now = Date.now();
    return programs.map((p) => {
      const isOnline = now - p.lastSeenAt.getTime() < OFFLINE_THRESHOLD_MS;
      return {
        id: p.id,
        program_type: p.programType,
        instance_name: p.instanceName,
        status: isOnline ? 'online' : 'offline',
        version: p.version,
        hostname: p.hostname,
        last_seen_at: p.lastSeenAt.toISOString(),
        metadata: p.metadata,
        created_at: p.createdAt.toISOString(),
      };
    });
  }
}
