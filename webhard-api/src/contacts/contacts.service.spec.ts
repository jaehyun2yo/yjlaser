/**
 * ContactsService 단위 테스트
 *
 * 스펙: docs/specs/features/drawing-workflow.md "타임라인 신뢰성 보장 > Fire-and-forget 금지"
 *       docs/specs/features/drawing-revision-history.md (파일명 prefix 규칙)
 * 태스크: tasks/18-drawing-consistency Phase 3 (트랜잭션), Phase 4 (filename-prefix),
 *        Phase 5 (folder-routing-hooks)
 *
 * 검증:
 *   TX1~TX3: create 트랜잭션 보장
 *   DL1~DL4: getDrawingDownloadUrl / getFileDownloadUrl → "[번호] 원본명" prefix
 *            (processStage/inquiryType 기반, status 무관 — FIELD_STATUSES 제거 확인)
 *   H1~H4  : updateInquiryType / updateProcessStage / updateStatus 에서
 *            번호 발급 직후 ensureInquiryFolder + relocateContactFiles 호출
 */

import {
  BadRequestException,
  ConflictException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';

interface PrismaMock {
  contact: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
  };
  company: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
  };
  notification: {
    create: jest.Mock;
  };
  contactStatusHistory: {
    create: jest.Mock;
  };
  webhardFolder: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  webhardFile: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  workerNote: {
    count: jest.Mock;
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    delete: jest.Mock;
  };
  drawingRevision: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
  executeWithRetry: jest.Mock;
  $transaction: jest.Mock;
}

function makePrisma(): PrismaMock {
  const prisma: PrismaMock = {
    contact: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    company: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    notification: {
      create: jest.fn().mockResolvedValue(undefined),
    },
    contactStatusHistory: {
      create: jest.fn().mockResolvedValue({}),
    },
    webhardFolder: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    webhardFile: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    },
    workerNote: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({
        id: 1,
        contactId: 'contact-1',
        type: 'issue',
        content: '현장 확인 필요',
        createdBy: 'worker-a',
        createdAt: new Date('2026-05-15T00:00:00.000Z'),
      }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    drawingRevision: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    executeWithRetry: jest.fn().mockImplementation(async (op: () => Promise<unknown>) => op()),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (input: Array<Promise<unknown>> | ((tx: PrismaMock) => unknown)) => {
      if (Array.isArray(input)) {
        return Promise.all(input);
      }
      return input(prisma);
    }
  );
  return prisma;
}

function buildService(
  overrides: {
    prisma?: PrismaMock;
    recordChange?: jest.Mock;
    createInitialRevision?: jest.Mock;
    getLatestForCurrentStage?: jest.Mock;
    getDownloadPresignedUrl?: jest.Mock;
    generateNumber?: jest.Mock;
    ensureInquiryFolder?: jest.Mock;
    relocateContactFiles?: jest.Mock;
    renameInquiryFolderForContact?: jest.Mock;
    moveInquiryFolderToCompleted?: jest.Mock;
    onContactCreated?: jest.Mock;
    onInquiryTypeClassified?: jest.Mock;
    onProcessStageChanged?: jest.Mock;
    emitToFolder?: jest.Mock;
  } = {}
) {
  const prisma = overrides.prisma ?? makePrisma();
  const timeline = {
    recordChange: overrides.recordChange ?? jest.fn().mockResolvedValue({ id: 'status-1' }),
  };
  const drawingRevision = {
    createInitialRevision:
      overrides.createInitialRevision ?? jest.fn().mockResolvedValue({ id: 'rev-1' }),
    getLatestForCurrentStage:
      overrides.getLatestForCurrentStage ?? jest.fn().mockResolvedValue(null),
  };
  const gateway = {
    emitContactCreated: jest.fn(),
    emitContactUpdated: jest.fn(),
    emitContactStatusChanged: jest.fn(),
    emitContactProcessStageChanged: jest.fn(),
    emitContactSplit: jest.fn(),
    emitBatchUpdated: jest.fn(),
  };
  const mailService = {
    sendContactNotification: jest.fn().mockResolvedValue(undefined),
  };
  const numberService = {
    generateNumber: overrides.generateNumber ?? jest.fn().mockResolvedValue(null),
  };
  const storageService = {
    getDownloadPresignedUrl:
      overrides.getDownloadPresignedUrl ??
      jest.fn().mockResolvedValue({ url: 'https://cdn.yjlaser.net/signed' }),
  };
  const foldersService = {
    ensureInquiryFolder: overrides.ensureInquiryFolder ?? jest.fn().mockResolvedValue(null),
    relocateContactFiles:
      overrides.relocateContactFiles ?? jest.fn().mockResolvedValue({ movedIds: [] }),
    renameInquiryFolderForContact:
      overrides.renameInquiryFolderForContact ?? jest.fn().mockResolvedValue(undefined),
    moveInquiryFolderToCompleted:
      overrides.moveInquiryFolderToCompleted ?? jest.fn().mockResolvedValue(undefined),
  };
  const configService = { get: jest.fn() };
  const eventsGateway = {
    emitToFolder: overrides.emitToFolder ?? jest.fn(),
  };
  // task 23: ContactFolderSyncService 는 ContactsService 안의 ensureInquiryFolder /
  // relocateContactFiles / renameInquiryFolderForContact 직접 호출을 위임 받았다.
  // 기존 spec 의 호출 카운트 검증을 보존하기 위해 mock 의 default impl 이
  // 실제 FoldersService mock 메서드들을 호출하도록 (실제 ContactFolderSyncService 와 동일 시퀀스).
  const contactFolderSync = {
    onContactCreated:
      overrides.onContactCreated ??
      jest.fn().mockImplementation(async (ctx: { contactId: string; client?: unknown }) => {
        const folder = await foldersService.ensureInquiryFolder(ctx.contactId, ctx.client);
        if (!folder) return;
        await foldersService.relocateContactFiles(ctx.contactId, folder.id, ctx.client);
      }),
    onInquiryTypeClassified:
      overrides.onInquiryTypeClassified ??
      jest.fn().mockImplementation(async (ctx: { contactId: string; client?: unknown }) => {
        await foldersService.renameInquiryFolderForContact(ctx.contactId, ctx.client);
        const folder = await foldersService.ensureInquiryFolder(ctx.contactId, ctx.client);
        if (!folder) return;
        await foldersService.relocateContactFiles(ctx.contactId, folder.id, ctx.client);
      }),
    onProcessStageChanged:
      overrides.onProcessStageChanged ??
      jest.fn().mockImplementation(async (ctx: { contactId: string; client?: unknown }) => {
        await foldersService.renameInquiryFolderForContact(ctx.contactId, ctx.client);
        const folder = await foldersService.ensureInquiryFolder(ctx.contactId, ctx.client);
        if (!folder) return;
        await foldersService.relocateContactFiles(ctx.contactId, folder.id, ctx.client);
      }),
  };

  const service = new ContactsService(
    prisma as never,
    gateway as never,
    storageService as never,
    numberService as never,
    timeline as never,
    drawingRevision as never,
    mailService as never,
    foldersService as never,
    contactFolderSync as never,
    configService as never,
    eventsGateway as never
  );

  return {
    service,
    prisma,
    timeline,
    drawingRevision,
    gateway,
    mailService,
    storageService,
    numberService,
    foldersService,
    contactFolderSync,
    eventsGateway,
  };
}

const BASE_DTO: CreateContactDto = {
  name: '홍길동',
  email: 'test@example.com',
  phone: '010-0000-0000',
  companyName: '거래처A',
  position: null,
  contactType: 'company',
} as unknown as CreateContactDto;

const DTO_WITH_DRAWING: CreateContactDto = {
  ...BASE_DTO,
  drawingFileUrl: 'https://cdn.yjlaser.net/drawings/initial.dxf',
  drawingFileName: 'initial.dxf',
} as unknown as CreateContactDto;

describe('ContactsService.findByWorkNumber — 운영 identity lookup', () => {
  it('작업번호 exact lookup은 운영 연동 필수 identity 필드를 반환한다', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findMany.mockResolvedValueOnce([
      {
        id: 'contact-work-number',
        workNumber: '260624-F-001',
        inquiryNumber: '260624-O-001',
        companyId: 42,
        webhardFolderId: 'folder-inquiry-1',
        processStage: 'laser',
        status: 'production',
        companyName: '거래처A',
        inquiryTitle: '레이저 가공 문의',
        inquiryType: 'cutting_request',
      },
    ]);

    const result = await service.findByWorkNumber('260624-F-001');

    expect(result).toEqual({
      id: 'contact-work-number',
      workNumber: '260624-F-001',
      inquiryNumber: '260624-O-001',
      companyId: 42,
      webhardFolderId: 'folder-inquiry-1',
      processStage: 'laser',
      status: 'production',
      companyName: '거래처A',
      inquiryTitle: '레이저 가공 문의',
      inquiryType: 'cutting_request',
    });
    expect(prisma.contact.findMany).toHaveBeenCalledWith({
      where: { workNumber: '260624-F-001', status: { not: 'deleting' } },
      select: expect.objectContaining({
        id: true,
        workNumber: true,
        inquiryNumber: true,
        companyId: true,
        webhardFolderId: true,
        processStage: true,
        status: true,
        companyName: true,
        inquiryTitle: true,
        inquiryType: true,
      }),
      orderBy: { updatedAt: 'desc' },
      take: 2,
    });
  });

  it('문의번호 exact lookup도 동일한 identity shape를 반환한다', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findMany.mockResolvedValueOnce([
      {
        id: 'contact-inquiry-number',
        workNumber: null,
        inquiryNumber: '260624-O-001',
        companyId: null,
        webhardFolderId: 'external-folder-1',
        processStage: 'drawing',
        status: 'received',
        companyName: '미등록업체',
        inquiryTitle: '외부웹하드 문의',
        inquiryType: null,
      },
    ]);

    const result = await service.findByInquiryNumber('260624-O-001');

    expect(result).toEqual({
      id: 'contact-inquiry-number',
      workNumber: null,
      inquiryNumber: '260624-O-001',
      companyId: null,
      webhardFolderId: 'external-folder-1',
      processStage: 'drawing',
      status: 'received',
      companyName: '미등록업체',
      inquiryTitle: '외부웹하드 문의',
      inquiryType: null,
    });
    expect(prisma.contact.findMany).toHaveBeenCalledWith({
      where: { inquiryNumber: '260624-O-001', status: { not: 'deleting' } },
      select: expect.objectContaining({
        id: true,
        workNumber: true,
        inquiryNumber: true,
        companyId: true,
        webhardFolderId: true,
        processStage: true,
        status: true,
        companyName: true,
        inquiryTitle: true,
        inquiryType: true,
      }),
      orderBy: { updatedAt: 'desc' },
      take: 2,
    });
  });

  it('번호에 매칭되는 Contact가 없으면 null을 반환한다', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findMany.mockResolvedValueOnce([]);

    await expect(service.findByInquiryNumber('260624-O-404')).resolves.toBeNull();
  });

  it('같은 작업번호 Contact가 2건 이상이면 자동 매칭을 중단한다', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findMany.mockResolvedValueOnce([
      {
        id: 'contact-dup-1',
        workNumber: '260624-F-DUP',
        inquiryNumber: '260624-O-001',
        companyId: 1,
        webhardFolderId: 'folder-1',
        processStage: 'laser',
        status: 'production',
        companyName: '거래처A',
        inquiryTitle: '중복1',
        inquiryType: 'cutting_request',
      },
      {
        id: 'contact-dup-2',
        workNumber: '260624-F-DUP',
        inquiryNumber: '260624-O-002',
        companyId: 2,
        webhardFolderId: 'folder-2',
        processStage: 'laser',
        status: 'production',
        companyName: '거래처B',
        inquiryTitle: '중복2',
        inquiryType: 'cutting_request',
      },
    ]);

    await expect(service.findByWorkNumber('260624-F-DUP')).rejects.toThrow(BadRequestException);
  });
});

describe('ContactsService worker notifications', () => {
  it('작업자 이슈 메모 추가 시 관리자 작업관리 알림을 생성한다', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findUnique.mockResolvedValueOnce({
      id: 'contact-1',
      companyName: '테스트업체',
      inquiryNumber: 'O-1',
      workNumber: null,
    });

    await service.addWorkerNote('contact-1', {
      type: 'issue',
      content: '현장 확인 필요',
      createdBy: 'worker-a',
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userType: 'admin',
        userId: null,
        type: 'worker_issue_added',
        title: '작업 이슈 등록',
        metadata: expect.objectContaining({
          contactId: 'contact-1',
          link: '/admin/work-management?contactId=contact-1',
        }),
      }),
    });
  });

  it('작업자 노트 추가 응답은 worker 화면 계약에 맞게 snake_case로 반환한다', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findUnique.mockResolvedValueOnce({
      id: 'contact-1',
      companyName: '테스트업체',
      inquiryNumber: 'O-1',
      workNumber: null,
    });

    const result = await service.addWorkerNote('contact-1', {
      type: 'issue',
      content: '현장 확인 필요',
      createdBy: '김재현',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 1,
        contact_id: 'contact-1',
        type: 'issue',
        content: '현장 확인 필요',
        created_by: 'worker-a',
        created_at: '2026-05-15T00:00:00.000Z',
      })
    );
    expect(result).not.toHaveProperty('createdBy');
    expect(result).not.toHaveProperty('createdAt');
  });

  it('작업자 노트 목록 응답은 created_by와 created_at을 포함한다', async () => {
    const { service, prisma } = buildService();
    prisma.workerNote.findMany.mockResolvedValueOnce([
      {
        id: 2,
        contactId: 'contact-1',
        type: 'memo',
        content: '메모',
        createdBy: '김재현',
        createdAt: new Date('2026-05-21T05:30:00.000Z'),
        updatedAt: new Date('2026-05-21T05:30:00.000Z'),
      },
    ]);

    const result = await service.getWorkerNotes('contact-1');

    expect(result).toEqual([
      {
        id: 2,
        contact_id: 'contact-1',
        type: 'memo',
        content: '메모',
        created_by: '김재현',
        created_at: '2026-05-21T05:30:00.000Z',
        updated_at: '2026-05-21T05:30:00.000Z',
      },
    ]);
  });
});

