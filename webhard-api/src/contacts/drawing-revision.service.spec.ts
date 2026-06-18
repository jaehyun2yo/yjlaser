/**
 * DrawingRevisionService 단위 테스트
 *
 * 스펙: docs/specs/features/drawing-workflow.md 섹션 W, docs/specs/features/drawing-revision-history.md
 * 태스크: tasks/18-drawing-consistency/phase4.md (filename-prefix-apply)
 *
 * 검증 항목:
 * 1. createRevision → WebhardFile 행이 files 배열 길이만큼 생성
 * 2. 거래처 루트 폴더 없을 때 initializeCompanyFolders 자동 호출
 * 3. 번호 전용 문의 폴더 없을 때 생성, 있을 때 재사용
 * 4. WebhardFile.name = `[{picked}] {originalName}`, originalName 원본 유지
 *    - workNumber 가 있으면 공정 단계와 무관하게 workNumber 우선, 없으면 inquiryNumber
 * 5. WebhardFile.companyId, inquiryNumber 정확
 * 6. DrawingRevision.webhardFileIds에 생성된 id들 저장
 * 7. createInitialRevision (skipInitial=true) → WebhardFile 추가 생성 안 함
 * 8. Worker 경로: 세션 companyId 없어도 contact.companyName으로 Company 해결
 * 9. DXF 매칭 (integration) 경로: actorType=external, reason=laser_processing → WebhardFile 생성
 * 10. getRevisionDownloadUrl → workNumber 우선 "[번호] 원본명" fileName 반환
 */

import { DrawingRevisionService } from './drawing-revision.service';
import { CreateDrawingRevisionDto } from './dto/drawing-revision.dto';
import { StorageProvider } from '@prisma/client';

interface PrismaMock {
  contact: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  company: {
    findFirst: jest.Mock;
  };
  webhardFolder: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  webhardFile: {
    create: jest.Mock;
  };
  drawingRevision: {
    create: jest.Mock;
    update: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
  };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
}

function makePrisma(): PrismaMock {
  const prisma: PrismaMock = {
    contact: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    company: {
      findFirst: jest.fn(),
    },
    webhardFolder: {
      findFirst: jest.fn(),
      findUnique: jest.fn(async (args?: { where?: { id?: string } }) => ({
        id: args?.where?.id ?? SUB_FOLDER_ID,
        storageProvider: StorageProvider.R2,
        driveFolderId: null,
      })),
      create: jest.fn(),
    },
    webhardFile: {
      create: jest.fn(),
    },
    drawingRevision: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ next_version: 1 }]),
    $transaction: jest.fn(),
  };

  // $transaction: 콜백 스타일 — tx로 prisma 자체를 넘겨 동일한 mock 사용
  prisma.$transaction.mockImplementation(async (cb: (tx: PrismaMock) => unknown) => cb(prisma));

  return prisma;
}

function makeFoldersService() {
  return {
    initializeCompanyFolders: jest.fn().mockResolvedValue({ success: true }),
    computeFolderPath: jest.fn().mockImplementation(async (parentId: string, name: string) => {
      return parentId ? `/거래처A/${name}` : `/${name}`;
    }),
    // phase 5: ensureInquiryFolder — 기본값으로 문의 폴더 반환 (분류 완료된 Contact).
    ensureInquiryFolder: jest.fn().mockImplementation(async () => ({
      id: SUB_FOLDER_ID,
      name: WORK_NUMBER,
      parentId: ROOT_FOLDER_ID,
      companyId: COMPANY_ID,
      path: `/거래처A/문의/${WORK_NUMBER}`,
      folderKind: 'inquiry',
      contactId: CONTACT_ID,
      inquiryNumber: INQUIRY_NUMBER,
      workNumber: WORK_NUMBER,
    })),
    // phase 2 (task 19): relocateContactFiles — Contact 의 기존 파일을 target 폴더로 일괄 이동.
    relocateContactFiles: jest.fn().mockResolvedValue({ movedIds: [] }),
  };
}

function makeConfigService() {
  return {
    get: jest.fn().mockImplementation((key: string, fallback: string) => {
      if (key === 'R2_PUBLIC_BASE_URL') return 'https://cdn.yjlaser.net';
      return fallback;
    }),
  };
}

function makeTimelineService() {
  return { recordChange: jest.fn().mockResolvedValue({}) };
}

function makeContactsGateway() {
  return { emitDrawingRevisionAdded: jest.fn() };
}

function makeEventsGateway() {
  return { emitToFolder: jest.fn() };
}

