import { Body, Controller, Logger, Post, Req } from '@nestjs/common';
import { LogIngestionAuthVerifier, type LogIngestionRequest } from './auth/log-ingestion-auth';
import type { LogProject } from './dto/log-event.dto';
import { LogEventBatchDto } from './dto/log-event.dto';
import { LogEventRequestPipe } from './log-event-request.pipe';
import { LogEventsService } from './log-events.service';

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
    this.logger.debug(
      `Log ingestion started: eventCount=${batch.events.length}, projectCount=${projects.length}`
    );

    try {
      const authContext = await this.authVerifier.verifyRequest(request, projects);
      const response = await this.logEventsService.collect(authContext, batch);
      const elapsedMs = Date.now() - startedAt;
      this.logger.log(
        `Log ingestion succeeded: clientId=${authContext.clientId}, eventCount=${batch.events.length}, accepted=${response.accepted}, duplicate=${response.duplicate}, elapsedMs=${elapsedMs}`
      );
      return response;
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      this.logger.warn(
        `Log ingestion failed: eventCount=${batch.events.length}, projectCount=${projects.length}, elapsedMs=${elapsedMs}, error=${this.getErrorName(error)}`
      );
      throw error;
    }
  }

  private getProjects(batch: LogEventBatchDto): LogProject[] {
    return [...new Set(batch.events.map((event) => event.project))];
  }

  private getErrorName(error: unknown): string {
    return error instanceof Error ? error.name : typeof error;
  }
}
