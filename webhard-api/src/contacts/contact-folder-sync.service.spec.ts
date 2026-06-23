/**
 * ContactFolderSyncService 단위 테스트
 *
 * 스펙: tasks/23-qa-contact-worker-v1/phase2.md
 *       docs/specs/features/contact-webhard-folder.md (공통 훅 정책)
 *
 * 검증 항목:
 *   - onContactCreated:
 *     * inquiryType=null → no-op (ensureInquiryFolder 호출 없음)
 *     * inquiryType 확정 + folder OK → ensure → relocate 순서
 *     * inquiryType 확정 + folder null → relocate skip (warn)
 *     * contact 미존재 → no-op
 *   - onInquiryTypeClassified:
 *     * 항상 rename → ensure → relocate 순서
 *     * folder null → warn+skip (throw 안 함, UX 회귀 방지)
 *   - onProcessStageChanged:
 *     * nextStage='drawing_confirmed' + folder null → UnprocessableEntityException throw
 *     * nextStage='drawing' + folder null → warn+skip
 *     * nextStage='drawing_confirmed' + folder OK → relocate 정상 호출
 *
 * 패턴: 기존 folders.service.spec.ts 와 동일하게 jest mock 기반.
 */

import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ContactFolderSyncService } from './contact-folder-sync.service';

const CONTACT_ID = '11111111-1111-1111-1111-111111111111';
const FOLDER_ID = 'folder-id-xyz';

interface FoldersServiceMock {
  ensureInquiryFolder: jest.Mock;
  renameInquiryFolderForContact: jest.Mock;
  relocateContactFiles: jest.Mock;
  ensureInquiryRootFolder: jest.Mock;
  initializeCompanyFolders: jest.Mock;
}

interface EventsGatewayMock {
  emitGlobal: jest.Mock;
}

interface PrismaMock {
  contact: { findUnique: jest.Mock };
}

function makeFoldersService(): FoldersServiceMock {
  return {
    ensureInquiryFolder: jest.fn(),
    renameInquiryFolderForContact: jest.fn().mockResolvedValue(undefined),
    relocateContactFiles: jest.fn().mockResolvedValue({ movedIds: [] }),
    ensureInquiryRootFolder: jest.fn(),
    initializeCompanyFolders: jest.fn().mockResolvedValue({ success: true }),
  };
}

function makeEventsGateway(): EventsGatewayMock {
  return { emitGlobal: jest.fn() };
}

function makePrisma(inquiryType: string | null = 'cutting_request'): PrismaMock {
  return {
    contact: {
      findUnique: jest.fn().mockResolvedValue({ inquiryType }),
    },
  };
}

/**
 * onProcessStageChanged 는 drawing_confirmed 전환 시 inquiryNumber/workNumber 을 검사한다.
 * 별도 의미 필드를 반환하는 prisma mock (findUnique select 에 맞게 필드 반환).
 */
function makePrismaWithNumbers(
  inquiryNumber: string | null,
  workNumber: string | null
): PrismaMock {
  return {
    contact: {
      findUnique: jest.fn().mockResolvedValue({ inquiryNumber, workNumber }),
    },
  };
}

function buildService(
  foldersService: FoldersServiceMock = makeFoldersService(),
  prisma: PrismaMock = makePrisma(),
  eventsGateway: EventsGatewayMock = makeEventsGateway()
) {
  const service = new ContactFolderSyncService(
    foldersService as never,
    prisma as never,
    eventsGateway as never
  );
  return { service, foldersService, prisma, eventsGateway };
}

describe('ContactFolderSyncService.onContactCreated', () => {
  it('inquiryType=null → no-op (ensureInquiryFolder 호출 없음)', async () => {
    const { service, foldersService } = buildService(makeFoldersService(), makePrisma(null));
    await service.onContactCreated({ contactId: CONTACT_ID });
    expect(foldersService.ensureInquiryFolder).not.toHaveBeenCalled();
    expect(foldersService.relocateContactFiles).not.toHaveBeenCalled();
  });

  it('inquiryType 확정 + folder 반환 → ensure → relocate 순서', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue({ id: FOLDER_ID });
    folders.relocateContactFiles.mockResolvedValue({ movedIds: ['f1'] });
    const { service } = buildService(folders, makePrisma('cutting_request'));

    await service.onContactCreated({ contactId: CONTACT_ID });

    expect(folders.ensureInquiryFolder).toHaveBeenCalledWith(CONTACT_ID, undefined);
    expect(folders.relocateContactFiles).toHaveBeenCalledWith(CONTACT_ID, FOLDER_ID, undefined);

    const ensureOrder = folders.ensureInquiryFolder.mock.invocationCallOrder[0];
    const relocateOrder = folders.relocateContactFiles.mock.invocationCallOrder[0];
    expect(ensureOrder).toBeLessThan(relocateOrder);
  });

  it('inquiryType 확정 + folder=null → relocate skip', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue(null);
    const { service } = buildService(folders, makePrisma('cutting_request'));

    await service.onContactCreated({ contactId: CONTACT_ID });

    expect(folders.ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(folders.relocateContactFiles).not.toHaveBeenCalled();
  });

  it('contact 미존재 → no-op', async () => {
    const folders = makeFoldersService();
    const prisma: PrismaMock = {
      contact: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const { service } = buildService(folders, prisma);

    await service.onContactCreated({ contactId: CONTACT_ID });

    expect(folders.ensureInquiryFolder).not.toHaveBeenCalled();
    expect(folders.relocateContactFiles).not.toHaveBeenCalled();
  });

  it('client(tx) 가 그대로 FoldersService 에 전파', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue({ id: FOLDER_ID });
    const prisma = makePrisma('cutting_request');
    const fakeTx = {
      contact: { findUnique: jest.fn().mockResolvedValue({ inquiryType: 'cutting_request' }) },
    } as never;
    const { service } = buildService(folders, prisma);

    await service.onContactCreated({ contactId: CONTACT_ID, client: fakeTx });

    expect(folders.ensureInquiryFolder).toHaveBeenCalledWith(CONTACT_ID, fakeTx);
    expect(folders.relocateContactFiles).toHaveBeenCalledWith(CONTACT_ID, FOLDER_ID, fakeTx);
  });
});

