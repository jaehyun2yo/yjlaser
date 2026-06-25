/**
 * ContactsController.getTimeline 컨트롤러 테스트
 *
 * 스펙: tasks/13-drawing-timeline-unify/phase2.md
 *
 * 검증:
 * 1. 응답 shape = { timeline: TimelineItemDto[] } 래핑 유지
 * 2. 거래처 세션이 다른 companyId의 contact 요청 시 403 ForbiddenException
 */

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { ContactTimelineService } from './contact-timeline.service';
import { DrawingRevisionService } from './drawing-revision.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SessionUser } from '../auth/auth.service';
import { TimelineItemDto } from './dto/timeline-item.dto';
import { WorkerContactAccessService } from '../worker-access/worker-contact-access.service';

const CONTACT_ID = '11111111-1111-1111-1111-111111111111';

function makeTimelineItem(overrides: Partial<TimelineItemDto> = {}): TimelineItemDto {
  return {
    id: 'item-1',
    kind: 'status_change',
    createdAt: '2026-04-10T10:00:00.000Z',
    actorType: 'admin',
    actorName: '관리자',
    payload: {
      changeType: 'status',
      fromValue: 'received',
      toValue: 'drawing',
      metadata: {},
    },
    ...overrides,
  };
}

function makeAdminUser(): SessionUser {
  return { userType: 'admin', userId: 'admin', companyId: 0 };
}

function makeCompanyUser(companyId = 42): SessionUser {
  return { userType: 'company', userId: companyId, companyId };
}

function makeApiKeyUser(): SessionUser {
  return {
    userType: 'integration',
    userId: 'api:web',
    companyId: null,
    programType: 'web',
    permissions: ['job/read'],
  };
}

function makeWorkerUser(): SessionUser {
  return {
    userType: 'worker',
    userId: 'worker-1',
    companyId: null,
    workerName: '검증작업자',
  } as SessionUser;
}

function buildController(
  deps: {
    contactsService?: Partial<ContactsService>;
    timelineService?: Partial<ContactTimelineService>;
    drawingRevisionService?: Partial<DrawingRevisionService>;
    prisma?: Partial<PrismaService>;
    storageService?: Partial<StorageService>;
    workerContactAccessService?: Partial<WorkerContactAccessService>;
  } = {}
) {
  const contactsService = (deps.contactsService as ContactsService) ?? ({} as ContactsService);
  const timelineService =
    (deps.timelineService as ContactTimelineService) ?? ({} as ContactTimelineService);
  const drawingRevisionService =
    (deps.drawingRevisionService as DrawingRevisionService) ?? ({} as DrawingRevisionService);
  const prisma = (deps.prisma as PrismaService) ?? ({} as PrismaService);
  const storageService = (deps.storageService as StorageService) ?? ({} as StorageService);
  const workerContactAccessService =
    (deps.workerContactAccessService as WorkerContactAccessService) ??
    ({
      assertCanAccessContact: jest.fn().mockResolvedValue(undefined),
      assertCanAccessContacts: jest.fn().mockResolvedValue(undefined),
    } as unknown as WorkerContactAccessService);

  return new ContactsController(
    contactsService,
    timelineService,
    drawingRevisionService,
    prisma,
    storageService,
    workerContactAccessService
  );
}

