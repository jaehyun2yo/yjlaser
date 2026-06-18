/**
 * ContactTimelineService.getTimeline 단위 테스트
 *
 * 스펙: docs/specs/features/drawing-workflow.md §B 통합 타임라인
 *       docs/specs/api/nestjs-endpoints.md timeline 응답 shape
 * 태스크: tasks/13-drawing-timeline-unify/phase2.md
 *
 * 검증 항목:
 * 1. ContactStatusHistory만 있을 때 → kind === 'status_change'만
 * 2. DrawingRevision만 있을 때 → kind === 'drawing_revision'만
 * 3. 두 테이블 혼합 → createdAt ASC 인터리브 정렬
 * 4. createdAt은 ISO 8601 string
 * 5. drawing_revision payload에 version/files/reason/isPublic/processStage 포함
 * 6. forCompany=true:
 *    - isPublic=false 제외
 *    - admin actorName → 'YJLaser' 마스킹
 *    - drawing_revision payload.note → null 마스킹
 *    - DB changeType='drawing_revision'인 status_change 항목 제외
 *    - 화이트리스트 외 changeType 제외
 * 7. urgent_toggle 이력이 없는 기존 긴급 문의는 urgentAt 기반 fallback 이력 표시
 */

import { ContactTimelineService } from './contact-timeline.service';

interface PrismaTimelineMock {
  contactStatusHistory: {
    findMany: jest.Mock;
  };
  drawingRevision: {
    findMany: jest.Mock;
  };
  contact: {
    findUnique: jest.Mock;
  };
}

function makePrisma(
  statusRows: unknown[] = [],
  drawingRows: unknown[] = [],
  contact: unknown = null
): PrismaTimelineMock {
  return {
    contactStatusHistory: {
      findMany: jest.fn().mockResolvedValue(statusRows),
    },
    drawingRevision: {
      findMany: jest.fn().mockResolvedValue(drawingRows),
    },
    contact: {
      findUnique: jest.fn().mockResolvedValue(contact),
    },
  };
}

function buildService(prisma: PrismaTimelineMock) {
  return new ContactTimelineService(prisma as never);
}

const CONTACT_ID = '11111111-1111-1111-1111-111111111111';

function statusRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'status-1',
    contactId: CONTACT_ID,
    changeType: 'status_change',
    fromStatus: 'received',
    toStatus: 'drawing',
    fromStage: null,
    toStage: null,
    actorType: 'admin',
    actorName: '관리자',
    companyName: null,
    companyId: null,
    source: 'manual',
    note: null,
    metadata: {},
    createdAt: new Date('2026-04-10T10:00:00Z'),
    ...overrides,
  };
}

function drawingRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rev-1',
    contactId: CONTACT_ID,
    version: 1,
    processStage: 'drawing',
    reason: 'initial',
    reasonDetail: null,
    files: [
      {
        url: 'https://cdn.yjlaser.net/drawings/contact-1/a.dxf',
        name: 'a.dxf',
        size: 1024,
        mimeType: 'application/dxf',
      },
    ],
    actorType: 'admin',
    actorName: '관리자',
    isPublic: true,
    note: '내부 메모',
    createdAt: new Date('2026-04-11T12:00:00Z'),
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// 1. ContactStatusHistory만 있을 때
// ──────────────────────────────────────────────
describe('ContactTimelineService.getTimeline — status_change only', () => {
  it('ContactStatusHistory만 있을 때 모든 항목이 kind=status_change', async () => {
    const prisma = makePrisma(
      [
        statusRow({ id: 's1', changeType: 'status_change' }),
        statusRow({
          id: 's2',
          changeType: 'process_stage_change',
          fromStage: 'drawing',
          toStage: 'drawing_confirmed',
          createdAt: new Date('2026-04-12T09:00:00Z'),
        }),
      ],
      []
    );
    const service = buildService(prisma);

    const result = await service.getTimeline(CONTACT_ID);

    expect(result).toHaveLength(2);
    for (const item of result) {
      expect(item.kind).toBe('status_change');
    }
  });
});