describe('ContactFolderSyncService.onInquiryTypeClassified', () => {
  it('항상 rename → ensure → relocate 순서', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue({ id: FOLDER_ID });
    folders.relocateContactFiles.mockResolvedValue({ movedIds: ['f1', 'f2'] });
    const { service } = buildService(folders);

    await service.onInquiryTypeClassified({ contactId: CONTACT_ID });

    expect(folders.renameInquiryFolderForContact).toHaveBeenCalledTimes(1);
    expect(folders.ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(folders.relocateContactFiles).toHaveBeenCalledTimes(1);

    const renameOrder = folders.renameInquiryFolderForContact.mock.invocationCallOrder[0];
    const ensureOrder = folders.ensureInquiryFolder.mock.invocationCallOrder[0];
    const relocateOrder = folders.relocateContactFiles.mock.invocationCallOrder[0];
    expect(renameOrder).toBeLessThan(ensureOrder);
    expect(ensureOrder).toBeLessThan(relocateOrder);
  });

  it('folder=null → warn+skip (throw 안 함)', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue(null);
    const { service } = buildService(folders);

    await expect(
      service.onInquiryTypeClassified({ contactId: CONTACT_ID })
    ).resolves.toBeUndefined();

    expect(folders.relocateContactFiles).not.toHaveBeenCalled();
  });

  it('client(tx) 전파', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue({ id: FOLDER_ID });
    const fakeTx = {} as never;
    const { service } = buildService(folders);

    await service.onInquiryTypeClassified({ contactId: CONTACT_ID, client: fakeTx });

    expect(folders.renameInquiryFolderForContact).toHaveBeenCalledWith(CONTACT_ID, fakeTx);
    expect(folders.ensureInquiryFolder).toHaveBeenCalledWith(CONTACT_ID, fakeTx);
    expect(folders.relocateContactFiles).toHaveBeenCalledWith(CONTACT_ID, FOLDER_ID, fakeTx);
  });
});

// ──────────────────────────────────────────────
// task 25 phase 3: Bug 3 회귀 가드 (U3)
//
// 스펙: docs/specs/features/contact-webhard-folder.md
//       (미가입 업체 = companyId=null Contact 도 폴더 생성/이동 정상 동작)
//
// 회귀 가드 의도:
//   - onInquiryTypeClassified 가 가입 업체 여부(companyId)에 따라 분기하지 않아야 한다.
//   - 미가입 업체 contact (companyId=null) 도 ensureInquiryFolder + relocateContactFiles
//     정상 호출되어, 폴더가 생성되고 파일이 이동되어야 한다.
//   - 본 service 자체에는 companyId 분기가 없으므로 현재 코드 그대로 PASS 한다.
//     (외부에서 가입 업체만 호출하는 식의 회귀가 발생할 경우, 본 단위 spec 으로는
//      잡지 못하나, 본 spec 은 service 단의 무차별 동작을 invariant 로 박제한다.)
// ──────────────────────────────────────────────
describe('ContactFolderSyncService — Bug 3 회귀 가드 (task 25 U3)', () => {
  it('U3: onInquiryTypeClassified — 미가입 업체 contact (companyId=null) 도 ensureInquiryFolder + relocateContactFiles 정상 호출', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue({ id: FOLDER_ID });
    folders.relocateContactFiles.mockResolvedValue({ movedIds: ['file-a', 'file-b'] });

    // 미가입 업체 contact: companyId=null, companyName='미가입업체',
    // inquiryType='cutting_request' 분류 확정 직후 시나리오.
    // service 는 companyId 를 직접 조회하지 않으므로 prisma mock 의 inquiryType 만 의미 있음.
    const prisma = makePrisma('cutting_request');
    const { service } = buildService(folders, prisma);

    await service.onInquiryTypeClassified({ contactId: CONTACT_ID });

    // companyId=null 분기가 service 에 없음을 검증 — 폴더 hook 3개 모두 정상 호출.
    expect(folders.renameInquiryFolderForContact).toHaveBeenCalledTimes(1);
    expect(folders.renameInquiryFolderForContact).toHaveBeenCalledWith(CONTACT_ID, undefined);

    expect(folders.ensureInquiryFolder).toHaveBeenCalledTimes(1);
    expect(folders.ensureInquiryFolder).toHaveBeenCalledWith(CONTACT_ID, undefined);

    expect(folders.relocateContactFiles).toHaveBeenCalledTimes(1);
    expect(folders.relocateContactFiles).toHaveBeenCalledWith(CONTACT_ID, FOLDER_ID, undefined);

    // rename → ensure → relocate 순서 invariant 도 같이 박제 (Bug 3 회귀 + 순서 회귀 동시 가드).
    const renameOrder = folders.renameInquiryFolderForContact.mock.invocationCallOrder[0];
    const ensureOrder = folders.ensureInquiryFolder.mock.invocationCallOrder[0];
    const relocateOrder = folders.relocateContactFiles.mock.invocationCallOrder[0];
    expect(renameOrder).toBeLessThan(ensureOrder);
    expect(ensureOrder).toBeLessThan(relocateOrder);
  });
});

