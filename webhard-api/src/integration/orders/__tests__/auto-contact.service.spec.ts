/**
 * AutoContactService 단위 테스트
 *
 * 스펙: docs/superpowers/specs/2026-03-17-webhard-auto-inquiry-design.md
 *
 * 검증 항목:
 * 1. 칼선의뢰/목형의뢰/미분류 각각 자동 생성
 * 2. 중복 파일 업데이트 처리
 * 3. 미분류 → 유형 지정 시 status 자동 변경
 * 4. processStageToContactStatus ERP status 보존 가드
 */

import { AutoContactService } from '../auto-contact.service';
import { AutoContactFromFileDto } from '../dto/auto-contact.dto';
import { processStageToContactStatus, orderStatusToProcessStage } from '../order-status-sync.util';
// task 25 phase 4 (E2E-1): Bug 2 + Bug 3 통합 service-level test 에서
// FolderAliasService.createApprovedAlias 와 ContactFolderSyncService.relocateAfterAliasApproved
// 의 chain 호출 시퀀스를 직접 검증하기 위해 import.
import { FolderAliasService } from '../../../companies/folder-alias.service';
import { ContactFolderSyncService } from '../../../contacts/contact-folder-sync.service';

// Prisma mock with ORM methods
function makePrisma() {
  const prisma = {
    contact: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    company: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    // task 24 phase 2: matchCompanyInfo 4단계 매칭에서 0차/3차 단계가 사용.
    // default 안전값 — 0차는 alias 없음 (null), 3차는 후보 0개·upsert no-op.
    companyFolderAlias: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
    notification: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    webhardFile: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    executeWithRetry: jest.fn((fn: () => unknown) => fn()),
    $transaction: jest.fn(),
  };
  // Phase 2: createNewContact는 $transaction(async tx => {...}) 안에서 tx.contact.create 호출.
  // tx로 prisma 자체를 넘겨 기존 mock을 재사용 (tx.contact.create === prisma.contact.create).
  prisma.$transaction.mockImplementation(
    async (cb: (tx: typeof prisma) => unknown, _opts?: unknown) => cb(prisma)
  );
  return prisma;
}

// NumberService mock
function makeNumberService() {
  let seq = 0;
  return {
    generateNumber: jest.fn(async (type: string) => {
      seq++;
      const today = new Date();
      const yy = String(today.getFullYear()).slice(2);
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const prefix = type === 'inquiry' ? 'O' : 'F';
      return `${yy}${mm}${dd}-${prefix}-${String(seq).padStart(3, '0')}`;
    }),
    peekNextNumber: jest.fn(async (type: string) => {
      const prefix = type === 'inquiry' ? 'O' : 'F';
      return `260325-${prefix}-001`;
    }),
  };
}

// WebhardConfigService mock
function makeWebhardConfigService() {
  return {
    classifyByFolderPath: jest.fn(async (path: string) => {
      if (path.includes('칼선의뢰')) return 'cutting_request';
      if (path.includes('목형의뢰')) return 'mold_request';
      if (path.includes('샘플의뢰')) return '샘플의뢰';
      return null;
    }),
    getStatusForInquiryType: jest.fn(async (type: string | null) => {
      if (type === 'cutting_request') return { status: 'drawing', processStage: 'drawing' };
      if (type === 'mold_request')
        return { status: 'confirmed', processStage: 'drawing_confirmed' };
      if (type === '샘플의뢰') return { status: 'confirmed', processStage: 'sample' };
      return { status: 'received', processStage: null };
    }),
    getFolderStatusMapping: jest.fn(),
    getExcludedFolders: jest.fn(),
    isAutoContactExcluded: jest.fn().mockResolvedValue(false),
  };
}

// FoldersService mock — task 20 phase 3 에서 createNewContact 끝단 훅 추가.
// 기본값: ensureInquiryFolder=null 반환 (폴더 없음, relocate 생략 경로).
// P3-1~P3-5 테스트는 mockResolvedValueOnce 로 개별 override.
function makeFoldersService() {
  return {
    ensureInquiryFolder: jest.fn().mockResolvedValue(null),
    relocateContactFiles: jest.fn().mockResolvedValue({ movedIds: [] }),
  };
}

// task 23: AutoContactService 가 ContactFolderSyncService 를 주입받음.
// mock 의 default impl 이 항상 FoldersService mock 의 ensureInquiryFolder + relocateContactFiles 를
// 호출하도록 한다 — 기존 spec 의 호출 카운트 검증을 보존하기 위함.
// 새 ContactFolderSyncService 의 inquiryType 분기 정책 (미분류 → no-op) 은
// `src/contacts/contact-folder-sync.service.spec.ts` 가 별도로 검증한다.
function makeContactFolderSync(foldersService: ReturnType<typeof makeFoldersService>) {
  return {
    // legacy 호출 형식 (두 인자만) — AutoContactService 는 tx 외부 호출이므로 ctx.client 미지정.
    onContactCreated: jest.fn().mockImplementation(async (ctx: { contactId: string }) => {
      const folder = await foldersService.ensureInquiryFolder(ctx.contactId);
      if (!folder) return;
      await foldersService.relocateContactFiles(ctx.contactId, folder.id);
    }),
    onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
    onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
  };
}

const baseDto: AutoContactFromFileDto = {
  fileName: 'test.dxf',
  fileUrl: 'https://r2.example.com/test.dxf',
  folderId: 'folder-001',
  folderPath: '/원컴퍼니/칼선의뢰',
  companyName: '원컴퍼니',
};

function makeSyncLogService() {
  return {
    createPipelineEvent: jest.fn().mockResolvedValue(undefined),
  };
}

function makeAutoContactServiceWithSyncLog(
  webhardConfigService: ReturnType<typeof makeWebhardConfigService>,
  syncLogService: ReturnType<typeof makeSyncLogService>
) {
  const ServiceCtor = AutoContactService as unknown as new (
    ...args: unknown[]
  ) => AutoContactService;
  return new ServiceCtor(
    makePrisma() as never,
    webhardConfigService as never,
    makeNumberService() as never,
    { recordChange: jest.fn() } as never,
    { createInitialRevision: jest.fn().mockResolvedValue(undefined) } as never,
    { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) } as never,
    makeFoldersService() as never,
    {
      onContactCreated: jest.fn().mockResolvedValue(undefined),
      onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
      onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
    } as never,
    syncLogService as never
  );
}

describe('AutoContactService pipeline backlog', () => {
  it('자동 문의 제외 폴더 skip reason을 구조화된 pipeline event로 남긴다', async () => {
    const webhardConfigService = makeWebhardConfigService();
    webhardConfigService.isAutoContactExcluded.mockResolvedValue(true);
    const syncLogService = makeSyncLogService();
    const service = makeAutoContactServiceWithSyncLog(webhardConfigService, syncLogService);

    const result = await service.detectAndCreate({
      ...baseDto,
      fileName: 'excluded.dxf',
      folderPath: '/원컴퍼니/자동문의제외',
    });

    expect(result).toBeNull();
    expect(syncLogService.createPipelineEvent).toHaveBeenCalledWith({
      filename: 'excluded.dxf',
      companyName: '원컴퍼니',
      stage: 'auto_contact',
      status: 'skipped',
      reasonCode: 'auto_contact_excluded_folder',
      folderId: 'folder-001',
      context: {
        folderPath: '/원컴퍼니/자동문의제외',
      },
    });
  });
});

// ──────────────────────────────────────────────
// 1. classifyByFolderPath — 폴더 경로 기반 분류
// ──────────────────────────────────────────────
describe('AutoContactService.classifyByFolderPath', () => {
  let service: AutoContactService;

  beforeEach(() => {
    const prisma = makePrisma();
    service = new AutoContactService(
      prisma as never,
      makeWebhardConfigService() as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { createInitialRevision: jest.fn().mockResolvedValue(undefined) } as never,
      { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) } as never,
      makeFoldersService() as never,
      {
        onContactCreated: jest.fn().mockResolvedValue(undefined),
        onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
        onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
      } as never
    );
  });

  it('칼선의뢰 경로 또는 이름 → cutting_request', async () => {
    await expect(service.classifyByFolderPath('/원컴퍼니/칼선의뢰')).resolves.toBe(
      'cutting_request'
    );
    await expect(service.classifyByFolderPath('칼선의뢰/파일')).resolves.toBe('cutting_request');
    await expect(service.classifyByFolderPath('/원컴퍼니/칼선의뢰/sub')).resolves.toBe(
      'cutting_request'
    );
    // 폴더 이름만 전달 (path='/'인 경우 folderName으로 폴백)
    await expect(service.classifyByFolderPath('칼선의뢰')).resolves.toBe('cutting_request');
  });

  it('목형의뢰 경로 또는 이름 → mold_request', async () => {
    await expect(service.classifyByFolderPath('/원컴퍼니/목형의뢰')).resolves.toBe('mold_request');
    await expect(service.classifyByFolderPath('목형의뢰/파일')).resolves.toBe('mold_request');
    // 폴더 이름만 전달
    await expect(service.classifyByFolderPath('목형의뢰')).resolves.toBe('mold_request');
  });

  it('루트 또는 미분류 경로 → null', async () => {
    await expect(service.classifyByFolderPath('/원컴퍼니')).resolves.toBeNull();
    await expect(service.classifyByFolderPath('/')).resolves.toBeNull();
    await expect(service.classifyByFolderPath('/대성목형')).resolves.toBeNull();
  });
});

describe('AutoContactService logging', () => {
  function makeServiceForLogging(webhardConfigService = makeWebhardConfigService()) {
    const prisma = makePrisma();
    const service = new AutoContactService(
      prisma as never,
      webhardConfigService as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { createInitialRevision: jest.fn().mockResolvedValue(undefined) } as never,
      { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) } as never,
      makeFoldersService() as never,
      {
        onContactCreated: jest.fn().mockResolvedValue(undefined),
        onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
        onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
      } as never
    );

    return { prisma, service };
  }

  function collectLogText(spy: jest.SpyInstance): string {
    return spy.mock.calls.map(([message]) => String(message)).join('\n');
  }

  it('신규 자동문의 logger에 raw filename, fileUrl, folderPath, companyName을 남기지 않는다', async () => {
    const { prisma, service } = makeServiceForLogging();
    const rawFilename = '민감거래처-도면-raw-name.dxf';
    const rawFileUrl = 'storage://r2/company-7/raw-sensitive-key';
    const rawFolderPath = '/민감거래처/칼선의뢰';
    const rawCompanyName = '민감거래처';
    const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();
    prisma.contact.findFirst.mockResolvedValueOnce(null);
    prisma.contact.create.mockResolvedValueOnce({ id: 'contact-logging-1' });

    await service.detectAndCreate({
      fileName: rawFilename,
      fileUrl: rawFileUrl,
      folderId: 'folder-logging-1',
      folderPath: rawFolderPath,
      companyName: rawCompanyName,
      companyId: '7',
    });

    const logText = collectLogText(logSpy);
    expect(logText).toContain('auto contact detect started');
    expect(logText).toContain('auto contact created');
    expect(logText).toContain('extension=dxf');
    expect(logText).toContain('folderId=folder-logging-1');
    expect(logText).toContain('companyId=7');
    expect(logText).not.toContain(rawFilename);
    expect(logText).not.toContain(rawFileUrl);
    expect(logText).not.toContain(rawFolderPath);
    expect(logText).not.toContain(rawCompanyName);
  });

  it('중복 자동문의 업데이트 logger에 raw filename과 companyName을 남기지 않는다', async () => {
    const { prisma, service } = makeServiceForLogging();
    const rawFilename = '민감거래처-중복-raw-name.dxf';
    const rawCompanyName = '민감거래처';
    const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();
    prisma.contact.findFirst.mockResolvedValueOnce({ id: 'contact-existing-1' });
    prisma.contact.update.mockResolvedValueOnce({ id: 'contact-existing-1' });

    await service.detectAndCreate({
      fileName: rawFilename,
      fileUrl: 'storage://r2/duplicate-sensitive-key',
      folderId: 'folder-duplicate-1',
      folderPath: '/민감거래처/칼선의뢰',
      companyName: rawCompanyName,
      companyId: '7',
    });

    const logText = collectLogText(logSpy);
    expect(logText).toContain('auto contact duplicate detected');
    expect(logText).toContain('Contact updated');
    expect(logText).toContain('extension=dxf');
    expect(logText).not.toContain(rawFilename);
    expect(logText).not.toContain(rawCompanyName);
  });

  it('detectAndCreate 오류 logger에 raw filename을 남기지 않는다', async () => {
    const webhardConfigService = makeWebhardConfigService();
    webhardConfigService.isAutoContactExcluded.mockRejectedValueOnce(new Error('config down'));
    const { service } = makeServiceForLogging(webhardConfigService);
    const rawFilename = '민감거래처-오류-raw-name.dxf';
    const errorSpy = jest.spyOn(service['logger'], 'error').mockImplementation();

    await service.detectAndCreate({
      fileName: rawFilename,
      fileUrl: 'storage://r2/error-sensitive-key',
      folderId: 'folder-error-1',
      folderPath: '/민감거래처/칼선의뢰',
      companyName: '민감거래처',
      companyId: '7',
    });

    const errorText = collectLogText(errorSpy);
    expect(errorText).toContain('AutoContactService.detectAndCreate failed');
    expect(errorText).toContain('extension=dxf');
    expect(errorText).toContain('errorType=Error');
    expect(errorText).toContain('messageHash=');
    expect(errorText).not.toContain(rawFilename);
    expect(errorText).not.toContain('config down');
  });
});