describe('ContactsService.toggleUrgent', () => {
  it('긴급 배치 시 상태 변경과 타임라인 이력을 같은 트랜잭션에 기록하고 관리자 알림을 생성한다', async () => {
    const { service, prisma, timeline, gateway } = buildService();
    prisma.contact.findUnique.mockResolvedValueOnce({
      id: 'contact-1',
      isUrgent: false,
      companyName: '대성목형',
      companyId: 7,
    });
    prisma.contact.update.mockResolvedValueOnce({
      id: 'contact-1',
      isUrgent: true,
      urgentAt: new Date('2026-05-22T04:00:00.000Z'),
    });

    const result = await service.toggleUrgent('contact-1', {
      actorType: 'worker',
      actorName: '김재현',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'contact-1',
        is_urgent: true,
        urgent_at: '2026-05-22T04:00:00.000Z',
      })
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'contact-1' },
      data: expect.objectContaining({
        isUrgent: true,
        urgentAt: expect.any(Date),
      }),
    });
    expect(timeline.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: 'contact-1',
        changeType: 'urgent_toggle',
        fromStatus: 'normal',
        toStatus: 'urgent',
        actorType: 'worker',
        actorName: '김재현',
        companyName: '대성목형',
        companyId: 7,
        source: 'manual',
        metadata: { isUrgent: true },
        tx: prisma,
      })
    );
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userType: 'admin',
        type: 'contact_urgent',
        title: '긴급 문의 지정',
      }),
    });
    expect(gateway.emitContactUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'contact-1' })
    );
  });

  it('긴급 해제 시 타임라인에 해제 이력을 남기고 신규 긴급 알림은 만들지 않는다', async () => {
    const { service, prisma, timeline } = buildService();
    prisma.contact.findUnique.mockResolvedValueOnce({
      id: 'contact-1',
      isUrgent: true,
      companyName: '대성목형',
      companyId: 7,
    });
    prisma.contact.update.mockResolvedValueOnce({
      id: 'contact-1',
      isUrgent: false,
      urgentAt: null,
    });

    await service.toggleUrgent('contact-1', {
      actorType: 'worker',
      actorName: '김재현',
    });

    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'contact-1' },
      data: {
        isUrgent: false,
        urgentAt: null,
      },
    });
    expect(timeline.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        changeType: 'urgent_toggle',
        fromStatus: 'urgent',
        toStatus: 'normal',
        actorType: 'worker',
        actorName: '김재현',
        metadata: { isUrgent: false },
      })
    );
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

describe('ContactsService.create — 트랜잭션 보장 (Phase 3)', () => {
  it('TX1: drawingFileUrl 있을 때 contact.create + recordChange + createInitialRevision 단일 tx', async () => {
    const { service, prisma, timeline, drawingRevision } = buildService();
    prisma.contact.create.mockResolvedValue({
      id: 'contact-tx1',
      name: '홍길동',
      email: 'test@example.com',
      companyName: '거래처A',
      drawingFileUrl: DTO_WITH_DRAWING.drawingFileUrl,
      drawingFileName: DTO_WITH_DRAWING.drawingFileName,
      status: 'received',
      processStage: null,
    });

    await service.create(DTO_WITH_DRAWING);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.contact.create).toHaveBeenCalledTimes(1);

    expect(timeline.recordChange).toHaveBeenCalledTimes(1);
    const recordArg = timeline.recordChange.mock.calls[0][0] as {
      contactId: string;
      changeType: string;
      tx?: unknown;
    };
    expect(recordArg.contactId).toBe('contact-tx1');
    expect(recordArg.changeType).toBe('created');
    expect(recordArg.tx).toBeDefined();

    expect(drawingRevision.createInitialRevision).toHaveBeenCalledTimes(1);
    const initArgs = drawingRevision.createInitialRevision.mock.calls[0];
    expect(initArgs[0]).toBe('contact-tx1');
    expect(initArgs[1]).toBe(DTO_WITH_DRAWING.drawingFileUrl);
    expect(initArgs[2]).toBe(DTO_WITH_DRAWING.drawingFileName);
    expect(initArgs[3]).toMatchObject({ tx: expect.anything() });
  });

  it('TX2: createInitialRevision 실패 → 예외 전파 (Contact 생성 롤백)', async () => {
    const { service, prisma, drawingRevision } = buildService({
      createInitialRevision: jest.fn().mockRejectedValue(new Error('revision insert failed')),
    });
    prisma.contact.create.mockResolvedValue({
      id: 'contact-tx2',
      name: '홍길동',
      email: 'test@example.com',
      companyName: '거래처A',
      drawingFileUrl: DTO_WITH_DRAWING.drawingFileUrl,
      drawingFileName: DTO_WITH_DRAWING.drawingFileName,
      status: 'received',
      processStage: null,
    });

    await expect(service.create(DTO_WITH_DRAWING)).rejects.toThrow('revision insert failed');
    expect(drawingRevision.createInitialRevision).toHaveBeenCalledTimes(1);
  });

  it('TX3: drawingFileUrl 없으면 createInitialRevision 미호출, recordChange 만 1회', async () => {
    const { service, prisma, timeline, drawingRevision } = buildService();
    prisma.contact.create.mockResolvedValue({
      id: 'contact-tx3',
      name: '홍길동',
      email: 'test@example.com',
      companyName: '거래처A',
      drawingFileUrl: null,
      drawingFileName: null,
      status: 'received',
      processStage: null,
    });

    await service.create(BASE_DTO);

    expect(timeline.recordChange).toHaveBeenCalledTimes(1);
    expect(drawingRevision.createInitialRevision).not.toHaveBeenCalled();
  });
});

describe('ContactsService.batchStartDelivery — 납품증빙 웹하드 동기화', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-12T06:07:08.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('납품증빙 이미지를 문의 폴더에 납품완료_납품시간 파일명으로 저장한다', async () => {
    const ensureInquiryFolder = jest.fn().mockResolvedValue({
      id: 'folder-delivery',
      companyId: 42,
      contactId: 'contact-delivery',
      inquiryNumber: '260512-F-001',
      workNumber: '260512-F-001',
      folderKind: 'inquiry',
    });
    const moveInquiryFolderToCompleted = jest.fn().mockResolvedValue(undefined);
    const { service, prisma, eventsGateway } = buildService({
      ensureInquiryFolder,
      moveInquiryFolderToCompleted,
    });

    prisma.contact.findMany.mockResolvedValueOnce([
      {
        id: 'contact-delivery',
        processStage: 'delivery',
        status: 'production',
        companyName: '거래처A',
        inquiryNumber: '260512-F-001',
        workNumber: null,
      },
    ]);
    prisma.contact.update.mockResolvedValue({ id: 'contact-delivery' });
    prisma.webhardFile.create.mockResolvedValue({ id: 'file-delivery-proof' });

    const result = await service.batchStartDelivery({
      contactIds: ['contact-delivery'],
      deliveryProofImage: 'https://cdn.yjlaser.net/contacts/delivery-proofs/proof.webp',
      deliveryProofOriginalName: '현장사진.webp',
      deliveryProofFileSize: 1234,
      deliveryProofMimeType: 'image/webp',
      actorType: 'worker',
      actorName: '김작업',
    });

    expect(result.results).toEqual([{ contactId: 'contact-delivery', success: true }]);
    expect(ensureInquiryFolder).toHaveBeenCalledWith('contact-delivery');
    expect(moveInquiryFolderToCompleted).toHaveBeenCalledWith('contact-delivery');
    expect(prisma.webhardFile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '납품완료_20260512_150708.webp',
        originalName: '현장사진.webp',
        size: BigInt(1234),
        mimeType: 'image/webp',
        path: 'contacts/delivery-proofs/proof.webp',
        folderId: 'folder-delivery',
        companyId: 42,
        uploadedBy: '김작업',
        inquiryNumber: '260512-F-001',
      }),
    });
    expect(eventsGateway.emitToFolder).toHaveBeenCalledWith('folder-delivery', {
      type: 'file:created',
      folderId: 'folder-delivery',
      data: { fileId: 'file-delivery-proof', contactId: 'contact-delivery' },
    });
  });
});

// ──────────────────────────────────────────────
// Phase 4: 다운로드 파일명 prefix ("[번호] 원본명")
// ──────────────────────────────────────────────
const O_NUMBER = '260417-O-002';
const F_NUMBER = '260420-F-004';

describe('ContactsService.getDrawingDownloadUrl — 파일명 prefix (Phase 4)', () => {
  it('DL1: processStage=field(laser) → [workNumber] 원본명', async () => {
    const { service, prisma, storageService } = buildService();
    prisma.contact.findFirst.mockResolvedValue({
      drawingFileUrl: 'https://cdn.yjlaser.net/drawings/d1.dxf',
      drawingFileName: 'design.dxf',
      inquiryNumber: O_NUMBER,
      workNumber: F_NUMBER,
      processStage: 'laser',
      inquiryType: null,
    });

    const result = await service.getDrawingDownloadUrl('contact-dl1');

    expect(result.fileName).toBe(`[${F_NUMBER}] design.dxf`);
    expect(storageService.getDownloadPresignedUrl).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      `[${F_NUMBER}] design.dxf`
    );
  });

  it('DL2: processStage=office(drawing) + workNumber 존재 → [workNumber] 원본명', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findFirst.mockResolvedValue({
      drawingFileUrl: 'https://cdn.yjlaser.net/drawings/d2.dxf',
      drawingFileName: 'plan.dxf',
      inquiryNumber: O_NUMBER,
      workNumber: F_NUMBER,
      processStage: 'drawing',
      inquiryType: null,
    });

    const result = await service.getDrawingDownloadUrl('contact-dl2');

    expect(result.fileName).toBe(`[${F_NUMBER}] plan.dxf`);
  });

  it('DL3: 번호 모두 없음 → 원본명 그대로', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findFirst.mockResolvedValue({
      drawingFileUrl: 'https://cdn.yjlaser.net/drawings/d3.dxf',
      drawingFileName: 'naked.dxf',
      inquiryNumber: null,
      workNumber: null,
      processStage: null,
      inquiryType: null,
    });

    const result = await service.getDrawingDownloadUrl('contact-dl3');

    expect(result.fileName).toBe('naked.dxf');
  });
});

describe('ContactsService.getFileDownloadUrl — 파일명 prefix (Phase 4)', () => {
  it('DL4: attachment + processStage=laser → [workNumber] 원본명', async () => {
    const { service, prisma, storageService } = buildService();
    prisma.contact.findFirst.mockResolvedValue({
      attachmentUrl: 'https://cdn.yjlaser.net/attachments/a1.pdf',
      attachmentFilename: 'ref.pdf',
      drawingFileUrl: null,
      drawingFileName: null,
      revisionRequestFileUrl: null,
      revisionRequestFileName: null,
      referencePhotosUrls: null,
      revisionRequestHistory: null,
      deliveryProofImage: null,
      inquiryNumber: O_NUMBER,
      workNumber: F_NUMBER,
      processStage: 'laser',
      inquiryType: null,
    });

    const result = await service.getFileDownloadUrl('contact-dl4', 'attachment');

    expect(result.fileName).toBe(`[${F_NUMBER}] ref.pdf`);
    expect(storageService.getDownloadPresignedUrl).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      `[${F_NUMBER}] ref.pdf`
    );
  });

  it('DL5: attachment + processStage=sample(office) + workNumber 존재 → [workNumber] 원본명', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findFirst.mockResolvedValue({
      attachmentUrl: 'https://cdn.yjlaser.net/attachments/a2.pdf',
      attachmentFilename: 'sample.pdf',
      drawingFileUrl: null,
      drawingFileName: null,
      revisionRequestFileUrl: null,
      revisionRequestFileName: null,
      referencePhotosUrls: null,
      revisionRequestHistory: null,
      deliveryProofImage: null,
      inquiryNumber: O_NUMBER,
      workNumber: F_NUMBER,
      processStage: 'sample',
      inquiryType: null,
    });

    const result = await service.getFileDownloadUrl('contact-dl5', 'attachment');

    expect(result.fileName).toBe(`[${F_NUMBER}] sample.pdf`);
  });
});

// ══════════════════════════════════════════════════════════════
// Phase 5: folder-routing-hooks
// ══════════════════════════════════════════════════════════════
const INQUIRY_FOLDER_ID = 'inquiry-folder-h';

