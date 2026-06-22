import { Module } from '@nestjs/common';
import {
  InMemoryLogIngestionKeyStore,
  InMemoryLogIngestionRateLimiter,
  InMemoryLogIngestionReplayStore,
  LOG_INGESTION_AUTH_OPTIONS,
  LOG_INGESTION_KEY_STORE,
  LOG_INGESTION_RATE_LIMITER,
  LOG_INGESTION_REPLAY_STORE,
  LogIngestionAuthVerifier,
} from './auth/log-ingestion-auth';
import { LogEventsController } from './log-events.controller';
import { LogEventsService } from './log-events.service';
import {
  InMemoryLogEventRepository,
  LOG_EVENT_REPOSITORY,
} from './repositories/log-event.repository';

@Module({
  controllers: [LogEventsController],
  providers: [
    LogEventsService,
    LogIngestionAuthVerifier,
    {
      provide: LOG_EVENT_REPOSITORY,
      useClass: InMemoryLogEventRepository,
    },
    {
      provide: LOG_INGESTION_KEY_STORE,
      useValue: new InMemoryLogIngestionKeyStore(),
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