// ──────────────────────────────────────────────
// 2. detectAndCreate — 칼선의뢰 신규 생성
// ──────────────────────────────────────────────
describe('AutoContactService.detectAndCreate — 칼선의뢰 신규 생성', () => {
  let service: AutoContactService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AutoContactService(
      prisma as never,
      makeWebhardConfigService() as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { createInitialRevision: jest.fn().mockResolvedValue(undefined) } as never,
      { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) } as never,
      makeFoldersService() as never,
      {
        onContactCreated: jest.fn().mockResolvedValue(undefined),
        onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
        onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
      } as never
    );
  });

  it('칼선의뢰 폴더 파일 → status=drawing, process_stage=drawing, inquiry_type=cutting_request', async () => {
    // findExistingContact → null (중복 없음)
    prisma.contact.findFirst
      .mockResolvedValueOnce(null) // findExistingContact
      .mockResolvedValueOnce(null); // generateInquiryNumber (no prior)

    // createNewContact → INSERT
    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-100' });

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/원컴퍼니/칼선의뢰',
    });

    expect(result).not.toBeNull();
    expect(result?.action).toBe('created');
    expect(result?.contactId).toBe('uuid-100');

    // create 호출 인자에서 status, processStage, inquiryType 검증
    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.status).toBe('drawing');
    expect(createCall.data.processStage).toBe('drawing');
    expect(createCall.data.inquiryType).toBe('cutting_request');
  });

  it('신규 자동 문의 생성 직후 worker/admin contact:created 이벤트를 발행한다', async () => {
    const contactsGateway = { emitContactCreated: jest.fn() };
    const ServiceCtor = AutoContactService as unknown as new (
      ...args: unknown[]
    ) => AutoContactService;
    service = new ServiceCtor(
      prisma as never,
      makeWebhardConfigService() as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { createInitialRevision: jest.fn().mockResolvedValue(undefined) } as never,
      { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) } as never,
      makeFoldersService() as never,
      {
        onContactCreated: jest.fn().mockResolvedValue(undefined),
        onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
        onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
      } as never,
      undefined,
      contactsGateway as never
    );
    prisma.contact.findFirst.mockResolvedValueOnce(null);
    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-created' });

    await service.detectAndCreate({
      ...baseDto,
      folderPath: '/원컴퍼니/칼선의뢰',
    });

    expect(contactsGateway.emitContactCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'uuid-created',
        company_name: '원컴퍼니',
        source: 'webhard',
        inquiry_type: 'cutting_request',
        process_stage: 'drawing',
      })
    );
  });
});

// ──────────────────────────────────────────────
// 3. detectAndCreate — 목형의뢰 신규 생성
// ──────────────────────────────────────────────
describe('AutoContactService.detectAndCreate — 목형의뢰 신규 생성', () => {
  let service: AutoContactService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AutoContactService(
      prisma as never,
      makeWebhardConfigService() as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { createInitialRevision: jest.fn().mockResolvedValue(undefined) } as never,
      { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) } as never,
      makeFoldersService() as never,
      {
        onContactCreated: jest.fn().mockResolvedValue(undefined),
        onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
        onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
      } as never
    );
  });

  it('목형의뢰 폴더 파일 → status=confirmed, process_stage=drawing_confirmed, inquiry_type=mold_request', async () => {
    prisma.contact.findFirst
      .mockResolvedValueOnce(null) // findExistingContact
      .mockResolvedValueOnce(null); // generateInquiryNumber

    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-200' });

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/대성목형/목형의뢰',
      companyName: '대성목형',
    });

    expect(result?.action).toBe('created');
    expect(result?.contactId).toBe('uuid-200');

    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.status).toBe('confirmed');
    expect(createCall.data.processStage).toBe('drawing_confirmed');
    expect(createCall.data.inquiryType).toBe('mold_request');
  });
});

// ──────────────────────────────────────────────
// 4. detectAndCreate — 미분류 신규 생성
// ──────────────────────────────────────────────
describe('AutoContactService.detectAndCreate — 미분류 (루트 업로드)', () => {
  let service: AutoContactService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AutoContactService(
      prisma as never,
      makeWebhardConfigService() as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { createInitialRevision: jest.fn().mockResolvedValue(undefined) } as never,
      { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) } as never,
      makeFoldersService() as never,
      {
        onContactCreated: jest.fn().mockResolvedValue(undefined),
        onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
        onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
      } as never
    );
  });

  it('루트 경로 파일 → status=received, process_stage=null, inquiry_type=null', async () => {
    prisma.contact.findFirst
      .mockResolvedValueOnce(null) // findExistingContact
      .mockResolvedValueOnce(null); // generateInquiryNumber

    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-300' });
    // 미분류 경로: new_contact + webhard_classify_failed 두 건이 생성됨 (phase 6)
    prisma.notification.create.mockResolvedValue({});

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/삼화포장',
      companyName: '삼화포장',
    });

    expect(result?.action).toBe('created');
    expect(result?.contactId).toBe('uuid-300');

    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.status).toBe('received');
    expect(createCall.data.processStage).toBeNull();
    expect(createCall.data.inquiryType).toBeNull();

    // 미분류이므로 notification.create 2회: new_contact + webhard_classify_failed
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    const types = prisma.notification.create.mock.calls.map(
      (args) => (args[0] as { data: { type: string } }).data.type
    );
    expect(types).toContain('new_contact');
    expect(types).toContain('webhard_classify_failed');
  });

  it('미분류 → webhard_classify_failed Notification 에 folderPath/fileName 포함 (phase 6)', async () => {
    prisma.contact.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-301' });
    prisma.notification.create.mockResolvedValue({});

    await service.detectAndCreate({
      ...baseDto,
      folderPath: '/삼화포장',
      fileName: 'mystery.dxf',
      companyName: '삼화포장',
    });

    const failedCall = prisma.notification.create.mock.calls.find(
      (args) => (args[0] as { data: { type: string } }).data.type === 'webhard_classify_failed'
    );
    expect(failedCall).toBeDefined();
    const data = (failedCall![0] as { data: Record<string, unknown> }).data;
    expect(data.userType).toBe('admin');
    expect(data.title).toBe('웹하드 파일 미분류');
    const metadata = data.metadata as { folderPath: string; fileName: string; contactId: string };
    expect(metadata.folderPath).toBe('/삼화포장');
    expect(metadata.fileName).toBe('mystery.dxf');
    expect(metadata.contactId).toBe('uuid-301');
  });

  it('같은 folderPath의 classify_failed 알림이 1시간 안에 이미 있으면 중복 생성하지 않음', async () => {
    const baseTime = new Date('2026-05-13T11:00:00.000Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(baseTime);
    prisma.contact.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-301b' });
    prisma.notification.findFirst.mockResolvedValueOnce({ id: 'notification-existing' });
    prisma.notification.create.mockResolvedValue({});

    await service.detectAndCreate({
      ...baseDto,
      folderPath: '/삼화포장',
      fileName: 'mystery-2.dxf',
      companyName: '삼화포장',
    });

    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: {
        userType: 'admin',
        type: 'webhard_classify_failed',
        createdAt: { gte: new Date(baseTime - 60 * 60 * 1000) },
        metadata: {
          path: ['folderPath'],
          equals: '/삼화포장',
        },
      },
      select: { id: true },
    });
    const types = prisma.notification.create.mock.calls.map(
      (args) => (args[0] as { data: { type: string } }).data.type
    );
    expect(types).toEqual(['new_contact']);
  });

  it('분류 성공(/칼선의뢰) → webhard_classify_failed Notification 생성 안 됨', async () => {
    prisma.contact.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-302' });

    await service.detectAndCreate({
      ...baseDto,
      folderPath: '/원컴퍼니/칼선의뢰',
      companyName: '원컴퍼니',
    });

    const failedCalls = prisma.notification.create.mock.calls.filter(
      (args) => (args[0] as { data: { type: string } }).data.type === 'webhard_classify_failed'
    );
    expect(failedCalls).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// 5. detectAndCreate — 중복 파일 업데이트 처리
// ──────────────────────────────────────────────
describe('AutoContactService.detectAndCreate — 중복 파일 업데이트', () => {
  let service: AutoContactService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AutoContactService(
      prisma as never,
      makeWebhardConfigService() as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { createInitialRevision: jest.fn().mockResolvedValue(undefined) } as never,
      { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) } as never,
      makeFoldersService() as never,
      {
        onContactCreated: jest.fn().mockResolvedValue(undefined),
        onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
        onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
      } as never
    );
  });

  it('동일 company_name + filename 중복 → action=updated, create 호출 없음', async () => {
    // 기존 contact 존재
    prisma.contact.findFirst.mockResolvedValueOnce({ id: 'uuid-99' });
    prisma.contact.update.mockResolvedValueOnce({});

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/원컴퍼니/칼선의뢰',
    });

    expect(result?.action).toBe('updated');
    expect(result?.contactId).toBe('uuid-99');

    // create 호출 없어야 함
    expect(prisma.contact.create).not.toHaveBeenCalled();

    // update 호출 확인
    expect(prisma.contact.update).toHaveBeenCalledTimes(1);
    const updateCall = prisma.contact.update.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateCall.where.id).toBe('uuid-99');
    expect(updateCall.data.drawingFileUrl).toBe(baseDto.fileUrl);
    expect(updateCall.data.drawingFileName).toBe(baseDto.fileName);
  });

  it('중복 파일 업데이트 시 inquiryNumber는 빈 문자열', async () => {
    prisma.contact.findFirst.mockResolvedValueOnce({ id: 'uuid-55' });
    prisma.contact.update.mockResolvedValueOnce({});

    const result = await service.detectAndCreate(baseDto);
    expect(result?.inquiryNumber).toBe('');
  });
});

// ──────────────────────────────────────────────
// 6. classifyContact — 미분류 → 유형 지정 시 status 자동 변경
// ──────────────────────────────────────────────
describe('AutoContactService.classifyContact — 미분류 → 유형 지정', () => {
  let service: AutoContactService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AutoContactService(
      prisma as never,
      makeWebhardConfigService() as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { createInitialRevision: jest.fn().mockResolvedValue(undefined) } as never,
      { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) } as never,
      makeFoldersService() as never,
      {
        onContactCreated: jest.fn().mockResolvedValue(undefined),
        onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
        onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
      } as never
    );
  });

  it('cutting_request 지정 → status=drawing, process_stage=drawing', async () => {
    prisma.contact.update.mockResolvedValueOnce({});

    await service.classifyContact('uuid-101', 'cutting_request');

    const updateCall = prisma.contact.update.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateCall.data.inquiryType).toBe('cutting_request');
    expect(updateCall.data.status).toBe('drawing');
    expect(updateCall.data.processStage).toBe('drawing');
    expect(updateCall.where.id).toBe('uuid-101');
  });

  it('mold_request 지정 → status=confirmed, process_stage=drawing_confirmed', async () => {
    prisma.contact.update.mockResolvedValueOnce({});

    await service.classifyContact('uuid-202', 'mold_request');

    const updateCall = prisma.contact.update.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateCall.data.inquiryType).toBe('mold_request');
    expect(updateCall.data.status).toBe('confirmed');
    expect(updateCall.data.processStage).toBe('drawing_confirmed');
    expect(updateCall.where.id).toBe('uuid-202');
  });
});