describe('ContactsService.updateInquiryType — folder routing (Phase 5 H1)', () => {
  it('H1: inquiryType 변경 시 ensureInquiryFolder + relocateContactFiles 호출', async () => {
    const ensureInquiryFolder = jest.fn().mockResolvedValue({ id: INQUIRY_FOLDER_ID });
    const relocateContactFiles = jest.fn().mockResolvedValue({ movedIds: ['f1'] });
    const generateNumber = jest.fn().mockResolvedValue(O_NUMBER);
    const { service, prisma } = buildService({
      ensureInquiryFolder,
      relocateContactFiles,
      generateNumber,
    });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-h1',
      source: 'webhard',
      inquiryType: null,
      inquiryNumber: null,
      workNumber: null,
      inquiryTitle: null,
      processStage: null,
      status: 'new',
      companyName: '거래처A',
    });
    prisma.contact.update.mockResolvedValue({
      id: 'contact-h1',
      inquiryType: 'cutting_request',
      inquiryNumber: O_NUMBER,
      status: 'drawing',
      processStage: 'drawing',
    });

    await service.updateInquiryType('contact-h1', 'cutting_request');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(ensureInquiryFolder).toHaveBeenCalledWith('contact-h1', expect.anything());
    expect(relocateContactFiles).toHaveBeenCalledWith(
      'contact-h1',
      INQUIRY_FOLDER_ID,
      expect.anything()
    );
  });

  it('H1b: ensureInquiryFolder=null(미분류 유지) → relocate 미호출', async () => {
    const ensureInquiryFolder = jest.fn().mockResolvedValue(null);
    const relocateContactFiles = jest.fn();
    const { service, prisma } = buildService({
      ensureInquiryFolder,
      relocateContactFiles,
    });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-h1b',
      source: 'webhard',
      inquiryType: 'cutting_request',
      inquiryNumber: O_NUMBER,
      workNumber: null,
      inquiryTitle: null,
      processStage: null,
      status: 'drawing',
      companyName: '거래처A',
    });
    prisma.contact.update.mockResolvedValue({
      id: 'contact-h1b',
      inquiryType: 'laser_cutting',
    });

    await service.updateInquiryType('contact-h1b', 'laser_cutting');

    expect(ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(relocateContactFiles).not.toHaveBeenCalled();
  });

  it('H4: ensureInquiryFolder 실패 시 Contact 업데이트까지 롤백', async () => {
    const ensureInquiryFolder = jest.fn().mockRejectedValue(new Error('ensure failed'));
    const relocateContactFiles = jest.fn();
    const { service, prisma } = buildService({
      ensureInquiryFolder,
      relocateContactFiles,
    });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-h4',
      source: 'webhard',
      inquiryType: null,
      inquiryNumber: null,
      workNumber: null,
      inquiryTitle: null,
      processStage: null,
      status: 'new',
      companyName: '거래처A',
    });
    prisma.contact.update.mockResolvedValue({ id: 'contact-h4' });

    await expect(service.updateInquiryType('contact-h4', 'cutting_request')).rejects.toThrow(
      'ensure failed'
    );
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(relocateContactFiles).not.toHaveBeenCalled();
  });
});

describe('ContactsService.updateProcessStage — folder routing (Phase 5 H2)', () => {
  it('H2: office→field 전환으로 workNumber 발급 시 ensureInquiryFolder + relocate 호출', async () => {
    const ensureInquiryFolder = jest.fn().mockResolvedValue({ id: INQUIRY_FOLDER_ID });
    const relocateContactFiles = jest.fn().mockResolvedValue({ movedIds: [] });
    const generateNumber = jest.fn().mockResolvedValue(F_NUMBER);
    const { service, prisma } = buildService({
      ensureInquiryFolder,
      relocateContactFiles,
      generateNumber,
    });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-h2',
      processStage: 'drawing',
      status: 'drawing',
      companyName: '거래처A',
      workNumber: null,
      inquiryNumber: O_NUMBER,
      inquiryTitle: `${O_NUMBER} 테스트`,
      inquiryType: 'cutting_request',
    });
    prisma.contact.update.mockResolvedValue({
      id: 'contact-h2',
      processStage: 'drawing_confirmed',
      status: 'drawing',
      workNumber: F_NUMBER,
      inquiryType: 'cutting_request',
      updatedAt: new Date(),
    });

    await service.updateProcessStage('contact-h2', 'drawing_confirmed');

    expect(generateNumber).toHaveBeenCalledWith('work');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(ensureInquiryFolder).toHaveBeenCalledWith('contact-h2', expect.anything());
    expect(relocateContactFiles).toHaveBeenCalledWith(
      'contact-h2',
      INQUIRY_FOLDER_ID,
      expect.anything()
    );
  });

  it('H2b: field→field 전환 (drawing_confirmed→laser) → $transaction 미사용, ensureInquiryFolder 미호출', async () => {
    // field→field 전환은 isOfficeToField=false 이므로 folder sync 가 실행되지 않는다.
    const ensureInquiryFolder = jest.fn();
    const { service, prisma } = buildService({ ensureInquiryFolder });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-h2b',
      processStage: 'drawing_confirmed',
      status: 'drawing',
      companyName: '거래처A',
      workNumber: F_NUMBER,
      inquiryNumber: O_NUMBER,
      inquiryTitle: null,
      inquiryType: 'cutting_request',
    });
    prisma.contact.update.mockResolvedValue({
      id: 'contact-h2b',
      processStage: 'laser',
      status: 'drawing',
      workNumber: F_NUMBER,
      inquiryType: 'cutting_request',
      updatedAt: new Date(),
    });

    await service.updateProcessStage('contact-h2b', 'laser');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(ensureInquiryFolder).not.toHaveBeenCalled();
  });

  it('H2c: expectedCurrentStage 조건부 업데이트가 race로 바뀐 stage를 감지하면 중단한다', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findUnique
      .mockResolvedValueOnce({
        id: 'contact-h2c',
        processStage: 'drawing_confirmed',
        status: 'drawing',
        companyName: '거래처A',
        workNumber: F_NUMBER,
        inquiryNumber: O_NUMBER,
        inquiryTitle: null,
        inquiryType: 'cutting_request',
      })
      .mockResolvedValueOnce({
        id: 'contact-h2c',
        processStage: 'cutting',
        status: 'drawing',
        workNumber: F_NUMBER,
        inquiryType: 'cutting_request',
        updatedAt: new Date('2026-06-24T00:00:00.000Z'),
      });
    prisma.contact.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateProcessStage(
        'contact-h2c',
        'laser',
        { actorType: 'system', actorName: 'management_program' },
        { expectedCurrentStage: 'drawing_confirmed' }
      )
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.contact.updateMany).toHaveBeenCalledWith({
      where: { id: 'contact-h2c', processStage: 'drawing_confirmed' },
      data: expect.objectContaining({ processStage: 'laser' }),
    });
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it('H2d: laser_cutting 특수 완료 branch도 expectedCurrentStage race를 감지하면 중단한다', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findUnique
      .mockResolvedValueOnce({
        id: 'contact-h2d',
        processStage: 'laser',
        status: 'cutting',
        companyName: '거래처A',
        workNumber: F_NUMBER,
        inquiryNumber: O_NUMBER,
        inquiryTitle: null,
        inquiryType: 'laser_cutting',
      })
      .mockResolvedValueOnce({
        id: 'contact-h2d',
        processStage: 'drawing_confirmed',
        status: 'drawing',
        workNumber: F_NUMBER,
        inquiryType: 'laser_cutting',
        updatedAt: new Date('2026-06-24T00:00:00.000Z'),
      });
    prisma.contact.updateMany.mockResolvedValue({ count: 0 });
    prisma.contact.update.mockResolvedValue({
      id: 'contact-h2d',
      processStage: null,
      status: 'completed',
      workNumber: F_NUMBER,
      inquiryType: 'laser_cutting',
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    });

    await expect(
      service.updateProcessStage(
        'contact-h2d',
        'cutting',
        { actorType: 'system', actorName: 'nesting_program' },
        { expectedCurrentStage: 'laser' }
      )
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.contact.updateMany).toHaveBeenCalledWith({
      where: { id: 'contact-h2d', processStage: 'laser' },
      data: expect.objectContaining({ status: 'completed', processStage: null }),
    });
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it('H2e: laser_cutting retry가 이미 완료된 row를 만나면 이벤트와 타임라인을 재발행하지 않는다', async () => {
    const { service, prisma, gateway, timeline } = buildService();
    prisma.contact.findUnique
      .mockResolvedValueOnce({
        id: 'contact-h2e',
        processStage: 'laser',
        status: 'cutting',
        companyName: '거래처A',
        workNumber: F_NUMBER,
        inquiryNumber: O_NUMBER,
        inquiryTitle: null,
        inquiryType: 'laser_cutting',
      })
      .mockResolvedValueOnce({
        id: 'contact-h2e',
        processStage: null,
        status: 'completed',
        workNumber: F_NUMBER,
        inquiryType: 'laser_cutting',
        updatedAt: new Date('2026-06-24T00:00:00.000Z'),
      });
    prisma.contact.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.updateProcessStage(
      'contact-h2e',
      'cutting',
      { actorType: 'system', actorName: 'nesting_program' },
      { expectedCurrentStage: 'laser' }
    );

    expect(result).toMatchObject({
      id: 'contact-h2e',
      process_stage: null,
      status: 'completed',
      status_changed: false,
    });
    expect(prisma.contact.updateMany).toHaveBeenCalledWith({
      where: { id: 'contact-h2e', processStage: 'laser' },
      data: expect.objectContaining({ status: 'completed', processStage: null }),
    });
    expect(gateway.emitContactProcessStageChanged).not.toHaveBeenCalled();
    expect(gateway.emitContactStatusChanged).not.toHaveBeenCalled();
    expect(timeline.recordChange).not.toHaveBeenCalled();
  });

  it('H2f: expectedCurrentStage retry가 이미 목표 stage로 바뀐 row를 만나면 이벤트와 타임라인을 재발행하지 않는다', async () => {
    const { service, prisma, gateway, timeline } = buildService();
    prisma.contact.findUnique
      .mockResolvedValueOnce({
        id: 'contact-h2f',
        processStage: 'drawing_confirmed',
        status: 'drawing',
        companyName: '거래처A',
        workNumber: F_NUMBER,
        inquiryNumber: O_NUMBER,
        inquiryTitle: null,
        inquiryType: 'cutting_request',
      })
      .mockResolvedValueOnce({
        id: 'contact-h2f',
        processStage: 'laser',
        status: 'drawing',
        workNumber: F_NUMBER,
        inquiryType: 'cutting_request',
        updatedAt: new Date('2026-06-24T00:00:00.000Z'),
      });
    prisma.contact.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.updateProcessStage(
      'contact-h2f',
      'laser',
      { actorType: 'system', actorName: 'management_program' },
      { expectedCurrentStage: 'drawing_confirmed' }
    );

    expect(result).toMatchObject({
      id: 'contact-h2f',
      process_stage: 'laser',
      previous_stage: 'drawing_confirmed',
      status: 'drawing',
      status_changed: false,
    });
    expect(prisma.contact.updateMany).toHaveBeenCalledWith({
      where: { id: 'contact-h2f', processStage: 'drawing_confirmed' },
      data: expect.objectContaining({ processStage: 'laser' }),
    });
    expect(gateway.emitContactProcessStageChanged).not.toHaveBeenCalled();
    expect(gateway.emitContactStatusChanged).not.toHaveBeenCalled();
    expect(timeline.recordChange).not.toHaveBeenCalled();
  });

  it('H2g: laser_cutting retry가 첫 조회에서 이미 완료 상태이면 expectedCurrentStage 충돌 대신 no-op으로 반환한다', async () => {
    const { service, prisma, gateway, timeline } = buildService();
    prisma.contact.findUnique.mockResolvedValueOnce({
      id: 'contact-h2g',
      processStage: null,
      status: 'completed',
      companyName: '거래처A',
      workNumber: F_NUMBER,
      inquiryNumber: O_NUMBER,
      inquiryTitle: null,
      inquiryType: 'laser_cutting',
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    });

    const result = await service.updateProcessStage(
      'contact-h2g',
      'cutting',
      { actorType: 'system', actorName: 'nesting_program' },
      { expectedCurrentStage: 'laser' }
    );

    expect(result).toMatchObject({
      id: 'contact-h2g',
      process_stage: null,
      status: 'completed',
      status_changed: false,
    });
    expect(prisma.contact.updateMany).not.toHaveBeenCalled();
    expect(prisma.contact.update).not.toHaveBeenCalled();
    expect(gateway.emitContactProcessStageChanged).not.toHaveBeenCalled();
    expect(gateway.emitContactStatusChanged).not.toHaveBeenCalled();
    expect(timeline.recordChange).not.toHaveBeenCalled();
  });

  it('H2h: laser_cutting 완료 timeline note는 updateProcessStage options.note를 우선 사용한다', async () => {
    const { service, prisma, timeline } = buildService();
    prisma.contact.findUnique
      .mockResolvedValueOnce({
        id: 'contact-h2h',
        processStage: 'laser',
        status: 'cutting',
        companyName: '거래처A',
        workNumber: F_NUMBER,
        inquiryNumber: O_NUMBER,
        inquiryTitle: null,
        inquiryType: 'laser_cutting',
      })
      .mockResolvedValueOnce({
        id: 'contact-h2h',
        processStage: null,
        status: 'completed',
        workNumber: F_NUMBER,
        inquiryType: 'laser_cutting',
        updatedAt: new Date('2026-06-24T00:00:00.000Z'),
      });
    prisma.contact.updateMany.mockResolvedValue({ count: 1 });

    await service.updateProcessStage(
      'contact-h2h',
      'cutting',
      { actorType: 'system', actorName: 'nesting_program' },
      { expectedCurrentStage: 'laser', note: '네스팅 배치완료 후 자동 완료' }
    );

    expect(timeline.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: 'contact-h2h',
        changeType: 'completed',
        note: '네스팅 배치완료 후 자동 완료',
      })
    );
  });
});