describe('ContactFolderSyncService.onProcessStageChanged', () => {
  it('nextStage=drawing_confirmed + folder=null → UnprocessableEntityException throw', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue(null);
    const { service } = buildService(folders, makePrismaWithNumbers('O-1', null));

    await expect(
      service.onProcessStageChanged({
        contactId: CONTACT_ID,
        previousStage: 'drawing',
        nextStage: 'drawing_confirmed',
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(folders.relocateContactFiles).not.toHaveBeenCalled();
  });

  it('throw 시 응답 payload 에 code=FOLDER_CREATION_FAILED 포함', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue(null);
    const { service } = buildService(folders, makePrismaWithNumbers('O-1', null));

    try {
      await service.onProcessStageChanged({
        contactId: CONTACT_ID,
        previousStage: 'drawing',
        nextStage: 'drawing_confirmed',
      });
      fail('expected UnprocessableEntityException');
    } catch (err) {
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      const response = (err as UnprocessableEntityException).getResponse();
      expect(response).toMatchObject({
        code: 'FOLDER_CREATION_FAILED',
        contactId: CONTACT_ID,
      });
    }
  });

  it('nextStage=drawing + folder=null → warn+skip', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue(null);
    const { service } = buildService(folders);

    await expect(
      service.onProcessStageChanged({
        contactId: CONTACT_ID,
        previousStage: null,
        nextStage: 'drawing',
      })
    ).resolves.toBeUndefined();

    expect(folders.relocateContactFiles).not.toHaveBeenCalled();
  });

  it('nextStage=drawing_confirmed + folder OK → rename → ensure → relocate', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue({ id: FOLDER_ID });
    folders.relocateContactFiles.mockResolvedValue({ movedIds: ['fA'] });
    const { service } = buildService(folders, makePrismaWithNumbers('O-1', 'F-1'));

    await service.onProcessStageChanged({
      contactId: CONTACT_ID,
      previousStage: 'sample',
      nextStage: 'drawing_confirmed',
    });

    expect(folders.renameInquiryFolderForContact).toHaveBeenCalledWith(CONTACT_ID, undefined);
    expect(folders.ensureInquiryFolder).toHaveBeenCalledWith(CONTACT_ID, undefined);
    expect(folders.relocateContactFiles).toHaveBeenCalledWith(CONTACT_ID, FOLDER_ID, undefined);
  });

  // ──────────────────────────────────────────────
  // task 23 phase 5: INQUIRY_NUMBER_REQUIRED 가드
  // inquiryNumber/workNumber 둘 다 없는 Contact 는 drawing_confirmed 로 전환할 수 없다.
  // ──────────────────────────────────────────────
  it('nextStage=drawing_confirmed + inquiryNumber=null + workNumber=null → INQUIRY_NUMBER_REQUIRED throw', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue({ id: FOLDER_ID });
    const { service } = buildService(folders, makePrismaWithNumbers(null, null));

    try {
      await service.onProcessStageChanged({
        contactId: CONTACT_ID,
        previousStage: 'drawing',
        nextStage: 'drawing_confirmed',
      });
      fail('expected UnprocessableEntityException');
    } catch (err) {
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      const response = (err as UnprocessableEntityException).getResponse();
      expect(response).toMatchObject({
        code: 'INQUIRY_NUMBER_REQUIRED',
        contactId: CONTACT_ID,
      });
    }

    // 가드 단계에서 throw 되므로 폴더 훅은 호출 자체가 되지 않는다.
    expect(folders.renameInquiryFolderForContact).not.toHaveBeenCalled();
    expect(folders.ensureInquiryFolder).not.toHaveBeenCalled();
    expect(folders.relocateContactFiles).not.toHaveBeenCalled();
  });

  it('nextStage=drawing_confirmed + inquiryNumber=O, workNumber=null → 정상 진행', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue({ id: FOLDER_ID });
    const { service } = buildService(folders, makePrismaWithNumbers('O-1', null));

    await expect(
      service.onProcessStageChanged({
        contactId: CONTACT_ID,
        previousStage: 'drawing',
        nextStage: 'drawing_confirmed',
      })
    ).resolves.toBeUndefined();

    expect(folders.renameInquiryFolderForContact).toHaveBeenCalledTimes(1);
    expect(folders.ensureInquiryFolder).toHaveBeenCalledTimes(1);
  });

  it('nextStage=drawing_confirmed + inquiryNumber=null, workNumber=F → 정상 진행', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue({ id: FOLDER_ID });
    const { service } = buildService(folders, makePrismaWithNumbers(null, 'F-1'));

    await expect(
      service.onProcessStageChanged({
        contactId: CONTACT_ID,
        previousStage: 'drawing',
        nextStage: 'drawing_confirmed',
      })
    ).resolves.toBeUndefined();

    expect(folders.renameInquiryFolderForContact).toHaveBeenCalledTimes(1);
  });

  it('nextStage=drawing + 번호 둘 다 없음 → 가드 우회(중간 단계 허용) → warn+skip', async () => {
    const folders = makeFoldersService();
    folders.ensureInquiryFolder.mockResolvedValue(null);
    const { service } = buildService(folders, makePrismaWithNumbers(null, null));

    // 'drawing' 전환은 INQUIRY_NUMBER_REQUIRED 체크 대상이 아님.
    await expect(
      service.onProcessStageChanged({
        contactId: CONTACT_ID,
        previousStage: null,
        nextStage: 'drawing',
      })
    ).resolves.toBeUndefined();

    expect(folders.renameInquiryFolderForContact).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────
// task 24 phase 2: relocateAfterAliasApproved (C1~C3)
//
// 스펙: docs/specs/features/external-sync-company-folder.md §정책 — 폴더 위치
//       §불변 규칙 #1 (단일 진입점), Q5 (미분류 Contact skip)
//
// 검증:
//   C1: 외부 미통합 Contact 일괄 통합 — companyName/companyId 업데이트 + onContactCreated 위임
//       (트랜잭션 클라이언트 전파도 검증)
//   C2: 이미 통합된 Contact (companyId != null) → findMany where 조건으로 자동 제외
//   C3: inquiryType=null Contact → skipped 카운트 + onContactCreated 호출 안 함
// ──────────────────────────────────────────────

interface ReloPrismaMock {
  contact: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
  company: {
    findUnique: jest.Mock;
  };
}

function makeReloPrisma(
  targets: Array<{
    id: string;
    companyName: string;
    companyId: number | null;
    inquiryType: string | null;
  }>,
  company: { id: number; companyName: string } | null
): ReloPrismaMock {
  return {
    contact: {
      // onContactCreated 의 loadContactInquiryType 가 호출하는 findUnique. 본 spec 은
      // onContactCreated 를 spy 로 mock 하므로 실제 호출되지 않으나 안전을 위해 정의.
      findUnique: jest.fn().mockResolvedValue({ inquiryType: 'cutting_request' }),
      findMany: jest.fn().mockResolvedValue(targets),
      update: jest.fn().mockResolvedValue({}),
    },
    company: {
      findUnique: jest.fn().mockResolvedValue(company),
    },
  };
}

function spyOnContactFolderLoggerLog(service: ContactFolderSyncService) {
  const logger = (
    service as unknown as {
      logger: { log: (...args: unknown[]) => void };
    }
  ).logger;

  return jest.spyOn(logger, 'log').mockImplementation(() => undefined);
}

describe('ContactFolderSyncService.relocateAfterAliasApproved (task 24)', () => {
  it('C1: 외부 미통합 Contact 일괄 통합 — companyName/companyId 업데이트 + onContactCreated 위임 + tx 전파', async () => {
    const folders = makeFoldersService();
    const prisma = makeReloPrisma(
      [
        {
          id: 'contact-c1-a',
          companyName: '폴더명',
          companyId: null,
          inquiryType: 'cutting_request',
        },
        {
          id: 'contact-c1-b',
          companyName: '폴더명',
          companyId: null,
          inquiryType: 'mold_request',
        },
      ],
      { id: 7, companyName: '정규업체명' }
    );
    const service = new ContactFolderSyncService(
      folders as never,
      prisma as never,
      makeEventsGateway() as never
    );
    const onContactCreatedSpy = jest
      .spyOn(service, 'onContactCreated')
      .mockResolvedValue(undefined);

    // 트랜잭션 클라이언트 전파 검증을 위해 별도 tx 객체 전달
    const fakeTx = prisma as never;
    const result = await service.relocateAfterAliasApproved('폴더명', 7, fakeTx);

    // findMany where 조건: companyId=null + companyName insensitive equals
    expect(prisma.contact.findMany).toHaveBeenCalledTimes(1);
    const findManyArg = prisma.contact.findMany.mock.calls[0][0] as {
      where: { OR: unknown[]; companyId: null };
    };
    expect(findManyArg.where.companyId).toBeNull();
    expect(findManyArg.where.OR).toEqual(
      expect.arrayContaining([
        { companyName: '폴더명' },
        { companyName: { equals: '폴더명', mode: 'insensitive' } },
      ])
    );

    // company.findUnique 로 정규형 조회
    expect(prisma.company.findUnique).toHaveBeenCalledWith({ where: { id: 7 } });

    // 두 Contact 모두 companyName 정규형 + companyId 업데이트
    expect(prisma.contact.update).toHaveBeenCalledTimes(2);
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'contact-c1-a' },
      data: { companyName: '정규업체명', companyId: 7 },
    });
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'contact-c1-b' },
      data: { companyName: '정규업체명', companyId: 7 },
    });

    // onContactCreated 위임 — tx 전파 검증
    expect(onContactCreatedSpy).toHaveBeenCalledTimes(2);
    expect(onContactCreatedSpy).toHaveBeenCalledWith({
      contactId: 'contact-c1-a',
      client: fakeTx,
    });
    expect(onContactCreatedSpy).toHaveBeenCalledWith({
      contactId: 'contact-c1-b',
      client: fakeTx,
    });

    expect(result).toEqual({ relocated: 2, skipped: 0 });
  });

  it('C2: 이미 통합된 Contact (companyId != null) → findMany where 조건으로 자동 제외', async () => {
    const folders = makeFoldersService();
    // findMany 의 where 가 companyId=null 이므로 mock 도 빈 배열 반환 (DB 가 자동 제외)
    const prisma = makeReloPrisma([], { id: 7, companyName: '정규업체명' });
    const service = new ContactFolderSyncService(
      folders as never,
      prisma as never,
      makeEventsGateway() as never
    );
    const onContactCreatedSpy = jest
      .spyOn(service, 'onContactCreated')
      .mockResolvedValue(undefined);

    const result = await service.relocateAfterAliasApproved('폴더명', 7);

    // where 조건에 companyId: null 포함 검증 (이미 통합된 Contact 자동 제외)
    const findManyArg = prisma.contact.findMany.mock.calls[0][0] as {
      where: { companyId: null };
    };
    expect(findManyArg.where.companyId).toBeNull();

    // update / onContactCreated 호출 0회
    expect(prisma.contact.update).not.toHaveBeenCalled();
    expect(onContactCreatedSpy).not.toHaveBeenCalled();

    expect(result).toEqual({ relocated: 0, skipped: 0 });
  });

  it('C3 (task 26): inquiryType=null Contact 도 강제 통합 — companyId 갱신 + onContactCreated 미호출', async () => {
    // task 26 변경: 미분류 contact 도 companyId/companyName 갱신.
    // 폴더 정착은 후속 migrateExternalFolderTreeToCompany 가 처리하므로 여기서 onContactCreated 호출은 skip.
    const folders = makeFoldersService();
    const prisma = makeReloPrisma(
      [
        { id: 'contact-c3-a', companyName: '폴더명', companyId: null, inquiryType: null },
        { id: 'contact-c3-b', companyName: '폴더명', companyId: null, inquiryType: null },
      ],
      { id: 7, companyName: '정규업체명' }
    );
    const service = new ContactFolderSyncService(
      folders as never,
      prisma as never,
      makeEventsGateway() as never
    );
    const onContactCreatedSpy = jest
      .spyOn(service, 'onContactCreated')
      .mockResolvedValue(undefined);

    const result = await service.relocateAfterAliasApproved('폴더명', 7);

    // 미분류 contact 2건 모두 companyId/companyName 갱신.
    expect(prisma.contact.update).toHaveBeenCalledTimes(2);
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'contact-c3-a' },
      data: { companyName: '정규업체명', companyId: 7 },
    });
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'contact-c3-b' },
      data: { companyName: '정규업체명', companyId: 7 },
    });

    // 미분류이므로 폴더 hooks 위임은 skip — onContactCreated 호출 0회.
    expect(onContactCreatedSpy).not.toHaveBeenCalled();

    // skipped 의미 정정: "이미 companyId 가 채워진 contact" — findMany 조건으로 자동 제외되므로 0.
    expect(result).toEqual({ relocated: 2, skipped: 0 });
  });

  it('로그는 alias 원본 folderName/companyName 없이 집계값만 남긴다', async () => {
    const sensitiveFolderName = '대성목형(2265-1295)';
    const normalizedCompanyName = '대성목형';
    const folders = makeFoldersService();
    const prisma = makeReloPrisma(
      [
        {
          id: 'contact-log-a',
          companyName: sensitiveFolderName,
          companyId: null,
          inquiryType: null,
        },
      ],
      { id: 7, companyName: normalizedCompanyName }
    );
    const service = new ContactFolderSyncService(
      folders as never,
      prisma as never,
      makeEventsGateway() as never
    );
    const logSpy = spyOnContactFolderLoggerLog(service);

    await service.relocateAfterAliasApproved(sensitiveFolderName, 7);

    const serializedCalls = JSON.stringify(logSpy.mock.calls);
    expect(serializedCalls).not.toContain(sensitiveFolderName);
    expect(serializedCalls).not.toContain(normalizedCompanyName);

    const completedCall = logSpy.mock.calls.find(
      ([, message]) => message === 'relocateAfterAliasApproved completed'
    );
    expect(completedCall).toBeDefined();
    const [payload] = completedCall ?? [];
    expect(payload).toMatchObject({
      action: 'relocate_after_alias_approved',
      status: 'success',
      companyId: 7,
      targetCount: 1,
      relocatedCount: 1,
      skippedCount: 0,
    });
    expect(payload).not.toHaveProperty('folderName');
  });

  it('company 미존재 → NotFoundException throw (트랜잭션 롤백 트리거)', async () => {
    const folders = makeFoldersService();
    const prisma = makeReloPrisma([], null);
    const service = new ContactFolderSyncService(
      folders as never,
      prisma as never,
      makeEventsGateway() as never
    );

    await expect(service.relocateAfterAliasApproved('폴더명', 999)).rejects.toThrow(
      NotFoundException
    );
  });
});