// ──────────────────────────────────────────────
// 2. DrawingRevision만 있을 때
// ──────────────────────────────────────────────
describe('ContactTimelineService.getTimeline — drawing_revision only', () => {
  it('DrawingRevision만 있을 때 모든 항목이 kind=drawing_revision', async () => {
    const prisma = makePrisma(
      [],
      [
        drawingRow({ id: 'r1', version: 1 }),
        drawingRow({
          id: 'r2',
          version: 2,
          createdAt: new Date('2026-04-13T09:00:00Z'),
        }),
      ]
    );
    const service = buildService(prisma);

    const result = await service.getTimeline(CONTACT_ID);

    expect(result).toHaveLength(2);
    for (const item of result) {
      expect(item.kind).toBe('drawing_revision');
    }
  });
});

// ──────────────────────────────────────────────
// 3. 혼합 — createdAt ASC 인터리브 정렬
// ──────────────────────────────────────────────
describe('ContactTimelineService.getTimeline — 혼합 인터리브 정렬', () => {
  it('두 테이블 혼합 시 createdAt ASC 순서로 인터리브', async () => {
    const prisma = makePrisma(
      [
        statusRow({ id: 's-early', createdAt: new Date('2026-04-10T10:00:00Z') }),
        statusRow({ id: 's-late', createdAt: new Date('2026-04-14T10:00:00Z') }),
      ],
      [
        drawingRow({ id: 'r-mid', createdAt: new Date('2026-04-12T10:00:00Z') }),
        drawingRow({ id: 'r-very-late', createdAt: new Date('2026-04-15T10:00:00Z') }),
      ]
    );
    const service = buildService(prisma);

    const result = await service.getTimeline(CONTACT_ID);

    expect(result.map((i) => i.id)).toEqual(['s-early', 'r-mid', 's-late', 'r-very-late']);
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].createdAt <= result[i + 1].createdAt).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────
// 4. createdAt 타입 및 ISO 8601 포맷
// ──────────────────────────────────────────────
describe('ContactTimelineService.getTimeline — createdAt ISO 8601', () => {
  it('모든 항목의 createdAt은 ISO 8601 문자열', async () => {
    const prisma = makePrisma(
      [statusRow({ createdAt: new Date('2026-04-10T10:00:00Z') })],
      [drawingRow({ createdAt: new Date('2026-04-11T12:00:00Z') })]
    );
    const service = buildService(prisma);

    const result = await service.getTimeline(CONTACT_ID);

    expect(result).toHaveLength(2);
    for (const item of result) {
      expect(typeof item.createdAt).toBe('string');
      expect(item.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(Number.isNaN(Date.parse(item.createdAt))).toBe(false);
    }
  });
});

// ──────────────────────────────────────────────
// 5. drawing_revision payload 필드 검증
// ──────────────────────────────────────────────
describe('ContactTimelineService.getTimeline — drawing_revision payload 필드', () => {
  it('drawing_revision payload에 version/files/reason/isPublic/processStage 포함', async () => {
    const prisma = makePrisma(
      [],
      [
        drawingRow({
          id: 'rev-abc',
          version: 3,
          processStage: 'drawing_confirmed',
          reason: 'field_correction',
          reasonDetail: '현장 보정',
          isPublic: true,
          files: [
            {
              url: 'https://cdn.yjlaser.net/x.dxf',
              name: 'x.dxf',
              size: 512,
              mimeType: 'application/dxf',
            },
            {
              url: 'https://cdn.yjlaser.net/y.dxf',
              name: 'y.dxf',
              size: 256,
              mimeType: 'application/dxf',
            },
          ],
        }),
      ]
    );
    const service = buildService(prisma);

    const [item] = await service.getTimeline(CONTACT_ID);

    expect(item.kind).toBe('drawing_revision');
    const payload = item.payload as {
      revisionId: string;
      version: number;
      processStage: string | null;
      reason: string;
      reasonDetail: string | null;
      files: Array<{ url: string; name: string; size: number; mimeType: string }>;
      isPublic: boolean;
      note: string | null;
    };
    expect(payload.revisionId).toBe('rev-abc');
    expect(payload.version).toBe(3);
    expect(payload.reason).toBe('field_correction');
    expect(payload.reasonDetail).toBe('현장 보정');
    expect(payload.processStage).toBe('drawing_confirmed');
    expect(payload.isPublic).toBe(true);
    expect(payload.files).toHaveLength(2);
    expect(payload.files[0]).toEqual({
      url: 'https://cdn.yjlaser.net/x.dxf',
      name: 'x.dxf',
      size: 512,
      mimeType: 'application/dxf',
    });
  });
});

// ──────────────────────────────────────────────
// 6. forCompany=true 필터링 & 마스킹
// ──────────────────────────────────────────────
describe('ContactTimelineService.getTimeline — forCompany=true', () => {
  it('isPublic=false drawing_revision 제외, admin actorName→YJLaser, note 마스킹, 중복 drawing_revision status_change 제외, 화이트리스트 외 changeType 제외 (일반 경로)', async () => {
    const prisma = makePrisma(
      [
        // 허용: status_change (→ 'status')
        statusRow({
          id: 's-allow',
          changeType: 'status_change',
          actorType: 'admin',
          actorName: '관리자-홍길동',
          createdAt: new Date('2026-04-10T10:00:00Z'),
        }),
        // 허용: process_stage_change (→ 'process_stage')
        statusRow({
          id: 's-stage',
          changeType: 'process_stage_change',
          actorType: 'system',
          actorName: 'system',
          fromStage: 'drawing',
          toStage: 'drawing_confirmed',
          fromStatus: null,
          toStatus: null,
          createdAt: new Date('2026-04-11T10:00:00Z'),
        }),
        // 허용: inquiry_type_change (→ 'type')
        statusRow({
          id: 's-type',
          changeType: 'inquiry_type_change',
          actorType: 'company',
          actorName: '거래처 담당자',
          createdAt: new Date('2026-04-12T10:00:00Z'),
        }),
        // 제외 (중복): DB changeType='drawing_revision'
        statusRow({
          id: 's-dup-rev',
          changeType: 'drawing_revision',
          actorType: 'admin',
          actorName: '관리자',
          createdAt: new Date('2026-04-13T10:00:00Z'),
        }),
        // 제외: 화이트리스트 외 (created)
        statusRow({
          id: 's-created',
          changeType: 'created',
          actorType: 'system',
          actorName: 'system',
          createdAt: new Date('2026-04-09T09:00:00Z'),
        }),
      ],
      [
        // 포함: isPublic=true
        drawingRow({
          id: 'r-public',
          version: 1,
          isPublic: true,
          actorType: 'admin',
          actorName: '관리자-도면담당',
          note: '내부 메모1',
          createdAt: new Date('2026-04-14T10:00:00Z'),
        }),
        // 제외: isPublic=false
        drawingRow({
          id: 'r-private',
          version: 2,
          isPublic: false,
          actorType: 'admin',
          actorName: '관리자-비공개',
          note: '내부 메모2',
          createdAt: new Date('2026-04-15T10:00:00Z'),
        }),
      ]
    );
    const service = buildService(prisma);

    const result = await service.getTimeline(CONTACT_ID, { forCompany: true });
    const ids = result.map((i) => i.id);

    // 포함: s-allow, s-stage, s-type, r-public
    expect(ids).toContain('s-allow');
    expect(ids).toContain('s-stage');
    expect(ids).toContain('s-type');
    expect(ids).toContain('r-public');
    // 제외: DB drawing_revision (중복), 화이트리스트 외 (created), isPublic=false
    expect(ids).not.toContain('s-dup-rev');
    expect(ids).not.toContain('s-created');
    expect(ids).not.toContain('r-private');

    // admin actorName 마스킹 'YJLaser'
    const sAllow = result.find((i) => i.id === 's-allow');
    expect(sAllow?.actorName).toBe('YJLaser');
    // system도 admin과 동일하게 마스킹
    const sStage = result.find((i) => i.id === 's-stage');
    expect(sStage?.actorName).toBe('YJLaser');
    // company actorName은 원본 유지
    const sType = result.find((i) => i.id === 's-type');
    expect(sType?.actorName).toBe('거래처 담당자');

    // drawing_revision note 마스킹 null
    const rPublic = result.find((i) => i.id === 'r-public');
    expect(rPublic?.kind).toBe('drawing_revision');
    const payload = rPublic?.payload as { note: string | null };
    expect(payload.note).toBeNull();
    // admin actorName 마스킹
    expect(rPublic?.actorName).toBe('YJLaser');
  });
});

// ──────────────────────────────────────────────
// F1~F7: Fallback 응답 — tasks/14-timeline-reliability Phase 1
//
// 스펙: docs/specs/features/drawing-workflow.md "타임라인 신뢰성 보장 > Fallback 응답"
//       실데이터가 없을 때 contacts 테이블에서 최소 이벤트 파생.
//       실데이터 1건이라도 있으면 fallback 비활성.
// ──────────────────────────────────────────────

interface ContactFallbackRow {
  id: string;
  createdAt: Date;
  source: string | null;
  drawingFileUrl: string | null;
  originalFilename: string | null;
  drawingFileName: string | null;
  isUrgent: boolean | null;
  urgentAt: Date | null;
}

interface PrismaFallbackMock {
  contactStatusHistory: { findMany: jest.Mock; create: jest.Mock };
  drawingRevision: { findMany: jest.Mock };
  contact: { findUnique: jest.Mock };
}

function makeFallbackPrisma(
  statusRows: unknown[] = [],
  drawingRows: unknown[] = [],
  contact: ContactFallbackRow | null = null
): PrismaFallbackMock {
  return {
    contactStatusHistory: {
      findMany: jest.fn().mockResolvedValue(statusRows),
      create: jest.fn(),
    },
    drawingRevision: {
      findMany: jest.fn().mockResolvedValue(drawingRows),
    },
    contact: {
      findUnique: jest.fn().mockResolvedValue(contact),
    },
  };
}

function defaultContact(overrides: Partial<ContactFallbackRow> = {}): ContactFallbackRow {
  return {
    id: CONTACT_ID,
    createdAt: new Date('2026-04-10T10:00:00Z'),
    source: 'webhard_auto',
    drawingFileUrl: 'https://cdn.yjlaser.net/drawings/initial.dxf',
    originalFilename: 'initial.dxf',
    drawingFileName: null,
    isUrgent: false,
    urgentAt: null,
    ...overrides,
  };
}

describe('ContactTimelineService.getTimeline — Fallback (실데이터 없을 때 contacts 테이블 파생)', () => {
  it('F1: 양쪽 DB 비었고 drawingFileUrl 있으면 created + drawing_revision initial 2개', async () => {
    const prisma = makeFallbackPrisma([], [], defaultContact());
    const service = buildService(prisma as never);

    const result = await service.getTimeline(CONTACT_ID);

    expect(result).toHaveLength(2);
    expect(result.filter((i) => i.kind === 'status_change')).toHaveLength(1);
    expect(result.filter((i) => i.kind === 'drawing_revision')).toHaveLength(1);

    const created = result.find((i) => i.kind === 'status_change');
    const createdPayload = created!.payload as { changeType: string };
    expect(createdPayload.changeType).toBe('created');

    const drawing = result.find((i) => i.kind === 'drawing_revision');
    const drawingPayload = drawing!.payload as { reason: string; version: number };
    expect(drawingPayload.reason).toBe('initial');
    expect(drawingPayload.version).toBe(1);
  });

  it('F2: 양쪽 DB 비었고 drawingFileUrl 없으면 created 1개만', async () => {
    const prisma = makeFallbackPrisma([], [], defaultContact({ drawingFileUrl: null }));
    const service = buildService(prisma as never);

    const result = await service.getTimeline(CONTACT_ID);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('status_change');
    expect((result[0].payload as { changeType: string }).changeType).toBe('created');
  });

  it('F3: Contact 자체가 없을 때 빈 배열', async () => {
    const prisma = makeFallbackPrisma([], [], null);
    const service = buildService(prisma as never);

    const result = await service.getTimeline(CONTACT_ID);

    expect(result).toEqual([]);
  });

  it('F4: 실 데이터 1건이라도 있으면 일반 fallback 비활성, 긴급 fallback만 별도 확인한다', async () => {
    const prisma = makeFallbackPrisma(
      [statusRow({ id: 'real-status', changeType: 'status_change' })],
      [],
      defaultContact()
    );
    const service = buildService(prisma as never);

    const result = await service.getTimeline(CONTACT_ID);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('real-status');
    expect(result.some((i) => i.id.startsWith('fallback:'))).toBe(false);
    expect(prisma.contact.findUnique).toHaveBeenCalledWith({
      where: { id: CONTACT_ID },
      select: {
        id: true,
        isUrgent: true,
        urgentAt: true,
      },
    });
  });

  it('F8: 기존 긴급 문의에 urgent_toggle 이력이 없으면 urgentAt 기반 긴급 처리 이력을 파생한다', async () => {
    const prisma = makeFallbackPrisma(
      [statusRow({ id: 'real-status', changeType: 'status_change' })],
      [],
      defaultContact({
        isUrgent: true,
        urgentAt: new Date('2026-05-22T04:14:00Z'),
      })
    );
    const service = buildService(prisma as never);

    const result = await service.getTimeline(CONTACT_ID);

    expect(result).toHaveLength(2);
    const urgent = result.find((item) => item.id === `fallback:${CONTACT_ID}:urgent`);
    expect(urgent).toBeDefined();
    expect(urgent?.createdAt).toBe('2026-05-22T04:14:00.000Z');
    expect(urgent?.actorType).toBe('system');
    expect(urgent?.actorName).toBeNull();
    expect(urgent?.payload).toEqual(
      expect.objectContaining({
        changeType: 'urgent_toggle',
        fromValue: 'normal',
        toValue: 'urgent',
        fallback: true,
      })
    );
  });

  it('F9: urgent_toggle 실 이력이 있으면 urgentAt fallback을 중복 생성하지 않는다', async () => {
    const prisma = makeFallbackPrisma(
      [statusRow({ id: 'real-urgent', changeType: 'urgent_toggle' })],
      [],
      defaultContact({
        isUrgent: true,
        urgentAt: new Date('2026-05-22T04:14:00Z'),
      })
    );
    const service = buildService(prisma as never);

    const result = await service.getTimeline(CONTACT_ID);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('real-urgent');
    expect(prisma.contact.findUnique).not.toHaveBeenCalled();
  });

  it('F5: source=webhard_auto → actorType=system, actorName="웹하드 자동생성"', async () => {
    const prisma = makeFallbackPrisma([], [], defaultContact({ source: 'webhard_auto' }));
    const service = buildService(prisma as never);

    const result = await service.getTimeline(CONTACT_ID);

    const created = result.find((i) => i.kind === 'status_change');
    expect(created).toBeDefined();
    expect(created!.actorType).toBe('system');
    expect(created!.actorName).toBe('웹하드 자동생성');
  });

  it('F6: forCompany=true 시 created 포함, drawing_revision initial 제외 (isPublic=false)', async () => {
    const prisma = makeFallbackPrisma([], [], defaultContact());
    const service = buildService(prisma as never);

    const result = await service.getTimeline(CONTACT_ID, { forCompany: true });

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('status_change');
    expect((result[0].payload as { changeType: string }).changeType).toBe('created');
  });

  it('F7: fallback 이벤트의 payload에 fallback=true 플래그 포함', async () => {
    const prisma = makeFallbackPrisma([], [], defaultContact());
    const service = buildService(prisma as never);

    const result = await service.getTimeline(CONTACT_ID);

    expect(result).toHaveLength(2);
    for (const item of result) {
      expect((item.payload as { fallback?: boolean }).fallback).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────
// REG-1~REG-2: 원본 v1 + revision v2 공존 (tasks/18-drawing-consistency Phase 3)
//
// 스펙: docs/specs/features/drawing-workflow.md "타임라인 신뢰성 보장 > Fire-and-forget 금지"
//       Contact 생성 트랜잭션 내 createInitialRevision 으로 v1 이 항상 쌓임.
//       Fallback 은 양 테이블 모두 비었을 때만 동작.
// ──────────────────────────────────────────────
describe('ContactTimelineService.getTimeline — [regression] 원본 v1 + revision v2 공존', () => {
  it('REG-1: DB 에 initial(v1) 및 domuson_fit(v2) revision 이 모두 있을 때 둘 다 노출', async () => {
    const prisma = makePrisma(
      [],
      [
        drawingRow({
          id: 'rev-v1',
          version: 1,
          reason: 'initial',
          processStage: null,
          actorType: 'system',
          actorName: null,
          createdAt: new Date('2026-04-10T10:00:00Z'),
        }),
        drawingRow({
          id: 'rev-v2',
          version: 2,
          reason: 'domuson_fit',
          processStage: 'drawing',
          actorType: 'admin',
          actorName: '관리자',
          createdAt: new Date('2026-04-11T12:00:00Z'),
        }),
      ]
    );
    const service = buildService(prisma);

    const result = await service.getTimeline(CONTACT_ID);

    const drawingItems = result.filter((i) => i.kind === 'drawing_revision');
    expect(drawingItems).toHaveLength(2);
    const versions = drawingItems
      .map((i) => (i.payload as { version: number }).version)
      .sort((a, b) => a - b);
    expect(versions).toEqual([1, 2]);
    const reasons = drawingItems.map((i) => (i.payload as { reason: string }).reason);
    expect(reasons).toContain('initial');
    expect(reasons).toContain('domuson_fit');
    // fallback 미참여 (실데이터 사용)
    expect(result.every((i) => !i.id.startsWith('fallback:'))).toBe(true);
  });

  it('REG-2: 실데이터 1건 있을 때 fallback 비활성 (F4 와 동일하지만 drawing_revision 만 있어도 적용)', async () => {
    const prisma = makeFallbackPrisma(
      [],
      [drawingRow({ id: 'real-drawing', version: 1, reason: 'initial' })],
      defaultContact()
    );
    const service = buildService(prisma as never);

    const result = await service.getTimeline(CONTACT_ID);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('real-drawing');
    expect(result.some((i) => i.id.startsWith('fallback:'))).toBe(false);
    expect(prisma.contact.findUnique).toHaveBeenCalledWith({
      where: { id: CONTACT_ID },
      select: {
        id: true,
        isUrgent: true,
        urgentAt: true,
      },
    });
  });
});

// ──────────────────────────────────────────────
// R1~R3: recordChange — throw 전환 + tx 전파 (Phase 2 tx-guarantee)
//
// 스펙: docs/specs/features/drawing-workflow.md "타임라인 신뢰성 보장 > 트랜잭션 보장"
//       warning 삼킴 제거 → 호출자가 에러 처리 책임.
//       tx 주입 시 해당 트랜잭션 클라이언트에 INSERT.
// ──────────────────────────────────────────────
describe('ContactTimelineService.recordChange — throw & tx 전파', () => {
  it('R1: DB 에러 시 throw (warning 삼키지 않음)', async () => {
    const prisma = {
      contactStatusHistory: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockRejectedValue(new Error('DB down')),
      },
      drawingRevision: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = buildService(prisma as never);

    await expect(
      service.recordChange({
        contactId: CONTACT_ID,
        changeType: 'created',
        actorType: 'system',
        source: 'manual',
      })
    ).rejects.toThrow('DB down');
  });

  it('R2: tx 제공 시 tx.contactStatusHistory.create 사용 (this.prisma 미사용)', async () => {
    const prismaCreate = jest.fn();
    const txCreate = jest.fn().mockResolvedValue({ id: 'tx-status' });
    const prisma = {
      contactStatusHistory: { findMany: jest.fn(), create: prismaCreate },
      drawingRevision: { findMany: jest.fn() },
    };
    const tx = {
      contactStatusHistory: { create: txCreate },
    };
    const service = buildService(prisma as never);

    await service.recordChange({
      contactId: CONTACT_ID,
      changeType: 'created',
      actorType: 'system',
      source: 'manual',
      tx: tx as never,
    });

    expect(txCreate).toHaveBeenCalledTimes(1);
    expect(prismaCreate).not.toHaveBeenCalled();
  });

  it('R3: tx 미제공 시 this.prisma.contactStatusHistory.create 사용 (기본값)', async () => {
    const prismaCreate = jest.fn().mockResolvedValue({ id: 'prisma-status' });
    const prisma = {
      contactStatusHistory: { findMany: jest.fn(), create: prismaCreate },
      drawingRevision: { findMany: jest.fn() },
    };
    const service = buildService(prisma as never);

    await service.recordChange({
      contactId: CONTACT_ID,
      changeType: 'created',
      actorType: 'system',
      source: 'manual',
    });

    expect(prismaCreate).toHaveBeenCalledTimes(1);
  });
});