// ──────────────────────────────────────────────
// 7. generateInquiryNumber — 의뢰번호 형식 검증
// ──────────────────────────────────────────────
describe('AutoContactService — 의뢰번호 생성 형식', () => {
  let service: AutoContactService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AutoContactService(
      prisma as never,
      makeWebhardConfigService() as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { createInitialRevision: jest.fn().mockResolvedValue(undefined) } as never,
      { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) } as never,
      makeFoldersService() as never,
      {
        onContactCreated: jest.fn().mockResolvedValue(undefined),
        onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
        onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
      } as never
    );
  });

  it('cutting_request → YYMMDD-O-NNN 포맷의 inquiryNumber 반환', async () => {
    prisma.contact.findFirst.mockResolvedValueOnce(null); // findExistingContact
    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-400' });

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/원컴퍼니/칼선의뢰',
    });

    // 번호 생성은 NumberService 가 담당. 여기서는 AutoContactService 가 해당 포맷을 그대로 전달하는지만 검증.
    expect(result?.inquiryNumber).toMatch(/^\d{6}-O-\d{3}$/);
  });

  it('NumberService.generateNumber(inquiry) 반환값을 그대로 inquiryNumber 로 전달', async () => {
    // 순번 증가 로직은 NumberService 의 책임. AutoContactService 는 delegation 만 담당.
    prisma.contact.findFirst.mockResolvedValueOnce(null); // findExistingContact
    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-500' });

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/원컴퍼니/칼선의뢰',
    });

    // makeNumberService mock: inquiry 첫 호출 → `${today}-O-001`
    const today = new Date();
    const yy = String(today.getFullYear()).slice(2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    expect(result?.inquiryNumber).toBe(`${yy}${mm}${dd}-O-001`);
  });
});

// ──────────────────────────────────────────────
// 8. processStageToContactStatus — ERP status 보존 가드
// ──────────────────────────────────────────────
describe('processStageToContactStatus — ERP status 보존 가드', () => {
  it('drawing 상태 → 레거시 덮어쓰기 금지 (drawing 유지)', () => {
    // 스펙: drawing/confirmed는 AutoContactService가 관리 — 덮어쓰기 금지
    expect(processStageToContactStatus('laser', 'drawing')).toBe('drawing');
    expect(processStageToContactStatus('cutting', 'drawing')).toBe('drawing');
    expect(processStageToContactStatus(null, 'drawing')).toBe('drawing');
    expect(processStageToContactStatus('drawing', 'drawing')).toBe('drawing');
  });

  it('confirmed 상태 → 레거시 덮어쓰기 금지 (confirmed 유지)', () => {
    expect(processStageToContactStatus('laser', 'confirmed')).toBe('confirmed');
    expect(processStageToContactStatus('drawing_confirmed', 'confirmed')).toBe('confirmed');
    expect(processStageToContactStatus(null, 'confirmed')).toBe('confirmed');
  });

  it('일반 상태 → 기존 로직 정상 동작', () => {
    expect(processStageToContactStatus('delivery', 'in_progress')).toBe('completed');
    expect(processStageToContactStatus('laser', 'received')).toBe('in_progress');
    expect(processStageToContactStatus(null, 'received')).toBe('received');
  });
});

// ──────────────────────────────────────────────
// 9. orderStatusToProcessStage — ERP 8단계 매핑 검증
// ──────────────────────────────────────────────
describe('orderStatusToProcessStage — ERP 8단계 상태 매핑', () => {
  it('drawing 관련 order 상태 → drawing processStage', () => {
    expect(orderStatusToProcessStage('drawing_received')).toBe('drawing');
    expect(orderStatusToProcessStage('drawing_review')).toBe('drawing');
  });

  it('nesting/cutting 관련 → laser', () => {
    expect(orderStatusToProcessStage('nesting_queued')).toBe('laser');
    expect(orderStatusToProcessStage('cutting_ready')).toBe('laser');
    expect(orderStatusToProcessStage('cutting_in_progress')).toBe('laser');
  });

  it('delivered → delivery', () => {
    expect(orderStatusToProcessStage('delivered')).toBe('delivery');
  });

  it('알 수 없는 상태 → null', () => {
    expect(orderStatusToProcessStage('unknown_status')).toBeNull();
  });
});

// ──────────────────────────────────────────────
// 10. getUnclassifiedCount — 미분류 수 조회
// ──────────────────────────────────────────────
describe('AutoContactService.getUnclassifiedCount', () => {
  let service: AutoContactService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AutoContactService(
      prisma as never,
      makeWebhardConfigService() as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { createInitialRevision: jest.fn().mockResolvedValue(undefined) } as never,
      { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) } as never,
      makeFoldersService() as never,
      {
        onContactCreated: jest.fn().mockResolvedValue(undefined),
        onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
        onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
      } as never
    );
  });

  it('미분류 3개 → 3 반환', async () => {
    prisma.contact.count.mockResolvedValueOnce(3);
    const count = await service.getUnclassifiedCount();
    expect(count).toBe(3);
  });

  it('결과 없을 때 → 0 반환', async () => {
    prisma.contact.count.mockResolvedValueOnce(0);
    const count = await service.getUnclassifiedCount();
    expect(count).toBe(0);
  });
});

// ──────────────────────────────────────────────
// 11. detectAndCreate — DB 오류 시 null 반환 (graceful degradation)
// ──────────────────────────────────────────────
describe('AutoContactService.detectAndCreate — 오류 처리', () => {
  let service: AutoContactService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AutoContactService(
      prisma as never,
      makeWebhardConfigService() as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { createInitialRevision: jest.fn().mockResolvedValue(undefined) } as never,
      { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) } as never,
      makeFoldersService() as never,
      {
        onContactCreated: jest.fn().mockResolvedValue(undefined),
        onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
        onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
      } as never
    );
  });

  it('DB 오류 발생 시 null 반환 (파일 업로드 흐름 방해하지 않음)', async () => {
    prisma.contact.findFirst.mockRejectedValueOnce(new Error('DB connection error'));

    const result = await service.detectAndCreate(baseDto);
    expect(result).toBeNull();
  });
});

// ──────────────────────────────────────────────
// 12. laserOnly 업체 — 일반 폴더 → laser_cutting 자동 분류
// ──────────────────────────────────────────────
describe('AutoContactService.detectAndCreate — laserOnly 업체 (일반 폴더)', () => {
  let service: AutoContactService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AutoContactService(
      prisma as never,
      makeWebhardConfigService() as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { createInitialRevision: jest.fn().mockResolvedValue(undefined) } as never,
      { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) } as never,
      makeFoldersService() as never,
      {
        onContactCreated: jest.fn().mockResolvedValue(undefined),
        onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
        onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
      } as never
    );
  });

  it('laserOnly=true + 미분류 폴더 → inquiryType=laser_cutting, status=cutting, processStage=laser', async () => {
    prisma.contact.findFirst.mockResolvedValueOnce(null); // findExistingContact
    prisma.company.findFirst.mockResolvedValueOnce({
      managerName: '김담당',
      managerPhone: '010-1234-5678',
      managerEmail: 'kim@example.com',
      laserOnly: true,
    });
    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-laser-1' });

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/레이저전용업체',
      companyName: '레이저전용업체',
    });

    expect(result).not.toBeNull();
    expect(result?.action).toBe('created');
    expect(result?.contactId).toBe('uuid-laser-1');
    // laser_cutting은 현장 직행 → inquiryNumber null
    expect(result?.inquiryNumber).toBeNull();

    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.inquiryType).toBe('laser_cutting');
    expect(createCall.data.status).toBe('cutting');
    expect(createCall.data.processStage).toBe('laser');
    expect(createCall.data.workNumber).toBeDefined();
    expect(createCall.data.productionStartedAt).toBeDefined();
  });

  it('laserOnly=true + 칼선의뢰 폴더 → laser_cutting으로 오버라이드 (비샘플이므로)', async () => {
    prisma.contact.findFirst.mockResolvedValueOnce(null);
    prisma.company.findFirst.mockResolvedValueOnce({
      managerName: null,
      managerPhone: null,
      managerEmail: null,
      laserOnly: true,
    });
    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-laser-2' });

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/레이저전용업체/칼선의뢰',
      companyName: '레이저전용업체',
    });

    expect(result?.action).toBe('created');

    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.inquiryType).toBe('laser_cutting');
    expect(createCall.data.status).toBe('cutting');
    expect(createCall.data.processStage).toBe('laser');
  });
});

// ──────────────────────────────────────────────
// 13. laserOnly 업체 — 샘플의뢰 폴더 → 기존 샘플 로직 유지
// ──────────────────────────────────────────────
describe('AutoContactService.detectAndCreate — laserOnly 업체 (샘플의뢰 폴더)', () => {
  let service: AutoContactService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AutoContactService(
      prisma as never,
      makeWebhardConfigService() as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { createInitialRevision: jest.fn().mockResolvedValue(undefined) } as never,
      { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) } as never,
      makeFoldersService() as never,
      {
        onContactCreated: jest.fn().mockResolvedValue(undefined),
        onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
        onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
      } as never
    );
  });

  it('laserOnly=true + 샘플의뢰 폴더 → 기존 샘플 로직 유지 (status=confirmed, processStage=sample)', async () => {
    prisma.contact.findFirst.mockResolvedValueOnce(null); // findExistingContact
    prisma.company.findFirst.mockResolvedValueOnce({
      managerName: '박담당',
      managerPhone: '010-9999-8888',
      managerEmail: 'park@example.com',
      laserOnly: true,
    });
    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-laser-sample' });

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/레이저전용업체/샘플의뢰',
      companyName: '레이저전용업체',
    });

    expect(result?.action).toBe('created');
    // 샘플은 inquiryNumber 부여 (현장 직행 아님)
    expect(result?.inquiryNumber).toBeDefined();

    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.inquiryType).toBe('샘플의뢰');
    expect(createCall.data.status).toBe('confirmed');
    expect(createCall.data.processStage).toBe('sample');
  });
});

// ──────────────────────────────────────────────
// 14. laserOnly=false 업체 — 기존 로직 유지 (회귀 테스트)
// ──────────────────────────────────────────────
describe('AutoContactService.detectAndCreate — laserOnly=false (회귀 테스트)', () => {
  let service: AutoContactService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AutoContactService(
      prisma as never,
      makeWebhardConfigService() as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { createInitialRevision: jest.fn().mockResolvedValue(undefined) } as never,
      { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) } as never,
      makeFoldersService() as never,
      {
        onContactCreated: jest.fn().mockResolvedValue(undefined),
        onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
        onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
      } as never
    );
  });

  it('laserOnly=false 업체 + 칼선의뢰 → 기존 cutting_request 로직', async () => {
    prisma.contact.findFirst.mockResolvedValueOnce(null);
    prisma.company.findFirst.mockResolvedValueOnce({
      managerName: '이담당',
      managerPhone: '010-1111-2222',
      managerEmail: 'lee@example.com',
      laserOnly: false,
    });
    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-normal-1' });

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/일반업체/칼선의뢰',
      companyName: '일반업체',
    });

    expect(result?.action).toBe('created');

    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.inquiryType).toBe('cutting_request');
    expect(createCall.data.status).toBe('drawing');
    expect(createCall.data.processStage).toBe('drawing');
  });

  it('미등록 업체 (matchCompanyInfo null) → laserOnly=false로 간주, 기존 로직 유지', async () => {
    prisma.contact.findFirst.mockResolvedValueOnce(null);
    prisma.company.findFirst.mockResolvedValueOnce(null); // 미등록 업체
    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-unknown-1' });
    prisma.notification.create.mockResolvedValueOnce({});

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/미등록업체',
      companyName: '미등록업체',
    });

    expect(result?.action).toBe('created');

    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    // 미등록 + 미분류 → received/null
    expect(createCall.data.inquiryType).toBeNull();
    expect(createCall.data.status).toBe('received');
    expect(createCall.data.processStage).toBeNull();
  });
});

// ──────────────────────────────────────────────
// 15. detectAndCreate — 문의 자동생성 제외 폴더 (skip)
// ──────────────────────────────────────────────
describe('AutoContactService.detectAndCreate — 자동생성 제외 폴더', () => {
  let service: AutoContactService;
  let prisma: ReturnType<typeof makePrisma>;
  let webhardConfig: ReturnType<typeof makeWebhardConfigService>;

  beforeEach(() => {
    prisma = makePrisma();
    webhardConfig = makeWebhardConfigService();
    service = new AutoContactService(
      prisma as never,
      webhardConfig as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { createInitialRevision: jest.fn().mockResolvedValue(undefined) } as never,
      { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) } as never,
      makeFoldersService() as never,
      {
        onContactCreated: jest.fn().mockResolvedValue(undefined),
        onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
        onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
      } as never
    );
  });

  it('제외 폴더 경로 → null 반환, DB 접근 없음', async () => {
    webhardConfig.isAutoContactExcluded.mockResolvedValueOnce(true);

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/업체A/ㄱ 내리기전용/하위폴더',
    });

    expect(result).toBeNull();
    // DB 접근이 전혀 없어야 함
    expect(prisma.contact.findFirst).not.toHaveBeenCalled();
    expect(prisma.contact.create).not.toHaveBeenCalled();
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it('비제외 폴더 경로 → 정상 생성 (제외 체크 통과)', async () => {
    webhardConfig.isAutoContactExcluded.mockResolvedValueOnce(false);
    prisma.contact.findFirst.mockResolvedValueOnce(null);
    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-normal' });

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/업체A/칼선의뢰',
    });

    expect(result).not.toBeNull();
    expect(result?.action).toBe('created');
    expect(webhardConfig.isAutoContactExcluded).toHaveBeenCalledWith('/업체A/칼선의뢰');
  });
});