// ══════════════════════════════════════════════════════════════
// task 23 qa-contact-worker-v1 Phase 5: stage-transition-backend
//   - workNumber 이미 존재 + office→field 재전환 → onProcessStageChanged 호출 보장 (bug fix)
//   - inquiryNumber/workNumber 둘 다 없음 + drawing_confirmed → 422 UnprocessableEntityException
//   - transaction rollback 검증 (onProcessStageChanged throw → contact update 롤백)
// ══════════════════════════════════════════════════════════════
describe('ContactsService.updateProcessStage — task 23 phase 5 (stage-transition-backend)', () => {
  it('invalid processStage 값은 DB update 전에 거부한다', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-invalid-stage',
      processStage: 'laser',
      status: 'production',
      companyName: '거래처A',
      workNumber: F_NUMBER,
      inquiryNumber: O_NUMBER,
      inquiryTitle: null,
      inquiryType: 'mold_request',
    });

    await expect(service.updateProcessStage('contact-invalid-stage', 'bad_stage')).rejects.toThrow(
      BadRequestException
    );

    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it('T23-P5-1: workNumber 이미 존재 + drawing→drawing_confirmed 재전환 → onProcessStageChanged 호출', async () => {
    // QA 제보의 핵심 버그: drawing_confirmed 를 되돌렸다 다시 전진하거나 외부 동기화 Contact 가
    // workNumber 를 이미 갖고 있는 경우, 기존 코드는 issueWorkNumber=false 여서 폴더 sync 가 skip 됐다.
    // 수정 후: isOfficeToField=true 이면 workNumber 발급 여부와 무관하게 onProcessStageChanged 호출.
    const onProcessStageChanged = jest.fn().mockResolvedValue(undefined);
    const generateNumber = jest.fn();
    const { service, prisma } = buildService({
      onProcessStageChanged,
      generateNumber,
    });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-t23-p5-1',
      processStage: 'drawing',
      status: 'drawing',
      companyName: '거래처A',
      workNumber: F_NUMBER, // 이미 워크넘버 존재
      inquiryNumber: O_NUMBER,
      inquiryTitle: `${F_NUMBER} 테스트`,
      inquiryType: 'cutting_request',
    });
    prisma.contact.update.mockResolvedValue({
      id: 'contact-t23-p5-1',
      processStage: 'drawing_confirmed',
      status: 'drawing',
      workNumber: F_NUMBER,
      inquiryType: 'cutting_request',
      updatedAt: new Date(),
    });

    await service.updateProcessStage('contact-t23-p5-1', 'drawing_confirmed');

    // 이미 workNumber 존재 → 신규 발급 없음
    expect(generateNumber).not.toHaveBeenCalled();
    // 핵심: $transaction 내부에서 onProcessStageChanged 가 호출됨
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(onProcessStageChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: 'contact-t23-p5-1',
        previousStage: 'drawing',
        nextStage: 'drawing_confirmed',
        client: expect.anything(),
      })
    );
  });

  it('T23-P5-2: workNumber 없음 + drawing→drawing_confirmed → workNumber 발급 + onProcessStageChanged 호출', async () => {
    const onProcessStageChanged = jest.fn().mockResolvedValue(undefined);
    const generateNumber = jest.fn().mockResolvedValue(F_NUMBER);
    const { service, prisma } = buildService({
      onProcessStageChanged,
      generateNumber,
    });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-t23-p5-2',
      processStage: 'drawing',
      status: 'drawing',
      companyName: '거래처A',
      workNumber: null,
      inquiryNumber: O_NUMBER,
      inquiryTitle: `${O_NUMBER} 테스트`,
      inquiryType: 'cutting_request',
    });
    prisma.contact.update.mockResolvedValue({
      id: 'contact-t23-p5-2',
      processStage: 'drawing_confirmed',
      status: 'drawing',
      workNumber: F_NUMBER,
      inquiryType: 'cutting_request',
      updatedAt: new Date(),
    });

    await service.updateProcessStage('contact-t23-p5-2', 'drawing_confirmed');

    expect(generateNumber).toHaveBeenCalledWith('work');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(onProcessStageChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: 'contact-t23-p5-2',
        previousStage: 'drawing',
        nextStage: 'drawing_confirmed',
      })
    );
  });

  it('T23-P5-3: onProcessStageChanged throw → service.updateProcessStage 예외 전파 (rollback)', async () => {
    const onProcessStageChanged = jest.fn().mockRejectedValue(
      new UnprocessableEntityException({
        code: 'INQUIRY_NUMBER_REQUIRED',
        message: '도면 확정 전에 문의번호(O) 또는 작업번호(F) 가 할당되어야 합니다.',
        contactId: 'contact-t23-p5-3',
      })
    );
    const generateNumber = jest.fn().mockResolvedValue(null); // 번호 발급 실패 시뮬레이션
    const { service, prisma } = buildService({
      onProcessStageChanged,
      generateNumber,
    });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-t23-p5-3',
      processStage: 'drawing',
      status: 'drawing',
      companyName: '거래처A',
      workNumber: null,
      inquiryNumber: null,
      inquiryTitle: null,
      inquiryType: null,
    });
    prisma.contact.update.mockResolvedValue({
      id: 'contact-t23-p5-3',
      processStage: 'drawing_confirmed',
      status: 'drawing',
      workNumber: null,
      inquiryType: null,
      updatedAt: new Date(),
    });

    await expect(
      service.updateProcessStage('contact-t23-p5-3', 'drawing_confirmed')
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    // $transaction 은 호출되지만 onProcessStageChanged throw 로 Prisma 측 update 도 롤백 대상.
    // mock 에서는 rollback 시뮬레이션이 제한적이지만 최소한 예외 전파는 검증한다.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(onProcessStageChanged).toHaveBeenCalledTimes(1);
  });

  it('T23-P5-4: 예외 응답 payload 에 code=INQUIRY_NUMBER_REQUIRED 포함', async () => {
    const thrown = new UnprocessableEntityException({
      code: 'INQUIRY_NUMBER_REQUIRED',
      message: '도면 확정 전에 문의번호(O) 또는 작업번호(F) 가 할당되어야 합니다.',
      contactId: 'contact-t23-p5-4',
    });
    const onProcessStageChanged = jest.fn().mockRejectedValue(thrown);
    const { service, prisma } = buildService({ onProcessStageChanged });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-t23-p5-4',
      processStage: 'drawing',
      status: 'drawing',
      companyName: '거래처A',
      workNumber: null,
      inquiryNumber: null,
      inquiryTitle: null,
      inquiryType: null,
    });
    prisma.contact.update.mockResolvedValue({
      id: 'contact-t23-p5-4',
      processStage: 'drawing_confirmed',
    });

    try {
      await service.updateProcessStage('contact-t23-p5-4', 'drawing_confirmed');
      fail('expected UnprocessableEntityException');
    } catch (err) {
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      const response = (err as UnprocessableEntityException).getResponse();
      expect(response).toMatchObject({
        code: 'INQUIRY_NUMBER_REQUIRED',
      });
    }
  });

  it('T23-P5-5: sample→drawing_confirmed + workNumber 이미 존재 + 폴더 rename 성공 — rename 반드시 호출', async () => {
    // 되돌렸다 다시 전진하는 케이스 (task 문서의 silent fail 제거 시나리오 중 하나).
    // 기존 버그: workNumber 가 있으니 issueWorkNumber=false → rename skip.
    // 수정: isOfficeToField=true → onProcessStageChanged 호출 → FoldersService 의 rename 트리거.
    const renameInquiryFolderForContact = jest.fn().mockResolvedValue(undefined);
    const ensureInquiryFolder = jest.fn().mockResolvedValue({ id: INQUIRY_FOLDER_ID });
    const relocateContactFiles = jest.fn().mockResolvedValue({ movedIds: [] });
    const { service, prisma } = buildService({
      renameInquiryFolderForContact,
      ensureInquiryFolder,
      relocateContactFiles,
    });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-t23-p5-5',
      processStage: 'sample',
      status: 'drawing',
      companyName: '거래처A',
      workNumber: F_NUMBER, // 이미 존재
      inquiryNumber: O_NUMBER,
      inquiryTitle: `${F_NUMBER} 되돌린 문의`,
      inquiryType: 'cutting_request',
    });
    prisma.contact.update.mockResolvedValue({
      id: 'contact-t23-p5-5',
      processStage: 'drawing_confirmed',
      status: 'drawing',
      workNumber: F_NUMBER,
      inquiryType: 'cutting_request',
      updatedAt: new Date(),
    });

    await service.updateProcessStage('contact-t23-p5-5', 'drawing_confirmed');

    // 기존 버그에서 skip 됐던 3 단계가 모두 실행됨.
    expect(renameInquiryFolderForContact).toHaveBeenCalledWith(
      'contact-t23-p5-5',
      expect.anything()
    );
    expect(ensureInquiryFolder).toHaveBeenCalledWith('contact-t23-p5-5', expect.anything());
    expect(relocateContactFiles).toHaveBeenCalledWith(
      'contact-t23-p5-5',
      INQUIRY_FOLDER_ID,
      expect.anything()
    );
  });
});

describe('ContactsService.updateStatus — folder routing (Phase 5 H3)', () => {
  it('H3: status=production + workNumber null → 발급 + ensureInquiryFolder + relocate', async () => {
    const ensureInquiryFolder = jest.fn().mockResolvedValue({ id: INQUIRY_FOLDER_ID });
    const relocateContactFiles = jest.fn().mockResolvedValue({ movedIds: [] });
    const generateNumber = jest.fn().mockResolvedValue(F_NUMBER);
    const { service, prisma } = buildService({
      ensureInquiryFolder,
      relocateContactFiles,
      generateNumber,
    });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-h3',
      status: 'confirmed',
      workNumber: null,
      companyName: '거래처A',
    });
    prisma.contact.update.mockResolvedValue({
      id: 'contact-h3',
      status: 'production',
      workNumber: F_NUMBER,
    });

    await service.updateStatus('contact-h3', 'production');

    expect(generateNumber).toHaveBeenCalledWith('work');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(ensureInquiryFolder).toHaveBeenCalledWith('contact-h3', expect.anything());
    expect(relocateContactFiles).toHaveBeenCalledWith(
      'contact-h3',
      INQUIRY_FOLDER_ID,
      expect.anything()
    );
  });

  it('H3b: status=production + workNumber 이미 존재 → $transaction 미사용', async () => {
    const ensureInquiryFolder = jest.fn();
    const { service, prisma } = buildService({ ensureInquiryFolder });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-h3b',
      status: 'confirmed',
      workNumber: F_NUMBER,
      companyName: '거래처A',
    });
    prisma.contact.update.mockResolvedValue({
      id: 'contact-h3b',
      status: 'production',
      workNumber: F_NUMBER,
    });

    await service.updateStatus('contact-h3b', 'production');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(ensureInquiryFolder).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════
// Task 19 Phase 1: folder rename / move hooks
// ══════════════════════════════════════════════════════════════