describe('ContactsController.findByWorkNumber — 운영 identity lookup', () => {
  const contact = {
    id: CONTACT_ID,
    workNumber: '260624-F-001',
    inquiryNumber: '260624-O-001',
    companyId: 42,
    webhardFolderId: 'folder-inquiry-1',
    processStage: 'laser',
    status: 'production',
    companyName: '거래처A',
    inquiryTitle: '레이저 가공 문의',
    inquiryType: 'cutting_request',
  };

  it('작업번호로 조회한 Contact identity를 { contact }로 반환한다', async () => {
    const findByWorkNumber = jest.fn().mockResolvedValue(contact);
    const controller = buildController({
      contactsService: {
        findByWorkNumber,
      } as unknown as Partial<ContactsService>,
    });

    const result = await controller.findByWorkNumber(' 260624-F-001 ', makeApiKeyUser());

    expect(result).toEqual({ contact });
    expect(findByWorkNumber).toHaveBeenCalledWith('260624-F-001');
  });

  it('작업번호가 없으면 BadRequestException을 던진다', async () => {
    const findByWorkNumber = jest.fn();
    const controller = buildController({
      contactsService: {
        findByWorkNumber,
      } as unknown as Partial<ContactsService>,
    });

    await expect(controller.findByWorkNumber('   ', makeApiKeyUser())).rejects.toThrow(
      BadRequestException
    );
    expect(findByWorkNumber).not.toHaveBeenCalled();
  });

  it('문의번호로 조회한 Contact identity를 { contact }로 반환한다', async () => {
    const findByInquiryNumber = jest.fn().mockResolvedValue(contact);
    const controller = buildController({
      contactsService: {
        findByInquiryNumber,
      } as unknown as Partial<ContactsService>,
    });

    const result = await controller.findByInquiryNumber(' 260624-O-001 ', makeApiKeyUser());

    expect(result).toEqual({ contact });
    expect(findByInquiryNumber).toHaveBeenCalledWith('260624-O-001');
  });

  it('문의번호가 없으면 BadRequestException을 던진다', async () => {
    const findByInquiryNumber = jest.fn();
    const controller = buildController({
      contactsService: {
        findByInquiryNumber,
      } as unknown as Partial<ContactsService>,
    });

    await expect(controller.findByInquiryNumber('   ', makeApiKeyUser())).rejects.toThrow(
      BadRequestException
    );
    expect(findByInquiryNumber).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────
// 1. 응답 shape = { timeline: [...] }
// ──────────────────────────────────────────────
describe('ContactsController.getTimeline — 응답 shape', () => {
  it('admin 세션: { timeline: TimelineItemDto[] } 래핑 + forCompany=false로 서비스 호출', async () => {
    const timelineItems = [
      makeTimelineItem({ id: 't1' }),
      makeTimelineItem({
        id: 't2',
        kind: 'drawing_revision',
        payload: {
          revisionId: 't2',
          version: 1,
          processStage: null,
          reason: 'initial',
          reasonDetail: null,
          files: [],
          isPublic: true,
          note: null,
        },
      }),
    ];
    const getTimeline = jest.fn().mockResolvedValue(timelineItems);
    const controller = buildController({
      timelineService: {
        getTimeline,
      } as unknown as Partial<ContactTimelineService>,
    });

    const result = await controller.getTimeline(CONTACT_ID, makeAdminUser());

    expect(result).toEqual({ timeline: timelineItems });
    expect(getTimeline).toHaveBeenCalledWith(CONTACT_ID, { forCompany: false });
  });
});

// ──────────────────────────────────────────────
// 2. 거래처 세션이 다른 companyId contact 요청 → 403
// ──────────────────────────────────────────────
describe('ContactsController.getTimeline — 거래처 소유권 검증', () => {
  it('거래처 세션이 다른 companyId의 contact 요청 시 ForbiddenException', async () => {
    const getCompanyNameByCompanyId = jest.fn().mockResolvedValue('거래처A');
    const verifyCompanyOwnership = jest
      .fn()
      .mockRejectedValue(new ForbiddenException('해당 문의에 대한 접근 권한이 없습니다.'));
    const getTimeline = jest.fn();

    const controller = buildController({
      contactsService: {
        getCompanyNameByCompanyId,
        verifyCompanyOwnership,
      } as unknown as Partial<ContactsService>,
      timelineService: {
        getTimeline,
      } as unknown as Partial<ContactTimelineService>,
    });

    await expect(controller.getTimeline(CONTACT_ID, makeCompanyUser(42))).rejects.toThrow(
      ForbiddenException
    );

    expect(getCompanyNameByCompanyId).toHaveBeenCalledWith(42);
    expect(verifyCompanyOwnership).toHaveBeenCalledWith(CONTACT_ID, '거래처A');
    // 소유권 검증 실패 시 타임라인 조회 호출되지 않음
    expect(getTimeline).not.toHaveBeenCalled();
  });

  it('거래처 세션이 본인 companyId의 contact 요청 시 forCompany=true로 조회', async () => {
    const getCompanyNameByCompanyId = jest.fn().mockResolvedValue('거래처A');
    const verifyCompanyOwnership = jest.fn().mockResolvedValue({
      id: CONTACT_ID,
      companyName: '거래처A',
    });
    const timelineItems = [makeTimelineItem({ id: 'ok' })];
    const getTimeline = jest.fn().mockResolvedValue(timelineItems);

    const controller = buildController({
      contactsService: {
        getCompanyNameByCompanyId,
        verifyCompanyOwnership,
      } as unknown as Partial<ContactsService>,
      timelineService: {
        getTimeline,
      } as unknown as Partial<ContactTimelineService>,
    });

    const result = await controller.getTimeline(CONTACT_ID, makeCompanyUser(42));

    expect(result).toEqual({ timeline: timelineItems });
    expect(verifyCompanyOwnership).toHaveBeenCalledWith(CONTACT_ID, '거래처A');
    expect(getTimeline).toHaveBeenCalledWith(CONTACT_ID, { forCompany: true });
  });
});

describe('ContactsController.toggleUrgent', () => {
  it('worker 세션 이름을 긴급 토글 actor로 전달한다', async () => {
    const toggleUrgent = jest.fn().mockResolvedValue({ id: CONTACT_ID, is_urgent: true });
    const controller = buildController({
      contactsService: {
        toggleUrgent,
      } as unknown as Partial<ContactsService>,
    });

    await controller.toggleUrgent(CONTACT_ID, makeWorkerUser());

    expect(toggleUrgent).toHaveBeenCalledWith(CONTACT_ID, {
      actorType: 'worker',
      actorName: '검증작업자',
    });
  });

  it('company 세션은 긴급 토글을 수행할 수 없다', async () => {
    const toggleUrgent = jest.fn();
    const controller = buildController({
      contactsService: {
        toggleUrgent,
      } as unknown as Partial<ContactsService>,
    });

    await expect(controller.toggleUrgent(CONTACT_ID, makeCompanyUser())).rejects.toThrow(
      ForbiddenException
    );
    expect(toggleUrgent).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────
// 3. 최신 도면 다운로드 URL — 마지막 업로드 리비전 우선
// ──────────────────────────────────────────────
describe('ContactsController.getLatestDrawingUrl', () => {
  it('현재 공정 기준이 아니라 마지막 업로드된 DrawingRevision을 다운로드 대상으로 사용한다', async () => {
    const latestUploaded = { id: 'revision-last-uploaded' };
    const getLatestUploaded = jest.fn().mockResolvedValue(latestUploaded);
    const getLatestForCurrentStage = jest.fn().mockResolvedValue({ id: 'revision-current-stage' });
    const getRevisionDownloadUrl = jest
      .fn()
      .mockResolvedValue({ url: 'https://r2.example.com/latest', fileName: 'latest.dxf' });

    const controller = buildController({
      drawingRevisionService: {
        getLatestUploaded,
        getLatestForCurrentStage,
        getRevisionDownloadUrl,
      } as unknown as Partial<DrawingRevisionService>,
    });

    const result = await controller.getLatestDrawingUrl(CONTACT_ID, makeAdminUser());

    expect(result).toEqual({ url: 'https://r2.example.com/latest', fileName: 'latest.dxf' });
    expect(getLatestUploaded).toHaveBeenCalledWith(CONTACT_ID, { includePrivate: true });
    expect(getLatestForCurrentStage).not.toHaveBeenCalled();
    expect(getRevisionDownloadUrl).toHaveBeenCalledWith('revision-last-uploaded', 0);
  });
});

describe('ContactsController.getDrawingRevisionAccessInfo', () => {
  it('도면 revision 접근 제어 메타데이터를 서비스에서 조회한다', async () => {
    const revisionInfo = {
      id: '11111111-2222-3333-4444-555555555555',
      contactId: CONTACT_ID,
      companyName: '거래처A',
      isPublic: true,
    };
    const getRevisionAccessInfo = jest.fn().mockResolvedValue(revisionInfo);
    const controller = buildController({
      drawingRevisionService: {
        getRevisionAccessInfo,
      } as unknown as Partial<DrawingRevisionService>,
    });

    const result = await controller.getDrawingRevisionAccessInfo(revisionInfo.id, makeAdminUser());

    expect(result).toEqual(revisionInfo);
    expect(getRevisionAccessInfo).toHaveBeenCalledWith(revisionInfo.id);
  });
});

describe('ContactsController admin-only mutation boundary', () => {
  it.each([
    ['cleanup', (controller: ContactsController) => controller.cleanup(makeApiKeyUser())],
    [
      'deleteBatchByPattern',
      (controller: ContactsController) =>
        controller.deleteBatchByPattern('테스트%', makeApiKeyUser()),
    ],
    ['deleteAll', (controller: ContactsController) => controller.deleteAll(makeApiKeyUser())],
    [
      'update',
      (controller: ContactsController) =>
        controller.update(CONTACT_ID, { status: 'drawing' } as never, makeApiKeyUser()),
    ],
    [
      'restore',
      (controller: ContactsController) => controller.restore(CONTACT_ID, makeApiKeyUser()),
    ],
    [
      'delete',
      (controller: ContactsController) =>
        controller.delete(CONTACT_ID, { permanent: false }, makeApiKeyUser()),
    ],
    [
      'backfillTimeline',
      (controller: ContactsController) => controller.backfillTimeline(makeApiKeyUser()),
    ],
  ])('integration principal cannot call %s', async (_name, invoke) => {
    const contactsService = {
      cleanup: jest.fn(),
      deleteBatchByCompanyPattern: jest.fn(),
      deleteAll: jest.fn(),
      update: jest.fn(),
      restore: jest.fn(),
      softDelete: jest.fn(),
      permanentDelete: jest.fn(),
    } as unknown as Partial<ContactsService>;
    const timelineService = {
      backfillFromTimestamps: jest.fn(),
    } as unknown as Partial<ContactTimelineService>;
    const controller = buildController({ contactsService, timelineService });

    await expect(invoke(controller)).rejects.toThrow(ForbiddenException);

    expect(contactsService.cleanup).not.toHaveBeenCalled();
    expect(contactsService.deleteBatchByCompanyPattern).not.toHaveBeenCalled();
    expect(contactsService.deleteAll).not.toHaveBeenCalled();
    expect(contactsService.update).not.toHaveBeenCalled();
    expect(contactsService.restore).not.toHaveBeenCalled();
    expect(contactsService.softDelete).not.toHaveBeenCalled();
    expect(contactsService.permanentDelete).not.toHaveBeenCalled();
    expect(timelineService.backfillFromTimestamps).not.toHaveBeenCalled();
  });
});

describe('ContactsController drawing revision download boundary', () => {
  const revisionInfo = {
    id: '11111111-2222-3333-4444-555555555555',
    contactId: CONTACT_ID,
    companyName: '거래처A',
    isPublic: true,
  };

  it('integration principal cannot read revision metadata or download URL', async () => {
    const getRevisionAccessInfo = jest.fn().mockResolvedValue(revisionInfo);
    const getRevisionDownloadUrl = jest.fn();
    const controller = buildController({
      drawingRevisionService: {
        getRevisionAccessInfo,
        getRevisionDownloadUrl,
      } as unknown as Partial<DrawingRevisionService>,
    });

    await expect(
      controller.getDrawingRevisionAccessInfo(revisionInfo.id, makeApiKeyUser())
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.getDrawingRevisionDownloadUrl(revisionInfo.id, '0', makeApiKeyUser())
    ).rejects.toThrow(ForbiddenException);

    expect(getRevisionAccessInfo).not.toHaveBeenCalled();
    expect(getRevisionDownloadUrl).not.toHaveBeenCalled();
  });

  it('company session cannot download an owned private revision', async () => {
    const getCompanyNameByCompanyId = jest.fn().mockResolvedValue('거래처A');
    const getRevisionAccessInfo = jest.fn().mockResolvedValue({
      ...revisionInfo,
      isPublic: false,
    });
    const getRevisionDownloadUrl = jest.fn();
    const controller = buildController({
      contactsService: {
        getCompanyNameByCompanyId,
      } as unknown as Partial<ContactsService>,
      drawingRevisionService: {
        getRevisionAccessInfo,
        getRevisionDownloadUrl,
      } as unknown as Partial<DrawingRevisionService>,
    });

    await expect(
      controller.getDrawingRevisionDownloadUrl(revisionInfo.id, '0', makeCompanyUser(42))
    ).rejects.toThrow(ForbiddenException);

    expect(getRevisionAccessInfo).toHaveBeenCalledWith(revisionInfo.id);
    expect(getRevisionDownloadUrl).not.toHaveBeenCalled();
  });

  it('company session can download an owned public revision', async () => {
    const getCompanyNameByCompanyId = jest.fn().mockResolvedValue('거래처A');
    const getRevisionAccessInfo = jest.fn().mockResolvedValue(revisionInfo);
    const getRevisionDownloadUrl = jest
      .fn()
      .mockResolvedValue({ url: 'https://r2.example.test/public', fileName: 'public.dxf' });
    const controller = buildController({
      contactsService: {
        getCompanyNameByCompanyId,
      } as unknown as Partial<ContactsService>,
      drawingRevisionService: {
        getRevisionAccessInfo,
        getRevisionDownloadUrl,
      } as unknown as Partial<DrawingRevisionService>,
    });

    const result = await controller.getDrawingRevisionDownloadUrl(
      revisionInfo.id,
      '0',
      makeCompanyUser(42)
    );

    expect(result).toEqual({ url: 'https://r2.example.test/public', fileName: 'public.dxf' });
    expect(getRevisionDownloadUrl).toHaveBeenCalledWith(revisionInfo.id, 0);
  });

  it('worker session must pass contact ACL before revision download URL is created', async () => {
    const getRevisionAccessInfo = jest.fn().mockResolvedValue({
      ...revisionInfo,
      isPublic: false,
    });
    const getRevisionDownloadUrl = jest.fn();
    const assertCanAccessContact = jest
      .fn()
      .mockRejectedValue(new ForbiddenException('Worker contact access denied'));
    const controller = buildController({
      drawingRevisionService: {
        getRevisionAccessInfo,
        getRevisionDownloadUrl,
      } as unknown as Partial<DrawingRevisionService>,
      workerContactAccessService: {
        assertCanAccessContact,
      } as unknown as Partial<WorkerContactAccessService>,
    });

    await expect(
      controller.getDrawingRevisionDownloadUrl(revisionInfo.id, '0', makeWorkerUser())
    ).rejects.toThrow(ForbiddenException);

    expect(assertCanAccessContact).toHaveBeenCalledWith(makeWorkerUser(), CONTACT_ID);
    expect(getRevisionDownloadUrl).not.toHaveBeenCalled();
  });

  it('visibility changes are admin-only and reject integration principals', async () => {
    const updateVisibility = jest.fn();
    const controller = buildController({
      drawingRevisionService: {
        updateVisibility,
      } as unknown as Partial<DrawingRevisionService>,
    });

    await expect(
      controller.updateDrawingRevisionVisibility(
        revisionInfo.id,
        { isPublic: true },
        makeApiKeyUser()
      )
    ).rejects.toThrow(ForbiddenException);

    expect(updateVisibility).not.toHaveBeenCalled();
  });
});

describe('ContactsController latest drawing visibility boundary', () => {
  it('company latest drawing lookup only returns public revisions', async () => {
    const getCompanyNameByCompanyId = jest.fn().mockResolvedValue('거래처A');
    const verifyCompanyOwnership = jest.fn().mockResolvedValue({ id: CONTACT_ID });
    const getLatestForCurrentStage = jest.fn().mockResolvedValue({ id: 'public-revision' });
    const controller = buildController({
      contactsService: {
        getCompanyNameByCompanyId,
        verifyCompanyOwnership,
      } as unknown as Partial<ContactsService>,
      drawingRevisionService: {
        getLatestForCurrentStage,
      } as unknown as Partial<DrawingRevisionService>,
    });

    const result = await controller.getLatestDrawing(CONTACT_ID, makeCompanyUser(42));

    expect(result).toEqual({ drawing: { id: 'public-revision' } });
    expect(verifyCompanyOwnership).toHaveBeenCalledWith(CONTACT_ID, '거래처A');
    expect(getLatestForCurrentStage).toHaveBeenCalledWith(CONTACT_ID, { includePrivate: false });
  });

  it('integration principal cannot request latest drawing or latest drawing URL', async () => {
    const getLatestForCurrentStage = jest.fn();
    const getLatestUploaded = jest.fn();
    const controller = buildController({
      drawingRevisionService: {
        getLatestForCurrentStage,
        getLatestUploaded,
      } as unknown as Partial<DrawingRevisionService>,
    });

    await expect(controller.getLatestDrawing(CONTACT_ID, makeApiKeyUser())).rejects.toThrow(
      ForbiddenException
    );
    await expect(controller.getLatestDrawingUrl(CONTACT_ID, makeApiKeyUser())).rejects.toThrow(
      ForbiddenException
    );

    expect(getLatestForCurrentStage).not.toHaveBeenCalled();
    expect(getLatestUploaded).not.toHaveBeenCalled();
  });

  it('company latest drawing URL does not fall back to private contact.drawingFileUrl when no public revision exists', async () => {
    const getCompanyNameByCompanyId = jest.fn().mockResolvedValue('거래처A');
    const verifyCompanyOwnership = jest.fn().mockResolvedValue({ id: CONTACT_ID });
    const getLatestUploaded = jest.fn().mockResolvedValue(null);
    const getRevisionDownloadUrl = jest.fn();
    const findUnique = jest.fn();
    const getDownloadPresignedUrl = jest.fn();
    const controller = buildController({
      contactsService: {
        getCompanyNameByCompanyId,
        verifyCompanyOwnership,
      } as unknown as Partial<ContactsService>,
      drawingRevisionService: {
        getLatestUploaded,
        getRevisionDownloadUrl,
      } as unknown as Partial<DrawingRevisionService>,
      prisma: {
        contact: { findUnique },
      } as unknown as Partial<PrismaService>,
      storageService: {
        getDownloadPresignedUrl,
      } as unknown as Partial<StorageService>,
    });

    await expect(controller.getLatestDrawingUrl(CONTACT_ID, makeCompanyUser(42))).rejects.toThrow(
      NotFoundException
    );

    expect(getLatestUploaded).toHaveBeenCalledWith(CONTACT_ID, { includePrivate: false });
    expect(getRevisionDownloadUrl).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(getDownloadPresignedUrl).not.toHaveBeenCalled();
  });
});

describe('ContactsController worker actor boundary', () => {
  it('API key integration 요청은 actorType이 없어도 worker workflow 공정 변경을 수행할 수 없다', async () => {
    const updateProcessStage = jest.fn();
    const controller = buildController({
      contactsService: {
        updateProcessStage,
      } as unknown as Partial<ContactsService>,
    });

    await expect(
      controller.updateProcessStage(CONTACT_ID, { processStage: 'laser' }, makeApiKeyUser())
    ).rejects.toThrow(ForbiddenException);

    expect(updateProcessStage).not.toHaveBeenCalled();
  });

  it('API key integration 요청은 worker actor 위조로 공정 변경을 수행할 수 없다', async () => {
    const updateProcessStage = jest.fn();
    const controller = buildController({
      contactsService: {
        updateProcessStage,
      } as unknown as Partial<ContactsService>,
    });

    await expect(
      controller.updateProcessStage(
        CONTACT_ID,
        {
          processStage: 'laser',
          actorType: 'worker',
          actorName: '위조작업자',
        },
        makeApiKeyUser()
      )
    ).rejects.toThrow(ForbiddenException);

    expect(updateProcessStage).not.toHaveBeenCalled();
  });

  it('worker drawing revision 조회는 contact ACL을 통과한 뒤에만 revision을 읽는다', async () => {
    const getRevisions = jest.fn().mockResolvedValue([{ id: 'revision-1' }]);
    const assertCanAccessContact = jest.fn().mockResolvedValue(undefined);
    const controller = buildController({
      drawingRevisionService: {
        getRevisions,
      } as unknown as Partial<DrawingRevisionService>,
      workerContactAccessService: {
        assertCanAccessContact,
      } as unknown as Partial<WorkerContactAccessService>,
    });

    const result = await controller.getDrawingRevisions(CONTACT_ID, 'true', makeWorkerUser());

    expect(result).toEqual([{ id: 'revision-1' }]);
    expect(assertCanAccessContact).toHaveBeenCalledWith(makeWorkerUser(), CONTACT_ID);
    expect(getRevisions).toHaveBeenCalledWith(CONTACT_ID, { includePrivate: true });
  });

  it('worker contact ACL 실패 시 drawing revision 조회를 실행하지 않는다', async () => {
    const getRevisions = jest.fn();
    const assertCanAccessContact = jest
      .fn()
      .mockRejectedValue(new ForbiddenException('Worker contact access denied'));
    const controller = buildController({
      drawingRevisionService: {
        getRevisions,
      } as unknown as Partial<DrawingRevisionService>,
      workerContactAccessService: {
        assertCanAccessContact,
      } as unknown as Partial<WorkerContactAccessService>,
    });

    await expect(
      controller.getDrawingRevisions(CONTACT_ID, 'true', makeWorkerUser())
    ).rejects.toThrow(ForbiddenException);

    expect(getRevisions).not.toHaveBeenCalled();
  });

  it('API key integration 요청은 도면 revision 생성에서 admin fallback actor가 될 수 없다', async () => {
    const createRevision = jest.fn();
    const controller = buildController({
      drawingRevisionService: {
        createRevision,
      } as unknown as Partial<DrawingRevisionService>,
    });

    await expect(
      controller.createDrawingRevision(
        CONTACT_ID,
        {
          reason: 'field_correction',
          files: [],
        },
        makeApiKeyUser()
      )
    ).rejects.toThrow(ForbiddenException);

    expect(createRevision).not.toHaveBeenCalled();
  });

  it('worker session 요청은 DTO actorName 대신 검증된 세션 workerName을 사용한다', async () => {
    const updateProcessStage = jest.fn().mockResolvedValue({ id: CONTACT_ID });
    const controller = buildController({
      contactsService: {
        updateProcessStage,
      } as unknown as Partial<ContactsService>,
    });

    await controller.updateProcessStage(
      CONTACT_ID,
      {
        processStage: 'laser',
        actorType: 'worker',
        actorName: '위조작업자',
      },
      makeWorkerUser()
    );

    expect(updateProcessStage).toHaveBeenCalledWith(CONTACT_ID, 'laser', {
      actorType: 'worker',
      actorName: '검증작업자',
    });
  });

  it('company session 도면 revision 생성은 소유권 검증 후 company actor로만 수행한다', async () => {
    const getCompanyNameByCompanyId = jest.fn().mockResolvedValue('거래처A');
    const verifyCompanyOwnership = jest.fn().mockResolvedValue({ id: CONTACT_ID });
    const createRevision = jest.fn().mockResolvedValue({
      revision: { id: 'revision-1' },
      webhardWarning: undefined,
    });
    const controller = buildController({
      contactsService: {
        getCompanyNameByCompanyId,
        verifyCompanyOwnership,
      } as unknown as Partial<ContactsService>,
      drawingRevisionService: {
        createRevision,
      } as unknown as Partial<DrawingRevisionService>,
    });

    await controller.createDrawingRevision(
      CONTACT_ID,
      {
        reason: 'revision_request',
        files: [],
      },
      makeCompanyUser(42)
    );

    expect(verifyCompanyOwnership).toHaveBeenCalledWith(CONTACT_ID, '거래처A');
    expect(createRevision).toHaveBeenCalledWith(
      CONTACT_ID,
      expect.objectContaining({ reason: 'revision_request' }),
      { actorType: 'company', actorName: '거래처A' }
    );
  });

  it('company session 도면 revision 조회는 소유권 검증 후 public revision만 조회한다', async () => {
    const getCompanyNameByCompanyId = jest.fn().mockResolvedValue('거래처A');
    const verifyCompanyOwnership = jest.fn().mockResolvedValue({ id: CONTACT_ID });
    const getRevisions = jest.fn().mockResolvedValue([{ id: 'public-revision' }]);
    const controller = buildController({
      contactsService: {
        getCompanyNameByCompanyId,
        verifyCompanyOwnership,
      } as unknown as Partial<ContactsService>,
      drawingRevisionService: {
        getRevisions,
      } as unknown as Partial<DrawingRevisionService>,
    });

    const result = await controller.getDrawingRevisions(CONTACT_ID, undefined, makeCompanyUser(42));

    expect(result).toEqual([{ id: 'public-revision' }]);
    expect(verifyCompanyOwnership).toHaveBeenCalledWith(CONTACT_ID, '거래처A');
    expect(getRevisions).toHaveBeenCalledWith(CONTACT_ID, { includePrivate: false });
  });

  it('company session 도면 revision 생성은 다른 actor 위조를 거부한다', async () => {
    const createRevision = jest.fn();
    const controller = buildController({
      drawingRevisionService: {
        createRevision,
      } as unknown as Partial<DrawingRevisionService>,
    });

    await expect(
      controller.createDrawingRevision(
        CONTACT_ID,
        {
          reason: 'revision_request',
          files: [],
          actorType: 'admin',
          actorName: '위조관리자',
        },
        makeCompanyUser(42)
      )
    ).rejects.toThrow(ForbiddenException);

    expect(createRevision).not.toHaveBeenCalled();
  });
});
