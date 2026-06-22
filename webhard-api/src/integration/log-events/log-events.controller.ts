import { Body, Controller, HttpException, Logger, Post, Req } from '@nestjs/common';
import {
  formatLogEvent,
  generateCorrelationId,
  hashIdentifier,
} from '../../common/logging/log-event';
import {
  LogIngestionAuthVerifier,
  type LogIngestionAuthContext,
  type LogIngestionRequest,
} from './auth/log-ingestion-auth';
import type { LogProject } from './dto/log-event.dto';
import { LogEventBatchDto } from './dto/log-event.dto';
import { LogEventRequestPipe } from './log-event-request.pipe';
import { LogEventsService, type LogEventCollectResponse } from './log-events.service';

@Controller('integration/log-events')
export class LogEventsController {
  private readonly logger = new Logger(LogEventsController.name);

  constructor(
    private readonly authVerifier: LogIngestionAuthVerifier,
    private readonly logEventsService: LogEventsService
  ) {}

  @Post()
  async collect(
    @Req() request: LogIngestionRequest,
    @Body(LogEventRequestPipe) batchPayload: unknown
  ) {
    const batch = batchPayload as LogEventBatchDto;
    const startedAt = Date.now();
    const projects = this.getProjects(batch);
    const correlationId = this.getCorrelationId(batch);
    this.logIngestionStarted(batch, projects, correlationId);

    try {
      const authContext = await this.authVerifier.verifyRequest(request, projects);
      const response = await this.logEventsService.collect(authContext, batch);
      const elapsedMs = Date.now() - startedAt;
      this.logIngestionSucceeded(authContext, batch, response, elapsedMs, correlationId);
      return response;
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      this.logIngestionFailed(error, request, batch, projects, elapsedMs, correlationId);
      throw error;
    }
  }

  private getProjects(batch: LogEventBatchDto): LogProject[] {
    return [...new Set(batch.events.map((event) => event.project))];
  }

  private getCorrelationId(batch: LogEventBatchDto): string {
    return batch.events[0]?.correlation_id || generateCorrelationId('log-ingestion');
  }

  private logIngestionStarted(
    batch: LogEventBatchDto,
    projects: LogProject[],
    correlationId: string
  ): void {
    this.logger.debug(
      formatLogEvent({
        level: 'debug',
        project: 'company_site',
        component: LogEventsController.name,
        feature: 'log_ingestion',
        event: 'log_ingestion_started',
        action: 'collect',
        status: 'start',
        channel: 'audit',
        correlation_id: correlationId,
        count: batch.events.length,
        metadata: {
          event_count: batch.events.length,
          project_count: projects.length,
        },
      })
    );
  }

  private logIngestionSucceeded(
    authContext: LogIngestionAuthContext,
    batch: LogEventBatchDto,
    response: LogEventCollectResponse,
    elapsedMs: number,
    correlationId: string
  ): void {
    this.logger.log(
      formatLogEvent({
        level: 'info',
        project: 'company_site',
        component: LogEventsController.name,
        feature: 'log_ingestion',
        event: 'log_ingestion_succeeded',
        action: 'collect',
        status: 'success',
        channel: 'audit',
        correlation_id: correlationId,
        duration_ms: elapsedMs,
        count: batch.events.length,
        actor_type: 'log_client',
        actor_id_hash: hashIdentifier(authContext.clientId),
        hash_key_version: authContext.hashKeyVersion,
        metadata: {
          event_count: batch.events.length,
          accepted: response.accepted,
          duplicate: response.duplicate,
          rejected: response.rejected,
          conflict: response.conflict,
        },
      })
    );
  }

  private logIngestionFailed(
    error: unknown,
    request: LogIngestionRequest,
    batch: LogEventBatchDto,
    projects: LogProject[],
    elapsedMs: number,
    correlationId: string
  ): void {
    const errorCode = this.getErrorCode(error);
    const clientIdHash = this.getClientIdHash(request);
    this.logger.warn(
      formatLogEvent({
        level: 'warn',
        project: 'company_site',
        component: LogEventsController.name,
        feature: 'log_ingestion',
        event: 'log_ingestion_failed',
        action: 'collect',
        status: 'failure',
        channel: errorCode?.startsWith('LOG_') ? 'security' : 'error',
        correlation_id: correlationId,
        duration_ms: elapsedMs,
        count: batch.events.length,
        actor_type: clientIdHash ? 'log_client' : undefined,
        actor_id_hash: clientIdHash,
        error_type: this.getErrorName(error),
        error_code: errorCode,
        metadata: {
          event_count: batch.events.length,
          project_count: projects.length,
        },
      })
    );
  }

  private getErrorName(error: unknown): string {
    return error instanceof Error ? error.name : typeof error;
  }

  private getErrorCode(error: unknown): string | undefined {
    if (!(error instanceof HttpException)) {
      return undefined;
    }

    const response = error.getResponse();
    if (isRecord(response) && typeof response.code === 'string') {
      return response.code;
    }

    return undefined;
  }

  private getClientIdHash(request: LogIngestionRequest): string | undefined {
    const value = this.getHeader(request, 'x-log-client-id');
    return value ? hashIdentifier(value) : undefined;
  }

  private getHeader(request: LogIngestionRequest, name: string): string | undefined {
    const directValue = request.headers[name];
    const value =
      directValue ??
      Object.entries(request.headers).find(([key]) => key.toLowerCase() === name)?.[1];

    if (Array.isArray(value)) {
      return value[0];
    }

    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