describe('ContactsService — task 19 folder hooks (H5~H7)', () => {
  it('H5: workNumber 발급되는 office→field 전환 시 renameInquiryFolderForContact 호출', async () => {
    const renameInquiryFolderForContact = jest.fn().mockResolvedValue(undefined);
    const ensureInquiryFolder = jest.fn().mockResolvedValue({ id: INQUIRY_FOLDER_ID });
    const relocateContactFiles = jest.fn().mockResolvedValue({ movedIds: [] });
    const generateNumber = jest.fn().mockResolvedValue(F_NUMBER);
    const { service, prisma } = buildService({
      renameInquiryFolderForContact,
      ensureInquiryFolder,
      relocateContactFiles,
      generateNumber,
    });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-h5',
      processStage: 'drawing',
      status: 'drawing',
      companyName: '거래처A',
      workNumber: null,
      inquiryNumber: O_NUMBER,
      inquiryTitle: `${O_NUMBER} 테스트`,
      inquiryType: 'cutting_request',
    });
    prisma.contact.update.mockResolvedValue({
      id: 'contact-h5',
      processStage: 'drawing_confirmed',
      status: 'drawing',
      workNumber: F_NUMBER,
      inquiryType: 'cutting_request',
      updatedAt: new Date(),
    });

    await service.updateProcessStage('contact-h5', 'drawing_confirmed');

    expect(renameInquiryFolderForContact).toHaveBeenCalledWith('contact-h5', expect.anything());
    // ensureInquiryFolder 보다 먼저 실행되어야 함
    const renameOrder = renameInquiryFolderForContact.mock.invocationCallOrder[0];
    const ensureOrder = ensureInquiryFolder.mock.invocationCallOrder[0];
    expect(renameOrder).toBeLessThan(ensureOrder);
  });

  it('H5b: updateInquiryType 에서 workNumber 발급 시 renameInquiryFolderForContact 호출', async () => {
    const renameInquiryFolderForContact = jest.fn().mockResolvedValue(undefined);
    const ensureInquiryFolder = jest.fn().mockResolvedValue({ id: INQUIRY_FOLDER_ID });
    const relocateContactFiles = jest.fn().mockResolvedValue({ movedIds: [] });
    const generateNumber = jest.fn().mockResolvedValue(F_NUMBER);
    const { service, prisma } = buildService({
      renameInquiryFolderForContact,
      ensureInquiryFolder,
      relocateContactFiles,
      generateNumber,
    });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-h5b',
      source: 'webhard',
      inquiryType: null,
      inquiryNumber: null,
      workNumber: null,
      inquiryTitle: null,
      processStage: null,
      status: 'new',
      companyName: '거래처A',
    });
    prisma.contact.update.mockResolvedValue({
      id: 'contact-h5b',
      inquiryType: 'mold_request',
    });

    await service.updateInquiryType('contact-h5b', 'mold_request');

    expect(renameInquiryFolderForContact).toHaveBeenCalledWith('contact-h5b', expect.anything());
  });

  it("H6: processStage='delivery' 전환 시 moveInquiryFolderToCompleted 호출", async () => {
    const moveInquiryFolderToCompleted = jest.fn().mockResolvedValue(undefined);
    const { service, prisma } = buildService({
      moveInquiryFolderToCompleted,
    });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-h6',
      processStage: 'creasing',
      status: 'production',
      companyName: '거래처A',
      workNumber: F_NUMBER,
      inquiryNumber: O_NUMBER,
      inquiryTitle: null,
      inquiryType: 'mold_request',
    });
    prisma.contact.update.mockResolvedValue({
      id: 'contact-h6',
      processStage: 'delivery',
      status: 'production',
      workNumber: F_NUMBER,
      inquiryType: 'mold_request',
      updatedAt: new Date(),
    });

    await service.updateProcessStage('contact-h6', 'delivery');

    expect(moveInquiryFolderToCompleted).toHaveBeenCalledWith('contact-h6');
  });

  it("H6b: processStage 가 이미 'delivery' 였으면 moveInquiryFolderToCompleted 재호출 안함 (멱등 check)", async () => {
    // updateProcessStage 의 기존 멱등성 분기: processStage 동일 시 업데이트 자체가 skip
    const moveInquiryFolderToCompleted = jest.fn().mockResolvedValue(undefined);
    const { service, prisma } = buildService({
      moveInquiryFolderToCompleted,
    });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-h6b',
      processStage: 'delivery', // 이미 delivery
      status: 'production',
      companyName: '거래처A',
      workNumber: F_NUMBER,
      inquiryNumber: O_NUMBER,
      inquiryTitle: null,
      inquiryType: 'mold_request',
    });

    await service.updateProcessStage('contact-h6b', 'delivery');

    // 멱등성 분기로 아무 처리도 없음
    expect(moveInquiryFolderToCompleted).not.toHaveBeenCalled();
  });

  it('H7: moveInquiryFolderToCompleted 실패해도 stage 전환 자체는 성공 (Best Effort)', async () => {
    const moveInquiryFolderToCompleted = jest
      .fn()
      .mockRejectedValue(new Error('move folder failed'));
    const { service, prisma } = buildService({
      moveInquiryFolderToCompleted,
    });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-h7',
      processStage: 'creasing',
      status: 'production',
      companyName: '거래처A',
      workNumber: F_NUMBER,
      inquiryNumber: O_NUMBER,
      inquiryTitle: null,
      inquiryType: 'mold_request',
    });
    prisma.contact.update.mockResolvedValue({
      id: 'contact-h7',
      processStage: 'delivery',
      status: 'production',
      workNumber: F_NUMBER,
      inquiryType: 'mold_request',
      updatedAt: new Date(),
    });

    const result = await service.updateProcessStage('contact-h7', 'delivery');

    // 성공 응답
    expect(result).toMatchObject({
      id: 'contact-h7',
      process_stage: 'delivery',
    });
    expect(moveInquiryFolderToCompleted).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════
// Task 29 Phase 3: laser-only-folder-lifecycle — completeLaserOnlyContact 가
// 일반 delivery 와 동일하게 inquiry 폴더를 `완료/` 로 이동시키는지 검증.
// ══════════════════════════════════════════════════════════════
describe('ContactsService.completeLaserOnlyContact (task 29)', () => {
  it('H1: laser_cutting 완료 시 moveInquiryFolderToCompleted(id) 호출', async () => {
    const moveInquiryFolderToCompleted = jest.fn().mockResolvedValue(undefined);
    const { service, prisma } = buildService({ moveInquiryFolderToCompleted });

    prisma.contact.findUnique.mockResolvedValueOnce({
      id: 'contact-h1',
      inquiryType: 'laser_cutting',
      processStage: 'laser',
      status: 'cutting',
      companyName: '대성목형',
    });
    prisma.contact.update.mockResolvedValueOnce({
      id: 'contact-h1',
      status: 'completed',
      processStage: null,
    });

    await service.completeLaserOnlyContact('contact-h1');

    expect(moveInquiryFolderToCompleted).toHaveBeenCalledWith('contact-h1');
  });

  it('H2: 폴더 이동 실패해도 status=completed 결과 반환 + warn 로깅 (Best Effort)', async () => {
    const moveInquiryFolderToCompleted = jest
      .fn()
      .mockRejectedValue(new Error('mock folder move error'));
    const { service, prisma } = buildService({ moveInquiryFolderToCompleted });
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    prisma.contact.findUnique.mockResolvedValueOnce({
      id: 'contact-h2',
      inquiryType: 'laser_cutting',
      processStage: 'laser',
      status: 'cutting',
      companyName: '대성목형',
    });
    prisma.contact.update.mockResolvedValueOnce({
      id: 'contact-h2',
      status: 'completed',
      processStage: null,
    });

    const result = await service.completeLaserOnlyContact('contact-h2');

    expect(result).toMatchObject({ status: 'completed', process_stage: null });
    expect(moveInquiryFolderToCompleted).toHaveBeenCalled();
    // silent swallow 회귀 방지: catch 가 throw 흡수 후 logger.warn 호출되어야 함
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('moveInquiryFolderToCompleted failed for contactId=contact-h2')
    );
    warnSpy.mockRestore();
  });

  it('H3: inquiry 폴더 없는 contact 도 status 는 정상 변경 (moveInquiryFolderToCompleted 자체가 no-op)', async () => {
    const moveInquiryFolderToCompleted = jest.fn().mockResolvedValue(undefined);
    const { service, prisma } = buildService({ moveInquiryFolderToCompleted });

    prisma.contact.findUnique.mockResolvedValueOnce({
      id: 'contact-h3',
      inquiryType: 'laser_cutting',
      processStage: 'laser',
      status: 'cutting',
      companyName: '대성목형',
    });
    prisma.contact.update.mockResolvedValueOnce({
      id: 'contact-h3',
      status: 'completed',
      processStage: null,
    });

    const result = await service.completeLaserOnlyContact('contact-h3');

    expect(result).toMatchObject({ status: 'completed' });
    expect(moveInquiryFolderToCompleted).toHaveBeenCalledWith('contact-h3');
  });
});