function makeStorageService() {
  return {
    getDownloadPresignedUrl: jest.fn(),
    getUploadPresignedUrl: jest.fn(),
  };
}

const CONTACT_ID = '11111111-1111-1111-1111-111111111111';
const COMPANY_ID = 42;
const COMPANY_NAME = '거래처A';
const WORK_NUMBER = '260417-F-001';
const INQUIRY_NUMBER = 'IN-0417-1';
const ROOT_FOLDER_ID = 'root-folder-uuid';
const SUB_FOLDER_ID = 'sub-folder-uuid';

function makeBaseDto(overrides: Partial<CreateDrawingRevisionDto> = {}): CreateDrawingRevisionDto {
  return {
    reason: 'field_correction',
    files: [
      {
        url: 'https://cdn.yjlaser.net/drawings/contact-1/uuid/111-sample.dxf',
        name: 'sample.dxf',
        size: 1024,
        mimeType: 'application/dxf',
      },
    ],
    source: 'manual',
    ...overrides,
  };
}

function buildService(
  overrides: {
    prisma?: PrismaMock;
    folders?: ReturnType<typeof makeFoldersService>;
    config?: ReturnType<typeof makeConfigService>;
  } = {}
) {
  const prisma = overrides.prisma ?? makePrisma();
  const folders = overrides.folders ?? makeFoldersService();
  const config = overrides.config ?? makeConfigService();
  const timeline = makeTimelineService();
  const gateway = makeContactsGateway();
  const eventsGateway = makeEventsGateway();
  const storage = makeStorageService();

  const service = new DrawingRevisionService(
    prisma as never,
    storage as never,
    timeline as never,
    gateway as never,
    eventsGateway as never,
    folders as never,
    config as never
  );

  return { service, prisma, folders, config, timeline, gateway, eventsGateway };
}

function stubSuccessfulRevisionCreate(prisma: PrismaMock, revisionId = 'rev-1', version = 2) {
  prisma.drawingRevision.create.mockResolvedValue({
    id: revisionId,
    contactId: CONTACT_ID,
    version,
    reason: 'field_correction',
    files: [],
    webhardFileIds: [],
    actorType: 'admin',
    actorName: '관리자',
    source: 'manual',
    processStage: null,
    reasonDetail: null,
    note: null,
    isPublic: false,
    createdAt: new Date(),
  });
  prisma.drawingRevision.update.mockImplementation(
    async ({ data }: { data: { webhardFileIds: string[] } }) => ({
      id: revisionId,
      contactId: CONTACT_ID,
      version,
      reason: 'field_correction',
      files: [],
      webhardFileIds: data.webhardFileIds,
      actorType: 'admin',
      actorName: '관리자',
      source: 'manual',
      processStage: null,
      reasonDetail: null,
      note: null,
      isPublic: false,
      createdAt: new Date(),
    })
  );
}

function stubDefaultContactLookups(
  prisma: PrismaMock,
  opts: {
    workNumber?: string | null;
    inquiryNumber?: string | null;
    companyName?: string | null;
    processStage?: string | null;
    inquiryType?: string | null;
    hasRootFolder?: boolean;
    hasSubFolder?: boolean;
  } = {}
) {
  const {
    workNumber = WORK_NUMBER,
    inquiryNumber = INQUIRY_NUMBER,
    companyName = COMPANY_NAME,
    processStage = null,
    inquiryType = null,
    hasRootFolder = true,
    hasSubFolder = false,
  } = opts;

  prisma.contact.findUnique.mockResolvedValue({
    id: CONTACT_ID,
    workNumber,
    inquiryNumber,
    companyName,
    processStage,
    inquiryType,
  });

  prisma.company.findFirst.mockResolvedValue(companyName ? { id: COMPANY_ID, companyName } : null);

  // webhardFolder.findFirst 순서: (1) root 조회, (2) sub 조회, (3) 루트 부재 시 initialize 이후 재조회
  const folderCalls: Array<{ id: string } | null> = [];
  folderCalls.push(hasRootFolder ? { id: ROOT_FOLDER_ID } : null);
  if (!hasRootFolder) {
    folderCalls.push({ id: ROOT_FOLDER_ID }); // initialize 후 재조회
  }
  folderCalls.push(hasSubFolder ? { id: SUB_FOLDER_ID } : null);

  prisma.webhardFolder.findFirst.mockImplementation(async () => folderCalls.shift() ?? null);

  prisma.webhardFolder.create.mockResolvedValue({ id: SUB_FOLDER_ID });

  let fileSeq = 0;
  prisma.webhardFile.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
    fileSeq += 1;
    return {
      id: `webhard-file-${fileSeq}`,
      ...args.data,
    };
  });
}