// ──────────────────────────────────────────────
// 16. LaserOnlyMapping 기반 laser_cutting
// ──────────────────────────────────────────────
describe('AutoContactService.detectAndCreate — LaserOnlyMapping', () => {
  let service: AutoContactService;
  let prisma: ReturnType<typeof makePrisma>;
  let laserOnlyMappingService: { isLaserOnlyFolder: jest.Mock };

  beforeEach(() => {
    prisma = makePrisma();
    laserOnlyMappingService = { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) };
    service = new AutoContactService(
      prisma as never,
      makeWebhardConfigService() as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { createInitialRevision: jest.fn().mockResolvedValue(undefined) } as never,
      laserOnlyMappingService as never,
      makeFoldersService() as never,
      {
        onContactCreated: jest.fn().mockResolvedValue(undefined),
        onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
        onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
      } as never
    );
  });

  it('LaserOnlyMapping 존재 + Company 미등록 → laser_cutting 생성', async () => {
    laserOnlyMappingService.isLaserOnlyFolder.mockResolvedValueOnce(true);
    prisma.contact.findFirst.mockResolvedValueOnce(null);
    prisma.company.findFirst.mockResolvedValueOnce(null); // 미등록 업체
    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-mapped-1' });
    prisma.notification.create.mockResolvedValueOnce({});

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/매핑업체',
      companyName: '매핑업체',
    });

    expect(result?.action).toBe('created');

    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.inquiryType).toBe('laser_cutting');
    expect(createCall.data.status).toBe('cutting');
    expect(createCall.data.processStage).toBe('laser');
    expect(createCall.data.workNumber).toBeDefined();
  });

  it('LaserOnlyMapping 미존재 + Company.laserOnly=true → 하위호환 laser_cutting', async () => {
    laserOnlyMappingService.isLaserOnlyFolder.mockResolvedValueOnce(false);
    prisma.contact.findFirst.mockResolvedValueOnce(null);
    prisma.company.findFirst.mockResolvedValueOnce({
      managerName: '김담당',
      managerPhone: '010-1234-5678',
      managerEmail: 'kim@example.com',
      laserOnly: true,
    });
    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-compat-1' });

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/레이저전용업체',
      companyName: '레이저전용업체',
    });

    expect(result?.action).toBe('created');

    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.inquiryType).toBe('laser_cutting');
    expect(createCall.data.status).toBe('cutting');
    expect(createCall.data.processStage).toBe('laser');
  });

  it('LaserOnlyMapping 존재 + 샘플 폴더 → 샘플 로직 우선', async () => {
    laserOnlyMappingService.isLaserOnlyFolder.mockResolvedValueOnce(true);
    prisma.contact.findFirst.mockResolvedValueOnce(null);
    prisma.company.findFirst.mockResolvedValueOnce(null);
    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-sample-mapped' });
    prisma.notification.create.mockResolvedValueOnce({});

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/매핑업체/샘플의뢰',
      companyName: '매핑업체',
    });

    expect(result?.action).toBe('created');

    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    // 샘플 로직이 우선 → laser_cutting이 아님
    expect(createCall.data.inquiryType).toBe('샘플의뢰');
    expect(createCall.data.status).toBe('confirmed');
    expect(createCall.data.processStage).toBe('sample');
  });
});

// ──────────────────────────────────────────────
// T1~T4: 트랜잭션 보장 (tasks/14-timeline-reliability Phase 2)
//
// 스펙: docs/specs/features/drawing-workflow.md "타임라인 신뢰성 보장 > 트랜잭션 보장"
//       Contact 생성 + recordChange(created) + createInitialRevision을
//       단일 prisma.$transaction으로 원자화. 내부 throw 시 전체 롤백.
// ──────────────────────────────────────────────

function buildTxService(
  overrides: {
    recordChange?: jest.Mock;
    createInitialRevision?: jest.Mock;
    foldersService?: ReturnType<typeof makeFoldersService>;
  } = {}
) {
  const prisma = makePrisma();
  const timeline = {
    recordChange: overrides.recordChange ?? jest.fn().mockResolvedValue({ id: 'status-entry' }),
  };
  const drawingRevision = {
    createInitialRevision:
      overrides.createInitialRevision ?? jest.fn().mockResolvedValue(undefined),
  };
  const foldersService = overrides.foldersService ?? makeFoldersService();
  const contactFolderSync = makeContactFolderSync(foldersService);

  const service = new AutoContactService(
    prisma as never,
    makeWebhardConfigService() as never,
    makeNumberService() as never,
    timeline as never,
    drawingRevision as never,
    { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) } as never,
    foldersService as never,
    contactFolderSync as never
  );

  return { service, prisma, timeline, drawingRevision, foldersService, contactFolderSync };
}

describe('AutoContactService.createNewContact — 트랜잭션 보장', () => {
  const txDto: AutoContactFromFileDto = {
    fileName: 'drawing.dxf',
    fileUrl: 'https://cdn.example.com/drawings/drawing.dxf',
    folderId: 'folder-tx',
    folderPath: '/업체A/칼선의뢰',
    companyName: '업체A',
  };

  it('T1: 성공 시 tx.contact.create + recordChange(created, tx) + createInitialRevision(tx) 3건 모두 호출', async () => {
    const { service, prisma, timeline, drawingRevision } = buildTxService();
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'tx1-contact' });

    const result = await service.detectAndCreate(txDto);

    expect(result?.action).toBe('created');
    expect(result?.contactId).toBe('tx1-contact');

    // 1) contact.create: $transaction 콜백 안에서 tx(=prisma)에 호출
    expect(prisma.contact.create).toHaveBeenCalledTimes(1);

    // 2) recordChange: changeType='created' + tx 인자 전파
    expect(timeline.recordChange).toHaveBeenCalledTimes(1);
    const recordArg = timeline.recordChange.mock.calls[0][0] as {
      changeType: string;
      contactId: string;
      actorType: string;
      source: string;
      tx?: unknown;
    };
    expect(recordArg.changeType).toBe('created');
    expect(recordArg.contactId).toBe('tx1-contact');
    expect(recordArg.actorType).toBe('system');
    expect(recordArg.source).toBe('webhard_auto');
    expect(recordArg.tx).toBeDefined();

    // 3) createInitialRevision: 4번째 인자로 tx 전파
    expect(drawingRevision.createInitialRevision).toHaveBeenCalledTimes(1);
    const initArgs = drawingRevision.createInitialRevision.mock.calls[0];
    expect(initArgs[0]).toBe('tx1-contact');
    expect(initArgs[1]).toBe(txDto.fileUrl);
    expect(initArgs[2]).toBe(txDto.fileName);
    expect(initArgs[3]).toBeDefined();
  });

  it('T2: recordChange throw → detectAndCreate null (트랜잭션 에러 전파), createInitialRevision 미호출', async () => {
    const { service, prisma, drawingRevision } = buildTxService({
      recordChange: jest.fn().mockRejectedValue(new Error('timeline insert failed')),
    });
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'tx2-contact' });

    const result = await service.detectAndCreate(txDto);

    // 트랜잭션 내부 throw → $transaction 에러 전파 → detectAndCreate try/catch → null
    expect(result).toBeNull();
    // recordChange 실패 후 createInitialRevision은 호출되지 않아야 함
    expect(drawingRevision.createInitialRevision).not.toHaveBeenCalled();
  });

  it('T3: createInitialRevision throw → detectAndCreate null (전체 롤백 경로), recordChange는 호출됨', async () => {
    const { service, prisma, timeline } = buildTxService({
      createInitialRevision: jest.fn().mockRejectedValue(new Error('revision insert failed')),
    });
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'tx3-contact' });

    const result = await service.detectAndCreate(txDto);

    expect(result).toBeNull();
    // recordChange는 createInitialRevision 실패 전에 호출됨
    expect(timeline.recordChange).toHaveBeenCalledTimes(1);
  });

  it('T4: drawingFileUrl 없으면 createInitialRevision 미호출, recordChange만 1건', async () => {
    const { service, prisma, timeline, drawingRevision } = buildTxService();
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'tx4-contact' });

    const result = await service.detectAndCreate({
      ...txDto,
      fileUrl: '',
    });

    expect(result?.action).toBe('created');
    expect(timeline.recordChange).toHaveBeenCalledTimes(1);
    expect(drawingRevision.createInitialRevision).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────
// P3-1 ~ P3-5: task 20 phase 3 — auto-contact-path
//
// 스펙: docs/specs/features/drawing-workflow.md §W.1 경로 2,3 (웹하드 감지)
//       분류 확정 시 createNewContact 끝단에서 ensureInquiryFolder + relocateContactFiles
//       가 자동 실행되어 파일이 번호 전용 문의 폴더로 이동한다. 미분류는 원위치 유지.
// ──────────────────────────────────────────────

