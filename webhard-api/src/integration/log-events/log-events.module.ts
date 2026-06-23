import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import {
  InMemoryLogIngestionKeyStore,
  InMemoryLogIngestionRateLimiter,
  InMemoryLogIngestionReplayStore,
  LOG_INGESTION_AUTH_OPTIONS,
  LOG_INGESTION_KEY_STORE,
  LOG_INGESTION_RATE_LIMITER,
  LOG_INGESTION_REPLAY_STORE,
  LogIngestionAuthVerifier,
  parseLogIngestionClientKeys,
} from './auth/log-ingestion-auth';
import { LogEventsController } from './log-events.controller';
import { LogEventsService } from './log-events.service';
import {
  InMemoryLogEventRepository,
  LOG_EVENT_REPOSITORY,
} from './repositories/log-event.repository';
import { PrismaLogEventRepository } from './repositories/prisma-log-event.repository';
import { LogEventRequestPipe } from './log-event-request.pipe';

@Module({
  imports: [ConfigModule],
  controllers: [LogEventsController],
  providers: [
    LogEventsService,
    LogEventRequestPipe,
    LogIngestionAuthVerifier,
    {
      provide: LOG_EVENT_REPOSITORY,
      useFactory: (configService: ConfigService, moduleRef: ModuleRef) => {
        if (shouldUseInMemoryLogEventRepository(configService)) {
          return new InMemoryLogEventRepository();
        }

        const prisma = moduleRef.get(PrismaService, { strict: false });
        return new PrismaLogEventRepository(prisma);
      },
      inject: [ConfigService, ModuleRef],
    },
    {
      provide: LOG_INGESTION_KEY_STORE,
      useFactory: (configService: ConfigService) => {
        return new InMemoryLogIngestionKeyStore(
          parseLogIngestionClientKeys(configService.get<string>('LOG_INGESTION_CLIENT_KEYS_JSON'))
        );
      },
      inject: [ConfigService],
    },
    {
      provide: LOG_INGESTION_REPLAY_STORE,
      useClass: InMemoryLogIngestionReplayStore,
    },
    {
      provide: LOG_INGESTION_RATE_LIMITER,
      useValue: new InMemoryLogIngestionRateLimiter({
        maxRequests: 60,
        windowMs: 60_000,
      }),
    },
    {
      provide: LOG_INGESTION_AUTH_OPTIONS,
      useValue: { allowedClockSkewMs: 300_000 },
    },
  ],
  exports: [LogEventsService],
})
export class LogEventsModule {}

function shouldUseInMemoryLogEventRepository(configService: ConfigService): boolean {
  const configured = configService.get<string>('LOG_EVENT_PERSISTENCE')?.trim().toLowerCase();

  if (configured === 'memory') {
    return true;
  }

  if (configured === 'database' || configured === 'db') {
    return false;
  }

  return process.env.NODE_ENV === 'test';
}