// ══════════════════════════════════════════════════════════════
// Task 20 Phase 2: web-form-path — create 트랜잭션 내부 폴더·알림 로직
// ══════════════════════════════════════════════════════════════
describe('ContactsService.create — 웹하드 폴더 자동 연결 (task 20 Phase 2)', () => {
  it('P2-1: inquiryType=cutting_request → inquiryNumber 발급 + ensureInquiryFolder + relocateContactFiles', async () => {
    const ensureInquiryFolder = jest.fn().mockResolvedValue({ id: INQUIRY_FOLDER_ID });
    const relocateContactFiles = jest.fn().mockResolvedValue({ movedIds: [] });
    const generateNumber = jest.fn().mockResolvedValue(O_NUMBER);
    const { service, prisma, numberService } = buildService({
      ensureInquiryFolder,
      relocateContactFiles,
      generateNumber,
    });
    prisma.contact.create.mockResolvedValue({
      id: 'contact-p2-1',
      companyName: '거래처A',
      inquiryType: 'cutting_request',
      inquiryNumber: O_NUMBER,
      drawingFileUrl: null,
      drawingFileName: null,
      status: 'drawing',
      processStage: 'drawing',
    });
    prisma.company.findMany.mockResolvedValue([{ id: 101 }]);

    await service.create({
      ...BASE_DTO,
      inquiryType: 'cutting_request',
    } as unknown as CreateContactDto);

    expect(numberService.generateNumber).toHaveBeenCalledWith('inquiry');
    expect(ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(ensureInquiryFolder).toHaveBeenCalledWith('contact-p2-1', expect.anything());
    expect(relocateContactFiles).toHaveBeenCalledTimes(1);
    expect(relocateContactFiles).toHaveBeenCalledWith(
      'contact-p2-1',
      INQUIRY_FOLDER_ID,
      expect.anything()
    );
  });

  it('P2-1b: 등록 업체 companyName 은 Contact 생성 시 company relation 으로 연결한다', async () => {
    const generateNumber = jest.fn().mockResolvedValue(O_NUMBER);
    const { service, prisma } = buildService({ generateNumber });
    prisma.company.findMany.mockResolvedValue([{ id: 101 }]);
    prisma.contact.create.mockResolvedValue({
      id: 'contact-p2-1b',
      companyName: '거래처A',
      companyId: 101,
      inquiryType: 'cutting_request',
      inquiryNumber: O_NUMBER,
      drawingFileUrl: null,
      drawingFileName: null,
      status: 'received',
      processStage: null,
    });

    await service.create({
      ...BASE_DTO,
      inquiryType: 'cutting_request',
    } as unknown as CreateContactDto);

    expect(prisma.contact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyName: '거래처A',
        company: { connect: { id: 101 } },
      }),
    });
    expect(prisma.company.findMany).toHaveBeenCalledWith({
      where: {
        companyName: '거래처A',
        deletedAt: null,
        status: 'active',
        isApproved: true,
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 2,
    });
  });

  it('P2-1c: 등록 업체 companyName 후보가 2개 이상이면 자동 company 연결과 폴더 sync를 중단한다', async () => {
    const generateNumber = jest.fn().mockResolvedValue(O_NUMBER);
    const onContactCreated = jest.fn();
    const { service, prisma } = buildService({ generateNumber, onContactCreated });
    const syncSpy = jest
      .spyOn(
        service as unknown as {
          syncWebsiteContactFilesToWebhard(contactId: string): Promise<void>;
        },
        'syncWebsiteContactFilesToWebhard'
      )
      .mockResolvedValue(undefined);
    prisma.company.findMany.mockResolvedValue([{ id: 101 }, { id: 102 }]);
    prisma.contact.create.mockResolvedValue({
      id: 'contact-p2-1c',
      companyName: '거래처A',
      companyId: null,
      inquiryType: 'cutting_request',
      inquiryNumber: O_NUMBER,
      drawingFileUrl: 'r2://bucket/duplicate-company.dxf',
      drawingFileName: 'duplicate-company.dxf',
      status: 'received',
      processStage: null,
    });

    await service.create({
      ...BASE_DTO,
      inquiryType: 'cutting_request',
    } as unknown as CreateContactDto);

    expect(prisma.contact.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({
        company: expect.anything(),
      }),
    });
    expect(onContactCreated).not.toHaveBeenCalled();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it('P2-2: inquiryType=mold_request → workNumber 발급 + ensureInquiryFolder 호출', async () => {
    const ensureInquiryFolder = jest.fn().mockResolvedValue({ id: INQUIRY_FOLDER_ID });
    const relocateContactFiles = jest.fn().mockResolvedValue({ movedIds: [] });
    const generateNumber = jest.fn().mockResolvedValue(F_NUMBER);
    const { service, prisma, numberService } = buildService({
      ensureInquiryFolder,
      relocateContactFiles,
      generateNumber,
    });
    prisma.contact.create.mockResolvedValue({
      id: 'contact-p2-2',
      companyName: '거래처A',
      inquiryType: 'mold_request',
      workNumber: F_NUMBER,
      drawingFileUrl: null,
      drawingFileName: null,
      status: 'confirmed',
      processStage: 'drawing_confirmed',
    });
    prisma.company.findMany.mockResolvedValue([{ id: 101 }]);

    await service.create({
      ...BASE_DTO,
      inquiryType: 'mold_request',
    } as unknown as CreateContactDto);

    expect(numberService.generateNumber).toHaveBeenCalledWith('work');
    expect(ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(ensureInquiryFolder).toHaveBeenCalledWith('contact-p2-2', expect.anything());
  });

  it('P2-3: inquiryType=null (미분류) → ensureInquiryFolder 미호출', async () => {
    const ensureInquiryFolder = jest.fn();
    const relocateContactFiles = jest.fn();
    const { service, prisma } = buildService({
      ensureInquiryFolder,
      relocateContactFiles,
    });
    prisma.contact.create.mockResolvedValue({
      id: 'contact-p2-3',
      companyName: '거래처A',
      inquiryType: null,
      drawingFileUrl: null,
      drawingFileName: null,
      status: 'received',
      processStage: null,
    });
    prisma.company.findMany.mockResolvedValue([{ id: 101 }]);

    await service.create(BASE_DTO);

    expect(ensureInquiryFolder).not.toHaveBeenCalled();
    expect(relocateContactFiles).not.toHaveBeenCalled();
  });

  it('P2-4: ensureInquiryFolder 실패 → 트랜잭션 rollback 으로 service.create 예외 전파', async () => {
    const ensureInquiryFolder = jest.fn().mockRejectedValue(new Error('folder ensure failed'));
    const relocateContactFiles = jest.fn();
    const generateNumber = jest.fn().mockResolvedValue(O_NUMBER);
    const { service, prisma } = buildService({
      ensureInquiryFolder,
      relocateContactFiles,
      generateNumber,
    });
    prisma.contact.create.mockResolvedValue({
      id: 'contact-p2-4',
      companyName: '거래처A',
      inquiryType: 'cutting_request',
      inquiryNumber: O_NUMBER,
      drawingFileUrl: null,
      drawingFileName: null,
      status: 'drawing',
      processStage: 'drawing',
    });
    prisma.company.findMany.mockResolvedValue([{ id: 101 }]);

    await expect(
      service.create({
        ...BASE_DTO,
        inquiryType: 'cutting_request',
      } as unknown as CreateContactDto)
    ).rejects.toThrow('folder ensure failed');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(relocateContactFiles).not.toHaveBeenCalled();
  });

  it('P2-5: company 미존재 → Notification(webhard_company_mismatch) 생성 (task 21 Phase 2: best-effort ensureInquiryFolder 시도 — mock null 반환이므로 relocate 미호출)', async () => {
    const ensureInquiryFolder = jest.fn().mockResolvedValue(null);
    const relocateContactFiles = jest.fn();
    const generateNumber = jest.fn().mockResolvedValue(O_NUMBER);
    const { service, prisma } = buildService({
      ensureInquiryFolder,
      relocateContactFiles,
      generateNumber,
    });
    prisma.contact.create.mockResolvedValue({
      id: 'contact-p2-5',
      companyName: '매칭안되는업체',
      inquiryType: 'cutting_request',
      inquiryNumber: O_NUMBER,
      drawingFileUrl: null,
      drawingFileName: null,
      status: 'drawing',
      processStage: 'drawing',
    });
    prisma.company.findMany.mockResolvedValue([]);
    prisma.notification.create.mockResolvedValue({});

    await service.create({
      ...BASE_DTO,
      companyName: '매칭안되는업체',
      inquiryType: 'cutting_request',
    } as unknown as CreateContactDto);

    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    const call = prisma.notification.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.type).toBe('webhard_company_mismatch');
    expect(call.data.userType).toBe('admin');
    expect(call.data.title).toBe('웹하드 업체 폴더 매칭 실패');
    const metadata = call.data.metadata as { contactId: string; companyName: string };
    expect(metadata.contactId).toBe('contact-p2-5');
    expect(metadata.companyName).toBe('매칭안되는업체');

    // task 21 Phase 2: !company 분기에서도 inquiryType 확정되면 best-effort 로
    // ensureInquiryFolder 호출 (Phase 1 의 name 정규화 fallback 이 가상 업체를 찾을 수 있음).
    // mock 이 null 반환하므로 relocateContactFiles 는 미호출.
    expect(ensureInquiryFolder).toHaveBeenCalledWith('contact-p2-5', expect.anything());
    expect(relocateContactFiles).not.toHaveBeenCalled();
  });

  it('P2-6: Notification.create 실패해도 Contact 생성은 성공 (구 RFW2)', async () => {
    const ensureInquiryFolder = jest.fn();
    const { service, prisma } = buildService({
      ensureInquiryFolder,
    });
    prisma.contact.create.mockResolvedValue({
      id: 'contact-p2-6',
      companyName: '매칭안되는업체',
      inquiryType: null,
      drawingFileUrl: null,
      drawingFileName: null,
      status: 'received',
      processStage: null,
    });
    prisma.company.findMany.mockResolvedValue([]);
    prisma.notification.create.mockRejectedValue(new Error('notif insert failed'));

    await expect(
      service.create({
        ...BASE_DTO,
        companyName: '매칭안되는업체',
      } as unknown as CreateContactDto)
    ).resolves.toBeDefined();

    expect(ensureInquiryFolder).not.toHaveBeenCalled();
  });

  it('웹폼 업로드 파일 전체를 문의 폴더 WebhardFile로 등록하고 실제 파일명은 바꾸지 않는다', async () => {
    const ensureInquiryFolder = jest.fn().mockResolvedValue({
      id: INQUIRY_FOLDER_ID,
      companyId: 101,
    });
    const relocateContactFiles = jest.fn().mockResolvedValue({ movedIds: [] });
    const generateNumber = jest.fn().mockResolvedValue(O_NUMBER);
    const { service, prisma } = buildService({
      ensureInquiryFolder,
      relocateContactFiles,
      generateNumber,
    });
    prisma.contact.create.mockResolvedValue({
      id: 'contact-webform-files',
      companyName: '거래처A',
      inquiryType: 'cutting_request',
      inquiryNumber: O_NUMBER,
      drawingFileUrl: 'https://cdn.yjlaser.net/contacts/drawings/drawing-key.png',
      drawingFileName: '화면 캡처.png',
      attachmentUrl: 'https://cdn.yjlaser.net/contacts/attachments/attach-key.pdf',
      attachmentFilename: '참고자료.pdf',
      referencePhotosUrls: JSON.stringify([
        'https://cdn.yjlaser.net/contacts/reference-photos/1779340000000-abc123de-0-샘플사진.jpg',
      ]),
      status: 'received',
      processStage: null,
    });
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-webform-files',
      companyName: '거래처A',
      inquiryNumber: O_NUMBER,
      workNumber: null,
      drawingFileUrl: 'https://cdn.yjlaser.net/contacts/drawings/drawing-key.png',
      drawingFileName: '화면 캡처.png',
      attachmentUrl: 'https://cdn.yjlaser.net/contacts/attachments/attach-key.pdf',
      attachmentFilename: '참고자료.pdf',
      referencePhotosUrls: JSON.stringify([
        'https://cdn.yjlaser.net/contacts/reference-photos/1779340000000-abc123de-0-샘플사진.jpg',
      ]),
    });
    prisma.company.findMany.mockResolvedValue([{ id: 101 }]);
    prisma.webhardFile.findFirst.mockResolvedValue(null);
    prisma.webhardFile.create
      .mockResolvedValueOnce({ id: 'drawing-file-id' })
      .mockResolvedValueOnce({ id: 'attachment-file-id' })
      .mockResolvedValueOnce({ id: 'reference-photo-file-id' });
    prisma.drawingRevision.findFirst.mockResolvedValue({
      id: 'initial-revision-id',
      webhardFileIds: [],
    });

    await service.create({
      ...BASE_DTO,
      inquiryType: 'cutting_request',
      drawingFileUrl: 'https://cdn.yjlaser.net/contacts/drawings/drawing-key.png',
      drawingFileName: '화면 캡처.png',
      attachmentUrl: 'https://cdn.yjlaser.net/contacts/attachments/attach-key.pdf',
      attachmentFilename: '참고자료.pdf',
      referencePhotosUrls: JSON.stringify([
        'https://cdn.yjlaser.net/contacts/reference-photos/1779340000000-abc123de-0-샘플사진.jpg',
      ]),
    } as unknown as CreateContactDto);

    expect(prisma.webhardFile.create).toHaveBeenCalledTimes(3);
    expect(prisma.webhardFile.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          name: '화면 캡처.png',
          originalName: '화면 캡처.png',
          path: 'contacts/drawings/drawing-key.png',
          folderId: INQUIRY_FOLDER_ID,
          companyId: 101,
          inquiryNumber: O_NUMBER,
        }),
      })
    );
    expect(prisma.webhardFile.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          name: '참고자료.pdf',
          originalName: '참고자료.pdf',
          path: 'contacts/attachments/attach-key.pdf',
          folderId: INQUIRY_FOLDER_ID,
        }),
      })
    );
    expect(prisma.webhardFile.create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        data: expect.objectContaining({
          name: '샘플사진.jpg',
          originalName: '샘플사진.jpg',
          path: 'contacts/reference-photos/1779340000000-abc123de-0-샘플사진.jpg',
          folderId: INQUIRY_FOLDER_ID,
        }),
      })
    );
    expect(prisma.drawingRevision.update).toHaveBeenCalledWith({
      where: { id: 'initial-revision-id' },
      data: { webhardFileIds: ['drawing-file-id'] },
    });
  });
});