describe('AutoContactService.createNewContact — 분류 확정 시 폴더·파일 정착 (task 20 phase 3)', () => {
  const baseTxDto: AutoContactFromFileDto = {
    fileName: 'drawing.dxf',
    fileUrl: 'https://cdn.example.com/drawings/drawing.dxf',
    folderId: 'folder-tx',
    folderPath: '/업체A/칼선의뢰',
    companyName: '업체A',
  };

  it('P3-1: 칼선의뢰 경로 → ensureInquiryFolder + relocateContactFiles 1 회씩 호출', async () => {
    const foldersService = makeFoldersService();
    foldersService.ensureInquiryFolder.mockResolvedValueOnce({
      id: 'folder-inquiry-1',
      name: '260422-O-001',
    });

    const { service, prisma } = buildTxService({ foldersService });
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'contact-cutting' });

    const result = await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/업체A/칼선의뢰',
    });

    expect(result?.action).toBe('created');
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledWith('contact-cutting');
    expect(foldersService.relocateContactFiles).toHaveBeenCalledTimes(1);
    expect(foldersService.relocateContactFiles).toHaveBeenCalledWith(
      'contact-cutting',
      'folder-inquiry-1'
    );
  });

  it('P3-2: 목형의뢰 경로 → ensureInquiryFolder + relocateContactFiles 1 회씩 호출', async () => {
    const foldersService = makeFoldersService();
    foldersService.ensureInquiryFolder.mockResolvedValueOnce({
      id: 'folder-inquiry-2',
      name: '260422-F-001',
    });

    const { service, prisma } = buildTxService({ foldersService });
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'contact-mold' });

    const result = await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/대성목형/목형의뢰',
      companyName: '대성목형',
    });

    expect(result?.action).toBe('created');
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledWith('contact-mold');
    expect(foldersService.relocateContactFiles).toHaveBeenCalledTimes(1);
    expect(foldersService.relocateContactFiles).toHaveBeenCalledWith(
      'contact-mold',
      'folder-inquiry-2'
    );
  });

  it('P3-3: 미분류 경로 (inquiryType=null) → ensureInquiryFolder 는 호출되나 relocateContactFiles 는 미호출 (task 21: O 번호 기반 폴더 시도, 파일은 원위치 유지)', async () => {
    // task 21 phase 3: 미분류 상태에서도 ensureInquiryFolder 는 항상 호출 —
    // inquiryNumber 가 있으면 `{O}` 폴더 생성, 없으면 FoldersService 내부에서 NO_INQUIRY_NUMBER
    // reason_code 로그 + null 반환. mock 기본값은 null 반환 (makeFoldersService).
    // 단 relocateContactFiles 는 finalInquiryType 확정 시에만 호출 — 미분류 파일을 엉뚱한 폴더로 이동 방지.
    const foldersService = makeFoldersService();

    const { service, prisma } = buildTxService({ foldersService });
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'contact-unclassified' });
    prisma.notification.create.mockResolvedValue({});

    const result = await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/업체A', // 루트 (분류 실패)
    });

    expect(result?.action).toBe('created');
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledWith('contact-unclassified');
    expect(foldersService.relocateContactFiles).not.toHaveBeenCalled();
  });

  it('P3-4: ensureInquiryFolder 가 null 반환 (이미 동일 Contact 폴더 탐색 실패) → relocate 생략, Contact 생성은 성공 유지', async () => {
    // ensureInquiryFolder 는 멱등 설계 (이미 존재하면 findFirst hit, 없으면 create).
    // 여기서는 null 반환(예: company 미존재, inquiryNumber/workNumber 둘 다 없음 등) 케이스에서
    // relocate 가 생략되는지 확인. 실제 멱등 경로 (findFirst hit) 는 folders.service.spec P1-2 에서 검증.
    const foldersService = makeFoldersService();
    foldersService.ensureInquiryFolder.mockResolvedValueOnce(null);

    const { service, prisma } = buildTxService({ foldersService });
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'contact-no-folder' });

    const result = await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/업체A/칼선의뢰',
    });

    expect(result?.action).toBe('created');
    expect(result?.contactId).toBe('contact-no-folder');
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(foldersService.relocateContactFiles).not.toHaveBeenCalled();
  });

  it('P3-5 (통합): 배치 5 개 (분류 3 + 미분류 2) → ensureInquiryFolder 5 회 (task 21: 미분류도 시도), relocate 3 회 (분류 확정만). batchTriggerAutoContact 도 동일 detectAndCreate → createNewContact 경로를 탄다 (files.service.ts:1266 → auto-contact.service.ts:createNewContact).', async () => {
    const foldersService = makeFoldersService();
    // 3 개 분류 성공 → 각각 다른 folderId 반환. 나머지 2 건 (미분류) 은 기본값(null) 반환 유지.
    foldersService.ensureInquiryFolder
      .mockResolvedValueOnce({ id: 'folder-batch-1' })
      .mockResolvedValueOnce({ id: 'folder-batch-2' })
      .mockResolvedValueOnce(null) // 미분류 contact-b3: NO_INQUIRY_NUMBER → null
      .mockResolvedValueOnce({ id: 'folder-batch-3' })
      .mockResolvedValueOnce(null); // 미분류 contact-b5: NO_INQUIRY_NUMBER → null

    const { service, prisma } = buildTxService({ foldersService });
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create
      .mockResolvedValueOnce({ id: 'contact-b1' })
      .mockResolvedValueOnce({ id: 'contact-b2' })
      .mockResolvedValueOnce({ id: 'contact-b3' })
      .mockResolvedValueOnce({ id: 'contact-b4' })
      .mockResolvedValueOnce({ id: 'contact-b5' });
    prisma.notification.create.mockResolvedValue({});

    const items = [
      { folderPath: '/업체A/칼선의뢰', fileName: 'a1.dxf' }, // 분류 성공
      { folderPath: '/업체A/목형의뢰', fileName: 'a2.dxf' }, // 분류 성공
      { folderPath: '/업체A', fileName: 'a3.dxf' }, //           미분류
      { folderPath: '/업체A/칼선의뢰', fileName: 'a4.dxf' }, // 분류 성공
      { folderPath: '/업체A', fileName: 'a5.dxf' }, //           미분류
    ];

    for (const item of items) {
      await service.detectAndCreate({
        ...baseTxDto,
        folderPath: item.folderPath,
        fileName: item.fileName,
      });
    }

    // task 21: ensureInquiryFolder 는 5 건 모두에 대해 호출됨 (미분류 포함).
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledTimes(5);
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledWith('contact-b1');
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledWith('contact-b2');
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledWith('contact-b3');
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledWith('contact-b4');
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledWith('contact-b5');
    // relocate 는 finalInquiryType 확정 + folder truthy 일 때만 — 분류 3 건.
    expect(foldersService.relocateContactFiles).toHaveBeenCalledTimes(3);
    expect(foldersService.relocateContactFiles).toHaveBeenCalledWith(
      'contact-b1',
      'folder-batch-1'
    );
    expect(foldersService.relocateContactFiles).toHaveBeenCalledWith(
      'contact-b2',
      'folder-batch-2'
    );
    expect(foldersService.relocateContactFiles).toHaveBeenCalledWith(
      'contact-b4',
      'folder-batch-3'
    );
    // 미분류(b3, b5) 는 relocate 되지 않아야 함 — 파일은 원위치 유지.
    expect(foldersService.relocateContactFiles).not.toHaveBeenCalledWith(
      'contact-b3',
      expect.anything()
    );
    expect(foldersService.relocateContactFiles).not.toHaveBeenCalledWith(
      'contact-b5',
      expect.anything()
    );
  });

  it('ensureInquiryFolder throw → Contact 는 성공 유지 (best-effort, LGU+ 배치 처리 중 개별 실패 허용)', async () => {
    const foldersService = makeFoldersService();
    foldersService.ensureInquiryFolder.mockRejectedValueOnce(new Error('folder race'));

    const { service, prisma } = buildTxService({ foldersService });
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'contact-best-effort' });

    const result = await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/업체A/칼선의뢰',
    });

    // Contact 는 생성 성공 — try/catch+warn 으로 감싸 오류 전파 안 됨
    expect(result?.action).toBe('created');
    expect(result?.contactId).toBe('contact-best-effort');
    expect(foldersService.relocateContactFiles).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────
// P3-6 ~ P3-10: task 21 phase 3 — auto-contact-unclassified
//
// 스펙: docs/specs/features/drawing-workflow.md §W.1 "경로 2·3 (auto-contact) 미분류 처리"
//       finalInquiryType 과 무관하게 ensureInquiryFolder 항상 시도.
//       relocateContactFiles 는 finalInquiryType 확정 + folder truthy 일 때만.
//       미분류 파일은 업체 루트에 유지 (분류 확정 시 updateInquiryType 경로가 이동).
// ──────────────────────────────────────────────

describe('AutoContactService.createNewContact — task 21: 미분류 상태 ensureInquiryFolder 시도', () => {
  const baseTxDto: AutoContactFromFileDto = {
    fileName: 'drawing.dxf',
    fileUrl: 'https://cdn.example.com/drawings/drawing.dxf',
    folderId: 'folder-tx',
    folderPath: '/업체A/칼선의뢰',
    companyName: '업체A',
  };

  it('P3-6: 미분류 (finalInquiryType=null) → ensureInquiryFolder 호출됨 (task 21 핵심 동작)', async () => {
    const foldersService = makeFoldersService();

    const { service, prisma } = buildTxService({ foldersService });
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'contact-p3-6' });
    prisma.notification.create.mockResolvedValue({});

    const result = await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/업체A', // 분류 실패 → finalInquiryType=null
    });

    expect(result?.action).toBe('created');
    expect(result?.contactId).toBe('contact-p3-6');
    // task 21: 미분류여도 ensureInquiryFolder 항상 호출 (inquiryNumber 있으면 Phase 1 util 이 `{O}` 생성).
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledWith('contact-p3-6');
  });

  it('P3-7 (task 23): 미분류 + onContactCreated 위임 — ContactFolderSyncService 가 inquiryType 분기 책임 (mock impl 은 분기 없이 ensure→relocate 호출)', async () => {
    // task 23 정책 변경: AutoContactService.createNewContact 가 ContactFolderSyncService.onContactCreated 로 위임.
    // 실제 ContactFolderSyncService 는 inquiryType=null 이면 no-op (ensure/relocate 둘 다 호출 안 됨) —
    // 이 정책은 `src/contacts/contact-folder-sync.service.spec.ts` 가 검증한다.
    // 이 spec 은 AutoContactService 가 위임 호출을 한다는 사실만 검증 (mock impl 은 단순화된 legacy 호출).
    const foldersService = makeFoldersService();
    foldersService.ensureInquiryFolder.mockResolvedValueOnce({
      id: 'folder-phantom',
      name: 'phantom',
    });

    const { service, prisma, contactFolderSync } = buildTxService({ foldersService });
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'contact-p3-7' });
    prisma.notification.create.mockResolvedValue({});

    const result = await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/업체A', // 미분류
    });

    expect(result?.action).toBe('created');
    // 위임 호출 확인 — 실제 inquiryType 분기 검증은 별도 spec.
    expect(contactFolderSync.onContactCreated).toHaveBeenCalledTimes(1);
    expect(contactFolderSync.onContactCreated).toHaveBeenCalledWith({ contactId: 'contact-p3-7' });
  });

  it('P3-8: 분류 확정 (mold_request) + folder 반환 → relocateContactFiles 호출 (회귀)', async () => {
    const foldersService = makeFoldersService();
    foldersService.ensureInquiryFolder.mockResolvedValueOnce({
      id: 'folder-mold-1',
      name: '260422-O-010_260422-F-010',
    });

    const { service, prisma } = buildTxService({ foldersService });
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'contact-p3-8' });

    const result = await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/대성목형/목형의뢰',
      companyName: '대성목형',
    });

    expect(result?.action).toBe('created');
    // 분류 확정 시 기존 동작 유지 — relocate 호출.
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(foldersService.relocateContactFiles).toHaveBeenCalledTimes(1);
    expect(foldersService.relocateContactFiles).toHaveBeenCalledWith(
      'contact-p3-8',
      'folder-mold-1'
    );
  });

  it('P3-9: ensureInquiryFolder throw → Contact 유지 + logger.warn 호출 (최외곽 방어)', async () => {
    const foldersService = makeFoldersService();
    foldersService.ensureInquiryFolder.mockRejectedValueOnce(new Error('prisma deadlock'));

    const { service, prisma } = buildTxService({ foldersService });
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'contact-p3-9' });

    // service['logger'] 에 warn spy 설치 (AutoContactService 내부 Logger 인스턴스).
    const loggerWarnSpy = jest
      .spyOn((service as unknown as { logger: { warn: (msg: string) => void } }).logger, 'warn')
      .mockImplementation(() => {
        /* suppress */
      });

    const result = await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/업체A/칼선의뢰',
    });

    // Contact 는 성공 — 최외곽 try/catch 가 오류 흡수.
    expect(result?.action).toBe('created');
    expect(result?.contactId).toBe('contact-p3-9');
    // relocate 는 호출되지 않음 (folder 획득 실패).
    expect(foldersService.relocateContactFiles).not.toHaveBeenCalled();
    // 최외곽 logger.warn 이 onContactCreated 오류를 기록 (task 23: 메시지가 위임 함수명으로 변경됨).
    const warnCalls = loggerWarnSpy.mock.calls.map((args) => String(args[0]));
    expect(
      warnCalls.some((msg) => msg.includes('onContactCreated') && msg.includes('contact-p3-9'))
    ).toBe(true);

    loggerWarnSpy.mockRestore();
  });

  it('P3-10: ensureInquiryFolder null + 미분류 → relocate 안 됨, Contact 유지', async () => {
    const foldersService = makeFoldersService();
    // 미분류 경로 (inquiryNumber=null) → Phase 1 의 NO_INQUIRY_NUMBER 로 null 반환 (makeFoldersService 기본값).
    // 명시적으로 null 을 한 번 더 지정해 의도를 문서화.
    foldersService.ensureInquiryFolder.mockResolvedValueOnce(null);

    const { service, prisma } = buildTxService({ foldersService });
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'contact-p3-10' });
    prisma.notification.create.mockResolvedValue({});

    const result = await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/업체A', // 미분류
    });

    expect(result?.action).toBe('created');
    expect(result?.contactId).toBe('contact-p3-10');
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(foldersService.relocateContactFiles).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────
// task 23 phase 3: companyName 정규화 (auto-contact-normalize)
//
// 스펙: docs/specs/api/endpoints/integration.md §companyName 정규화 정책
//       docs/specs/features/contact-webhard-folder.md
//
// 검증:
//   N1: matchCompanyInfo 성공 시 Contact.companyName = matchedCompany.companyName (정규형)
//   N2: matchCompanyInfo 실패 시 Contact.companyName = dto.companyName (폴더명 원본 fallback)
//   N3: 대소문자/공백 변종 폴더명 → 정규형으로 저장
// ──────────────────────────────────────────────

