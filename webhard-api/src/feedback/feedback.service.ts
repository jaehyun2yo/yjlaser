import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { FeedbackGateway } from './feedback.gateway';
import { MailService } from '../mail/mail.service';
import { formatLogEvent, generateCorrelationId, hashIdentifier } from '../common/logging/log-event';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);
  private readonly logFeature = 'feedback';

  constructor(
    private readonly prisma: PrismaService,
    private readonly feedbackGateway: FeedbackGateway,
    private readonly mailService: MailService
  ) {}

  async findAll(options: { status?: string; companyId?: number; limit?: number; offset?: number }) {
    const where: Prisma.CompanyFeedbackWhereInput = {};
    if (options.status) where.status = options.status;
    if (options.companyId) where.companyId = options.companyId;

    const [feedbacks, total] = await this.prisma.executeWithRetry(
      () =>
        Promise.all([
          this.prisma.companyFeedback.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: options.offset || 0,
            take: options.limit || 50,
          }),
          this.prisma.companyFeedback.count({ where }),
        ]),
      { operationName: 'feedback.findAll' }
    );

    return {
      feedbacks: feedbacks.map((f) => this.toSnakeCase(f)),
      total,
    };
  }

  async findById(id: bigint) {
    const feedback = await this.prisma.executeWithRetry(
      () => this.prisma.companyFeedback.findUnique({ where: { id } }),
      { operationName: 'feedback.findById' }
    );
    if (!feedback) return null;
    return this.toSnakeCase(feedback);
  }

  async create(data: {
    companyId: number;
    companyName: string;
    content: string;
    category?: string;
    categoryOther?: string;
    companyEmail?: string;
  }) {
    const feedback = await this.prisma.executeWithRetry(
      () =>
        this.prisma.companyFeedback.create({
          data: {
            companyId: data.companyId,
            companyName: data.companyName,
            content: data.content,
            category: data.category || null,
            categoryOther: data.categoryOther || null,
            companyEmail: data.companyEmail || null,
            status: 'pending',
          },
        }),
      { operationName: 'feedback.create' }
    );
    const createResult = this.toSnakeCase(feedback);
    this.feedbackGateway.emitFeedbackCreated(createResult);

    // Email notification: fire-and-forget (non-blocking)
    this.mailService
      .sendFeedbackNotification({
        feedbackId: Number(feedback.id),
        companyName: data.companyName,
        companyEmail: data.companyEmail,
        category: data.category || '',
        categoryOther: data.categoryOther,
        content: data.content,
      })
      .catch((err) => {
        this.logger.error(
          this.formatFeedbackLogEvent({
            event: 'feedback_notification_mail_failed',
            action: 'send_notification',
            status: 'failure',
            channel: 'external',
            companyId: data.companyId,
            feedbackId: Number(feedback.id),
            errorType: this.getErrorType(err),
            metadata: {
              reason: this.classifyMailFailure(err),
              category_present: !!data.category,
              category_hash: data.category ? hashIdentifier(data.category) : undefined,
              company_contact_present: !!data.companyEmail,
            },
          })
        );
      });

    return createResult;
  }

  async update(
    id: bigint,
    data: {
      status?: string;
      adminNotes?: string;
    }
  ) {
    const updateData: Prisma.CompanyFeedbackUpdateInput = {
      updatedAt: new Date(),
    };
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === 'resolved') {
        updateData.resolvedAt = new Date();
      }
    }
    if (data.adminNotes !== undefined) updateData.adminNotes = data.adminNotes;

    const feedback = await this.prisma.executeWithRetry(
      () => this.prisma.companyFeedback.update({ where: { id }, data: updateData }),
      { operationName: 'feedback.update' }
    );
    const updateResult = this.toSnakeCase(feedback);
    this.feedbackGateway.emitFeedbackUpdated(updateResult);
    return updateResult;
  }

  /**
   * 상태별 카운트 (대시보드용)
   */
  async getStatusCounts() {
    const all = await this.prisma.companyFeedback.findMany({
      select: { status: true },
    });

    const counts: Record<string, number> = {};
    for (const f of all) {
      counts[f.status] = (counts[f.status] || 0) + 1;
    }

    return {
      pending: counts['pending'] || 0,
      in_progress: counts['in_progress'] || 0,
      resolved: counts['resolved'] || 0,
      total: all.length,
    };
  }

  private toSnakeCase(f: {
    id: bigint;
    companyId: number;
    companyName: string;
    content: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt: Date | null;
    adminNotes: string | null;
    companyEmail: string | null;
    category: string | null;
    categoryOther: string | null;
  }) {
    return {
      id: Number(f.id),
      company_id: f.companyId,
      company_name: f.companyName,
      content: f.content,
      status: f.status,
      created_at: f.createdAt.toISOString(),
      updated_at: f.updatedAt.toISOString(),
      resolved_at: f.resolvedAt?.toISOString() || null,
      admin_notes: f.adminNotes,
      company_email: f.companyEmail,
      category: f.category,
      category_other: f.categoryOther,
    };
  }

  private classifyMailFailure(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'mail_delivery_failed';
    }

    if (/not configured|recipient not set/i.test(error.message)) {
      return 'mail_configuration_error';
    }

    return 'mail_delivery_failed';
  }

  private getErrorType(error: unknown): string {
    return error instanceof Error ? error.name : typeof error;
  }

  private formatFeedbackLogEvent(input: {
    event: string;
    action: string;
    status: 'failure';
    channel: 'external' | 'error';
    companyId: number;
    feedbackId: number;
    errorType: string;
    metadata: Record<string, unknown>;
  }): string {
    return formatLogEvent({
      level: 'error',
      project: 'company_site',
      component: FeedbackService.name,
      feature: this.logFeature,
      event: input.event,
      action: input.action,
      status: input.status,
      channel: input.channel,
      correlation_id: generateCorrelationId('feedback'),
      actor_type: 'company',
      actor_id_hash: hashIdentifier(input.companyId),
      target_type: 'feedback',
      target_id_hash: hashIdentifier(input.feedbackId),
      error_type: input.errorType,
      metadata: input.metadata,
    });
  }
}