// ══════════════════════════════════════════════════════════════
// Task 21 Phase 2: !company 분기 가드 완화 — best-effort ensureInquiryFolder fallback
// ══════════════════════════════════════════════════════════════
describe('ContactsService.create — !company fallback (task 21 Phase 2)', () => {
  it('task21-P2-1: !company + inquiryType=mold_request → ensureInquiryFolder 호출 (fallback 시도)', async () => {
    const ensureInquiryFolder = jest.fn().mockResolvedValue(null);
    const relocateContactFiles = jest.fn();
    const generateNumber = jest.fn().mockResolvedValue(F_NUMBER);
    const { service, prisma } = buildService({
      ensureInquiryFolder,
      relocateContactFiles,
      generateNumber,
    });
    prisma.contact.create.mockResolvedValue({
      id: 'contact-t21-p2-1',
      companyName: '가상업체',
      inquiryType: 'mold_request',
      workNumber: F_NUMBER,
      drawingFileUrl: null,
      drawingFileName: null,
      status: 'confirmed',
      processStage: 'drawing_confirmed',
    });
    prisma.company.findMany.mockResolvedValue([]);
    prisma.notification.create.mockResolvedValue({});

    await service.create({
      ...BASE_DTO,
      companyName: '가상업체',
      inquiryType: 'mold_request',
    } as unknown as CreateContactDto);

    expect(ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(ensureInquiryFolder).toHaveBeenCalledWith('contact-t21-p2-1', expect.anything());
  });

  it('task21-P2-2: !company + fallback 매칭 성공 → relocateContactFiles 호출', async () => {
    const ensureInquiryFolder = jest.fn().mockResolvedValue({ id: INQUIRY_FOLDER_ID });
    const relocateContactFiles = jest.fn().mockResolvedValue({ movedIds: [] });
    const generateNumber = jest.fn().mockResolvedValue(O_NUMBER);
    const { service, prisma } = buildService({
      ensureInquiryFolder,
      relocateContactFiles,
      generateNumber,
    });
    prisma.contact.create.mockResolvedValue({
      id: 'contact-t21-p2-2',
      companyName: '가상업체',
      inquiryType: 'cutting_request',
      inquiryNumber: O_NUMBER,
      drawingFileUrl: null,
      drawingFileName: null,
      status: 'drawing',
      processStage: 'drawing',
    });
    prisma.company.findMany.mockResolvedValue([]);
    prisma.notification.create.mockResolvedValue({});

    const result = await service.create({
      ...BASE_DTO,
      companyName: '가상업체',
      inquiryType: 'cutting_request',
    } as unknown as CreateContactDto);

    expect(result).toBeDefined();
    expect(ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(relocateContactFiles).toHaveBeenCalledTimes(1);
    expect(relocateContactFiles).toHaveBeenCalledWith(
      'contact-t21-p2-2',
      INQUIRY_FOLDER_ID,
      expect.anything()
    );
  });

  it('task21-P2-3: !company + fallback 실패 (ensureInquiryFolder=null) → Contact 유지, relocate 미호출', async () => {
    const ensureInquiryFolder = jest.fn().mockResolvedValue(null);
    const relocateContactFiles = jest.fn();
    const generateNumber = jest.fn().mockResolvedValue(F_NUMBER);
    const { service, prisma } = buildService({
      ensureInquiryFolder,
      relocateContactFiles,
      generateNumber,
    });
    prisma.contact.create.mockResolvedValue({
      id: 'contact-t21-p2-3',
      companyName: '가상업체',
      inquiryType: 'mold_request',
      workNumber: F_NUMBER,
      drawingFileUrl: null,
      drawingFileName: null,
      status: 'confirmed',
      processStage: 'drawing_confirmed',
    });
    prisma.company.findMany.mockResolvedValue([]);
    prisma.notification.create.mockResolvedValue({});

    const result = await service.create({
      ...BASE_DTO,
      companyName: '가상업체',
      inquiryType: 'mold_request',
    } as unknown as CreateContactDto);

    expect(result).toBeDefined();
    // Contact 레코드 생성은 유지 (fallback 실패가 롤백 유발 금지).
    expect(prisma.contact.create).toHaveBeenCalledTimes(1);
    expect(ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(relocateContactFiles).not.toHaveBeenCalled();
  });

  it('task21-P2-4: mismatch 알림 회귀 — notification.create 먼저, ensureInquiryFolder 뒤', async () => {
    const ensureInquiryFolder = jest.fn().mockResolvedValue(null);
    const generateNumber = jest.fn().mockResolvedValue(O_NUMBER);
    const { service, prisma } = buildService({
      ensureInquiryFolder,
      generateNumber,
    });
    prisma.contact.create.mockResolvedValue({
      id: 'contact-t21-p2-4',
      companyName: '가상업체',
      inquiryType: 'cutting_request',
      inquiryNumber: O_NUMBER,
      drawingFileUrl: null,
      drawingFileName: null,
      status: 'drawing',
      processStage: 'drawing',
    });
    prisma.company.findMany.mockResolvedValue([]);
    prisma.notification.create.mockResolvedValue({});

    await service.create({
      ...BASE_DTO,
      companyName: '가상업체',
      inquiryType: 'cutting_request',
    } as unknown as CreateContactDto);

    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    const notifCall = prisma.notification.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(notifCall.data.type).toBe('webhard_company_mismatch');

    // 알림 → 폴더 생성 시도 순서 보장 (phase 2 규칙: notify 먼저).
    const notifOrder = prisma.notification.create.mock.invocationCallOrder[0];
    const ensureOrder = ensureInquiryFolder.mock.invocationCallOrder[0];
    expect(notifOrder).toBeLessThan(ensureOrder);
  });

  it('task21-P2-5: ensureInquiryFolder 예외 → best-effort (Contact 생성 성공, relocate 미호출)', async () => {
    const ensureInquiryFolder = jest.fn().mockRejectedValue(new Error('folder ensure threw'));
    const relocateContactFiles = jest.fn();
    const generateNumber = jest.fn().mockResolvedValue(F_NUMBER);
    const { service, prisma } = buildService({
      ensureInquiryFolder,
      relocateContactFiles,
      generateNumber,
    });
    prisma.contact.create.mockResolvedValue({
      id: 'contact-t21-p2-5',
      companyName: '가상업체',
      inquiryType: 'mold_request',
      workNumber: F_NUMBER,
      drawingFileUrl: null,
      drawingFileName: null,
      status: 'confirmed',
      processStage: 'drawing_confirmed',
    });
    prisma.company.findMany.mockResolvedValue([]);
    prisma.notification.create.mockResolvedValue({});

    // !company 분기 try/catch 로 예외 흡수 — service.create 는 성공.
    await expect(
      service.create({
        ...BASE_DTO,
        companyName: '가상업체',
        inquiryType: 'mold_request',
      } as unknown as CreateContactDto)
    ).resolves.toBeDefined();

    expect(prisma.contact.create).toHaveBeenCalledTimes(1);
    expect(ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(relocateContactFiles).not.toHaveBeenCalled();
  });

  it('task21-P2-6: if (company) 분기 회귀 — 정식 업체 매칭 시 mismatch 알림 미발송 + ensureInquiryFolder 호출', async () => {
    const ensureInquiryFolder = jest.fn().mockResolvedValue({ id: INQUIRY_FOLDER_ID });
    const relocateContactFiles = jest.fn().mockResolvedValue({ movedIds: [] });
    const generateNumber = jest.fn().mockResolvedValue(O_NUMBER);
    const { service, prisma } = buildService({
      ensureInquiryFolder,
      relocateContactFiles,
      generateNumber,
    });
    prisma.contact.create.mockResolvedValue({
      id: 'contact-t21-p2-6',
      companyName: '거래처A',
      inquiryType: 'cutting_request',
      inquiryNumber: O_NUMBER,
      drawingFileUrl: null,
      drawingFileName: null,
      status: 'drawing',
      processStage: 'drawing',
    });
    prisma.company.findMany.mockResolvedValue([{ id: 101 }]);

    await service.create({
      ...BASE_DTO,
      inquiryType: 'cutting_request',
    } as unknown as CreateContactDto);

    // Company 매칭 분기는 이번 phase 에서 변경 없음.
    const notificationTypes = prisma.notification.create.mock.calls.map(
      ([call]) => (call as { data: { type: string } }).data.type
    );
    expect(notificationTypes).not.toContain('webhard_company_mismatch');
    expect(ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(relocateContactFiles).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════
// Task 20 Phase 4: split-path — splitContact 자식별 폴더 생성
// ══════════════════════════════════════════════════════════════
describe('ContactsService.splitContact — 자식 폴더 생성 (task 20 Phase 4)', () => {
  const PARENT_O = '260422-O-001';

  const makeParentContact = () => ({
    id: 'parent-contact',
    parentContactId: null as string | null,
    splitCount: null as number | null,
    processStage: 'drawing' as string | null,
    inquiryNumber: PARENT_O as string | null,
    workNumber: null as string | null,
    inquiryType: 'cutting_request' as string | null,
    companyName: '거래처A',
    name: '홍길동',
    email: null,
    phone: null,
    position: null,
    contactType: 'company',
    source: 'web',
    orderType: null,
    isUrgent: false,
    boxShape: null,
    material: null,
    length: null,
    width: null,
    height: null,
    deliveryMethod: null,
    deliveryAddress: null,
    deliveryName: null,
    deliveryPhone: null,
    deliveryType: null,
    deliveryCompanyName: null,
    deliveryCompanyPhone: null,
    deliveryCompanyAddress: null,
    deliveryNote: null,
    receiptMethod: null,
    subject: '테스트',
    status: 'drawing',
  });

  const makeChildContact = (id: string, idx: number, parent = makeParentContact()) => ({
    ...parent,
    id,
    parentContactId: parent.id,
    splitIndex: idx,
    inquiryNumber: `${parent.inquiryNumber}-${idx}`,
    workNumber: null,
    splitCount: null,
  });

  it('P4-1: 2 분할 → 자식 2 개 각각 ensureInquiryFolder(childId) 호출', async () => {
    const ensureInquiryFolder = jest.fn().mockResolvedValue({ id: 'child-folder' });
    const { service, prisma, foldersService } = buildService({ ensureInquiryFolder });

    const parent = makeParentContact();
    prisma.contact.findUnique.mockResolvedValue(parent);
    prisma.contact.create
      .mockResolvedValueOnce(makeChildContact('child-1', 1, parent))
      .mockResolvedValueOnce(makeChildContact('child-2', 2, parent));
    prisma.contact.update.mockResolvedValue({ ...parent, splitCount: 2 });

    await service.splitContact('parent-contact', { count: 2 });

    expect(ensureInquiryFolder).toHaveBeenCalledTimes(2);
    expect(ensureInquiryFolder).toHaveBeenNthCalledWith(1, 'child-1', expect.anything());
    expect(ensureInquiryFolder).toHaveBeenNthCalledWith(2, 'child-2', expect.anything());
    // 자식 폴더의 parent 계산은 FoldersService.ensureInquiryFolder 내부에서 중간 `문의/`
    // 폴더로 처리됨 (folders.service.spec P1-3 에서 검증). splitContact 는 child.id 만
    // 넘기고 parent 선택에 관여하지 않는다.
    expect(foldersService.renameInquiryFolderForContact).not.toHaveBeenCalled();
    expect(foldersService.moveInquiryFolderToCompleted).not.toHaveBeenCalled();
  });

  it('P4-2: 3 분할 → ensureInquiryFolder 3 회 호출 (자식 3 명)', async () => {
    const ensureInquiryFolder = jest.fn().mockResolvedValue({ id: 'child-folder' });
    const { service, prisma } = buildService({ ensureInquiryFolder });

    const parent = makeParentContact();
    prisma.contact.findUnique.mockResolvedValue(parent);
    prisma.contact.create
      .mockResolvedValueOnce(makeChildContact('child-1', 1, parent))
      .mockResolvedValueOnce(makeChildContact('child-2', 2, parent))
      .mockResolvedValueOnce(makeChildContact('child-3', 3, parent));
    prisma.contact.update.mockResolvedValue({ ...parent, splitCount: 3 });

    await service.splitContact('parent-contact', { count: 3 });

    expect(ensureInquiryFolder).toHaveBeenCalledTimes(3);
    expect(ensureInquiryFolder).toHaveBeenNthCalledWith(1, 'child-1', expect.anything());
    expect(ensureInquiryFolder).toHaveBeenNthCalledWith(2, 'child-2', expect.anything());
    expect(ensureInquiryFolder).toHaveBeenNthCalledWith(3, 'child-3', expect.anything());
  });

  it('P4-3: splitContact 후 부모 폴더 rename / move / delete 없음', async () => {
    const ensureInquiryFolder = jest.fn().mockResolvedValue({ id: 'child-folder' });
    const { service, prisma, foldersService } = buildService({ ensureInquiryFolder });

    const parent = makeParentContact();
    prisma.contact.findUnique.mockResolvedValue(parent);
    prisma.contact.create
      .mockResolvedValueOnce(makeChildContact('child-1', 1, parent))
      .mockResolvedValueOnce(makeChildContact('child-2', 2, parent));
    prisma.contact.update.mockResolvedValue({ ...parent, splitCount: 2 });

    await service.splitContact('parent-contact', { count: 2 });

    // 부모 폴더 DB 조작 없음 — parent 재배치 / rename / 삭제 모두 미호출.
    expect(prisma.webhardFolder.update).not.toHaveBeenCalled();
    expect(prisma.webhardFolder.delete).not.toHaveBeenCalled();
    // 부모 폴더 이관 / 이름 재계산 훅도 미호출.
    expect(foldersService.renameInquiryFolderForContact).not.toHaveBeenCalled();
    expect(foldersService.moveInquiryFolderToCompleted).not.toHaveBeenCalled();
  });

  it('P4-4: 부모 inquiryType=null (미분류) → 자식도 미분류 → ensureInquiryFolder 미호출', async () => {
    const ensureInquiryFolder = jest.fn();
    const { service, prisma } = buildService({ ensureInquiryFolder });

    const parent = { ...makeParentContact(), inquiryType: null };
    prisma.contact.findUnique.mockResolvedValue(parent);
    prisma.contact.create
      .mockResolvedValueOnce({ ...makeChildContact('child-1', 1, parent), inquiryType: null })
      .mockResolvedValueOnce({ ...makeChildContact('child-2', 2, parent), inquiryType: null });
    prisma.contact.update.mockResolvedValue({ ...parent, splitCount: 2 });

    await service.splitContact('parent-contact', { count: 2 });

    expect(ensureInquiryFolder).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════
// Task 22 Phase 2: findOne 응답 DTO 에 webhard_file_id 필드 포함
// ══════════════════════════════════════════════════════════════
describe('ContactsService.findOne — webhard_file_id (task 22 Phase 2)', () => {
  const CONTACT_ID = 'contact-wfi';

  it('#8: DrawingRevision 존재 + webhardFileIds[0] 있음 → response.webhard_file_id === webhardFileIds[0]', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findFirst.mockResolvedValue({
      id: CONTACT_ID,
      companyName: '거래처A',
      status: 'drawing',
      processStage: 'drawing',
    });
    prisma.drawingRevision.findFirst.mockResolvedValue({
      webhardFileIds: ['file-xyz', 'file-other'],
    });

    const result = await service.findOne(CONTACT_ID);

    expect(result.webhard_file_id).toBe('file-xyz');
    // 쿼리 조건 검증: contactId 로 조회 + version desc.
    const findFirstCall = prisma.drawingRevision.findFirst.mock.calls[0][0] as {
      where: { contactId: string };
      orderBy: { version: string };
      select: { webhardFileIds: boolean };
    };
    expect(findFirstCall.where.contactId).toBe(CONTACT_ID);
    expect(findFirstCall.orderBy.version).toBe('desc');
    expect(findFirstCall.select.webhardFileIds).toBe(true);
  });

  it('#9: DrawingRevision 없음 → response.webhard_file_id === null', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findFirst.mockResolvedValue({
      id: CONTACT_ID,
      companyName: '거래처A',
      status: 'received',
      processStage: null,
    });
    prisma.drawingRevision.findFirst.mockResolvedValue(null);

    const result = await service.findOne(CONTACT_ID);

    expect(result.webhard_file_id).toBeNull();
  });

  it('#10: DrawingRevision 있지만 webhardFileIds 빈 배열 → response.webhard_file_id === null', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findFirst.mockResolvedValue({
      id: CONTACT_ID,
      companyName: '거래처A',
      status: 'drawing',
      processStage: 'drawing',
    });
    prisma.drawingRevision.findFirst.mockResolvedValue({ webhardFileIds: [] });

    const result = await service.findOne(CONTACT_ID);

    expect(result.webhard_file_id).toBeNull();
  });
});

// ──────────────────────────────────────────────
// task 23 phase 3: findByCompany insensitive match (auto-contact-normalize)
//
// 스펙: docs/specs/api/endpoints/integration.md §companyName 정규화 정책
//       "findByCompany 는 동시에 insensitive match (대소문자 · 공백 무시) 로 하위 호환 보강.
//        기존 exact match 만 쓸 때 누락되던 레거시 Contact 도 조회된다."
// ──────────────────────────────────────────────

describe('ContactsService.findByCompany — insensitive match (task 23 phase 3)', () => {
  it('FC1: Prisma where.companyName.mode === "insensitive" 로 호출', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findMany.mockResolvedValue([]);

    await service.findByCompany({ companyName: '대성목형' } as never);

    expect(prisma.contact.findMany).toHaveBeenCalledTimes(1);
    const findManyCall = prisma.contact.findMany.mock.calls[0][0] as {
      where: {
        companyName: { equals: string; mode: string };
      };
    };
    expect(findManyCall.where.companyName).toEqual({
      equals: '대성목형',
      mode: 'insensitive',
    });
  });

  it('FC2: status query 가 있을 때 insensitive where 유지', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findMany.mockResolvedValue([]);

    await service.findByCompany({ companyName: '대성목형', status: 'drawing' } as never);

    const findManyCall = prisma.contact.findMany.mock.calls[0][0] as {
      where: {
        companyName: { equals: string; mode: string };
        status: string | { not: string };
      };
    };
    expect(findManyCall.where.companyName).toEqual({
      equals: '대성목형',
      mode: 'insensitive',
    });
    // status query 가 주어지면 status filter 가 덮어써짐 (기존 동작 보존)
    expect(findManyCall.where.status).toBe('drawing');
  });

  it('FC3: 대소문자 변종 ("ABC Corp" vs "abc corp") → 동일 인자로 호출 (Prisma 가 insensitive 처리)', async () => {
    // Prisma 레벨의 실제 insensitive 매칭은 DB 가 담당 — 여기선 service 가
    // insensitive 모드로 쿼리를 넘긴다는 사실만 검증 (unit 레이어 책임).
    const { service, prisma } = buildService();
    prisma.contact.findMany.mockResolvedValue([
      {
        id: 'c1',
        companyName: 'abc corp', // DB 저장값
        status: 'received',
        createdAt: new Date(),
      },
    ]);

    const result = await service.findByCompany({ companyName: 'ABC Corp' } as never);

    expect(result).toHaveLength(1);
    const findManyCall = prisma.contact.findMany.mock.calls[0][0] as {
      where: { companyName: { equals: string; mode: string } };
    };
    expect(findManyCall.where.companyName.mode).toBe('insensitive');
  });

  it('FC4: 완전히 다른 문자열 ("대성목형" vs "대성목형(주)") 은 매칭 안 됨 (insensitive 는 equals 기반, contains 아님)', async () => {
    // findMany 결과가 빈 배열이면 service 도 빈 배열 반환.
    // 실제 Prisma 에서도 equals+insensitive 는 부분 일치가 아닌 전체 일치만 허용.
    const { service, prisma } = buildService();
    prisma.contact.findMany.mockResolvedValue([]);

    const result = await service.findByCompany({ companyName: '대성목형' } as never);

    expect(result).toEqual([]);
    const findManyCall = prisma.contact.findMany.mock.calls[0][0] as {
      where: { companyName: { equals: string; mode: string } };
    };
    // equals 기반임을 보장 — 향후 contains 로 회귀하지 않도록.
    expect(findManyCall.where.companyName).toHaveProperty('equals');
    expect(findManyCall.where.companyName).not.toHaveProperty('contains');
  });

  it('FC5: 업체 대시보드 응답도 최신 DrawingRevision 파일의 현재 문의 폴더를 webhard_folder_id로 반환', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findMany.mockResolvedValue([
      {
        id: 'company-dashboard-contact',
        companyName: '테스트업체',
        status: 'drawing',
        processStage: 'drawing',
        source: 'webhard',
        inquiryType: 'cutting_request',
        webhardFolderId: 'company-root-folder-id',
        createdAt: new Date('2026-05-11T09:00:00.000Z'),
        updatedAt: new Date('2026-05-11T09:00:00.000Z'),
      },
    ]);
    prisma.webhardFolder.findMany.mockResolvedValueOnce([
      {
        id: 'company-root-folder-id',
        name: '테스트업체',
        path: '/테스트업체',
        parentId: null,
      },
    ]);
    prisma.drawingRevision.findMany.mockResolvedValueOnce([
      {
        contactId: 'company-dashboard-contact',
        version: 1,
        webhardFileIds: ['inquiry-file-id'],
      },
    ]);
    prisma.webhardFile.findMany.mockResolvedValueOnce([
      {
        id: 'inquiry-file-id',
        folderId: 'inquiry-folder-id',
        folder: {
          path: '/테스트업체/문의/260511-O-001',
        },
      },
    ]);

    const result = await service.findByCompany({ companyName: '테스트업체' } as never);

    expect(result[0].webhard_file_id).toBe('inquiry-file-id');
    expect(result[0].webhard_folder_id).toBe('inquiry-folder-id');
    expect(result[0].webhard_folder_path).toBe('/테스트업체/문의/260511-O-001');
  });

  it('FC6: 최신 파일 연결이 없어도 contactId로 연결된 문의 폴더를 업체 대시보드 webhard_folder_id로 반환', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findMany.mockResolvedValue([
      {
        id: 'company-dashboard-contact-with-stale-root',
        companyName: '테스트업체',
        status: 'drawing',
        processStage: 'drawing',
        source: 'webhard',
        inquiryType: 'cutting_request',
        inquiryNumber: '260511-O-001',
        workNumber: null,
        webhardFolderId: 'company-root-folder-id',
        createdAt: new Date('2026-05-11T09:00:00.000Z'),
        updatedAt: new Date('2026-05-11T09:00:00.000Z'),
      },
    ]);
    prisma.webhardFolder.findMany.mockResolvedValueOnce([
      {
        id: 'company-root-folder-id',
        name: '테스트업체',
        path: '/테스트업체',
        parentId: null,
      },
    ]);
    prisma.drawingRevision.findMany.mockResolvedValueOnce([
      {
        contactId: 'company-dashboard-contact-with-stale-root',
        version: 1,
        webhardFileIds: [],
      },
    ]);
    prisma.webhardFolder.findMany.mockResolvedValueOnce([
      {
        id: 'inquiry-folder-id',
        contactId: 'company-dashboard-contact-with-stale-root',
        folderKind: 'inquiry',
        name: '260511-O-001',
        path: '/테스트업체/문의/260511-O-001',
        parentId: 'inquiry-root-id',
      },
    ]);

    const result = await service.findByCompany({ companyName: '테스트업체' } as never);

    expect(result[0].webhard_file_id).toBeNull();
    expect(result[0].webhard_folder_id).toBe('inquiry-folder-id');
    expect(result[0].webhard_folder_path).toBe('/테스트업체/문의/260511-O-001');
  });
});

// ══════════════════════════════════════════════════════════════
// task 23 qa-contact-worker-v1 Phase 4: workCategory 필터 확장
// ══════════════════════════════════════════════════════════════

describe('ContactsService.findAll — workCategory 필터 (task 23 qa-contact-worker-v1)', () => {
  it('WC1: workCategory=unclassified 은 source=webhard + inquiryType=null 조건', async () => {
    const { service, prisma } = buildService();

    await service.findAll({ workCategory: 'unclassified' } as never);

    expect(prisma.contact.findMany).toHaveBeenCalledTimes(1);
    const findManyArgs = prisma.contact.findMany.mock.calls[0][0] as {
      where: {
        source?: string;
        inquiryType?: null;
        status?: { notIn: string[] };
      };
    };
    expect(findManyArgs.where.source).toBe('webhard');
    expect(findManyArgs.where.inquiryType).toBeNull();
    expect(findManyArgs.where.status).toEqual({ notIn: ['delivered', 'completed', 'deleting'] });
  });

  it('WC2: workCategory=office OR 분기 — 공개 폼(source=website) 과 외부웹하드 분류확정 모두 포함', async () => {
    const { service, prisma } = buildService();

    await service.findAll({ workCategory: 'office' } as never);

    const findManyArgs = prisma.contact.findMany.mock.calls[0][0] as {
      where: {
        OR?: Array<Record<string, unknown>>;
        status?: { notIn: string[] };
      };
    };
    expect(findManyArgs.where.OR).toBeDefined();
    // Prisma 는 `{ in: [null, ...] }` 를 허용하지 않아 null 을 분리한 4개 분기로 구성
    expect(findManyArgs.where.OR).toHaveLength(4);
    // (a) 공개 폼 접수 — processStage null 또는 drawing/sample
    expect(findManyArgs.where.OR).toContainEqual({
      source: 'website',
      processStage: null,
    });
    expect(findManyArgs.where.OR).toContainEqual({
      source: 'website',
      processStage: { in: ['drawing', 'sample'] },
    });
    // (b) 외부웹하드 + 분류 확정 — processStage null 또는 drawing/sample
    expect(findManyArgs.where.OR).toContainEqual({
      source: 'webhard',
      inquiryType: { not: null },
      processStage: null,
    });
    expect(findManyArgs.where.OR).toContainEqual({
      source: 'webhard',
      inquiryType: { not: null },
      processStage: { in: ['drawing', 'sample'] },
    });
    expect(findManyArgs.where.status).toEqual({ notIn: ['delivered', 'completed', 'deleting'] });
  });

  it('WC3: workCategory=office + search 동시 지정 시 OR 충돌 없이 AND 로 결합', async () => {
    const { service, prisma } = buildService();

    await service.findAll({ workCategory: 'office', search: '대성' } as never);

    const findManyArgs = prisma.contact.findMany.mock.calls[0][0] as {
      where: {
        OR?: Array<Record<string, unknown>>;
        AND?: Array<{ OR: Array<Record<string, unknown>> }>;
      };
    };
    // search 와 결합되면 기존 OR 가 AND 아래로 이동
    expect(findManyArgs.where.AND).toBeDefined();
    expect(findManyArgs.where.AND).toHaveLength(2);
    // 첫 번째 AND 절은 office OR (기존에 있던 OR)
    // 두 번째 AND 절은 search OR
    // 순서는 구현에 따라 다를 수 있으니, 둘 중 하나에 office OR 가 포함되어야 한다
    const andOrs = findManyArgs.where.AND!.map((a) => a.OR);
    const containsOfficeOr = andOrs.some(
      (or) =>
        Array.isArray(or) &&
        or.some(
          (o) =>
            (o as { source?: string }).source === 'website' ||
            (o as { source?: string }).source === 'webhard'
        )
    );
    expect(containsOfficeOr).toBe(true);
  });

  it('WC3b: search 조건은 delivered 서버 검색용 파일명 필드를 포함한다', async () => {
    const { service, prisma } = buildService();

    await service.findAll({ status: 'delivered', search: '도면파일' } as never);

    const findManyArgs = prisma.contact.findMany.mock.calls[0][0] as {
      where: {
        OR?: Array<Record<string, unknown>>;
      };
    };
    expect(findManyArgs.where.OR).toEqual(
      expect.arrayContaining([
        { originalFilename: { contains: '도면파일', mode: 'insensitive' } },
        { drawingFileName: { contains: '도면파일', mode: 'insensitive' } },
        { attachmentFilename: { contains: '도면파일', mode: 'insensitive' } },
        { revisionRequestFileName: { contains: '도면파일', mode: 'insensitive' } },
      ])
    );
  });

  it('WC4: workCategory=field 는 기존 로직 유지', async () => {
    const { service, prisma } = buildService();

    await service.findAll({ workCategory: 'field' } as never);

    const findManyArgs = prisma.contact.findMany.mock.calls[0][0] as {
      where: {
        processStage?: { in: string[] };
      };
    };
    expect(findManyArgs.where.processStage).toEqual({
      in: ['drawing_confirmed', 'laser', 'cutting', 'creasing', 'delivery'],
    });
  });

  it('WF1: 최신 DrawingRevision 파일의 현재 folderId/path가 Contact의 기존 webhardFolderId보다 우선한다', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findMany.mockResolvedValue([
      {
        id: 'contact-current-file-folder',
        companyName: '테스트업체',
        status: 'drawing',
        processStage: 'drawing',
        source: 'webhard',
        inquiryType: 'cutting_request',
        webhardFolderId: 'source-folder-id',
        createdAt: new Date('2026-05-11T09:00:00.000Z'),
        updatedAt: new Date('2026-05-11T09:00:00.000Z'),
      },
    ]);
    prisma.contact.count.mockResolvedValue(1);
    prisma.webhardFolder.findMany.mockResolvedValueOnce([
      {
        id: 'source-folder-id',
        name: '테스트업체',
        path: '/테스트업체',
        parentId: null,
      },
    ]);
    prisma.drawingRevision.findMany.mockResolvedValueOnce([
      {
        contactId: 'contact-current-file-folder',
        version: 2,
        webhardFileIds: ['latest-file-id'],
      },
    ]);
    prisma.webhardFile.findMany.mockResolvedValueOnce([
      {
        id: 'latest-file-id',
        folderId: 'inquiry-folder-id',
        folder: {
          id: 'inquiry-folder-id',
          name: '260511-O-001',
          path: '/테스트업체/문의/260511-O-001',
          parentId: 'inquiry-root-id',
        },
      },
    ]);

    const result = await service.findAll({ workCategory: 'office' } as never);

    expect(result.contacts[0].webhard_file_id).toBe('latest-file-id');
    expect(result.contacts[0].webhard_folder_id).toBe('inquiry-folder-id');
    expect(result.contacts[0].webhard_folder_path).toBe('/테스트업체/문의/260511-O-001');
  });

  it('includeWorkerNotes 응답의 worker_notes 내부 필드를 snake_case로 변환한다', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findMany.mockResolvedValue([
      {
        id: 'contact-with-worker-note',
        companyName: '테스트업체',
        status: 'drawing',
        processStage: 'drawing',
        source: 'webhard',
        inquiryType: 'cutting_request',
        createdAt: new Date('2026-05-21T04:00:00.000Z'),
        updatedAt: new Date('2026-05-21T04:00:00.000Z'),
        workerNotes: [
          {
            id: 3,
            contactId: 'contact-with-worker-note',
            type: 'issue',
            content: '3시간뒤 마감',
            createdBy: '김재현',
            createdAt: new Date('2026-05-21T05:30:00.000Z'),
            updatedAt: new Date('2026-05-21T05:30:00.000Z'),
          },
        ],
      },
    ]);
    prisma.contact.count.mockResolvedValue(1);

    const result = await service.findAll({ includeWorkerNotes: true } as never);
    const workerNotes = result.contacts[0].worker_notes as Array<Record<string, unknown>>;

    expect(workerNotes).toEqual([
      {
        id: 3,
        contact_id: 'contact-with-worker-note',
        type: 'issue',
        content: '3시간뒤 마감',
        created_by: '김재현',
        created_at: '2026-05-21T05:30:00.000Z',
        updated_at: '2026-05-21T05:30:00.000Z',
      },
    ]);
    expect(workerNotes[0]).not.toHaveProperty('createdBy');
    expect(workerNotes[0]).not.toHaveProperty('createdAt');
  });
});