describe('AutoContactService.createNewContact — companyName 정규화 (task 23 phase 3)', () => {
  const baseTxDto: AutoContactFromFileDto = {
    fileName: 'drawing.dxf',
    fileUrl: 'https://cdn.example.com/drawings/drawing.dxf',
    folderId: 'folder-normalize',
    folderPath: '/대성목형/목형의뢰',
    companyName: '대성목형',
  };

  it('N1: matchCompanyInfo 매칭 성공 → Contact.companyName 은 matchedCompany.companyName 정규형', async () => {
    const { service, prisma } = buildTxService();
    prisma.contact.findFirst.mockResolvedValue(null);
    // Company 정규형 = '대성목형' (공백 없음). matchCompanyInfo 는 insensitive equals 로 대성목형 hit.
    prisma.company.findFirst.mockResolvedValueOnce({
      id: 42,
      companyName: '대성목형',
      managerName: '김담당',
      managerPhone: '010-1111-2222',
      managerEmail: 'daesung@example.com',
      laserOnly: false,
    });
    prisma.contact.create.mockResolvedValue({ id: 'contact-n1' });

    // 폴더명에 공백/대소문자 섞임 — insensitive 매칭으로 Company 찾음
    const result = await service.detectAndCreate({
      ...baseTxDto,
      companyName: ' 대성목형 ', // 앞뒤 공백 + 실제 DB 엔트리는 '대성목형'
    });

    expect(result?.action).toBe('created');
    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    // 폴더명 원본 ' 대성목형 ' 이 아니라 Company 의 정규형 '대성목형' 이 저장돼야 함
    expect(createCall.data.companyName).toBe('대성목형');
  });

  it('N2: matchCompanyInfo 매칭 실패 (미등록 업체) → Contact.companyName 은 dto.companyName (fallback)', async () => {
    const { service, prisma } = buildTxService();
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.company.findFirst.mockResolvedValueOnce(null); // 미등록 업체
    prisma.contact.create.mockResolvedValue({ id: 'contact-n2' });
    prisma.notification.create.mockResolvedValue({});

    const result = await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/미등록업체', // 분류 실패 + Company 없음
      companyName: '미등록업체',
    });

    expect(result?.action).toBe('created');
    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    // Company 미등록 → dto.companyName 그대로 사용 (fallback)
    expect(createCall.data.companyName).toBe('미등록업체');
  });

  it('N3: matchCompanyInfo 가 반환한 companyName 이 dto 와 다르면 Company 값 우선', async () => {
    const { service, prisma } = buildTxService();
    prisma.contact.findFirst.mockResolvedValue(null);
    // DB 정규형 = "대성 목형", 폴더명 원본 = "대성목형"
    prisma.company.findFirst.mockResolvedValueOnce({
      id: 7,
      companyName: '대성 목형', // 공백 포함 정규형
      managerName: null,
      managerPhone: null,
      managerEmail: null,
      laserOnly: false,
    });
    prisma.contact.create.mockResolvedValue({ id: 'contact-n3' });

    const result = await service.detectAndCreate({
      ...baseTxDto,
      companyName: '대성목형', // 공백 없는 폴더명
    });

    expect(result?.action).toBe('created');
    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    // 폴더명 '대성목형' 이 아니라 DB 정규형 '대성 목형' 이 저장돼야 함
    expect(createCall.data.companyName).toBe('대성 목형');
    // inquiryTitle 도 정규형으로 생성되는지 확인 (task 23: 일관성 유지)
    expect(String(createCall.data.inquiryTitle)).toContain('대성 목형');
    expect(String(createCall.data.inquiryTitle)).not.toContain('대성목형 ');
  });

  it('N4: matchCompanyInfo 호출 시 select 에 id, companyName 포함 (회귀 방지)', async () => {
    const { service, prisma } = buildTxService();
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.company.findFirst.mockResolvedValueOnce({
      id: 99,
      companyName: '회귀테스트',
      managerName: null,
      managerPhone: null,
      managerEmail: null,
      laserOnly: false,
    });
    prisma.contact.create.mockResolvedValue({ id: 'contact-n4' });

    await service.detectAndCreate({
      ...baseTxDto,
      companyName: '회귀테스트',
    });

    // findFirst 호출 인자 검증 — id, companyName, manager*, laserOnly 모두 select 되어야 함
    const findFirstCall = prisma.company.findFirst.mock.calls[0][0] as {
      select: Record<string, boolean>;
    };
    expect(findFirstCall.select.id).toBe(true);
    expect(findFirstCall.select.companyName).toBe(true);
    expect(findFirstCall.select.managerName).toBe(true);
    expect(findFirstCall.select.laserOnly).toBe(true);
  });
});

// ──────────────────────────────────────────────
// task 24 phase 2: matchCompanyInfo 3단계 매칭 (A1~A7)
//
// 스펙: docs/specs/features/external-sync-company-folder.md §매칭 강화 (3단계)
//       docs/specs/api/endpoints/integration.md §companyName 정규화
//
// 검증:
//   A1: 0차 — CompanyFolderAlias status='approved' 일치 → 즉시 매칭 + 정규형 사용
//   A2: 0차 hit 시 1차/2차 단계 skip (Company.findFirst 호출 0회)
//   A3: 3차 — 정규화 매칭 단일 후보 → pending upsert + null 반환
//   A4: 3차 — 정규화 매칭 다수 후보 → 모두 pending upsert + null 반환
//   A5: 3차 — 매칭 후보 0개 → upsert 호출 없음
//   A6: 3차 — upsert 의 update 가 빈 객체 (status 변경 금지)
//   A7: 3차 — status='rejected' alias 가 있어도 0차 매칭 skip + update: {} 로 보존
// ──────────────────────────────────────────────

describe('AutoContactService.createNewContact — matchCompanyInfo 3단계 매칭 (task 24)', () => {
  const baseTxDto: AutoContactFromFileDto = {
    fileName: 'drawing.dxf',
    fileUrl: 'https://cdn.example.com/drawings/drawing.dxf',
    folderId: 'folder-task24',
    folderPath: '/대성목형',
    companyName: '대성목형',
  };

  it('A1: CompanyFolderAlias status=approved 일치 → alias 의 Company 정규형 매칭 반환', async () => {
    const { service, prisma } = buildTxService();
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.companyFolderAlias.findFirst.mockResolvedValueOnce({
      id: 1,
      folderName: '폴더명원본',
      companyId: 7,
      status: 'approved',
      company: {
        id: 7,
        companyName: '정규업체명',
        managerName: '김담당',
        managerPhone: '010-1111-2222',
        managerEmail: 'kim@example.com',
        laserOnly: false,
      },
    });
    prisma.contact.create.mockResolvedValue({ id: 'contact-a1' });

    const result = await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/폴더명원본/칼선의뢰',
      companyName: '폴더명원본',
    });
    expect(result?.action).toBe('created');

    // 0차 alias hit → Contact.companyName = alias 의 Company 정규형
    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.companyName).toBe('정규업체명');
    expect(createCall.data.companyId).toBe(7);

    // 0차에서 사용된 where 조건 검증
    const findFirstCall = prisma.companyFolderAlias.findFirst.mock.calls[0][0] as {
      where: { folderName: string; status: string };
    };
    expect(findFirstCall.where.folderName).toBe('폴더명원본');
    expect(findFirstCall.where.status).toBe('approved');
  });

  it('A2: 0차 alias 매칭 시 1차/2차 단계 skip — Company.findFirst 호출 0회', async () => {
    const { service, prisma } = buildTxService();
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.companyFolderAlias.findFirst.mockResolvedValueOnce({
      id: 2,
      folderName: 'F',
      companyId: 9,
      status: 'approved',
      company: {
        id: 9,
        companyName: '정규',
        managerName: null,
        managerPhone: null,
        managerEmail: null,
        laserOnly: false,
      },
    });
    prisma.contact.create.mockResolvedValue({ id: 'contact-a2' });

    await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/F/칼선의뢰',
      companyName: 'F',
    });

    // alias 즉시 반환 → 1차/2차 lookup 호출 안 됨
    expect(prisma.company.findFirst).not.toHaveBeenCalled();
    // 3차 fallthrough 도 안 됨
    expect(prisma.company.findMany).not.toHaveBeenCalled();
    expect(prisma.companyFolderAlias.upsert).not.toHaveBeenCalled();
  });

  it('A3: 정규화 매칭 단일 후보 → pending upsert 1회 + null 반환 (companyName 폴더명 원본 fallback)', async () => {
    const { service, prisma } = buildTxService();
    prisma.contact.findFirst.mockResolvedValue(null);
    // 0차/1차/2차 모두 fail
    prisma.companyFolderAlias.findFirst.mockResolvedValue(null);
    prisma.company.findFirst.mockResolvedValue(null);
    // 3차 후보: 단일 매칭 (정규화 '대성목형' 일치는 id=11 만)
    prisma.company.findMany.mockResolvedValueOnce([
      { id: 11, companyName: '대성 목형' }, // 정규화 → '대성목형'
      { id: 12, companyName: '다른업체' }, // 정규화 → '다른업체'
    ]);
    prisma.contact.create.mockResolvedValue({ id: 'contact-a3' });
    prisma.notification.create.mockResolvedValue({});

    const result = await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/대성목형',
      companyName: '  대성목형 ',
    });
    expect(result?.action).toBe('created');

    // 3차 upsert 1회 (matched 1개)
    expect(prisma.companyFolderAlias.upsert).toHaveBeenCalledTimes(1);
    const upsertCall = prisma.companyFolderAlias.upsert.mock.calls[0][0] as {
      where: { folderName_companyId: { folderName: string; companyId: number } };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    };
    expect(upsertCall.where.folderName_companyId.folderName).toBe('대성목형');
    expect(upsertCall.where.folderName_companyId.companyId).toBe(11);
    expect(upsertCall.update).toEqual({});
    expect(upsertCall.create).toMatchObject({
      folderName: '대성목형',
      companyId: 11,
      status: 'pending',
    });

    // 3차는 매칭 미적용 → null 반환 → fallback 으로 폴더명(trim) 원본 사용
    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.companyName).toBe('대성목형');
  });

  it('A4: 정규화 매칭 다수 후보 → 모두 pending upsert + null 반환', async () => {
    const { service, prisma } = buildTxService();
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.companyFolderAlias.findFirst.mockResolvedValue(null);
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.company.findMany.mockResolvedValueOnce([
      { id: 21, companyName: '대성목형 본사' }, // 정규화 → '대성목형본사' (불일치)
      { id: 22, companyName: '대성-목형' }, // 정규화 → '대성목형' ✓
      { id: 23, companyName: '대성 목형' }, // 정규화 → '대성목형' ✓
    ]);
    prisma.contact.create.mockResolvedValue({ id: 'contact-a4' });
    prisma.notification.create.mockResolvedValue({});

    await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/대성목형',
      companyName: '대성목형',
    });

    // 매칭 2개 → upsert 2회. 각 호출의 companyId 가 다름.
    expect(prisma.companyFolderAlias.upsert).toHaveBeenCalledTimes(2);
    const calls = prisma.companyFolderAlias.upsert.mock.calls.map(
      (c) =>
        (c[0] as { where: { folderName_companyId: { companyId: number } } }).where
          .folderName_companyId.companyId
    );
    expect(calls).toEqual(expect.arrayContaining([22, 23]));
    expect(calls).not.toContain(21);

    // null 반환 → fallback companyName
    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.companyName).toBe('대성목형');
  });

  it('A5: 매칭 후보 0개 → upsert 미호출 + null 반환 (회귀 보장)', async () => {
    const { service, prisma } = buildTxService();
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.companyFolderAlias.findFirst.mockResolvedValue(null);
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.company.findMany.mockResolvedValueOnce([
      { id: 31, companyName: '다른업체A' }, // 정규화 '다른업체a'
      { id: 32, companyName: '다른업체B' }, // 정규화 '다른업체b'
    ]);
    prisma.contact.create.mockResolvedValue({ id: 'contact-a5' });
    prisma.notification.create.mockResolvedValue({});

    await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/대성목형',
      companyName: '대성목형',
    });

    expect(prisma.companyFolderAlias.upsert).not.toHaveBeenCalled();

    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.companyName).toBe('대성목형');
  });

  it('A6: 3차 upsert 의 update 객체가 빈 객체 — status 변경 금지 (admin 결정 보존)', async () => {
    const { service, prisma } = buildTxService();
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.companyFolderAlias.findFirst.mockResolvedValue(null);
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.company.findMany.mockResolvedValueOnce([{ id: 41, companyName: '대성목형' }]);
    prisma.contact.create.mockResolvedValue({ id: 'contact-a6' });
    prisma.notification.create.mockResolvedValue({});

    await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/대성목형',
      companyName: '대성목형',
    });

    expect(prisma.companyFolderAlias.upsert).toHaveBeenCalledTimes(1);
    const upsertCall = prisma.companyFolderAlias.upsert.mock.calls[0][0] as {
      update: Record<string, unknown>;
      create: { status: string };
    };
    expect(upsertCall.update).toEqual({});
    expect(upsertCall.create.status).toBe('pending');
  });

  it('A7: status=rejected alias 가 있어도 0차 매칭 skip + 3차 upsert 의 update: {} 로 보존', async () => {
    const { service, prisma } = buildTxService();
    prisma.contact.findFirst.mockResolvedValue(null);
    // 0차 findFirst 의 where 는 status='approved' 만 검색 → rejected row 는 hit 안 함 (mock null)
    prisma.companyFolderAlias.findFirst.mockResolvedValue(null);
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.company.findMany.mockResolvedValueOnce([{ id: 51, companyName: '대성목형' }]);
    prisma.contact.create.mockResolvedValue({ id: 'contact-a7' });
    prisma.notification.create.mockResolvedValue({});

    await service.detectAndCreate({
      ...baseTxDto,
      folderPath: '/대성목형',
      companyName: '대성목형',
    });

    // 0차 findFirst 의 where 가 status='approved' 인지 검증 — rejected 무시
    const findFirstCall = prisma.companyFolderAlias.findFirst.mock.calls[0][0] as {
      where: { folderName: string; status: string };
    };
    expect(findFirstCall.where.status).toBe('approved');

    // 3차 upsert 의 update: {} → 기존 rejected row 의 status 유지
    expect(prisma.companyFolderAlias.upsert).toHaveBeenCalledTimes(1);
    const upsertCall = prisma.companyFolderAlias.upsert.mock.calls[0][0] as {
      update: Record<string, unknown>;
    };
    expect(upsertCall.update).toEqual({});
  });
});