describe('DrawingRevisionService.getLatestForCurrentStage — query performance', () => {
  it('현재 공정 fallback을 여러 findFirst 호출이 아닌 단일 ranked query로 조회', async () => {
    const { service, prisma } = buildService();
    const latestRevision = {
      id: 'latest-ranked-revision',
      contactId: CONTACT_ID,
      version: 7,
      processStage: 'laser',
      reason: 'laser_processing',
      reasonDetail: null,
      files: [],
      webhardFileIds: ['file-1'],
      actorType: 'worker',
      actorName: '작업자',
      source: 'manual',
      isPublic: true,
      note: null,
      createdAt: new Date('2026-05-25T00:00:00.000Z'),
    };

    prisma.contact.findUnique.mockResolvedValue({ processStage: 'creasing' });
    prisma.$queryRaw.mockResolvedValueOnce([latestRevision]);

    await expect(
      service.getLatestForCurrentStage(CONTACT_ID, { includePrivate: false })
    ).resolves.toEqual(latestRevision);

    expect(prisma.drawingRevision.findFirst).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────
// 1. createRevision → WebhardFile per file
// ──────────────────────────────────────────────
describe('DrawingRevisionService.createRevision — WebhardFile 자동 생성 개수', () => {
  it('files 배열 길이만큼 WebhardFile 생성', async () => {
    const { service, prisma } = buildService();
    stubSuccessfulRevisionCreate(prisma);
    stubDefaultContactLookups(prisma);

    const dto = makeBaseDto({
      files: [
        {
          url: 'https://cdn.yjlaser.net/drawings/1/a.dxf',
          name: 'a.dxf',
          size: 1,
          mimeType: 'application/dxf',
        },
        {
          url: 'https://cdn.yjlaser.net/drawings/1/b.dxf',
          name: 'b.dxf',
          size: 2,
          mimeType: 'application/dxf',
        },
        {
          url: 'https://cdn.yjlaser.net/drawings/1/c.dxf',
          name: 'c.dxf',
          size: 3,
          mimeType: 'application/dxf',
        },
      ],
    });

    await service.createRevision(CONTACT_ID, dto, { actorType: 'admin', actorName: '관리자' });

    expect(prisma.webhardFile.create).toHaveBeenCalledTimes(3);
  });
});

// ──────────────────────────────────────────────
// 2. 문의 폴더 배치 위임 (phase 5: ensureInquiryFolder)
// ──────────────────────────────────────────────
describe('DrawingRevisionService.createRevision — ensureInquiryFolder 위임', () => {
  it('분류된 Contact → ensureInquiryFolder 결과 폴더에 WebhardFile 생성', async () => {
    const { service, prisma, folders } = buildService();
    stubSuccessfulRevisionCreate(prisma);
    stubDefaultContactLookups(prisma);

    await service.createRevision(CONTACT_ID, makeBaseDto(), {
      actorType: 'admin',
      actorName: '관리자',
    });

    expect(folders.ensureInquiryFolder).toHaveBeenCalledWith(CONTACT_ID);
    const createCall = prisma.webhardFile.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    // ensureInquiryFolder 가 반환한 폴더의 id 로 folderId 지정
    expect(createCall.data.folderId).toBe(SUB_FOLDER_ID);
  });

  it('미분류(ensureInquiryFolder=null) → 거래처 루트 폴더로 fallback', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue(null);
    const { service, prisma } = buildService({ folders });
    stubSuccessfulRevisionCreate(prisma);
    stubDefaultContactLookups(prisma, { hasRootFolder: true });

    await service.createRevision(CONTACT_ID, makeBaseDto(), {
      actorType: 'admin',
      actorName: '관리자',
    });

    const createCall = prisma.webhardFile.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    // fallback 은 거래처 루트 폴더
    expect(createCall.data.folderId).toBe(ROOT_FOLDER_ID);
  });

  it('미분류 + 루트 폴더도 없음 → initializeCompanyFolders 호출 후 루트 폴더 사용', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue(null);
    const { service, prisma } = buildService({ folders });
    stubSuccessfulRevisionCreate(prisma);
    stubDefaultContactLookups(prisma, { hasRootFolder: false });

    await service.createRevision(CONTACT_ID, makeBaseDto(), {
      actorType: 'admin',
      actorName: '관리자',
    });

    expect(folders.initializeCompanyFolders).toHaveBeenCalledWith(COMPANY_ID, COMPANY_NAME);
    expect(prisma.webhardFile.create).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────
// 4. WebhardFile 이름 포맷 & originalName 보존
// ──────────────────────────────────────────────
describe('DrawingRevisionService.createRevision — 파일명 규칙', () => {
  it('revision.processStage=field → name = `[{workNumber}] {originalName}`, originalName = 원본', async () => {
    const { service, prisma } = buildService();
    stubSuccessfulRevisionCreate(prisma);
    stubDefaultContactLookups(prisma);

    const dto = makeBaseDto({
      processStage: 'laser',
      files: [
        {
          url: 'https://cdn.yjlaser.net/drawings/1/my-design.dxf',
          name: 'my-design.dxf',
          size: 100,
          mimeType: 'application/dxf',
        },
      ],
    });

    await service.createRevision(CONTACT_ID, dto, { actorType: 'admin', actorName: '관리자' });

    const createCall = prisma.webhardFile.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.name).toBe(`[${WORK_NUMBER}] my-design.dxf`);
    expect(createCall.data.originalName).toBe('my-design.dxf');
    // size는 BigInt 변환
    expect(createCall.data.size).toBe(BigInt(100));
    expect(createCall.data.mimeType).toBe('application/dxf');
  });

  it('revision.processStage=office(drawing) + workNumber 존재 → name = `[{workNumber}] {originalName}`', async () => {
    const { service, prisma } = buildService();
    stubSuccessfulRevisionCreate(prisma);
    stubDefaultContactLookups(prisma);

    const dto = makeBaseDto({
      processStage: 'drawing',
      files: [
        {
          url: 'https://cdn.yjlaser.net/drawings/1/plan.dxf',
          name: 'plan.dxf',
          size: 200,
          mimeType: 'application/dxf',
        },
      ],
    });

    await service.createRevision(CONTACT_ID, dto, { actorType: 'admin', actorName: '관리자' });

    const createCall = prisma.webhardFile.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.name).toBe(`[${WORK_NUMBER}] plan.dxf`);
    expect(createCall.data.originalName).toBe('plan.dxf');
  });
});

// ──────────────────────────────────────────────
// 5. companyId, inquiryNumber 정확
// ──────────────────────────────────────────────
describe('DrawingRevisionService.createRevision — companyId/inquiryNumber', () => {
  it('WebhardFile.companyId는 Company.id, inquiryNumber는 contact.inquiryNumber 사용', async () => {
    const { service, prisma } = buildService();
    stubSuccessfulRevisionCreate(prisma);
    stubDefaultContactLookups(prisma);

    await service.createRevision(CONTACT_ID, makeBaseDto(), {
      actorType: 'admin',
      actorName: '관리자',
    });

    const createCall = prisma.webhardFile.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.companyId).toBe(COMPANY_ID);
    expect(createCall.data.inquiryNumber).toBe(INQUIRY_NUMBER);
    expect(createCall.data.folderId).toBe(SUB_FOLDER_ID);
  });

  it('inquiryNumber 없으면 workNumber로 폴백', async () => {
    const { service, prisma } = buildService();
    stubSuccessfulRevisionCreate(prisma);
    stubDefaultContactLookups(prisma, { inquiryNumber: null });

    await service.createRevision(CONTACT_ID, makeBaseDto(), {
      actorType: 'admin',
      actorName: '관리자',
    });

    const createCall = prisma.webhardFile.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.inquiryNumber).toBe(WORK_NUMBER);
  });
});

// ──────────────────────────────────────────────
// 6. DrawingRevision.webhardFileIds 업데이트
// ──────────────────────────────────────────────
describe('DrawingRevisionService.createRevision — webhardFileIds 저장', () => {
  it('생성된 WebhardFile.id 배열로 DrawingRevision.webhardFileIds 업데이트', async () => {
    const { service, prisma } = buildService();
    stubSuccessfulRevisionCreate(prisma, 'rev-xyz');
    stubDefaultContactLookups(prisma);

    const dto = makeBaseDto({
      files: [
        {
          url: 'https://cdn.yjlaser.net/a.dxf',
          name: 'a.dxf',
          size: 1,
          mimeType: 'application/dxf',
        },
        {
          url: 'https://cdn.yjlaser.net/b.dxf',
          name: 'b.dxf',
          size: 2,
          mimeType: 'application/dxf',
        },
      ],
    });

    const result = await service.createRevision(CONTACT_ID, dto, {
      actorType: 'admin',
      actorName: '관리자',
    });

    expect(prisma.drawingRevision.update).toHaveBeenCalledTimes(1);
    const updateCall = prisma.drawingRevision.update.mock.calls[0][0] as {
      where: { id: string };
      data: { webhardFileIds: string[] };
    };
    expect(updateCall.where.id).toBe('rev-xyz');
    expect(updateCall.data.webhardFileIds).toEqual(['webhard-file-1', 'webhard-file-2']);
    expect(result.revision.webhardFileIds).toEqual(['webhard-file-1', 'webhard-file-2']);
    expect(result.webhardFiles).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────
// 7. createInitialRevision (skipInitial=true) → WebhardFile 생성 없음
// ──────────────────────────────────────────────
describe('DrawingRevisionService.createInitialRevision — skipInitial 중복 방지', () => {
  it('auto_initial 경로는 WebhardFile.create 호출하지 않음 (registerFilesToWebhard가 전담)', async () => {
    const { service, prisma } = buildService();
    // $queryRaw는 next_version=1
    prisma.drawingRevision.create.mockResolvedValue({
      id: 'rev-init',
      contactId: CONTACT_ID,
      version: 1,
      reason: 'initial',
      files: [],
      webhardFileIds: [],
      actorType: 'system',
      actorName: null,
      source: 'auto_initial',
      processStage: null,
      reasonDetail: null,
      note: null,
      isPublic: false,
      createdAt: new Date(),
    });

    await service.createInitialRevision(
      CONTACT_ID,
      'https://cdn.yjlaser.net/initial.dxf',
      'initial.dxf'
    );

    // WebhardFile은 생성되지 않아야 함
    expect(prisma.webhardFile.create).not.toHaveBeenCalled();
    // Company 조회도 skipInitial로 즉시 return이므로 수행되지 않음
    expect(prisma.company.findFirst).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────
// 8. Worker 경로: contact.companyName으로 Company 해결 → WebhardFile.companyId 채움
// ──────────────────────────────────────────────
describe('DrawingRevisionService.createRevision — Worker 경로', () => {
  it('actorType=worker + 세션 companyId 없음 → contact.companyName 기반 Company.id로 WebhardFile.companyId 채움', async () => {
    const { service, prisma } = buildService();
    stubSuccessfulRevisionCreate(prisma, 'rev-worker');
    stubDefaultContactLookups(prisma);

    await service.createRevision(CONTACT_ID, makeBaseDto(), {
      actorType: 'worker',
      actorName: '홍길동',
    });

    expect(prisma.company.findFirst).toHaveBeenCalledWith({
      where: { companyName: COMPANY_NAME },
      select: { id: true, companyName: true },
    });
    const createCall = prisma.webhardFile.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.companyId).toBe(COMPANY_ID);
    expect(createCall.data.uploadedBy).toBe('홍길동');
  });

  it('WebhardFile 생성 후 대상 문의 폴더에 file:created 이벤트를 발행한다', async () => {
    const { service, prisma, eventsGateway } = buildService();
    stubSuccessfulRevisionCreate(prisma, 'rev-worker');
    stubDefaultContactLookups(prisma);

    await service.createRevision(CONTACT_ID, makeBaseDto(), {
      actorType: 'worker',
      actorName: '홍길동',
    });

    expect(eventsGateway.emitToFolder).toHaveBeenCalledWith(SUB_FOLDER_ID, {
      type: 'file:created',
      folderId: SUB_FOLDER_ID,
      data: { fileId: 'webhard-file-1', contactId: CONTACT_ID },
    });
  });
});

// ──────────────────────────────────────────────
// 9. DXF 매칭 (integration) 경로: actorType=external, reason=laser_processing
// ──────────────────────────────────────────────
describe('DrawingRevisionService.createRevision — DXF 매칭 integration 경로', () => {
  it('actorType=external + reason=laser_processing → WebhardFile 생성, uploadedBy=관리프로그램', async () => {
    const { service, prisma } = buildService();
    stubSuccessfulRevisionCreate(prisma, 'rev-dxf');
    stubDefaultContactLookups(prisma);

    const dto = makeBaseDto({
      reason: 'laser_processing',
      source: 'integration',
      processStage: 'laser',
      files: [
        {
          url: 'https://cdn.yjlaser.net/dxf/260417-F-001.dxf',
          name: '260417-F-001.dxf',
          size: 500,
          mimeType: 'application/dxf',
        },
      ],
    });

    await service.createRevision(CONTACT_ID, dto, {
      actorType: 'external',
      actorName: '관리프로그램',
    });

    expect(prisma.webhardFile.create).toHaveBeenCalledTimes(1);
    const createCall = prisma.webhardFile.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.uploadedBy).toBe('관리프로그램');
    expect(createCall.data.originalName).toBe('260417-F-001.dxf');
    expect(createCall.data.name).toBe(`[${WORK_NUMBER}] 260417-F-001.dxf`);

    // revision 생성 시 reason/source 전달 확인
    const revCreate = prisma.drawingRevision.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(revCreate.data.reason).toBe('laser_processing');
    expect(revCreate.data.source).toBe('integration');
    expect(revCreate.data.actorType).toBe('external');
  });
});

// ──────────────────────────────────────────────
// 회귀: companyName 없는 문의 (laser-only 등) — 에러 없이 빈 배열
// ──────────────────────────────────────────────
describe('DrawingRevisionService.createRevision — companyName 없는 문의', () => {
  it('contact.companyName=null → WebhardFile 생성 없음, DrawingRevision은 정상 생성', async () => {
    const { service, prisma } = buildService();
    stubSuccessfulRevisionCreate(prisma);
    prisma.contact.findUnique.mockResolvedValue({
      id: CONTACT_ID,
      workNumber: WORK_NUMBER,
      inquiryNumber: INQUIRY_NUMBER,
      companyName: null,
      processStage: null,
      inquiryType: null,
    });

    const result = await service.createRevision(CONTACT_ID, makeBaseDto(), {
      actorType: 'admin',
      actorName: '관리자',
    });

    expect(result).toBeDefined();
    expect(result.revision).toBeDefined();
    expect(result.webhardFiles).toHaveLength(0);
    expect(prisma.webhardFile.create).not.toHaveBeenCalled();
    // webhardFileIds 빈 배열이므로 update 호출 없음
    expect(prisma.drawingRevision.update).not.toHaveBeenCalled();
  });
});

describe('DrawingRevisionService.getRevisionAccessInfo', () => {
  it('revision 소유 문의의 companyName을 presigned URL 없이 반환한다', async () => {
    const { service, prisma } = buildService();
    prisma.drawingRevision.findUnique.mockResolvedValue({
      id: 'rev-info-1',
      contactId: CONTACT_ID,
      isPublic: true,
      contact: {
        companyName: COMPANY_NAME,
      },
    });

    const result = await service.getRevisionAccessInfo('rev-info-1');

    expect(result).toEqual({
      id: 'rev-info-1',
      contactId: CONTACT_ID,
      companyName: COMPANY_NAME,
      isPublic: true,
    });
    expect(prisma.drawingRevision.findUnique).toHaveBeenCalledWith({
      where: { id: 'rev-info-1' },
      select: {
        id: true,
        contactId: true,
        isPublic: true,
        contact: {
          select: {
            companyName: true,
          },
        },
      },
    });
  });

  it('revision이 없으면 NotFoundException을 던진다', async () => {
    const { service, prisma } = buildService();
    prisma.drawingRevision.findUnique.mockResolvedValue(null);

    await expect(service.getRevisionAccessInfo('missing-rev')).rejects.toThrow(
      '도면 수정 이력을 찾을 수 없습니다.'
    );
  });
});

// ──────────────────────────────────────────────
// 10. getRevisionDownloadUrl — "[번호] 원본명" fileName 반환
// ──────────────────────────────────────────────
describe('DrawingRevisionService.getRevisionDownloadUrl — 파일명 prefix', () => {
  function stubPresignedUrl(service: DrawingRevisionService) {
    const storage = (
      service as unknown as { storageService: { getDownloadPresignedUrl: jest.Mock } }
    ).storageService;
    storage.getDownloadPresignedUrl = jest
      .fn()
      .mockResolvedValue({ url: 'https://cdn.yjlaser.net/signed' });
    return storage.getDownloadPresignedUrl as jest.Mock;
  }

  it('revision.processStage=field → workNumber prefix', async () => {
    const { service, prisma } = buildService();
    const presign = stubPresignedUrl(service);
    prisma.drawingRevision.findUnique.mockResolvedValue({
      id: 'rev-dl-1',
      processStage: 'laser',
      files: [
        {
          url: 'https://cdn.yjlaser.net/drawings/1/foo.dxf',
          name: 'foo.dxf',
        },
      ],
      contact: {
        inquiryNumber: INQUIRY_NUMBER,
        workNumber: WORK_NUMBER,
        processStage: null,
        inquiryType: null,
      },
    });

    const result = await service.getRevisionDownloadUrl('rev-dl-1', 0);

    expect(result.fileName).toBe(`[${WORK_NUMBER}] foo.dxf`);
    expect(presign).toHaveBeenCalledWith(expect.any(String), undefined, `[${WORK_NUMBER}] foo.dxf`);
  });

  it('revision.processStage=office(drawing) + workNumber 존재 → workNumber prefix', async () => {
    const { service, prisma } = buildService();
    stubPresignedUrl(service);
    prisma.drawingRevision.findUnique.mockResolvedValue({
      id: 'rev-dl-2',
      processStage: 'drawing',
      files: [
        {
          url: 'https://cdn.yjlaser.net/drawings/1/bar.dxf',
          name: 'bar.dxf',
        },
      ],
      contact: {
        inquiryNumber: INQUIRY_NUMBER,
        workNumber: WORK_NUMBER,
        processStage: null,
        inquiryType: null,
      },
    });

    const result = await service.getRevisionDownloadUrl('rev-dl-2', 0);

    expect(result.fileName).toBe(`[${WORK_NUMBER}] bar.dxf`);
  });

  it('revision.processStage=null + contact 번호 부재 → 원본명 그대로', async () => {
    const { service, prisma } = buildService();
    stubPresignedUrl(service);
    prisma.drawingRevision.findUnique.mockResolvedValue({
      id: 'rev-dl-3',
      processStage: null,
      files: [
        {
          url: 'https://cdn.yjlaser.net/drawings/1/naked.dxf',
          name: 'naked.dxf',
        },
      ],
      contact: {
        inquiryNumber: null,
        workNumber: null,
        processStage: null,
        inquiryType: null,
      },
    });

    const result = await service.getRevisionDownloadUrl('rev-dl-3', 0);

    expect(result.fileName).toBe('naked.dxf');
  });

  it('percent-encoded 한글 URL → decoded key 로 storage 호출 (phase 6)', async () => {
    const { service, prisma } = buildService();
    const presign = stubPresignedUrl(service);
    prisma.drawingRevision.findUnique.mockResolvedValue({
      id: 'rev-dl-4',
      processStage: 'laser',
      files: [
        {
          // "drawings/1/파일.dxf" 를 percent-encoding 해 저장한 상태.
          url: 'https://cdn.yjlaser.net/drawings/1/%ED%8C%8C%EC%9D%BC.dxf',
          name: '파일.dxf',
        },
      ],
      contact: {
        inquiryNumber: INQUIRY_NUMBER,
        workNumber: WORK_NUMBER,
        processStage: null,
        inquiryType: null,
      },
    });

    await service.getRevisionDownloadUrl('rev-dl-4', 0);

    // storage.getDownloadPresignedUrl 에 전달된 첫 번째 인자(key)가
    // percent-escape 가 아닌 원문 '파일.dxf' 여야 한다.
    expect(presign).toHaveBeenCalledTimes(1);
    const [keyArg] = presign.mock.calls[0];
    expect(keyArg).toBe('drawings/1/파일.dxf');
  });
});

// ──────────────────────────────────────────────
// task 19 / phase 2: webhardWarning 반환 · relocateContactFiles 연계
// ──────────────────────────────────────────────
describe('DrawingRevisionService.createRevision — phase 2 webhardWarning', () => {
  // R1: ensureInquiryFolder → null (문의번호 미발급)
  it('R1: ensureInquiryFolder=null → webhardWarning=NO_INQUIRY_NUMBER, revision 은 여전히 생성', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue(null);
    const { service, prisma } = buildService({ folders });
    stubSuccessfulRevisionCreate(prisma, 'rev-r1');
    stubDefaultContactLookups(prisma, { hasRootFolder: true });

    const result = await service.createRevision(CONTACT_ID, makeBaseDto(), {
      actorType: 'admin',
      actorName: '관리자',
    });

    expect(result.webhardWarning).toEqual({
      code: 'NO_INQUIRY_NUMBER',
      message: expect.stringContaining('문의번호 미발급'),
    });
    expect(result.revision.id).toBe('rev-r1');
    // DB row 는 정상 생성 — drawingRevision.create 호출 확인.
    expect(prisma.drawingRevision.create).toHaveBeenCalledTimes(1);
    // fallback 으로 업체 루트에 파일은 생성됨.
    expect(prisma.webhardFile.create).toHaveBeenCalled();
  });

  // R2: 정상 경로
  it('R2: 정상 경로 → webhardWarning=undefined, webhardFiles.length>0', async () => {
    const { service, prisma } = buildService();
    stubSuccessfulRevisionCreate(prisma, 'rev-r2');
    stubDefaultContactLookups(prisma);

    const result = await service.createRevision(CONTACT_ID, makeBaseDto(), {
      actorType: 'admin',
      actorName: '관리자',
    });

    expect(result.webhardWarning).toBeUndefined();
    expect(result.webhardFiles.length).toBeGreaterThan(0);
  });

  // R3: 첫 업로드 시 원본 도면이 relocateContactFiles 로 새 문의 폴더로 이동
  it('R3: relocateContactFiles 가 targetFolderId 로 호출됨', async () => {
    const { service, prisma, folders } = buildService();
    stubSuccessfulRevisionCreate(prisma, 'rev-r3');
    stubDefaultContactLookups(prisma);

    await service.createRevision(CONTACT_ID, makeBaseDto(), {
      actorType: 'admin',
      actorName: '관리자',
    });

    expect(folders.relocateContactFiles).toHaveBeenCalledTimes(1);
    expect(folders.relocateContactFiles).toHaveBeenCalledWith(CONTACT_ID, SUB_FOLDER_ID);
  });

  // R4: 두 번째 revision — ensureInquiryFolder 재사용, 중복 폴더 생성 없음
  it('R4: 동일 Contact 2회 호출 — ensureInquiryFolder 가 기존 폴더 반환, 중복 생성 없음', async () => {
    const folders = makeFoldersService();
    // folders.ensureInquiryFolder 의 default mock 은 SUB_FOLDER_ID 를 반환.
    // 두 번 호출해도 같은 폴더 id 반환 — FoldersService 내부 findFirst 가 재사용.
    const { service, prisma } = buildService({ folders });
    stubSuccessfulRevisionCreate(prisma, 'rev-r4a');
    stubDefaultContactLookups(prisma);

    await service.createRevision(CONTACT_ID, makeBaseDto(), {
      actorType: 'admin',
      actorName: '관리자',
    });

    // 2회째 호출을 위한 stub 재설정 (prisma mock state 초기화 없이 이어감).
    prisma.drawingRevision.create.mockResolvedValue({
      id: 'rev-r4b',
      contactId: CONTACT_ID,
      version: 3,
      reason: 'field_correction',
      files: [],
      webhardFileIds: [],
      actorType: 'admin',
      actorName: '관리자',
      source: 'manual',
      processStage: null,
      reasonDetail: null,
      note: null,
      isPublic: false,
      createdAt: new Date(),
    });
    // webhardFolder.findFirst 의 stub 은 stubDefaultContactLookups 에서 순차 shift.
    // 2회차 호출 경로에서는 ensureInquiryFolder mock 이 이미 SUB_FOLDER_ID 를 반환하므로
    // prisma.webhardFolder.findFirst 는 거의 호출되지 않는다.
    const result2 = await service.createRevision(CONTACT_ID, makeBaseDto(), {
      actorType: 'admin',
      actorName: '관리자',
    });

    // ensureInquiryFolder 가 두 번 호출 (각 createRevision 1회씩).
    expect(folders.ensureInquiryFolder).toHaveBeenCalledTimes(2);
    // 2회차도 warning 없음.
    expect(result2.webhardWarning).toBeUndefined();
    // 신규 WebhardFile 은 두 호출 합산으로 최소 2개 생성.
    expect(prisma.webhardFile.create).toHaveBeenCalledTimes(2);
  });

  // R5: relocateContactFiles 내부 throw → RELOCATE_FAILED, 신규 WebhardFile 보존
  it('R5: relocateContactFiles throw → webhardWarning=RELOCATE_FAILED, WebhardFile 보존', async () => {
    const folders = makeFoldersService();
    folders.relocateContactFiles.mockRejectedValue(new Error('relocate boom'));
    const { service, prisma } = buildService({ folders });
    stubSuccessfulRevisionCreate(prisma, 'rev-r5');
    stubDefaultContactLookups(prisma);

    const result = await service.createRevision(CONTACT_ID, makeBaseDto(), {
      actorType: 'admin',
      actorName: '관리자',
    });

    expect(result.webhardWarning).toEqual({
      code: 'RELOCATE_FAILED',
      message: 'relocate boom',
    });
    // 신규 WebhardFile 은 보존 — webhardFiles 배열 채워져 있음.
    expect(result.webhardFiles.length).toBeGreaterThan(0);
    // DrawingRevision.webhardFileIds 도 정상 업데이트.
    expect(prisma.drawingRevision.update).toHaveBeenCalledTimes(1);
  });
});
