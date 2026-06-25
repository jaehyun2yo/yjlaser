import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactsService } from '../../contacts/contacts.service';
import { CompleteLaserCompletionsDto } from './dto/laser-completion.dto';

type LaserCompletionStatus =
  | 'completed'
  | 'already_completed'
  | 'not_found'
  | 'not_laser_only'
  | 'failed';

export interface LaserCompletionResult {
  workNumber: string;
  status: LaserCompletionStatus;
  contactId?: string;
  message: string;
}

export interface LaserCompletionSummary {
  requested: number;
  completed: number;
  alreadyCompleted: number;
  notFound: number;
  skipped: number;
  failed: number;
}

export interface LaserCompletionResponse {
  success: boolean;
  summary: LaserCompletionSummary;
  results: LaserCompletionResult[];
}

interface LaserCompletionContact {
  id: string;
  inquiryType: string | null;
  status: string | null;
  processStage: string | null;
}

interface ContactStageUpdateResult {
  process_stage?: string | null;
  status?: string | null;
  status_changed?: boolean;
}

@Injectable()
export class LaserCompletionsService {
  private readonly logger = new Logger(LaserCompletionsService.name);

  constructor(
    private prisma: PrismaService,
    private contactsService: ContactsService
  ) {}

  async completeByWorkNumbers(dto: CompleteLaserCompletionsDto): Promise<LaserCompletionResponse> {
    const workNumbers = this.dedupeWorkNumbers(dto.workNumbers);
    const summary: LaserCompletionSummary = {
      requested: workNumbers.length,
      completed: 0,
      alreadyCompleted: 0,
      notFound: 0,
      skipped: 0,
      failed: 0,
    };

    const results: LaserCompletionResult[] = [];

    for (const workNumber of workNumbers) {
      const result = await this.completeOne(workNumber, dto);
      this.applySummary(summary, result.status);
      results.push(result);
    }

    return {
      success: summary.failed === 0,
      summary,
      results,
    };
  }

  private async completeOne(
    workNumber: string,
    dto: CompleteLaserCompletionsDto
  ): Promise<LaserCompletionResult> {
    let contact: LaserCompletionContact | null = null;

    try {
      contact = await this.prisma.executeWithRetry(
        () =>
          this.prisma.contact.findFirst({
            where: {
              workNumber,
              deletedAt: null,
            },
            select: {
              id: true,
              inquiryType: true,
              status: true,
              processStage: true,
            },
          }),
        { operationName: 'integration.laserCompletions.findContact' }
      );

      if (!contact) {
        return {
          workNumber,
          status: 'not_found',
          message: '해당 workNumber의 문의를 찾을 수 없음',
        };
      }

      if (contact.inquiryType !== 'laser_cutting') {
        return {
          workNumber,
          status: 'not_laser_only',
          contactId: contact.id,
          message: '레이저 전용 문의가 아니므로 완료 처리하지 않음',
        };
      }

      if (contact.status === 'completed' && contact.processStage === null) {
        return {
          workNumber,
          status: 'already_completed',
          contactId: contact.id,
          message: '이미 완료 처리된 레이저 전용 문의',
        };
      }

      const stageUpdateResult = (await this.contactsService.updateProcessStage(
        contact.id,
        'cutting',
        {
          actorType: 'system',
          actorName: this.resolveActorName(dto),
        },
        this.resolveStageUpdateOptions(dto)
      )) as ContactStageUpdateResult;

      if (this.isAlreadyCompletedStageRetry(stageUpdateResult)) {
        return {
          workNumber,
          status: 'already_completed',
          contactId: contact.id,
          message: '이미 완료 처리된 레이저 전용 문의',
        };
      }

      return {
        workNumber,
        status: 'completed',
        contactId: contact.id,
        message: '레이저 전용 문의 완료 처리됨',
      };
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.warn(
        `Laser completion failed for workNumber=${workNumber}${
          contact?.id ? ` contactId=${contact.id}` : ''
        }: ${message}`
      );

      return {
        workNumber,
        status: 'failed',
        contactId: contact?.id,
        message,
      };
    }
  }

  private dedupeWorkNumbers(workNumbers: string[]): string[] {
    const seen = new Set<string>();
    const deduped: string[] = [];

    for (const rawWorkNumber of workNumbers) {
      const workNumber = rawWorkNumber.trim();
      if (!workNumber || seen.has(workNumber)) {
        continue;
      }
      seen.add(workNumber);
      deduped.push(workNumber);
    }

    return deduped;
  }

  private resolveActorName(dto: CompleteLaserCompletionsDto): string {
    return dto.actorName?.trim() || dto.source?.trim() || 'laser_nesting_program';
  }

  private resolveStageUpdateOptions(dto: CompleteLaserCompletionsDto): {
    expectedCurrentStage: 'laser';
    note?: string;
  } {
    const note = dto.message?.trim();
    return {
      expectedCurrentStage: 'laser',
      ...(note ? { note } : {}),
    };
  }

  private isAlreadyCompletedStageRetry(result: ContactStageUpdateResult): boolean {
    return (
      result.status_changed === false &&
      result.status === 'completed' &&
      result.process_stage === null
    );
  }

  private applySummary(summary: LaserCompletionSummary, status: LaserCompletionStatus): void {
    if (status === 'completed') {
      summary.completed += 1;
      return;
    }
    if (status === 'already_completed') {
      summary.alreadyCompleted += 1;
      return;
    }
    if (status === 'not_found') {
      summary.notFound += 1;
      return;
    }
    if (status === 'not_laser_only') {
      summary.skipped += 1;
      return;
    }
    summary.failed += 1;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