// ──────────────────────────────────────────────
// U1/U2/U4: Bug 3 회귀 가드 — 미가입 업체 외부 sync 통합 (task 25)
//
// 스펙: docs/specs/features/webhard-visibility-and-external-inquiry-fix.md
//       정책 — Bug 3: 미가입 업체 외부 sync 통합 흐름은 현재 코드 그대로 동작 가능해야 한다.
//       본 describe 는 회귀 가드 — 코드 변경 없음.
//
// 흐름 (spec line 94-102):
//   1) confirmUpload → triggerAutoContact → resolveCompanyFolder hierarchy 상향 탐색.
//      "칼선의뢰" 는 excludedFolders 에 포함되어 skip → 다음 상위 `{미가입업체}` 반환.
//   2) detectAndCreate → classifyByFolderPath → cutting_request/mold_request/null 반환.
//   3) matchCompanyInfo → 0차/1차/2차/3차 모두 fail → 결과 null.
//   4) Contact 생성 (companyName='{미가입업체}', companyId 미설정, source='webhard').
//   5) onContactCreated → 후속 폴더 생성 (별도 hook, U3 에서 검증).
// ──────────────────────────────────────────────

describe('AutoContactService — Bug 3 회귀 가드 (task 25 U1/U2/U4)', () => {
  const baseInquiryDto: AutoContactFromFileDto = {
    fileName: 'file.dxf',
    fileUrl: 'https://r2.example.com/file.dxf',
    folderId: 'folder-bug3',
    folderPath: '/미가입업체/칼선의뢰',
    companyName: '미가입업체',
  };

  it('U1: /{미가입업체}/칼선의뢰/file 업로드 → contact (inquiryType=cutting_request, companyId 미설정) + onContactCreated 1회 호출', async () => {
    const { service, prisma, contactFolderSync } = buildTxService();
    // findExistingContact → null
    prisma.contact.findFirst.mockResolvedValue(null);
    // matchCompanyInfo 의 0차/1차/2차/3차 모두 fail
    prisma.companyFolderAlias.findFirst.mockResolvedValue(null);
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.company.findMany.mockResolvedValue([]);
    prisma.contact.create.mockResolvedValue({ id: 'contact-u1' });
    prisma.notification.create.mockResolvedValue({});

    const result = await service.detectAndCreate({
      ...baseInquiryDto,
      folderPath: '/미가입업체/칼선의뢰',
      companyName: '미가입업체',
    });

    // detectAndCreate 결과 검증
    expect(result).not.toBeNull();
    expect(result?.action).toBe('created');
    expect(result?.contactId).toBe('contact-u1');

    // contact.create 의 data 검증 — inquiryType, companyName, companyId(미설정)
    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.inquiryType).toBe('cutting_request');
    // matchCompanyInfo null → fallback 으로 폴더명(trim) 원본 사용
    expect(createCall.data.companyName).toBe('미가입업체');
    // companyId 는 Contact data 에 명시적으로 설정되지 않음 (미가입 업체)
    expect(createCall.data.companyId).toBeUndefined();
    expect(createCall.data.source).toBe('webhard');

    // onContactCreated 가 1회 호출 (생성된 contact.id 인자) — 단일 진입점 위임
    expect(contactFolderSync.onContactCreated).toHaveBeenCalledTimes(1);
    expect(contactFolderSync.onContactCreated).toHaveBeenCalledWith({
      contactId: 'contact-u1',
    });
  });

  it('U2: /{미가입업체}/file (평면) → inquiryType=null + relocateContactFiles 미호출 (폴더 생성 X)', async () => {
    const { service, prisma, foldersService, contactFolderSync } = buildTxService();
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.companyFolderAlias.findFirst.mockResolvedValue(null);
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.company.findMany.mockResolvedValue([]);
    prisma.contact.create.mockResolvedValue({ id: 'contact-u2' });
    prisma.notification.create.mockResolvedValue({});

    const result = await service.detectAndCreate({
      ...baseInquiryDto,
      folderPath: '/미가입업체', // 평면 — 칼선의뢰/목형의뢰 segment 없음
      companyName: '미가입업체',
    });

    expect(result?.action).toBe('created');
    expect(result?.contactId).toBe('contact-u2');

    // classifyByFolderPath 결과 → null → inquiryType=null
    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.inquiryType).toBeNull();
    expect(createCall.data.companyName).toBe('미가입업체');
    expect(createCall.data.companyId).toBeUndefined();

    // onContactCreated 는 호출되지만 (위임 단일 진입점),
    // 미분류 → ensureInquiryFolder mock 이 null 반환 → relocateContactFiles 미호출.
    expect(contactFolderSync.onContactCreated).toHaveBeenCalledTimes(1);
    expect(foldersService.relocateContactFiles).not.toHaveBeenCalled();
  });

  it('U4: /{미가입업체}/목형의뢰/file → inquiryType=mold_request + workNumber=YYMMDD-F-NNN', async () => {
    const { service, prisma, contactFolderSync } = buildTxService();
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.companyFolderAlias.findFirst.mockResolvedValue(null);
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.company.findMany.mockResolvedValue([]);
    prisma.contact.create.mockResolvedValue({ id: 'contact-u4' });
    prisma.notification.create.mockResolvedValue({});

    const result = await service.detectAndCreate({
      ...baseInquiryDto,
      folderPath: '/미가입업체/목형의뢰',
      companyName: '미가입업체',
    });

    expect(result?.action).toBe('created');
    expect(result?.contactId).toBe('contact-u4');

    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    // 목형의뢰 → mold_request, 현장 직행 → workNumber 부여 (inquiryNumber=null)
    expect(createCall.data.inquiryType).toBe('mold_request');
    expect(createCall.data.companyName).toBe('미가입업체');
    expect(createCall.data.companyId).toBeUndefined();
    expect(createCall.data.workNumber).toMatch(/^\d{6}-F-\d{3}$/);
    expect(createCall.data.inquiryNumber).toBeNull();
    // 현장 직행 → productionStartedAt 부여
    expect(createCall.data.productionStartedAt).toBeDefined();

    // onContactCreated 위임 호출 검증
    expect(contactFolderSync.onContactCreated).toHaveBeenCalledTimes(1);
    expect(contactFolderSync.onContactCreated).toHaveBeenCalledWith({
      contactId: 'contact-u4',
    });
  });
});

// ──────────────────────────────────────────────
// E2E-1: Bug 2 + Bug 3 통합 service-level integration (task 25 phase 4)
//
// 스펙: docs/specs/features/webhard-visibility-and-external-inquiry-fix.md (E2E-1)
//
// 검증 의도:
//   A7 (folder-alias.service.spec) 와 U1/U2/U4 (위 describe) 가 각자 단일 service 호출을
//   검증한다면, E2E-1 는 두 시나리오에서 service 간 hook chain 의 end-to-end 호출 시퀀스
//   (invocationCallOrder) 를 검증한다.
//
//   - E2E-1a (Bug 2): 가입 업체 alias 매핑 후 relocateAfterAliasApproved 가
//     onContactCreated → ensureInquiryFolder → relocateContactFiles 까지 호출 시퀀스를 끝까지
//     진행하는지 검증. createApprovedAlias 진입점 → 단일 진입점 위임 (invariant 1) 보존.
//
//   - E2E-1b (Bug 3): 미가입 업체 신규 sync 의 detectAndCreate → onContactCreated 위임 →
//     ensureInquiryFolder 가 resolveCompanyRoot 에서 companyId=null root fallback 으로
//     `외부웹하드/{미가입업체}/문의/{title-O번호}/` 폴더 생성 시퀀스를 mock 호출 트레이스로 검증.
//     ensureInquiryRootFolder 호출 시 companyId=null 인자 전달이 핵심.
//
// fidelity: invocationCallOrder 까지 검증 — chain 이 끊기는 회귀를 invariant 로 박제.
// ──────────────────────────────────────────────

