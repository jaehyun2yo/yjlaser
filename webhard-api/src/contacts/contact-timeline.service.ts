import { Injectable, Logger } from '@nestjs/common';
import { ContactStatusHistory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  COMPANY_ALLOWED_CHANGE_TYPES,
  DrawingRevisionPayload,
  StatusChangePayload,
  TimelineActorType,
  TimelineFile,
  TimelineItemDto,
} from './dto/timeline-item.dto';

export interface TimelineActor {
  actorType: 'admin' | 'company' | 'system' | 'worker';
  actorName?: string;
  companyName?: string;
  companyId?: number;
}

export interface RecordChangeParams {
  contactId: string;
  changeType:
    | 'status_change'
    | 'process_stage_change'
    | 'inquiry_type_change'
    | 'created'
    | 'deleted'
    | 'restored'
    | 'drawing_revision'
    | 'split'
    | 'stage_completed_toggle'
    | 'urgent_toggle'
    | 'completed';
  fromStatus?: string | null;
  toStatus?: string | null;
  fromStage?: string | null;
  toStage?: string | null;
  actorType: 'admin' | 'company' | 'system' | 'worker';
  actorName?: string;
  companyName?: string;
  companyId?: number;
  source: 'manual' | 'webhard_auto' | 'order_auto' | 'system' | 'backfill';
  note?: string;
  metadata?: Record<string, unknown>;
  /**
   * 외부에서 트랜잭션 컨텍스트를 주입하면 해당 tx 안에서 INSERT를 수행한다.
   * 주입이 없으면 this.prisma를 사용한다.
   */
  tx?: Prisma.TransactionClient;
}

interface ContactStatusHistoryRow {
  id: string;
  contactId: string;
  changeType: string;
  fromStatus: string | null;
  toStatus: string | null;
  fromStage: string | null;
  toStage: string | null;
  actorType: string;
  actorName: string | null;
  companyName: string | null;
  companyId: number | null;
  source: string;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
}

interface DrawingRevisionRow {
  id: string;
  contactId: string;
  version: number;
  processStage: string | null;
  reason: string;
  reasonDetail: string | null;
  files: unknown;
  actorType: string;
  actorName: string | null;
  isPublic: boolean;
  note: string | null;
  createdAt: Date;
}

const COMPANY_MASKED_ACTOR_NAME = 'YJLaser';

@Injectable()
export class ContactTimelineService {
  private readonly logger = new Logger('ContactTimeline');

  constructor(private prisma: PrismaService) {}

  /**
   * 타임라인 이벤트 INSERT.
   *
   * - 실패 시 throw — 호출자가 트랜잭션 롤백 또는 에러 전파를 선택한다.
   * - `params.tx`를 전달하면 해당 트랜잭션 클라이언트 안에서 INSERT 수행.
   *   `this.prisma`는 `params.tx` 미제공 시 폴백.
   */
  async recordChange(params: RecordChangeParams): Promise<ContactStatusHistory> {
    const client = params.tx ?? this.prisma;
    return client.contactStatusHistory.create({
      data: {
        contactId: params.contactId,
        changeType: params.changeType,
        fromStatus: params.fromStatus ?? null,
        toStatus: params.toStatus ?? null,
        fromStage: params.fromStage ?? null,
        toStage: params.toStage ?? null,
        actorType: params.actorType,
        actorName: params.actorName ?? null,
        companyName: params.companyName ?? null,
        companyId: params.companyId ?? null,
        source: params.source,
        note: params.note ?? null,
        metadata: (params.metadata ?? {}) as Record<string, string>,
      },
    });
  }