// ──────────────────────────────────────────────
// task 26 phase 1: migrateExternalFolderTreeToCompany (M1~M9)
//
// 스펙: docs/specs/features/external-folder-migration.md
//       §정책 — 기존 누적분 통째 이전 (Phase 1)
//       §불변 규칙 (R2 key 불변, 단일 진입점, 멱등성)
//
// 검증:
//   M1: template 세그먼트 폴더 (`칼선의뢰`) 자식 병합 → 업체 동명 template 으로 자식 이동
//   M2: folderKind='inquiry' 폴더 → 업체 루트 하위 `문의/` 로 이동
//   M3: 임의 폴더 충돌 시 `(1)` rename
//   M4: 미분류 Contact 강제 이동 (companyId/companyName 갱신)
//   M5 (task 27 갱신): 외부 폴더 husk 유지 — cascade soft-delete 정책 제거
//   M6: 멱등 — 두 번째 호출 시 카운트 0
//   M7: external root 검증 실패 → BadRequestException
//   M8: WebhardFile.path (R2 key) 불변 — update 가 path 필드 포함하지 않음
//   M9: Contact 갱신 시 webhardFolderId 트리 + companyId IS NULL 조건
// ──────────────────────────────────────────────

interface MigratePrismaMock {
  contact: { findUnique: jest.Mock; updateMany: jest.Mock };
  company: { findUnique: jest.Mock };
  webhardFolder: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  webhardFile: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
}

interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
  path: string | null;
  companyId: number | null;
  folderKind: string;
  deletedAt: Date | null;
}

interface FileRow {
  id: string;
  folderId: string | null;
  companyId: number | null;
  deletedAt: Date | null;
  path: string;
}

/**
 * 폴더 트리 + 파일 시드 + 업체 정보를 받아 stateful 한 prisma mock 을 만든다.
 * findMany / update / updateMany / create 가 내부 state 를 갱신한다.
 *
 * resolveCompanyRoot 호환을 위해 company.findFirst / webhardFolder.findFirst 도 지원.
 * 단일 회사 시드, 단일 외부 root 시드 가정. 복잡한 시나리오는 별도 케이스에서 setup 추가.
 */
function makeMigratePrisma(setup: {
  folders: FolderRow[];
  files: FileRow[];
  contacts?: Array<{
    id: string;
    webhardFolderId: string | null;
    companyId: number | null;
  }>;
  company: { id: number; companyName: string } | null;
}): MigratePrismaMock {
  // 테스트 측에서 mutation 결과를 직접 검증하기 위해 input 배열을 그대로 공유.
  const folders: FolderRow[] = setup.folders;
  const files: FileRow[] = setup.files;
  const contacts = setup.contacts ?? [];

  const company = {
    findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: number } }) => {
      if (setup.company && setup.company.id === where.id) return setup.company;
      return null;
    }),
    // resolveCompanyRoot 의 1단계: companyName 일치 검색
    findFirst: jest
      .fn()
      .mockImplementation(async ({ where }: { where: { companyName: string } }) => {
        if (setup.company && setup.company.companyName === where.companyName) {
          return { id: setup.company.id };
        }
        return null;
      }),
  };

  const webhardFolder = {
    findUnique: jest
      .fn()
      .mockImplementation(
        async ({
          where,
          select: _select,
        }: {
          where: { id: string };
          select?: Record<string, boolean>;
        }) => {
          return folders.find((f) => f.id === where.id) ?? null;
        }
      ),
    findFirst: jest.fn().mockImplementation(async (args: { where: Record<string, unknown> }) => {
      const w = args.where as {
        parentId?: string | null;
        companyId?: number;
        name?: string;
        deletedAt?: null;
        folderKind?: { in: string[] };
      };
      const cands = folders.filter(
        (f) =>
          f.deletedAt === null &&
          (w.parentId === undefined || f.parentId === w.parentId) &&
          (w.name === undefined || f.name === w.name) &&
          (w.companyId === undefined || f.companyId === w.companyId) &&
          (w.folderKind === undefined || w.folderKind.in.includes(f.folderKind))
      );
      return cands[0] ?? null;
    }),
    findMany: jest.fn().mockImplementation(async (args: { where: Record<string, unknown> }) => {
      const w = args.where as {
        parentId?: string;
        deletedAt?: null;
        id?: { in: string[] };
        path?: { startsWith: string };
        OR?: Array<{ name?: string | { startsWith?: string } }>;
      };
      let res = folders.filter((f) => f.deletedAt === null);
      if (w.parentId !== undefined) res = res.filter((f) => f.parentId === w.parentId);
      if (w.id?.in) res = res.filter((f) => w.id!.in.includes(f.id));
      if (w.path?.startsWith) res = res.filter((f) => f.path?.startsWith(w.path!.startsWith));
      if (w.OR) {
        res = res.filter((f) =>
          w.OR!.some((cond) => {
            if (typeof cond.name === 'string') return f.name === cond.name;
            if (cond.name && typeof cond.name === 'object' && cond.name.startsWith) {
              return f.name.startsWith(cond.name.startsWith);
            }
            return false;
          })
        );
      }
      return res.map((f) => ({ ...f }));
    }),
    create: jest
      .fn()
      .mockImplementation(async ({ data }: { data: Partial<FolderRow> & { name: string } }) => {
        const created: FolderRow = {
          id: `created-${folders.length + 1}`,
          name: data.name,
          parentId: data.parentId ?? null,
          path: data.path ?? null,
          companyId: data.companyId ?? null,
          folderKind: data.folderKind ?? 'generic',
          deletedAt: null,
        };
        folders.push(created);
        return { ...created };
      }),
    update: jest
      .fn()
      .mockImplementation(
        async ({ where, data }: { where: { id: string }; data: Partial<FolderRow> }) => {
          const idx = folders.findIndex((f) => f.id === where.id);
          if (idx === -1) throw new Error(`Folder ${where.id} not found`);
          folders[idx] = { ...folders[idx], ...data };
          return { ...folders[idx] };
        }
      ),
    updateMany: jest
      .fn()
      .mockImplementation(
        async ({ where, data }: { where: { id?: { in: string[] } }; data: Partial<FolderRow> }) => {
          const targets = where.id?.in ?? [];
          let count = 0;
          for (const id of targets) {
            const idx = folders.findIndex((f) => f.id === id);
            if (idx !== -1) {
              folders[idx] = { ...folders[idx], ...data };
              count++;
            }
          }
          return { count };
        }
      ),
  };

  const webhardFile = {
    findMany: jest.fn().mockImplementation(async (args: { where: Record<string, unknown> }) => {
      const w = args.where as { folderId?: string | { in: string[] }; deletedAt?: null };
      let res = files.filter((f) => f.deletedAt === null);
      if (typeof w.folderId === 'string') res = res.filter((f) => f.folderId === w.folderId);
      else if (w.folderId && 'in' in w.folderId)
        res = res.filter(
          (f) => w.folderId && (w.folderId as { in: string[] }).in.includes(f.folderId ?? '')
        );
      return res.map((f) => ({ ...f }));
    }),
    updateMany: jest
      .fn()
      .mockImplementation(
        async ({
          where,
          data,
        }: {
          where: { id?: { in: string[] }; folderId?: { in: string[] }; deletedAt?: null };
          data: Partial<FileRow>;
        }) => {
          let targets = files.filter((f) => f.deletedAt === null);
          if (where.id?.in) targets = targets.filter((f) => where.id!.in.includes(f.id));
          if (where.folderId?.in)
            targets = targets.filter((f) => where.folderId!.in.includes(f.folderId ?? ''));
          for (const t of targets) {
            Object.assign(t, data);
          }
          return { count: targets.length };
        }
      ),
  };

  const contact = {
    findUnique: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockImplementation(
      async ({
        where,
        data,
      }: {
        where: {
          webhardFolderId?: { in: string[] };
          companyId?: null;
        };
        data: { companyId?: number; companyName?: string };
      }) => {
        let targets = contacts;
        if (where.webhardFolderId?.in)
          targets = targets.filter((c) =>
            where.webhardFolderId!.in.includes(c.webhardFolderId ?? '')
          );
        if (where.companyId === null) targets = targets.filter((c) => c.companyId === null);
        for (const t of targets) {
          if (data.companyId !== undefined) t.companyId = data.companyId;
        }
        return { count: targets.length };
      }
    ),
  };

  return {
    contact,
    company: company as unknown as MigratePrismaMock['company'],
    webhardFolder: webhardFolder as unknown as MigratePrismaMock['webhardFolder'],
    webhardFile: webhardFile as unknown as MigratePrismaMock['webhardFile'],
  };
}