describe('AutoContactService — E2E-1 service-level integration (task 25 Bug 2+3 통합)', () => {
  // ────────────────────────────────────────────
  // E2E-1a: Bug 2 — 가입 업체 alias 매핑 → relocate chain
  // ────────────────────────────────────────────
  it('E2E-1a (Bug 2): createApprovedAlias → relocateAfterAliasApproved → contact.update + onContactCreated → ensureInquiryFolder → relocateContactFiles 호출 시퀀스', async () => {
    // 시드 픽스처: 가입 업체 ('대성목형', id=4) + 외부웹하드 contact 1건 (companyId=null,
    //   inquiryType='cutting_request') — alias 매핑이 아직 없음.
    const folderName = '대성목형(2265-1295)';
    const companyId = 4;
    const fixedNow = new Date('2026-04-28T09:00:00Z');
    jest.useFakeTimers().setSystemTime(fixedNow);

    // ====== Prisma mock: FolderAliasService 가 사용하는 ORM 메서드 + ContactFolderSyncService
    //        가 사용하는 contact.findMany / update + ensureInquiryFolder 가 호출하는
    //        contact.findUnique / webhardFolder.* 를 모두 한 prisma 인스턴스에 묶는다.
    //        $transaction 콜백이 prisma 자체를 tx 로 넘겨 호출 시퀀스 일원화.
    const prisma = {
      $transaction: jest.fn(),
      company: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      companyFolderAlias: {
        upsert: jest.fn(),
        updateMany: jest.fn(),
      },
      contact: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      webhardFolder: {
        findFirst: jest.fn(),
      },
    };
    // $transaction(cb) → cb(prisma) — 한 트랜잭션 안에서 모든 호출이 일어남을 시뮬.
    prisma.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => unknown) =>
      cb(prisma)
    );

    // 시드: company 존재 검증 통과 — createApprovedAlias 1회 + relocateAfterAliasApproved 1회 호출.
    // 두 번 모두 동일 결과 반환하면 되므로 mockResolvedValue 로 default 셋업.
    prisma.company.findUnique.mockResolvedValue({ id: companyId, companyName: '대성목형' });
    // 시드: alias upsert (신규 row, status='approved')
    const seededAlias = {
      id: 100,
      folderName,
      companyId,
      status: 'approved',
      approvedBy: 'admin',
      approvedAt: fixedNow,
      createdAt: fixedNow,
      updatedAt: fixedNow,
    };
    prisma.companyFolderAlias.upsert.mockResolvedValueOnce(seededAlias);
    // 시드: 다른 pending alias 없음
    prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 0 });

    // 시드: relocateAfterAliasApproved 진입 — companyId 검증 통과 + 미통합 contact 1건
    const orphanContact = {
      id: 'contact-e2e1a',
      companyName: folderName,
      companyId: null,
      inquiryType: 'cutting_request',
    };
    prisma.contact.findMany.mockResolvedValueOnce([orphanContact]);
    // 시드: contact 갱신 (companyId=null → 4)
    prisma.contact.update.mockResolvedValueOnce({
      ...orphanContact,
      companyId,
      companyName: '대성목형',
    });

    // ====== ContactFolderSyncService — 실제 인스턴스 (단일 진입점 정책 검증) ======
    // FoldersService 는 mock — ensureInquiryFolder + relocateContactFiles + rename 만 spy.
    const foldersService = {
      ensureInquiryFolder: jest.fn().mockResolvedValue({
        id: 'folder-relocated-e2e1a',
        name: '260428-O-001',
        companyId,
      }),
      relocateContactFiles: jest.fn().mockResolvedValue({ movedIds: ['file-1', 'file-2'] }),
      renameInquiryFolderForContact: jest.fn().mockResolvedValue(undefined),
    };
    // onContactCreated 가 loadContactInquiryType 에서 contact.findUnique 호출.
    prisma.contact.findUnique.mockResolvedValue({ inquiryType: 'cutting_request' });

    const contactFolderSync = new ContactFolderSyncService(
      foldersService as never,
      prisma as never,
      { emitGlobal: jest.fn() } as never
    );

    // ====== FolderAliasService — 실제 인스턴스 (entry point) ======
    const folderAliasService = new FolderAliasService(prisma as never, contactFolderSync);

    // ====== 호출: createApprovedAlias (운영자 수동 매핑 시나리오) ======
    const result = await folderAliasService.createApprovedAlias(
      { folderName, companyId, cascadeBackfill: true },
      'admin'
    );

    // ====== 검증 1: 응답 shape — backfill 통계 포함 ======
    expect(result.alias).toMatchObject({ id: 100, status: 'approved' });
    // task 26: backfill 응답에 migration 카운트 포함 (외부 root 미존재 → 0)
    expect(result.backfill).toEqual({
      relocated: 1,
      skipped: 0,
      movedFolders: 0,
      movedFiles: 0,
      deletedExternalFolders: 0,
      conflicts: [],
      externalRootFound: false,
    });

    // ====== 검증 2: chain 의 모든 step 이 실제로 호출됨 ======
    // (a) alias upsert
    expect(prisma.companyFolderAlias.upsert).toHaveBeenCalledTimes(1);
    // (b) 미통합 contact 검색
    expect(prisma.contact.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.contact.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { companyName: folderName },
          { companyName: { equals: folderName, mode: 'insensitive' } },
        ],
        companyId: null,
      },
    });
    // (c) contact.update — companyId=null → 4 갱신, companyName 정규화
    expect(prisma.contact.update).toHaveBeenCalledTimes(1);
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'contact-e2e1a' },
      data: { companyName: '대성목형', companyId: 4 },
    });
    // (d) onContactCreated 위임 → ensureInquiryFolder + relocateContactFiles 호출
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledWith('contact-e2e1a', prisma);
    expect(foldersService.relocateContactFiles).toHaveBeenCalledTimes(1);
    expect(foldersService.relocateContactFiles).toHaveBeenCalledWith(
      'contact-e2e1a',
      'folder-relocated-e2e1a',
      prisma
    );

    // ====== 검증 3: 단일 진입점 (invariant 1) — renameInquiryFolderForContact 미호출 ======
    // onContactCreated 는 rename 을 호출하지 않음 (rename 은 onInquiryTypeClassified 전용).
    expect(foldersService.renameInquiryFolderForContact).not.toHaveBeenCalled();

    // ====== 검증 4: invocationCallOrder — chain 의 end-to-end 호출 시퀀스 ======
    const aliasUpsertOrder = prisma.companyFolderAlias.upsert.mock.invocationCallOrder[0];
    const contactFindManyOrder = prisma.contact.findMany.mock.invocationCallOrder[0];
    const contactUpdateOrder = prisma.contact.update.mock.invocationCallOrder[0];
    const ensureFolderOrder = foldersService.ensureInquiryFolder.mock.invocationCallOrder[0];
    const relocateFilesOrder = foldersService.relocateContactFiles.mock.invocationCallOrder[0];

    // alias upsert → contact 검색 → contact 갱신 → folder 생성 → file 이동
    expect(aliasUpsertOrder).toBeLessThan(contactFindManyOrder);
    expect(contactFindManyOrder).toBeLessThan(contactUpdateOrder);
    expect(contactUpdateOrder).toBeLessThan(ensureFolderOrder);
    expect(ensureFolderOrder).toBeLessThan(relocateFilesOrder);

    // ====== 검증 5: 단일 트랜잭션 ======
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  // ────────────────────────────────────────────
  // E2E-1b: Bug 3 — 미가입 업체 신규 sync → fallback 폴더 생성 chain
  // ────────────────────────────────────────────
  it('E2E-1b (Bug 3): detectAndCreate → contact.create (companyId=null) → onContactCreated → ensureInquiryFolder → resolveCompanyRoot fallback (companyId=null) → ensureInquiryRootFolder 호출 시퀀스', async () => {
    // 시드 픽스처: 외부웹하드/{미가입업체}/칼선의뢰/file 업로드 시나리오 (Bug 3 의 의도된 케이스).
    //   dev DB 사례: '(주)신영피앤피', '태인프린팅', '디자인삼진' 등 평면 구조 미가입 업체 폴더.
    const unregisteredCompanyName = '미가입업체A';
    const fileName = 'cutting.dxf';
    const fileUrl = 'https://r2.example.com/cutting.dxf';
    const folderId = 'webhard-folder-cutting';

    // ====== Prisma mock — AutoContactService + ContactFolderSyncService + FoldersService 의
    //        ensureInquiryFolder 내부 ORM 호출 시퀀스를 한 인스턴스에 통합 ======
    const prisma = {
      $transaction: jest.fn(),
      executeWithRetry: jest.fn((fn: () => unknown) => fn()),
      company: {
        findFirst: jest.fn().mockResolvedValue(null), // 0차/1차/2차 매칭 fail (미가입)
        findMany: jest.fn().mockResolvedValue([]), // 3차 정규화 후보 0건
      },
      companyFolderAlias: {
        findFirst: jest.fn().mockResolvedValue(null), // 0차 alias 없음
        upsert: jest.fn().mockResolvedValue({}),
      },
      contact: {
        findFirst: jest.fn().mockResolvedValue(null), // 중복 없음
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      notification: {
        create: jest.fn().mockResolvedValue({}),
      },
      webhardFile: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => unknown) =>
      cb(prisma)
    );

    // 시드: contact.create — Bug 3 핵심 (companyId 미설정 + companyName=폴더명 fallback)
    const createdContactId = 'contact-e2e1b';
    prisma.contact.create.mockResolvedValueOnce({ id: createdContactId });

    // ====== FoldersService — ensureInquiryFolder 와 ensureInquiryRootFolder 만 spy.
    //   ensureInquiryFolder 의 실제 동작 (resolveCompanyRoot fallback → ensureInquiryRootFolder
    //   호출) 은 단위 spec 에서 검증되므로, 여기선 ensureInquiryFolder 호출 시 내부적으로
    //   ensureInquiryRootFolder 가 companyId=null 인자로 호출됨을 흉내내는 mock impl 을 둔다.
    const ensureInquiryRootFolderSpy = jest.fn().mockResolvedValue({
      id: 'folder-inquiry-root-e2e1b',
      name: '문의',
      companyId: null,
      parentId: 'folder-virtual-root-e2e1b',
    });
    const foldersService = {
      // ensureInquiryFolder 의 내부 호출 시퀀스를 service-level 로 흉내냄:
      //   1) resolveCompanyRoot 가 fallback (companyId=null) 으로 root 반환
      //   2) ensureInquiryRootFolder(rootFolderId, companyId=null, tx) 호출
      //   3) `{O}` 폴더 create 후 반환
      ensureInquiryFolder: jest.fn().mockImplementation(async (contactId: string, tx?: unknown) => {
        // resolveCompanyRoot fallback: companyId=null 가상 업체 root 반환을 시뮬.
        const fallbackRootFolderId = 'folder-virtual-root-e2e1b';
        const fallbackCompanyId = null; // ← Bug 3 의 핵심: ensureInquiryRootFolder 가
        //   companyId=null 인자로 호출됨.
        const inquiryRoot = await ensureInquiryRootFolderSpy(
          fallbackRootFolderId,
          fallbackCompanyId,
          tx
        );
        return {
          id: 'folder-inquiry-detail-e2e1b',
          name: '260428-O-001',
          parentId: inquiryRoot.id,
          companyId: fallbackCompanyId,
          contactId,
        };
      }),
      relocateContactFiles: jest.fn().mockResolvedValue({ movedIds: ['file-e2e1b'] }),
      renameInquiryFolderForContact: jest.fn().mockResolvedValue(undefined),
    };

    // onContactCreated 의 loadContactInquiryType — created contact 의 inquiryType=cutting_request
    prisma.contact.findUnique.mockResolvedValue({ inquiryType: 'cutting_request' });

    // ====== ContactFolderSyncService 실제 인스턴스 — 단일 진입점 정책 보존 ======
    const contactFolderSync = new ContactFolderSyncService(
      foldersService as never,
      prisma as never,
      { emitGlobal: jest.fn() } as never
    );

    // ====== AutoContactService 실제 인스턴스 — entry point (detectAndCreate) ======
    const webhardConfig = makeWebhardConfigService();
    const numberSvc = makeNumberService();
    const timelineSvc = { recordChange: jest.fn().mockResolvedValue({ id: 'tl-1' }) };
    const drawingRevSvc = {
      createInitialRevision: jest.fn().mockResolvedValue(undefined),
    };
    const laserOnlyMappingSvc = { isLaserOnlyFolder: jest.fn().mockResolvedValue(false) };

    const autoContactService = new AutoContactService(
      prisma as never,
      webhardConfig as never,
      numberSvc as never,
      timelineSvc as never,
      drawingRevSvc as never,
      laserOnlyMappingSvc as never,
      foldersService as never,
      contactFolderSync as never
    );

    // ====== 호출: detectAndCreate (외부 sync 진입점) ======
    const result = await autoContactService.detectAndCreate({
      fileName,
      fileUrl,
      folderId,
      folderPath: `/외부웹하드/${unregisteredCompanyName}/칼선의뢰`,
      companyName: unregisteredCompanyName,
    });

    // ====== 검증 1: detectAndCreate 결과 ======
    expect(result).not.toBeNull();
    expect(result?.action).toBe('created');
    expect(result?.contactId).toBe(createdContactId);
    expect(result?.inquiryNumber).toMatch(/^\d{6}-O-\d{3}$/);

    // ====== 검증 2: matchCompanyInfo 의 0차/1차/2차/3차 모두 fail (미가입 업체) ======
    expect(prisma.companyFolderAlias.findFirst).toHaveBeenCalled(); // 0차
    expect(prisma.company.findFirst).toHaveBeenCalled(); // 1차/2차
    expect(prisma.company.findMany).toHaveBeenCalled(); // 3차 후보 조회
    expect(prisma.companyFolderAlias.upsert).not.toHaveBeenCalled(); // 후보 0건이라 upsert 없음

    // ====== 검증 3: contact.create — companyId 미설정 + inquiryType='cutting_request' ======
    expect(prisma.contact.create).toHaveBeenCalledTimes(1);
    const createCall = prisma.contact.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.inquiryType).toBe('cutting_request');
    expect(createCall.data.companyName).toBe(unregisteredCompanyName); // fallback (matchCompanyInfo null)
    expect(createCall.data.companyId).toBeUndefined(); // companyId 명시 X (미가입)
    expect(createCall.data.source).toBe('webhard');
    expect(createCall.data.inquiryNumber).toMatch(/^\d{6}-O-\d{3}$/);

    // ====== 검증 4: onContactCreated → ensureInquiryFolder 위임 (단일 진입점 invariant 1) ======
    // AutoContactService.createNewContact 는 transaction 외부 fire-and-forget 으로 onContactCreated 호출
    //   (auto-contact.service.ts line 391): `await this.contactFolderSync.onContactCreated({ contactId });`
    //   → client 미전달 → ensureInquiryFolder 의 두 번째 인자 tx 가 undefined 로 전파.
    //   본 동작은 의도된 정책 (createNewContact 의 메인 트랜잭션과 분리하여 폴더 생성 실패가
    //   Contact 생성 자체를 롤백하지 않게) — 단위 spec U1/U2/U4 도 동일 invariant 박제.
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledWith(createdContactId, undefined);

    // ====== 검증 5: ensureInquiryRootFolder 가 companyId=null 인자로 호출됨 (Bug 3 핵심) ======
    // resolveCompanyRoot 의 fallback 경로 — Company 미등록 가상 업체 폴더 root 사용.
    expect(ensureInquiryRootFolderSpy).toHaveBeenCalledTimes(1);
    expect(ensureInquiryRootFolderSpy).toHaveBeenCalledWith(
      'folder-virtual-root-e2e1b', // fallback root folder id
      null, // ← companyId=null (정식 Company 매칭 실패)
      undefined // tx 미전파 (createNewContact 의 fire-and-forget 호출)
    );

    // ====== 검증 6: relocateContactFiles 호출 — 파일 이동 ======
    expect(foldersService.relocateContactFiles).toHaveBeenCalledTimes(1);
    expect(foldersService.relocateContactFiles).toHaveBeenCalledWith(
      createdContactId,
      'folder-inquiry-detail-e2e1b',
      undefined
    );

    // ====== 검증 7: invocationCallOrder — chain 의 end-to-end 호출 시퀀스 ======
    const contactCreateOrder = prisma.contact.create.mock.invocationCallOrder[0];
    const ensureFolderOrder = foldersService.ensureInquiryFolder.mock.invocationCallOrder[0];
    const ensureRootOrder = ensureInquiryRootFolderSpy.mock.invocationCallOrder[0];
    const relocateOrder = foldersService.relocateContactFiles.mock.invocationCallOrder[0];

    // contact.create → ensureInquiryFolder → ensureInquiryRootFolder → relocateContactFiles
    expect(contactCreateOrder).toBeLessThan(ensureFolderOrder);
    expect(ensureFolderOrder).toBeLessThan(ensureRootOrder);
    expect(ensureRootOrder).toBeLessThan(relocateOrder);

    // ====== 검증 8: rename 미호출 (onContactCreated 는 rename 안 함) ======
    expect(foldersService.renameInquiryFolderForContact).not.toHaveBeenCalled();
  });
});