  /**
   * 통합 타임라인 조회 — ContactStatusHistory와 DrawingRevision을 시간순 인터리브.
   *
   * - 응답 필드는 camelCase + `createdAt`은 ISO 8601 문자열.
   * - 정렬: createdAt ASC (오래된 → 최신).
   * - 중복 방지: kind='status_change' 중 DB changeType='drawing_revision'인 항목은 제외
   *   (도면 수정 이력은 drawing_revisions 테이블에서만 노출).
   * - forCompany=true:
   *   - drawing_revision 중 isPublic=false 제외
   *   - admin/system/external actorName은 'YJLaser'로 마스킹 (actorType은 유지)
   *   - drawing_revision payload.note는 null로 마스킹 (관리자 내부 메모)
   *   - status_change 중 COMPANY_ALLOWED_CHANGE_TYPES에 없는 항목 제외
   */
  async getTimeline(
    contactId: string,
    options: { forCompany?: boolean } = {}
  ): Promise<TimelineItemDto[]> {
    const [statusHistory, drawingRevisions] = await Promise.all([
      this.prisma.contactStatusHistory.findMany({
        where: { contactId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.drawingRevision.findMany({
        where: { contactId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          contactId: true,
          version: true,
          processStage: true,
          reason: true,
          reasonDetail: true,
          files: true,
          actorType: true,
          actorName: true,
          isPublic: true,
          note: true,
          createdAt: true,
        },
      }),
    ]);

    const forCompany = options.forCompany === true;

    const statusItems: TimelineItemDto[] = [];
    for (const entry of statusHistory as ContactStatusHistoryRow[]) {
      // 중복 방지: 과거에 ContactStatusHistory에 기록된 drawing_revision 이벤트는
      // drawing_revisions 테이블 조회로 노출되므로 status_change에서는 제거.
      if (entry.changeType === 'drawing_revision') {
        continue;
      }

      const mappedChangeType = this.mapChangeType(entry.changeType);

      if (forCompany && !COMPANY_ALLOWED_CHANGE_TYPES.has(mappedChangeType)) {
        continue;
      }

      const payload: StatusChangePayload = {
        changeType: mappedChangeType,
        fromValue: entry.fromStatus ?? entry.fromStage ?? null,
        toValue: entry.toStatus ?? entry.toStage ?? null,
        metadata: this.toMetadataRecord(entry.metadata),
      };

      statusItems.push({
        id: entry.id,
        kind: 'status_change',
        createdAt: entry.createdAt.toISOString(),
        actorType: this.normalizeActorType(entry.actorType),
        actorName: this.maskActorName(entry.actorType, entry.actorName, forCompany),
        payload,
      });
    }

    const drawingItems: TimelineItemDto[] = [];
    for (const revision of drawingRevisions as DrawingRevisionRow[]) {
      if (forCompany && revision.isPublic !== true) {
        continue;
      }

      const payload: DrawingRevisionPayload = {
        revisionId: revision.id,
        version: revision.version,
        processStage: revision.processStage,
        reason: revision.reason,
        reasonDetail: revision.reasonDetail,
        files: this.toTimelineFiles(revision.files),
        isPublic: revision.isPublic,
        note: forCompany ? null : revision.note,
      };

      drawingItems.push({
        id: revision.id,
        kind: 'drawing_revision',
        createdAt: revision.createdAt.toISOString(),
        actorType: this.normalizeActorType(revision.actorType),
        actorName: this.maskActorName(revision.actorType, revision.actorName, forCompany),
        payload,
      });
    }

    const merged = [...statusItems, ...drawingItems];
    merged.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

    // Fallback: 양 테이블 모두 비었을 때만 contacts 테이블 기반 최소 이벤트 파생.
    // 실데이터가 한 건이라도 있으면 fallback 비활성 (실/파생 혼합 방지).
    if (statusHistory.length === 0 && drawingRevisions.length === 0) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: contactId },
        select: {
          id: true,
          createdAt: true,
          source: true,
          drawingFileUrl: true,
          originalFilename: true,
          drawingFileName: true,
          isUrgent: true,
          urgentAt: true,
        },
      });
      if (!contact) return [];
      return this.buildFallbackTimeline(contact, options);
    }

    if (!forCompany && !this.hasUrgentToggle(statusHistory as ContactStatusHistoryRow[])) {
      const urgentFallback = await this.buildUrgentFallbackItem(contactId);
      if (urgentFallback) {
        merged.push(urgentFallback);
        merged.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
      }
    }