const COMPANY_ID = 4;
const COMPANY_NAME = '대성목형';
const EXTERNAL_ROOT_ID = 'external-root-uuid';
const COMPANY_ROOT_ID = 'company-root-uuid';

function externalRootRow(): FolderRow {
  return {
    id: EXTERNAL_ROOT_ID,
    name: '대성목형(2265-1295)',
    parentId: 'webhard-external-root',
    path: '/외부웹하드/대성목형(2265-1295)',
    companyId: null,
    folderKind: 'generic',
    deletedAt: null,
  };
}

function companyRootRow(): FolderRow {
  return {
    id: COMPANY_ROOT_ID,
    name: COMPANY_NAME,
    parentId: null,
    path: `/${COMPANY_NAME}`,
    companyId: COMPANY_ID,
    folderKind: 'root',
    deletedAt: null,
  };
}

describe('ContactFolderSyncService.migrateExternalFolderTreeToCompany (task 26)', () => {
  it('M1 (task 27 갱신): template 세그먼트 (`칼선의뢰`) 자식 병합 → 업체 동명 template 으로 자식 이동, 외부 폴더 husk 유지', async () => {
    const folders: FolderRow[] = [
      externalRootRow(),
      {
        id: 'ext-cutting',
        name: '칼선의뢰',
        parentId: EXTERNAL_ROOT_ID,
        path: '/외부웹하드/대성목형(2265-1295)/칼선의뢰',
        companyId: null,
        folderKind: 'generic',
        deletedAt: null,
      },
      {
        id: 'ext-cutting-grand',
        name: 'O123',
        parentId: 'ext-cutting',
        path: '/외부웹하드/대성목형(2265-1295)/칼선의뢰/O123',
        companyId: null,
        folderKind: 'inquiry',
        deletedAt: null,
      },
      companyRootRow(),
      {
        // 업체 루트 동명 template 폴더 — 병합 대상
        id: 'company-cutting',
        name: '칼선의뢰',
        parentId: COMPANY_ROOT_ID,
        path: `/${COMPANY_NAME}/칼선의뢰`,
        companyId: COMPANY_ID,
        folderKind: 'template',
        deletedAt: null,
      },
    ];
    const prisma = makeMigratePrisma({
      folders,
      files: [],
      company: { id: COMPANY_ID, companyName: COMPANY_NAME },
    });
    const { service } = buildService(makeFoldersService(), prisma as never);
    const result = await service.migrateExternalFolderTreeToCompany(
      EXTERNAL_ROOT_ID,
      COMPANY_ID,
      prisma as never
    );

    // grandchild ('O123') 가 업체 '칼선의뢰' 하위로 이동
    const movedGrand = folders.find((f) => f.id === 'ext-cutting-grand');
    expect(movedGrand?.parentId).toBe('company-cutting');
    expect(movedGrand?.companyId).toBe(COMPANY_ID);
    expect(movedGrand?.path).toBe(`/${COMPANY_NAME}/칼선의뢰/O123`);

    // task 27 정책: 외부 폴더는 husk 로 유지 (cascade soft-delete 제거)
    const extCutting = folders.find((f) => f.id === 'ext-cutting');
    expect(extCutting?.deletedAt).toBeNull();
    const extRoot = folders.find((f) => f.id === EXTERNAL_ROOT_ID);
    expect(extRoot?.deletedAt).toBeNull();

    expect(result.movedFolders).toBeGreaterThanOrEqual(1);
    expect(result.deletedExternalFolders).toBe(0);
  });

  it('M2: folderKind=`inquiry` 직접 자식 → 업체 루트 하위 `문의/` 로 이동', async () => {
    const folders: FolderRow[] = [
      externalRootRow(),
      {
        id: 'ext-inquiry',
        name: 'O500',
        parentId: EXTERNAL_ROOT_ID,
        path: '/외부웹하드/대성목형(2265-1295)/O500',
        companyId: null,
        folderKind: 'inquiry',
        deletedAt: null,
      },
      companyRootRow(),
    ];
    const inquiryRoot: FolderRow = {
      id: 'company-inquiry-root',
      name: '문의',
      parentId: COMPANY_ROOT_ID,
      path: `/${COMPANY_NAME}/문의`,
      companyId: COMPANY_ID,
      folderKind: 'template',
      deletedAt: null,
    };
    const prisma = makeMigratePrisma({
      folders,
      files: [],
      company: { id: COMPANY_ID, companyName: COMPANY_NAME },
    });
    const foldersSvc = makeFoldersService();
    foldersSvc.ensureInquiryRootFolder.mockImplementation(async () => {
      // 시드 시점에 추가
      folders.push(inquiryRoot);
      return inquiryRoot;
    });
    const { service } = buildService(foldersSvc, prisma as never);

    const result = await service.migrateExternalFolderTreeToCompany(
      EXTERNAL_ROOT_ID,
      COMPANY_ID,
      prisma as never
    );

    // ensureInquiryRootFolder 호출됨
    expect(foldersSvc.ensureInquiryRootFolder).toHaveBeenCalledWith(
      COMPANY_ROOT_ID,
      COMPANY_ID,
      prisma
    );

    // inquiry 폴더 parentId 가 업체 '문의/' 로 이동
    const moved = folders.find((f) => f.id === 'ext-inquiry');
    expect(moved?.parentId).toBe('company-inquiry-root');
    expect(moved?.companyId).toBe(COMPANY_ID);
    expect(result.movedFolders).toBeGreaterThanOrEqual(1);
  });

  it('M3: 임의 폴더 충돌 시 `(1)` 자동 rename', async () => {
    const folders: FolderRow[] = [
      externalRootRow(),
      {
        id: 'ext-arb',
        name: '원본임의',
        parentId: EXTERNAL_ROOT_ID,
        path: '/외부웹하드/대성목형(2265-1295)/원본임의',
        companyId: null,
        folderKind: 'generic',
        deletedAt: null,
      },
      companyRootRow(),
      {
        // 업체 루트에 동명 폴더 이미 있음
        id: 'company-arb-existing',
        name: '원본임의',
        parentId: COMPANY_ROOT_ID,
        path: `/${COMPANY_NAME}/원본임의`,
        companyId: COMPANY_ID,
        folderKind: 'generic',
        deletedAt: null,
      },
    ];
    const prisma = makeMigratePrisma({
      folders,
      files: [],
      company: { id: COMPANY_ID, companyName: COMPANY_NAME },
    });
    const { service } = buildService(makeFoldersService(), prisma as never);

    const result = await service.migrateExternalFolderTreeToCompany(
      EXTERNAL_ROOT_ID,
      COMPANY_ID,
      prisma as never
    );

    expect(result.conflicts).toEqual([{ originalName: '원본임의', renamedTo: '원본임의 (1)' }]);
    const renamed = folders.find((f) => f.id === 'ext-arb');
    expect(renamed?.name).toBe('원본임의 (1)');
    expect(renamed?.path).toBe(`/${COMPANY_NAME}/원본임의 (1)`);
  });

  it('M4: 미분류 Contact 강제 통합 — webhardFolderId 트리 + companyId IS NULL 갱신', async () => {
    const folders: FolderRow[] = [externalRootRow(), companyRootRow()];
    const contacts = [
      { id: 'contact-A', webhardFolderId: EXTERNAL_ROOT_ID, companyId: null },
      // 이미 통합된 contact — 멱등 skip
      { id: 'contact-B', webhardFolderId: EXTERNAL_ROOT_ID, companyId: 99 },
    ];
    const prisma = makeMigratePrisma({
      folders,
      files: [],
      contacts,
      company: { id: COMPANY_ID, companyName: COMPANY_NAME },
    });
    const { service } = buildService(makeFoldersService(), prisma as never);

    await service.migrateExternalFolderTreeToCompany(EXTERNAL_ROOT_ID, COMPANY_ID, prisma as never);

    // companyId IS NULL contact 만 갱신
    const a = contacts.find((c) => c.id === 'contact-A');
    const b = contacts.find((c) => c.id === 'contact-B');
    expect(a?.companyId).toBe(COMPANY_ID);
    expect(b?.companyId).toBe(99); // 이미 통합된 것은 그대로
  });

  it('M5 (task 27 갱신): 외부 폴더는 husk 로 유지 (deletedAt=null) — cascade delete 정책 제거', async () => {
    const folders: FolderRow[] = [
      externalRootRow(),
      {
        id: 'ext-empty',
        name: '빈폴더',
        parentId: EXTERNAL_ROOT_ID,
        path: '/외부웹하드/대성목형(2265-1295)/빈폴더',
        companyId: null,
        folderKind: 'generic',
        deletedAt: null,
      },
      companyRootRow(),
    ];
    const prisma = makeMigratePrisma({
      folders,
      files: [],
      company: { id: COMPANY_ID, companyName: COMPANY_NAME },
    });
    const { service } = buildService(makeFoldersService(), prisma as never);

    const result = await service.migrateExternalFolderTreeToCompany(
      EXTERNAL_ROOT_ID,
      COMPANY_ID,
      prisma as never
    );

    // task 27 정책: 외부 폴더는 husk (빈 껍데기) 로 유지 — cascade soft-delete 제거
    // tryRouteExternalUpload routing 이 deletedAt=null 일 때만 lookup 가능하므로 삭제하지 않는다
    expect(result.deletedExternalFolders).toBe(0);

    const extRootAfter = folders.find((f) => f.id === EXTERNAL_ROOT_ID);
    expect(extRootAfter?.deletedAt).toBeNull();

    // '빈폴더' 는 업체 루트 직하로 이동했으므로 외부 root 의 직접 자식이 0개여야 함
    const childCount = folders.filter(
      (f) => f.parentId === EXTERNAL_ROOT_ID && f.deletedAt === null
    ).length;
    expect(childCount).toBe(0);
  });

  it('M6: 멱등 — 두 번째 호출 시 이미 soft-delete 된 root → BadRequestException', async () => {
    const folders: FolderRow[] = [
      { ...externalRootRow(), deletedAt: new Date() },
      companyRootRow(),
    ];
    const prisma = makeMigratePrisma({
      folders,
      files: [],
      company: { id: COMPANY_ID, companyName: COMPANY_NAME },
    });
    const { service } = buildService(makeFoldersService(), prisma as never);

    await expect(
      service.migrateExternalFolderTreeToCompany(EXTERNAL_ROOT_ID, COMPANY_ID, prisma as never)
    ).rejects.toThrow(BadRequestException);
  });

  it('M7: external root 검증 — `/외부웹하드/` 가 아닌 path → BadRequestException', async () => {
    const folders: FolderRow[] = [
      {
        ...externalRootRow(),
        path: '/다른경로/대성목형',
      },
      companyRootRow(),
    ];
    const prisma = makeMigratePrisma({
      folders,
      files: [],
      company: { id: COMPANY_ID, companyName: COMPANY_NAME },
    });
    const { service } = buildService(makeFoldersService(), prisma as never);

    await expect(
      service.migrateExternalFolderTreeToCompany(EXTERNAL_ROOT_ID, COMPANY_ID, prisma as never)
    ).rejects.toThrow(BadRequestException);
  });

  it('M8: WebhardFile.path (R2 key) 불변 — file updateMany 의 data 에 path 필드 미포함', async () => {
    const folders: FolderRow[] = [externalRootRow(), companyRootRow()];
    const files: FileRow[] = [
      {
        id: 'file-1',
        folderId: EXTERNAL_ROOT_ID,
        companyId: null,
        deletedAt: null,
        path: 'R2/key/외부웹하드/원본/file-1.dxf',
      },
    ];
    const prisma = makeMigratePrisma({
      folders,
      files,
      company: { id: COMPANY_ID, companyName: COMPANY_NAME },
    });
    const { service } = buildService(makeFoldersService(), prisma as never);

    await service.migrateExternalFolderTreeToCompany(EXTERNAL_ROOT_ID, COMPANY_ID, prisma as never);

    // 모든 webhardFile.updateMany 호출의 data 에 path 가 절대 포함되지 않아야 함
    const updateManyCalls = prisma.webhardFile.updateMany.mock.calls;
    for (const call of updateManyCalls) {
      const arg = call[0] as { data: Record<string, unknown> };
      expect(arg.data).not.toHaveProperty('path');
    }
    // R2 key (file.path) 그대로 유지
    expect(files[0].path).toBe('R2/key/외부웹하드/원본/file-1.dxf');
    // companyId / folderId 는 갱신
    expect(files[0].companyId).toBe(COMPANY_ID);
    expect(files[0].folderId).toBe(COMPANY_ROOT_ID);
  });

  it('M9: Contact.updateMany 호출 시 webhardFolderId 트리 + companyId IS NULL 조건 명시', async () => {
    const folders: FolderRow[] = [externalRootRow(), companyRootRow()];
    const prisma = makeMigratePrisma({
      folders,
      files: [],
      company: { id: COMPANY_ID, companyName: COMPANY_NAME },
    });
    const { service } = buildService(makeFoldersService(), prisma as never);

    await service.migrateExternalFolderTreeToCompany(EXTERNAL_ROOT_ID, COMPANY_ID, prisma as never);

    expect(prisma.contact.updateMany).toHaveBeenCalledTimes(1);
    const arg = prisma.contact.updateMany.mock.calls[0][0] as {
      where: { webhardFolderId: { in: string[] }; companyId: null };
      data: { companyId: number; companyName: string };
    };
    expect(arg.where.webhardFolderId.in).toContain(EXTERNAL_ROOT_ID);
    expect(arg.where.companyId).toBeNull();
    expect(arg.data).toEqual({ companyId: COMPANY_ID, companyName: COMPANY_NAME });
  });
});