    return merged;
  }

  /**
   * 실데이터가 없는 문의에서 contacts 테이블을 기반으로 최소 타임라인을 파생.
   *
   * - Event 1: `status_change` / `created` (항상 포함)
   * - Event 2: `drawing_revision` / `initial` (drawingFileUrl 존재 시, forCompany=false에서만)
   * - 정렬: createdAt ASC, 동일 시각이면 status_change(created)를 먼저 배치 — create 이벤트가 시간상 선행.
   * - forCompany=true에서는 기존 마스킹 규칙을 그대로 적용한다.
   *   단 'created'는 COMPANY_ALLOWED_CHANGE_TYPES에 없음에도 fallback 경로에서는 예외적으로 포함.
   */
  private buildFallbackTimeline(
    contact: {
      id: string;
      createdAt: Date;
      source: string | null;
      drawingFileUrl: string | null;
      originalFilename: string | null;
      drawingFileName: string | null;
      isUrgent: boolean | null;
      urgentAt: Date | null;
    },
    options: { forCompany?: boolean }
  ): TimelineItemDto[] {
    const forCompany = options.forCompany === true;
    const createdAtIso = contact.createdAt.toISOString();
    const items: TimelineItemDto[] = [];

    // Event 1: created (status_change)
    const { actorType: createdActorType, actorName: createdActorName } = this.deriveCreatedActor(
      contact.source
    );

    const createdPayload: StatusChangePayload = {
      changeType: 'created',
      metadata: { fallback: true },
      fallback: true,
    };

    items.push({
      id: `fallback:${contact.id}:created`,
      kind: 'status_change',
      createdAt: createdAtIso,
      actorType: createdActorType,
      actorName: this.maskActorName(createdActorType, createdActorName, forCompany),
      payload: createdPayload,
    });

    // Event 2: drawing_revision initial — drawingFileUrl이 있을 때만, forCompany=false에서만.
    if (contact.drawingFileUrl && !forCompany) {
      const fileName = contact.originalFilename || contact.drawingFileName || 'initial-drawing';

      const drawingPayload: DrawingRevisionPayload = {
        revisionId: 'fallback-initial',
        version: 1,
        processStage: null,
        reason: 'initial',
        reasonDetail: null,
        files: [
          {
            url: contact.drawingFileUrl,
            name: fileName,
            size: 0,
            mimeType: this.guessMimeType(fileName),
          },
        ],
        isPublic: false,
        note: null,
        fallback: true,
      };

      items.push({
        id: `fallback:${contact.id}:drawing-initial`,
        kind: 'drawing_revision',
        createdAt: createdAtIso,
        actorType: 'system',
        actorName: null,
        payload: drawingPayload,
      });
    }

    const urgentFallback = this.buildUrgentFallbackItemFromContact(contact);
    if (urgentFallback && !forCompany) {
      items.push(urgentFallback);
    }

    // 정렬: createdAt ASC. 동일 시각이면 status_change(created)를 먼저 배치한다.
    items.sort((a, b) => {
      if (a.createdAt < b.createdAt) return -1;
      if (a.createdAt > b.createdAt) return 1;
      if (a.kind === 'status_change' && b.kind === 'drawing_revision') return -1;
      if (a.kind === 'drawing_revision' && b.kind === 'status_change') return 1;
      return 0;
    });

    return items;
  }

  private hasUrgentToggle(statusHistory: ContactStatusHistoryRow[]): boolean {
    return statusHistory.some((entry) => entry.changeType === 'urgent_toggle');
  }

  private async buildUrgentFallbackItem(contactId: string): Promise<TimelineItemDto | null> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        isUrgent: true,
        urgentAt: true,
      },
    });
    if (!contact) return null;
    return this.buildUrgentFallbackItemFromContact(contact);
  }

  private buildUrgentFallbackItemFromContact(contact: {
    id: string;
    isUrgent: boolean | null;
    urgentAt: Date | null;
  }): TimelineItemDto | null {
    if (contact.isUrgent !== true || !contact.urgentAt) {
      return null;
    }

    const payload: StatusChangePayload = {
      changeType: 'urgent_toggle',
      fromValue: 'normal',
      toValue: 'urgent',
      metadata: { fallback: true, isUrgent: true },
      fallback: true,
    };

    return {
      id: `fallback:${contact.id}:urgent`,
      kind: 'status_change',
      createdAt: contact.urgentAt.toISOString(),
      actorType: 'system',
      actorName: null,
      payload,
    };
  }

  /**
   * contacts.source → fallback `created` 이벤트의 actor 매핑.
   */
  private deriveCreatedActor(source: string | null): {
    actorType: TimelineActorType;
    actorName: string | null;
  } {
    switch (source) {
      case 'webhard_auto':
        return { actorType: 'system', actorName: '웹하드 자동생성' };
      case 'admin_manual':
        return { actorType: 'admin', actorName: '관리자' };
      default:
        return { actorType: 'system', actorName: null };
    }
  }

  /**
   * 파일 확장자 기반 MIME 타입 추정. 매칭 실패 시 application/octet-stream.
   */
  private guessMimeType(name: string): string {
    const ext = name.toLowerCase().split('.').pop();
    switch (ext) {
      case 'dxf':
        return 'application/dxf';
      case 'pdf':
        return 'application/pdf';
      case 'dwg':
        return 'application/acad';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * DB의 ContactStatusHistory.changeType → 응답 payload.changeType 매핑.
   * 미매핑 값은 원본을 그대로 돌려준다.
   */
  private mapChangeType(dbChangeType: string): string {
    switch (dbChangeType) {
      case 'status_change':
        return 'status';
      case 'process_stage_change':
        return 'process_stage';
      case 'inquiry_type_change':
        return 'type';
      default:
        return dbChangeType;
    }
  }

  private normalizeActorType(actorType: string): TimelineActorType {
    switch (actorType) {
      case 'admin':
      case 'worker':
      case 'system':
      case 'external':
      case 'company':
        return actorType;
      default:
        return 'system';
    }
  }

  private maskActorName(
    actorType: string,
    actorName: string | null,
    forCompany: boolean
  ): string | null {
    if (!forCompany) {
      return actorName;
    }
    if (actorType === 'admin' || actorType === 'system' || actorType === 'external') {
      return COMPANY_MASKED_ACTOR_NAME;
    }
    return actorName;
  }

  private toMetadataRecord(metadata: unknown): Record<string, unknown> | undefined {
    if (metadata == null) {
      return undefined;
    }
    if (typeof metadata === 'object' && !Array.isArray(metadata)) {
      return metadata as Record<string, unknown>;
    }
    return undefined;
  }

  private toTimelineFiles(files: unknown): TimelineFile[] {
    if (!Array.isArray(files)) {
      return [];
    }
    return files
      .map((file) => {
        if (!file || typeof file !== 'object') {
          return null;
        }
        const f = file as Record<string, unknown>;
        if (typeof f.url !== 'string' || typeof f.name !== 'string') {
          return null;
        }
        return {
          url: f.url,
          name: f.name,
          size: typeof f.size === 'number' ? f.size : 0,
          mimeType: typeof f.mimeType === 'string' ? f.mimeType : 'application/octet-stream',
        } satisfies TimelineFile;
      })
      .filter((file): file is TimelineFile => file !== null);
  }

  /**
   * Get stage duration analytics - average time between status transitions
   */
  async getStageDurationAnalytics(options?: {
    companyName?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    // Build WHERE clause for filtering
    const where: Record<string, unknown> = {
      changeType: 'status_change',
    };

    if (options?.companyName) {
      where.companyName = options.companyName;
    }

    if (options?.dateFrom || options?.dateTo) {
      const createdAt: Record<string, Date> = {};
      if (options?.dateFrom) createdAt.gte = new Date(options.dateFrom);
      if (options?.dateTo) createdAt.lte = new Date(options.dateTo);
      where.createdAt = createdAt;
    }

    // Get all status_change entries grouped by contactId
    const entries = await this.prisma.contactStatusHistory.findMany({
      where,
      orderBy: [{ contactId: 'asc' }, { createdAt: 'asc' }],
      select: {
        contactId: true,
        fromStatus: true,
        toStatus: true,
        createdAt: true,
      },
    });

    // Group by contactId
    const grouped = new Map<string, typeof entries>();
    for (const entry of entries) {
      const list = grouped.get(entry.contactId) || [];
      list.push(entry);
      grouped.set(entry.contactId, list);
    }

    // Calculate durations for each transition pair
    const transitionDurations = new Map<string, number[]>();

    for (const contactEntries of grouped.values()) {
      for (let i = 0; i < contactEntries.length; i++) {
        const current = contactEntries[i];
        if (!current.fromStatus || !current.toStatus) continue;

        const key = `${current.fromStatus}→${current.toStatus}`;
        const durations = transitionDurations.get(key) || [];

        // Duration = time from previous status change to this one
        if (i > 0) {
          const prev = contactEntries[i - 1];
          const hours = (current.createdAt.getTime() - prev.createdAt.getTime()) / (1000 * 60 * 60);
          if (hours >= 0) {
            durations.push(hours);
          }
        }
        transitionDurations.set(key, durations);
      }
    }

    // Build response
    const stages = Array.from(transitionDurations.entries())
      .map(([key, durations]) => {
        const [from, to] = key.split('→');
        const sorted = [...durations].sort((a, b) => a - b);
        const avg =
          durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;
        const median =
          sorted.length > 0
            ? sorted.length % 2 === 0
              ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
              : sorted[Math.floor(sorted.length / 2)]
            : 0;

        return {
          from,
          to,
          avg_hours: Math.round(avg * 10) / 10,
          median_hours: Math.round(median * 10) / 10,
          count: durations.length,
        };
      })
      .filter((s) => s.count > 0)
      .sort((a, b) => {
        // Sort by workflow order
        const order = [
          'received',
          'drawing',
          'confirmed',
          'production',
          'cutting',
          'finishing',
          'delivered',
        ];
        return order.indexOf(a.from) - order.indexOf(b.from);
      });

    const allDurations = stages.map((s) => s.avg_hours);
    const totalAvg =
      allDurations.length > 0
        ? Math.round((allDurations.reduce((sum, d) => sum + d, 0) / allDurations.length) * 10) / 10
        : 0;

    return {
      stages,
      total_avg_hours: totalAvg,
      period: {
        from: options?.dateFrom || null,
        to: options?.dateTo || null,
      },
    };
  }

  /**
   * Backfill timeline entries from existing contact timestamp fields
   */
  async backfillFromTimestamps() {
    this.logger.log('Starting timeline backfill from existing timestamps...');

    const contacts = await this.prisma.contact.findMany({
      select: {
        id: true,
        status: true,
        companyName: true,
        source: true,
        createdAt: true,
        confirmedAt: true,
        productionStartedAt: true,
        cuttingStartedAt: true,
        cuttingCompletedAt: true,
        finishingStartedAt: true,
        finishingCompletedAt: true,
      },
    });

    let totalEntries = 0;
    let skipped = 0;

    for (const contact of contacts) {
      const existingCount = await this.prisma.contactStatusHistory.count({
        where: { contactId: contact.id },
      });

      if (existingCount > 0) {
        skipped++;
        continue;
      }

      interface BackfillRow {
        contactId: string;
        changeType: string;
        fromStatus: string | null;
        toStatus: string;
        actorType: string;
        source: string;
        note: string;
        companyName: string | null;
        metadata: Record<string, string>;
        createdAt: Date;
      }

      const entries: BackfillRow[] = [];

      const sourceLabel =
        contact.source === 'webhard' ? '웹하드' : contact.source === 'phone' ? '전화' : '웹사이트';

      entries.push({
        contactId: contact.id,
        changeType: 'created',
        fromStatus: null,
        toStatus: 'received',
        actorType: 'system',
        source: 'backfill',
        note: `기존 데이터 마이그레이션 (${sourceLabel})`,
        companyName: contact.companyName,
        metadata: {},
        createdAt: contact.createdAt,
      });

      if (contact.confirmedAt) {
        entries.push({
          contactId: contact.id,
          changeType: 'status_change',
          fromStatus: 'drawing',
          toStatus: 'confirmed',
          actorType: 'system',
          source: 'backfill',
          note: '기존 타임스탬프에서 마이그레이션',
          companyName: contact.companyName,
          metadata: {},
          createdAt: contact.confirmedAt,
        });
      }

      if (contact.productionStartedAt) {
        entries.push({
          contactId: contact.id,
          changeType: 'status_change',
          fromStatus: 'confirmed',
          toStatus: 'production',
          actorType: 'system',
          source: 'backfill',
          note: '기존 타임스탬프에서 마이그레이션',
          companyName: contact.companyName,
          metadata: {},
          createdAt: contact.productionStartedAt,
        });
      }

      if (contact.cuttingStartedAt) {
        entries.push({
          contactId: contact.id,
          changeType: 'status_change',
          fromStatus: 'production',
          toStatus: 'cutting',
          actorType: 'system',
          source: 'backfill',
          note: '기존 타임스탬프에서 마이그레이션',
          companyName: contact.companyName,
          metadata: {},
          createdAt: contact.cuttingStartedAt,
        });
      }

      if (contact.finishingStartedAt) {
        entries.push({
          contactId: contact.id,
          changeType: 'status_change',
          fromStatus: 'cutting',
          toStatus: 'finishing',
          actorType: 'system',
          source: 'backfill',
          note: '기존 타임스탬프에서 마이그레이션',
          companyName: contact.companyName,
          metadata: {},
          createdAt: contact.finishingStartedAt,
        });
      }

      if (entries.length > 0) {
        await this.prisma.contactStatusHistory.createMany({ data: entries });
        totalEntries += entries.length;
      }
    }

    this.logger.log(
      `Backfill complete: ${totalEntries} entries for ${contacts.length - skipped} contacts (${skipped} skipped)`
    );

    return { totalEntries, contactCount: contacts.length, skipped };
  }
}
