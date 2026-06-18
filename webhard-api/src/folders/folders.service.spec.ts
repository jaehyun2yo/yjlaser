/**
 * FoldersService 단위 테스트
 *
 * 스펙:
 *   - tasks/20-webhard-folder-policy-unify/phase1.md (중간 `문의/` 폴더 삽입)
 *   - tasks/19-worker-drawing-upload/phase1.md (업체 루트 직하 배치)
 *   - tasks/18-drawing-consistency/phase5.md (레거시)
 *
 * 검증 항목:
 *   - ensureInquiryRootFolder (task 20 신규):
 *     P1-1     : 업체 루트만 있을 때 `문의/` 폴더 lazy 생성 (folderKind='template')
 *     P1-2     : 이미 `문의/` 존재 시 findFirst hit, 중복 create 없음
 *   - ensureInquiryFolder (task 20 재설계):
 *     E1       : O 만 있을 때 `{O}` 이름 — parent 는 `문의/` 중간 폴더 (루트 아님)
 *     E2       : O + F 있을 때 `{O}_{F}` 이름
 *     E5       : 동일 contactId 재호출 → 기존 폴더 재사용 (create 없음)
 *     P1-3     : parent 가 inquiryRoot.id 여야 함 (루트 아님) — 핵심 구조 변경 검증
 *     P1-5     : 기존 업체(칼선의뢰·목형의뢰만 있음)에서 lazy `문의/` 생성 → 이어서 `{O}`
 *     NoNumber : inquiryNumber · workNumber 둘 다 null → null 반환
 *     NoCompany: companyName 없음 → null 반환
 *   - renameInquiryFolderForContact (task 19):
 *     E3       : 기존 `{O}` 폴더에 F 번호 추가 → `{O}_{F}` 로 rename (R2 key 무변경)
 *   - moveInquiryFolderToCompleted (task 19):
 *     E4       : 문의/완료 lazy 생성 + parentId 변경
 *     H7       : 이미 완료 하위에 있으면 no-op
 *   - initializeCompanyFolders (task 20: `문의` 추가):
 *     E6       : template (칼선의뢰, 목형의뢰, 문의) 폴더는 재호출 시 보존
 *     P1-4     : 신규 업체 초기화 시 `칼선의뢰`, `목형의뢰`, `문의` 모두 eager 생성
 *   - relocateContactFiles (task 18):
 *     webhardFileIds 로 연결된 파일 이동
 *     inquiryNumber/workNumber 매칭 파일 이동
 *     이미 target 에 있는 파일 skip
 *     path 재계산
 */

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StorageProvider } from '@prisma/client';
import { FoldersService } from './folders.service';
import type { SessionUser } from '../auth/auth.service';
import {
  buildWebhardFixtureCleanupWhere,
  buildWebhardFolderTreeFixture,
} from '../../test/helpers/test-utils';

const CONTACT_ID = '22222222-2222-2222-2222-222222222222';
const COMPANY_ID = 99;
const COMPANY_NAME = '거래처X';
const INQUIRY_NUMBER = '260417-O-002';
const WORK_NUMBER = '260420-F-004';
const ROOT_FOLDER_ID = 'root-folder-id';
const INQUIRY_FOLDER_ID = 'inquiry-folder-id';
const INQUIRY_ROOT_FOLDER_ID = 'inquiry-root-folder-id';

type FolderRow = {
  id: string;
  name: string;
  parentId: string | null;
  companyId: number | null;
  path: string | null;
  folderKind: string;
  contactId?: string | null;
  inquiryNumber?: string | null;
  workNumber?: string | null;
  deletedAt?: Date | null;
  storageProvider?: StorageProvider;
  driveFolderId?: string | null;
};

interface PrismaMock {
  contact: { findUnique: jest.Mock; update: jest.Mock };
  company: { findFirst: jest.Mock };
  webhardFolder: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  webhardFile: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  drawingRevision: { findMany: jest.Mock; findFirst: jest.Mock };
  executeWithRetry: jest.Mock;
  $transaction: jest.Mock;
  $executeRaw: jest.Mock;
  $queryRaw: jest.Mock;
}

function makePrisma(): PrismaMock {
  const prisma: PrismaMock = {
    contact: { findUnique: jest.fn(), update: jest.fn() },
    company: { findFirst: jest.fn() },
    webhardFolder: {
      findFirst: jest.fn(),
      findUnique: jest.fn(async (args?: { where?: { id?: string } }) => {
        const id = args?.where?.id;
        if (!id) return null;
        if (id === ROOT_FOLDER_ID) return rootFolderRow();
        if (id === INQUIRY_ROOT_FOLDER_ID) return inquiryRootFolderRow();
        return {
          id,
          name: id,
          parentId: null,
          companyId: null,
          path: `/${id}`,
          folderKind: 'generic',
          storageProvider: StorageProvider.R2,
          driveFolderId: null,
        };
      }),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    webhardFile: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    drawingRevision: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    executeWithRetry: jest.fn().mockImplementation(async (op: () => Promise<unknown>) => op()),
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest
      .fn()
      .mockImplementation(async (operation: ((tx: PrismaMock) => unknown) | Promise<unknown>[]) =>
        Array.isArray(operation) ? Promise.all(operation) : operation(prisma)
      ),
  };
  return prisma;
}

function makeContactsGateway() {
  return {
    emitFolderRenamed: jest.fn(),
    emitFileMoved: jest.fn(),
  };
}

function makeEventsGateway() {
  return { emitGlobal: jest.fn() };
}

function makeCacheManager() {
  return { get: jest.fn(), set: jest.fn(), del: jest.fn() };
}

function makeStorageService() {
  let sequence = 0;
  return {
    generateDriveIds: jest.fn(async (count: number) =>
      Array.from({ length: count }, () => {
        sequence += 1;
        return `drive-folder-${sequence}`;
      })
    ),
    createDriveFolder: jest.fn(async (input: { storageFolderId: string }) => ({
      storageFolderId: input.storageFolderId,
    })),
    renameDriveFolder: jest.fn().mockResolvedValue(undefined),
    moveDriveFolder: jest.fn().mockResolvedValue(undefined),
    trashDriveFolder: jest.fn().mockResolvedValue(undefined),
    restoreDriveFolder: jest.fn().mockResolvedValue(undefined),
  };
}

function buildService(prisma: PrismaMock = makePrisma()) {
  const contactsGateway = makeContactsGateway();
  const eventsGateway = makeEventsGateway();
  const cacheManager = makeCacheManager();
  const storageService = makeStorageService();
  const service = new FoldersService(
    prisma as never,
    eventsGateway as never,
    cacheManager as never,
    contactsGateway as never,
    undefined,
    undefined,
    undefined,
    storageService as never
  );
  return { service, prisma, contactsGateway, eventsGateway, cacheManager, storageService };
}

describe('FoldersService DB-only fast path', () => {
  it('getFolders 목록 조회는 Google Drive mutation API를 호출하지 않는다', async () => {
    const { service, prisma, storageService } = buildService();
    prisma.webhardFolder.findMany.mockResolvedValueOnce([
      {
        id: 'folder-1',
        name: '업체폴더',
        parentId: null,
        companyId: COMPANY_ID,
        path: '/업체폴더',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        deletedAt: null,
        company: null,
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFolderId: 'drive-folder-1',
      },
    ]);

    const result = await service.getFolders({ parentId: null } as never, {
      userId: 'company-user',
      userType: 'company',
      companyId: COMPANY_ID,
    });

    expect(result.folders).toHaveLength(1);
    expect(storageService.createDriveFolder).not.toHaveBeenCalled();
    expect(storageService.renameDriveFolder).not.toHaveBeenCalled();
    expect(storageService.moveDriveFolder).not.toHaveBeenCalled();
    expect(storageService.trashDriveFolder).not.toHaveBeenCalled();
    expect(storageService.restoreDriveFolder).not.toHaveBeenCalled();
  });
});

describe('FoldersService.createFolder authorization', () => {
  it('rejects company users before creating folders', async () => {
    const { service, prisma } = buildService();
    const companyUser: SessionUser = {
      userId: 5,
      userType: 'company',
      companyId: 5,
    };

    await expect(
      service.createFolder({ name: '업체 생성 시도' }, companyUser)
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.webhardFolder.create).not.toHaveBeenCalled();
  });

  it('inherits parent companyId when an admin creates a child folder under a company folder', async () => {
    const { service, prisma } = buildService();
    const adminUser: SessionUser = {
      userId: 1,
      userType: 'admin',
      companyId: null,
    };
    prisma.webhardFolder.findUnique.mockResolvedValue({
      id: 'parent-folder',
      name: '업체 루트',
      parentId: null,
      companyId: 7,
      path: '/업체 루트',
      deletedAt: null,
    });
    prisma.webhardFolder.findFirst.mockResolvedValueOnce(null);
    prisma.webhardFolder.create.mockResolvedValueOnce({
      id: 'child-folder',
      name: '관리자 생성',
      parentId: 'parent-folder',
      companyId: 7,
      path: '/업체 루트/관리자 생성',
      createdAt: new Date('2026-05-11T00:00:00.000Z'),
      updatedAt: new Date('2026-05-11T00:00:00.000Z'),
      deletedAt: null,
      company: { companyName: '테스트 업체' },
    });

    await service.createFolder({ name: '관리자 생성', parentId: 'parent-folder' }, adminUser);

    expect(prisma.webhardFolder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 7 }),
      })
    );
    expect(prisma.webhardFolder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 7 }),
      })
    );
  });

  it('Drive folder creation failure prevents DB folder creation', async () => {
    const { service, prisma, storageService } = buildService();
    const adminUser: SessionUser = {
      userId: 1,
      userType: 'admin',
      companyId: null,
    };
    prisma.webhardFolder.findFirst.mockResolvedValueOnce(null);
    storageService.createDriveFolder.mockRejectedValueOnce(new Error('drive create failed'));

    await expect(service.createFolder({ name: 'Drive 실패' }, adminUser)).rejects.toThrow(
      'drive create failed'
    );

    expect(storageService.generateDriveIds).toHaveBeenCalledTimes(1);
    expect(prisma.webhardFolder.create).not.toHaveBeenCalled();
  });
});

describe('FoldersService.moveFolder authorization', () => {
  it('rejects company users before reading or moving folders', async () => {
    const { service, prisma } = buildService();
    const companyUser: SessionUser = {
      userId: 5,
      userType: 'company',
      companyId: 5,
    };

    await expect(
      service.moveFolder('folder-company-move-attempt', { parentId: 'target-folder' }, companyUser)
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.executeWithRetry).not.toHaveBeenCalled();
    expect(prisma.webhardFolder.update).not.toHaveBeenCalled();
  });
});

describe('FoldersService.deleteFolder company root policy', () => {
  it('업체 루트 폴더 직접 삭제를 차단하고 업체 상세 이동 정보를 반환한다', async () => {
    const { service, prisma } = buildService();
    const adminUser: SessionUser = {
      userId: 1,
      userType: 'admin',
      companyId: null,
    };
    prisma.webhardFolder.findUnique.mockResolvedValue({
      id: 'company-root-folder',
      name: '거래처X',
      parentId: null,
      companyId: COMPANY_ID,
      path: '/거래처X',
      deletedAt: null,
      storageProvider: 'GOOGLE_DRIVE',
      driveFolderId: 'drive-root-folder',
      company: { companyName: COMPANY_NAME },
    });

    try {
      await service.deleteFolder('company-root-folder', adminUser);
      throw new Error('Expected deleteFolder to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({
          code: 'COMPANY_ROOT_FOLDER_DELETE_BLOCKED',
          companyId: COMPANY_ID,
          companyName: COMPANY_NAME,
          folderName: '거래처X',
          redirectTo: `/admin/companies/${COMPANY_ID}`,
        })
      );
    }
    expect(prisma.webhardFolder.updateMany).not.toHaveBeenCalled();
  });
});

describe('FoldersService.batchDeleteFolders performance', () => {
  const adminUser: SessionUser = {
    userId: 1,
    userType: 'admin',
    companyId: null,
  };

  it('선택 폴더 path 하위만 조회하고 전체 폴더 parent map 조회를 피한다', async () => {
    const { service, prisma, storageService } = buildService();
    prisma.webhardFolder.findMany
      .mockResolvedValueOnce([
        {
          id: 'folder-root',
          name: 'Root',
          parentId: null,
          companyId: null,
          path: '/Root',
          deletedAt: null,
          storageProvider: StorageProvider.R2,
          driveFolderId: null,
          company: null,
        },
      ])
      .mockResolvedValueOnce([
        { id: 'folder-root' },
        { id: 'folder-child' },
        { id: 'folder-grandchild' },
      ]);
    prisma.webhardFolder.updateMany.mockResolvedValueOnce({ count: 3 });
    prisma.webhardFile.updateMany.mockResolvedValueOnce({ count: 5 });

    const result = await service.batchDeleteFolders(['folder-root'], adminUser);

    expect(result.foldersDeleted).toBe(3);
    expect(result.filesDeleted).toBe(5);
    expect(storageService.trashDriveFolder).not.toHaveBeenCalled();
    expect(prisma.webhardFolder.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          OR: expect.arrayContaining([
            { id: { in: ['folder-root'] } },
            { path: { startsWith: '/Root/' } },
          ]),
        }),
        select: { id: true },
      })
    );
    expect(prisma.webhardFolder.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, parentId: true },
      })
    );
  });
});

describe('AUDIT-06 webhard folder performance fixture helpers', () => {
  it('10k 폴더 성능 fixture를 만들 수 있는 deterministic tree helper를 제공한다', () => {
    const fixture = buildWebhardFolderTreeFixture({
      prefix: 'perf-audit06',
      totalFolders: 10,
      childrenPerFolder: 3,
      companyId: 7,
    });

    expect(fixture).toHaveLength(10);
    expect(fixture[0]).toMatchObject({
      id: 'perf-audit06-folder-000000',
      name: 'perf-audit06-root-000000',
      parentId: null,
      companyId: 7,
      path: '/perf-audit06-root-000000',
      folderKind: 'root',
    });
    expect(fixture[1]?.parentId).toBe('perf-audit06-folder-000000');
    expect(
      buildWebhardFolderTreeFixture({
        prefix: 'perf-audit06',
        totalFolders: 10,
        childrenPerFolder: 3,
        companyId: 7,
      })
    ).toEqual(fixture);
  });

  it('fixture cleanup은 안전한 prefix 조건으로만 where 절을 만든다', () => {
    expect(buildWebhardFixtureCleanupWhere('perf-audit06')).toEqual({
      name: { startsWith: 'perf-audit06' },
    });
    expect(() => buildWebhardFixtureCleanupWhere('test')).toThrow('Unsafe fixture prefix');
  });
});

describe('AUDIT-07 lazy folder loading contract', () => {
  const adminUser: SessionUser = {
    userId: 1,
    userType: 'admin',
    companyId: null,
  };

  it('parentId 미지정 기본 조회는 전체 트리가 아니라 root 폴더만 조회한다', async () => {
    const { service, prisma } = buildService();
    prisma.webhardFolder.findMany.mockResolvedValueOnce([]);

    await service.getFolders({}, adminUser);

    expect(prisma.webhardFolder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          parentId: null,
        }),
      })
    );
  });

  it('integration API key principal은 일반 폴더 목록을 전체 조회할 수 없다', async () => {
    const { service, prisma } = buildService();
    const integrationUser: SessionUser = {
      userId: 'api:sync',
      userType: 'integration',
      companyId: null,
      programType: 'sync',
      permissions: ['folders:read'],
    };

    await expect(service.getFolders({}, integrationUser)).rejects.toThrow(ForbiddenException);
    expect(prisma.webhardFolder.findMany).not.toHaveBeenCalled();
  });

  it('parentId 지정 조회는 해당 폴더의 직계 자식만 조회한다', async () => {
    const { service, prisma } = buildService();
    prisma.webhardFolder.findMany.mockResolvedValueOnce([]);

    await service.getFolders({ parentId: '11111111-1111-4111-8111-111111111111' }, adminUser);

    expect(prisma.webhardFolder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          parentId: '11111111-1111-4111-8111-111111111111',
        }),
      })
    );
  });

  it('업체 사용자는 자기 업체 부모 폴더 아래의 legacy companyId null 하위 폴더도 조회한다', async () => {
    const { service, prisma } = buildService();
    const companyUser: SessionUser = {
      userId: 7,
      userType: 'company',
      companyId: 7,
    };
    prisma.webhardFolder.findUnique.mockResolvedValueOnce({
      id: 'company-parent',
      name: '업체 루트',
      parentId: null,
      companyId: 7,
      path: '/업체 루트',
      deletedAt: null,
    });
    prisma.webhardFolder.findMany.mockResolvedValueOnce([
      {
        id: 'legacy-child',
        name: '관리자 생성',
        parentId: 'company-parent',
        companyId: null,
        path: '/업체 루트/관리자 생성',
        createdAt: new Date('2026-05-11T00:00:00.000Z'),
        updatedAt: new Date('2026-05-11T00:00:00.000Z'),
        deletedAt: null,
        company: null,
      },
    ]);

    const result = await service.getFolders({ parentId: 'company-parent' }, companyUser);

    expect(prisma.webhardFolder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          parentId: 'company-parent',
          AND: expect.arrayContaining([{ OR: [{ companyId: 7 }, { companyId: null }] }]),
        }),
      })
    );
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0]?.id).toBe('legacy-child');
  });

  it('전체 트리 호환 조회는 includeAll 명시 옵션이 있을 때만 parentId 필터를 생략한다', async () => {
    const { service, prisma } = buildService();
    prisma.webhardFolder.findMany.mockResolvedValueOnce([]);

    await service.getFolders({ includeAll: true }, adminUser);

    expect(prisma.webhardFolder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          NOT: {
            storageProvider: StorageProvider.GOOGLE_DRIVE,
            driveFolderId: null,
          },
        },
      })
    );
  });

  it('폴더 목록 응답에 window query로 하위 파일 최신 업로드일과 업로더를 포함한다', async () => {
    const { service, prisma } = buildService();
    const rootCreatedAt = new Date('2026-05-01T00:00:00.000Z');
    const emptyCreatedAt = new Date('2026-05-02T00:00:00.000Z');

    prisma.webhardFolder.findMany
      .mockResolvedValueOnce([
        {
          id: 'root-folder',
          name: '루트 폴더',
          parentId: null,
          companyId: 7,
          path: '/루트 폴더',
          createdAt: rootCreatedAt,
          updatedAt: rootCreatedAt,
          deletedAt: null,
          company: { companyName: '테스트업체' },
        },
        {
          id: 'empty-folder',
          name: '빈 폴더',
          parentId: null,
          companyId: 7,
          path: '/빈 폴더',
          createdAt: emptyCreatedAt,
          updatedAt: emptyCreatedAt,
          deletedAt: null,
          company: { companyName: '테스트업체' },
        },
      ])
      .mockResolvedValueOnce([
        { id: 'root-folder', parentId: null, companyId: 7 },
        { id: 'child-folder', parentId: 'root-folder', companyId: 7 },
        { id: 'empty-folder', parentId: null, companyId: 7 },
      ]);
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        root_id: 'root-folder',
        folder_id: 'child-folder',
        created_at: new Date('2026-05-10T00:00:00.000Z'),
        uploaded_by: 'admin',
        company_name: null,
      },
    ]);
    prisma.webhardFile.findMany.mockResolvedValueOnce([
      {
        folderId: 'should-not-be-loaded',
        createdAt: new Date('2026-05-10T00:00:00.000Z'),
        uploadedBy: 'admin',
        company: null,
      },
    ]);

    const result = await service.getFolders({}, adminUser);

    expect(result.folders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'root-folder',
          latest_file_created_at: '2026-05-10T00:00:00.000Z',
          latest_file_uploader_display_name: '관리자',
        }),
        expect.objectContaining({
          id: 'empty-folder',
          latest_file_created_at: null,
          latest_file_uploader_display_name: null,
        }),
      ])
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.webhardFile.findMany).not.toHaveBeenCalled();
  });
});

describe('AUDIT-10 folder path prefix updates', () => {
  const adminUser: SessionUser = {
    userId: 1,
    userType: 'admin',
    companyId: null,
  };
  const now = new Date('2026-05-10T00:00:00.000Z');

  function makeFolder(overrides: Partial<FolderRow & { createdAt: Date; updatedAt: Date }> = {}) {
    return {
      id: 'folder-old',
      name: '기존',
      parentId: 'parent-folder',
      companyId: null,
      path: '/상위/기존',
      folderKind: 'generic',
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  function sqlCall(prisma: PrismaMock) {
    return prisma.$executeRaw.mock.calls[0]?.[0] as
      | { strings?: readonly string[]; values?: readonly unknown[] }
      | undefined;
  }

  it('renameFolder는 descendants path를 재귀 SELECT/UPDATE 대신 transaction 안의 prefix 치환으로 갱신한다', async () => {
    const prisma = makePrisma();
    const { service } = buildService(prisma);
    const folder = makeFolder();
    const updated = makeFolder({ name: '변경', path: '/상위/변경' });

    prisma.webhardFolder.findUnique
      .mockResolvedValueOnce(folder)
      .mockResolvedValueOnce({ path: '/상위', name: '상위', parentId: null });
    prisma.webhardFolder.findFirst.mockResolvedValueOnce(null);
    prisma.webhardFolder.update.mockResolvedValueOnce(updated);
    prisma.$executeRaw.mockResolvedValueOnce(5000);

    await service.renameFolder(folder.id, { name: '변경' }, adminUser);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.webhardFolder.update).toHaveBeenCalledTimes(1);
    expect(prisma.webhardFolder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: folder.id },
        data: { name: '변경', path: '/상위/변경' },
      })
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.webhardFolder.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { parentId: folder.id, deletedAt: null } })
    );
    const raw = sqlCall(prisma);
    expect(raw?.values).toEqual(expect.arrayContaining(['/상위/변경', '/상위/기존']));
    expect(raw?.strings?.join('')).toContain('left("path"');
  });

  it('moveFolder는 sibling prefix 오염을 막도록 slash-boundary 조건으로 descendants path를 갱신한다', async () => {
    const prisma = makePrisma();
    const { service, cacheManager } = buildService(prisma);
    const folder = makeFolder({ id: 'folder-moving', path: '/상위/기존' });
    const target = makeFolder({
      id: 'target-folder',
      name: '대상',
      parentId: null,
      path: '/대상',
    });
    const updated = makeFolder({
      id: 'folder-moving',
      parentId: 'target-folder',
      path: '/대상/기존',
    });
    cacheManager.get.mockResolvedValueOnce([
      { id: 'folder-moving', parentId: 'parent-folder', companyId: null },
      { id: 'target-folder', parentId: null, companyId: null },
    ]);
    prisma.webhardFolder.findUnique
      .mockResolvedValueOnce(folder)
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce({ path: '/대상', name: '대상', parentId: null });
    prisma.webhardFolder.findMany.mockResolvedValueOnce([]);
    prisma.webhardFolder.update.mockResolvedValueOnce(updated);
    prisma.$executeRaw.mockResolvedValueOnce(5000);

    await service.moveFolder(folder.id, { parentId: target.id }, adminUser);

    const raw = sqlCall(prisma);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(raw?.values).toEqual(expect.arrayContaining(['/대상/기존', '/상위/기존']));
    expect(raw?.strings?.join('')).toContain('substring("path" from');
    expect(raw?.strings?.join('')).toContain("= '/'");
  });

  it('descendant prefix 치환 실패 시 folder event/cache invalidation을 실행하지 않는다', async () => {
    const prisma = makePrisma();
    const { service, eventsGateway, cacheManager } = buildService(prisma);
    const folder = makeFolder();

    prisma.webhardFolder.findUnique
      .mockResolvedValueOnce(folder)
      .mockResolvedValueOnce({ path: '/상위', name: '상위', parentId: null });
    prisma.webhardFolder.findFirst.mockResolvedValueOnce(null);
    prisma.webhardFolder.update.mockResolvedValueOnce(makeFolder({ name: '변경' }));
    prisma.$executeRaw.mockRejectedValueOnce(new Error('raw failed'));

    await expect(service.renameFolder(folder.id, { name: '변경' }, adminUser)).rejects.toThrow(
      'raw failed'
    );
    expect(eventsGateway.emitGlobal).not.toHaveBeenCalled();
    expect(cacheManager.del).not.toHaveBeenCalled();
  });
});

function contactRow(
  overrides: {
    inquiryNumber?: string | null;
    workNumber?: string | null;
    inquiryType?: string | null;
    companyName?: string | null;
  } = {}
) {
  return {
    id: CONTACT_ID,
    companyName: COMPANY_NAME,
    inquiryNumber: overrides.inquiryNumber ?? null,
    workNumber: overrides.workNumber ?? null,
    inquiryType: overrides.inquiryType ?? null,
  };
}

function rootFolderRow(): FolderRow {
  return {
    id: ROOT_FOLDER_ID,
    name: COMPANY_NAME,
    parentId: null,
    companyId: COMPANY_ID,
    path: `/${COMPANY_NAME}`,
    folderKind: 'root',
    storageProvider: StorageProvider.R2,
    driveFolderId: null,
  };
}

function inquiryRootFolderRow(): FolderRow {
  return {
    id: INQUIRY_ROOT_FOLDER_ID,
    name: '문의',
    parentId: ROOT_FOLDER_ID,
    companyId: COMPANY_ID,
    path: `/${COMPANY_NAME}/문의`,
    folderKind: 'template',
    storageProvider: StorageProvider.R2,
    driveFolderId: null,
  };
}

function inquiryFolderRow(name: string, opts: Partial<FolderRow> = {}): FolderRow {
  return {
    id: INQUIRY_FOLDER_ID,
    name,
    parentId: INQUIRY_ROOT_FOLDER_ID,
    companyId: COMPANY_ID,
    path: `/${COMPANY_NAME}/문의/${name}`,
    folderKind: 'inquiry',
    contactId: CONTACT_ID,
    inquiryNumber: null,
    workNumber: null,
    deletedAt: null,
    ...opts,
  };
}

// ══════════════════════════════════════════════════════════════
// ensureInquiryFolder (task 19: 업체 루트 직하)
// ══════════════════════════════════════════════════════════════

describe('FoldersService.ensureInquiryFolder', () => {
  it('E1: O 만 있을 때 `{O}` 이름으로 중간 `문의/` 폴더 하위 생성', async () => {
    const { service, prisma, contactsGateway } = buildService();
    // findFirst 순서: inquiry (null) → root (ensureInquiryFolder) → root (ensureInquiryRootFolder) → 문의 root (existing)
    prisma.webhardFolder.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(rootFolderRow())
      .mockResolvedValueOnce(inquiryRootFolderRow());
    prisma.contact.findUnique.mockResolvedValue(
      contactRow({ inquiryNumber: INQUIRY_NUMBER, inquiryType: 'cutting_request' })
    );
    prisma.company.findFirst.mockResolvedValue({ id: COMPANY_ID, companyName: COMPANY_NAME });
    prisma.webhardFolder.create.mockResolvedValue(
      inquiryFolderRow(INQUIRY_NUMBER, {
        parentId: INQUIRY_ROOT_FOLDER_ID,
        inquiryNumber: INQUIRY_NUMBER,
      })
    );

    const result = await service.ensureInquiryFolder(CONTACT_ID);

    expect(result).not.toBeNull();
    expect(result?.name).toBe(INQUIRY_NUMBER);
    expect(result?.folderKind).toBe('inquiry');
    expect(result?.contactId).toBe(CONTACT_ID);
    const createCall = prisma.webhardFolder.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.name).toBe(INQUIRY_NUMBER);
    expect(createCall.data.parentId).toBe(INQUIRY_ROOT_FOLDER_ID);
    expect(createCall.data.folderKind).toBe('inquiry');
    expect(createCall.data.inquiryNumber).toBe(INQUIRY_NUMBER);
    expect(createCall.data.contactId).toBe(CONTACT_ID);
    // create 이벤트 emit (oldName='')
    expect(contactsGateway.emitFolderRenamed).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
      folderId: INQUIRY_FOLDER_ID,
      oldName: '',
      newName: INQUIRY_NUMBER,
    });
  });

  it('E2: O + F 있을 때 `{O}_{F}` 이름으로 생성', async () => {
    const { service, prisma } = buildService();
    prisma.webhardFolder.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(rootFolderRow())
      .mockResolvedValueOnce(inquiryRootFolderRow());
    prisma.contact.findUnique.mockResolvedValue(
      contactRow({
        inquiryNumber: INQUIRY_NUMBER,
        workNumber: WORK_NUMBER,
        inquiryType: 'cutting_request',
      })
    );
    prisma.company.findFirst.mockResolvedValue({ id: COMPANY_ID, companyName: COMPANY_NAME });
    prisma.webhardFolder.create.mockResolvedValue(
      inquiryFolderRow(`${INQUIRY_NUMBER}_${WORK_NUMBER}`, {
        parentId: INQUIRY_ROOT_FOLDER_ID,
        inquiryNumber: INQUIRY_NUMBER,
        workNumber: WORK_NUMBER,
      })
    );

    const result = await service.ensureInquiryFolder(CONTACT_ID);

    expect(result?.name).toBe(`${INQUIRY_NUMBER}_${WORK_NUMBER}`);
    const createCall = prisma.webhardFolder.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.name).toBe(`${INQUIRY_NUMBER}_${WORK_NUMBER}`);
    expect(createCall.data.parentId).toBe(INQUIRY_ROOT_FOLDER_ID);
    expect(createCall.data.inquiryNumber).toBe(INQUIRY_NUMBER);
    expect(createCall.data.workNumber).toBe(WORK_NUMBER);
  });

  it('E5: 동일 contactId 재호출 시 기존 폴더 재사용 (create/update 없음)', async () => {
    const { service, prisma, contactsGateway } = buildService();
    const existing = inquiryFolderRow(INQUIRY_NUMBER, {
      parentId: INQUIRY_ROOT_FOLDER_ID,
      inquiryNumber: INQUIRY_NUMBER,
    });
    prisma.webhardFolder.findFirst.mockResolvedValueOnce(existing);

    const result = await service.ensureInquiryFolder(CONTACT_ID);

    expect(result?.id).toBe(INQUIRY_FOLDER_ID);
    expect(result?.name).toBe(INQUIRY_NUMBER);
    expect(prisma.webhardFolder.create).not.toHaveBeenCalled();
    expect(prisma.webhardFolder.update).not.toHaveBeenCalled();
    // task 29 Phase 2: existing 분기에서도 syncContactWebhardFolderId 호출되어
    // contact.findUnique 가 호출됨. contact.update 는 mock 없으므로 호출되지 않음.
    expect(prisma.contact.update).not.toHaveBeenCalled();
    expect(contactsGateway.emitFolderRenamed).not.toHaveBeenCalled();
  });

  it('번호 모두 null → null 반환 (폴더 생성 불가)', async () => {
    const { service, prisma } = buildService();
    prisma.webhardFolder.findFirst.mockResolvedValueOnce(null);
    prisma.contact.findUnique.mockResolvedValue(
      contactRow({ inquiryNumber: null, workNumber: null, inquiryType: 'cutting_request' })
    );

    const result = await service.ensureInquiryFolder(CONTACT_ID);

    expect(result).toBeNull();
    expect(prisma.webhardFolder.create).not.toHaveBeenCalled();
  });

  it('companyName 부재 → null 반환', async () => {
    const { service, prisma } = buildService();
    prisma.webhardFolder.findFirst.mockResolvedValueOnce(null);
    prisma.contact.findUnique.mockResolvedValue(
      contactRow({
        inquiryNumber: INQUIRY_NUMBER,
        inquiryType: 'cutting_request',
        companyName: null,
      })
    );

    const result = await service.ensureInquiryFolder(CONTACT_ID);

    expect(result).toBeNull();
  });

  it('inquiryType=null 이어도 번호만 있으면 폴더 생성 (task 19: inquiryType 무관)', async () => {
    const { service, prisma } = buildService();
    prisma.webhardFolder.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(rootFolderRow())
      .mockResolvedValueOnce(inquiryRootFolderRow());
    prisma.contact.findUnique.mockResolvedValue(
      contactRow({ inquiryNumber: INQUIRY_NUMBER, inquiryType: null })
    );
    prisma.company.findFirst.mockResolvedValue({ id: COMPANY_ID, companyName: COMPANY_NAME });
    prisma.webhardFolder.create.mockResolvedValue(
      inquiryFolderRow(INQUIRY_NUMBER, { parentId: INQUIRY_ROOT_FOLDER_ID })
    );

    const result = await service.ensureInquiryFolder(CONTACT_ID);

    expect(result).not.toBeNull();
    expect(result?.name).toBe(INQUIRY_NUMBER);
  });

  it('P1-3: ensureInquiryFolder — 생성되는 폴더의 parent 는 `문의/` (루트 아님)', async () => {
    const { service, prisma } = buildService();
    prisma.webhardFolder.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(rootFolderRow())
      .mockResolvedValueOnce(inquiryRootFolderRow());
    prisma.contact.findUnique.mockResolvedValue(
      contactRow({ inquiryNumber: INQUIRY_NUMBER, inquiryType: 'cutting_request' })
    );
    prisma.company.findFirst.mockResolvedValue({ id: COMPANY_ID, companyName: COMPANY_NAME });
    prisma.webhardFolder.create.mockResolvedValue(
      inquiryFolderRow(INQUIRY_NUMBER, {
        parentId: INQUIRY_ROOT_FOLDER_ID,
        inquiryNumber: INQUIRY_NUMBER,
      })
    );

    const result = await service.ensureInquiryFolder(CONTACT_ID);

    expect(result?.parentId).toBe(INQUIRY_ROOT_FOLDER_ID);
    expect(result?.parentId).not.toBe(ROOT_FOLDER_ID);
    const createCall = prisma.webhardFolder.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.parentId).toBe(INQUIRY_ROOT_FOLDER_ID);
    expect(createCall.data.parentId).not.toBe(ROOT_FOLDER_ID);
  });

  it('P1-5: 기존 업체 (칼선의뢰·목형의뢰만) 에서 lazy `문의/` 생성 후 `{O}` 생성', async () => {
    const { service, prisma } = buildService();
    // findFirst: inquiry (null) → root (ensureInquiryFolder) → root (ensureInquiryRootFolder) → 문의 root (null — 미존재)
    prisma.webhardFolder.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(rootFolderRow())
      .mockResolvedValueOnce(null);
    prisma.contact.findUnique.mockResolvedValue(
      contactRow({ inquiryNumber: INQUIRY_NUMBER, inquiryType: 'cutting_request' })
    );
    prisma.company.findFirst.mockResolvedValue({ id: COMPANY_ID, companyName: COMPANY_NAME });
    // create: 1) 문의 (ensureInquiryRootFolder), 2) {O} (ensureInquiryFolder)
    prisma.webhardFolder.create
      .mockResolvedValueOnce({
        id: INQUIRY_ROOT_FOLDER_ID,
        name: '문의',
        parentId: ROOT_FOLDER_ID,
        companyId: COMPANY_ID,
        path: `/${COMPANY_NAME}/문의`,
        folderKind: 'template',
      })
      .mockResolvedValueOnce(
        inquiryFolderRow(INQUIRY_NUMBER, {
          parentId: INQUIRY_ROOT_FOLDER_ID,
          inquiryNumber: INQUIRY_NUMBER,
        })
      );

    const result = await service.ensureInquiryFolder(CONTACT_ID);

    expect(result).not.toBeNull();
    expect(result?.name).toBe(INQUIRY_NUMBER);
    expect(prisma.webhardFolder.create).toHaveBeenCalledTimes(2);
    const createCalls = prisma.webhardFolder.create.mock.calls.map(
      (c) => (c[0] as { data: { name: string; parentId: string; folderKind?: string } }).data
    );
    expect(createCalls[0].name).toBe('문의');
    expect(createCalls[0].parentId).toBe(ROOT_FOLDER_ID);
    expect(createCalls[0].folderKind).toBe('template');
    expect(createCalls[1].name).toBe(INQUIRY_NUMBER);
    expect(createCalls[1].parentId).toBe(INQUIRY_ROOT_FOLDER_ID);
  });

  it('P1-6: Company 미등록 + webhard_folders name 매칭 → fallback rootFolder 로 폴더 생성 (외부웹하드 가상 업체)', async () => {
    const { service, prisma } = buildService();
    const virtualRootId = 'virtual-root-hai-folder';
    // findFirst 순서: inquiry(null) → name 매칭 fallback(virtual) → 문의 root(null)
    // Company 없으므로 company-based rootFolder 조회 건너뜀.
    prisma.webhardFolder.findFirst
      .mockResolvedValueOnce(null) // inquiry existing
      .mockResolvedValueOnce({ id: virtualRootId, companyId: null }) // name 매칭 fallback
      .mockResolvedValueOnce(null); // 문의 root 미존재
    prisma.contact.findUnique.mockResolvedValue(
      contactRow({ inquiryNumber: INQUIRY_NUMBER, inquiryType: 'cutting_request' })
    );
    prisma.company.findFirst.mockResolvedValue(null); // Company 미등록
    prisma.webhardFolder.create
      .mockResolvedValueOnce({
        id: INQUIRY_ROOT_FOLDER_ID,
        name: '문의',
        parentId: virtualRootId,
        companyId: null,
        path: `/외부웹하드/${COMPANY_NAME}/문의`,
        folderKind: 'template',
      })
      .mockResolvedValueOnce(
        inquiryFolderRow(INQUIRY_NUMBER, {
          parentId: INQUIRY_ROOT_FOLDER_ID,
          inquiryNumber: INQUIRY_NUMBER,
        })
      );

    const result = await service.ensureInquiryFolder(CONTACT_ID);

    expect(result).not.toBeNull();
    expect(result?.name).toBe(INQUIRY_NUMBER);
    const createCalls = prisma.webhardFolder.create.mock.calls.map(
      (c) => (c[0] as { data: Record<string, unknown> }).data
    );
    expect(createCalls).toHaveLength(2);
    expect(createCalls[0].name).toBe('문의');
    expect(createCalls[0].parentId).toBe(virtualRootId);
    expect(createCalls[0].companyId).toBeNull();
    expect(createCalls[1].parentId).toBe(INQUIRY_ROOT_FOLDER_ID);
    expect(createCalls[1].companyId).toBeNull();
  });

  it('P1-7: Company 미등록 + webhard_folders name 매칭도 없음 → null 반환 (폴더 생성 skip)', async () => {
    const { service, prisma } = buildService();
    prisma.webhardFolder.findFirst
      .mockResolvedValueOnce(null) // inquiry existing
      .mockResolvedValueOnce(null); // name 매칭도 없음
    prisma.contact.findUnique.mockResolvedValue(
      contactRow({ inquiryNumber: INQUIRY_NUMBER, inquiryType: 'cutting_request' })
    );
    prisma.company.findFirst.mockResolvedValue(null);

    const result = await service.ensureInquiryFolder(CONTACT_ID);

    expect(result).toBeNull();
    expect(prisma.webhardFolder.create).not.toHaveBeenCalled();
  });

  // ════════════════════════════════════════════════════════════
  // task 21 phase 1 신규 — 2단계 fallback + reason_code 로깅 + 멱등성
  // ════════════════════════════════════════════════════════════

  it("P1-4 (task 21): 미분류 (inquiryType=null) + inquiryNumber='O-999' → 'O-999' 폴더 생성", async () => {
    const { service, prisma } = buildService();
    const customInquiry = 'O-999';
    prisma.webhardFolder.findFirst
      .mockResolvedValueOnce(null) // inquiry existing
      .mockResolvedValueOnce(rootFolderRow()) // company root
      .mockResolvedValueOnce(inquiryRootFolderRow()); // 문의/ already exists
    prisma.contact.findUnique.mockResolvedValue(
      contactRow({ inquiryNumber: customInquiry, inquiryType: null })
    );
    prisma.company.findFirst.mockResolvedValue({ id: COMPANY_ID, companyName: COMPANY_NAME });
    prisma.webhardFolder.create.mockResolvedValue(
      inquiryFolderRow(customInquiry, {
        parentId: INQUIRY_ROOT_FOLDER_ID,
        inquiryNumber: customInquiry,
      })
    );

    const result = await service.ensureInquiryFolder(CONTACT_ID);

    expect(result).not.toBeNull();
    expect(result?.name).toBe(customInquiry);
    expect(result?.folderKind).toBe('inquiry');
    const createCall = prisma.webhardFolder.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.name).toBe(customInquiry);
    expect(createCall.data.folderKind).toBe('inquiry');
    expect(createCall.data.inquiryNumber).toBe(customInquiry);
  });

  it('P1-5b (task 21): Company 미등록 + webhard_folders.name 완전 일치 fallback 회귀 (9be443cc 유지)', async () => {
    const { service, prisma } = buildService();
    const virtualRootId = 'virtual-root-p1-5b';
    // findFirst: inquiry(null) → name 완전 일치(virtualRoot) → 문의 root(null)
    prisma.webhardFolder.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: virtualRootId, companyId: null })
      .mockResolvedValueOnce(null);
    prisma.contact.findUnique.mockResolvedValue(
      contactRow({ inquiryNumber: INQUIRY_NUMBER, inquiryType: 'cutting_request' })
    );
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.webhardFolder.create
      .mockResolvedValueOnce({
        id: INQUIRY_ROOT_FOLDER_ID,
        name: '문의',
        parentId: virtualRootId,
        companyId: null,
        path: `/${COMPANY_NAME}/문의`,
        folderKind: 'template',
      })
      .mockResolvedValueOnce(
        inquiryFolderRow(INQUIRY_NUMBER, {
          parentId: INQUIRY_ROOT_FOLDER_ID,
          inquiryNumber: INQUIRY_NUMBER,
        })
      );

    const result = await service.ensureInquiryFolder(CONTACT_ID);

    expect(result).not.toBeNull();
    expect(result?.name).toBe(INQUIRY_NUMBER);
    // 완전 일치가 먼저 성공했으므로 정규화 fallback(findMany)은 호출되지 않아야 함.
    expect(prisma.webhardFolder.findMany).not.toHaveBeenCalled();
  });

  it("P1-6 (task 21): 정규화 매칭 fallback — 'ABC 회사' ↔ 'ABC회사' (공백 차이 흡수)", async () => {
    const { service, prisma } = buildService();
    const variedCompanyName = 'ABC 회사';
    const normalizedFolderName = 'ABC회사';
    const virtualRootId = 'virtual-root-abc';
    // findFirst: inquiry(null) → 완전 일치(null) → 문의 root(null)
    prisma.webhardFolder.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    // findMany: 정규화 매칭 후보 — 공백이 없는 'ABC회사' 만 존재.
    prisma.webhardFolder.findMany.mockResolvedValueOnce([
      { id: virtualRootId, name: normalizedFolderName, companyId: null },
    ]);
    prisma.contact.findUnique.mockResolvedValue({
      id: CONTACT_ID,
      companyName: variedCompanyName,
      inquiryNumber: INQUIRY_NUMBER,
      workNumber: null,
      inquiryType: null,
    });
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.webhardFolder.create
      .mockResolvedValueOnce({
        id: INQUIRY_ROOT_FOLDER_ID,
        name: '문의',
        parentId: virtualRootId,
        companyId: null,
        path: `/${normalizedFolderName}/문의`,
        folderKind: 'template',
      })
      .mockResolvedValueOnce(
        inquiryFolderRow(INQUIRY_NUMBER, {
          parentId: INQUIRY_ROOT_FOLDER_ID,
          inquiryNumber: INQUIRY_NUMBER,
        })
      );

    const result = await service.ensureInquiryFolder(CONTACT_ID);

    expect(result).not.toBeNull();
    expect(result?.name).toBe(INQUIRY_NUMBER);
    // 정규화 fallback(findMany)이 호출되어 'ABC회사' 후보가 rootFolder 로 선택됨.
    expect(prisma.webhardFolder.findMany).toHaveBeenCalled();
    const createCalls = prisma.webhardFolder.create.mock.calls.map(
      (c) => (c[0] as { data: Record<string, unknown> }).data
    );
    // 첫 create 는 `문의` 중간 폴더 — parent 는 정규화로 찾은 virtualRootId.
    expect(createCalls[0].parentId).toBe(virtualRootId);
    expect(createCalls[0].name).toBe('문의');
    // 두번째 create 는 inquiry 폴더 — parent 는 `문의` 중간 폴더.
    expect(createCalls[1].parentId).toBe(INQUIRY_ROOT_FOLDER_ID);
  });

  it("P1-7 (task 21): 모든 fallback 실패 → logger.warn 에 { reason_code: 'NO_FALLBACK_MATCH' }", async () => {
    const { service, prisma } = buildService();
    const warnSpy = jest.spyOn(service['logger'], 'warn');
    prisma.webhardFolder.findFirst
      .mockResolvedValueOnce(null) // inquiry existing
      .mockResolvedValueOnce(null); // 완전 일치 fallback 실패
    prisma.webhardFolder.findMany.mockResolvedValueOnce([]); // 정규화 fallback 후보 없음
    prisma.contact.findUnique.mockResolvedValue(
      contactRow({ inquiryNumber: INQUIRY_NUMBER, inquiryType: 'cutting_request' })
    );
    prisma.company.findFirst.mockResolvedValue(null); // Company 미등록

    const result = await service.ensureInquiryFolder(CONTACT_ID);

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reason_code: 'NO_FALLBACK_MATCH',
        contactId: CONTACT_ID,
        companyName: COMPANY_NAME,
        inquiryNumber: INQUIRY_NUMBER,
      })
    );
  });

  it('P1-8 (task 21): 멱등성 회귀 — 같은 contactId 재호출 시 create 한 번도 안 함 (기존 폴더 반환)', async () => {
    const { service, prisma } = buildService();
    const existingInquiry = inquiryFolderRow(INQUIRY_NUMBER, {
      parentId: INQUIRY_ROOT_FOLDER_ID,
      inquiryNumber: INQUIRY_NUMBER,
    });
    // 두 호출 모두 findFirst 로 기존 폴더를 반환 → early return.
    prisma.webhardFolder.findFirst.mockResolvedValue(existingInquiry);

    const first = await service.ensureInquiryFolder(CONTACT_ID);
    const second = await service.ensureInquiryFolder(CONTACT_ID);

    expect(first?.id).toBe(INQUIRY_FOLDER_ID);
    expect(second?.id).toBe(INQUIRY_FOLDER_ID);
    expect(prisma.webhardFolder.create).not.toHaveBeenCalled();
  });

  it("P1-9 (task 21): 문의번호/작업번호 없음 → logger.warn 에 { reason_code: 'NO_INQUIRY_OR_WORK_NUMBER' }", async () => {
    const { service, prisma } = buildService();
    const warnSpy = jest.spyOn(service['logger'], 'warn');
    prisma.webhardFolder.findFirst.mockResolvedValueOnce(null);
    prisma.contact.findUnique.mockResolvedValue(
      contactRow({ inquiryNumber: null, workNumber: null, inquiryType: null })
    );

    const result = await service.ensureInquiryFolder(CONTACT_ID);

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reason_code: 'NO_INQUIRY_OR_WORK_NUMBER',
        contactId: CONTACT_ID,
        companyName: COMPANY_NAME,
      })
    );
    // 폴더 생성 시도 없음.
    expect(prisma.webhardFolder.create).not.toHaveBeenCalled();
  });

  // ════════════════════════════════════════════════════════════
  // task 29 Phase 2 — contact.webhardFolderId 동기화
  // ════════════════════════════════════════════════════════════

  it('F1: contact.webhardFolderId 가 외부웹하드 husk → ensureInquiryFolder 후 정식 inquiry 폴더 id 로 갱신', async () => {
    const { service, prisma } = buildService();
    const huskFolderId = 'husk-id';
    const newInquiryFolderId = 'new-inquiry-id';
    // findFirst: inquiry(null) → company root → 문의 root(existing)
    prisma.webhardFolder.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(rootFolderRow())
      .mockResolvedValueOnce(inquiryRootFolderRow());
    prisma.contact.findUnique
      // 1) ensureInquiryFolder 본문에서 contact 정보 조회 (companyName 등)
      .mockResolvedValueOnce(contactRow({ inquiryNumber: INQUIRY_NUMBER }))
      // 2) syncContactWebhardFolderId 에서 webhardFolderId 조회
      .mockResolvedValueOnce({ webhardFolderId: huskFolderId });
    prisma.company.findFirst.mockResolvedValue({ id: COMPANY_ID, companyName: COMPANY_NAME });
    prisma.webhardFolder.create.mockResolvedValue(
      inquiryFolderRow(INQUIRY_NUMBER, {
        id: newInquiryFolderId,
        parentId: INQUIRY_ROOT_FOLDER_ID,
        inquiryNumber: INQUIRY_NUMBER,
      })
    );
    // 구 구현은 path 를 조회해 외부웹하드 prefix 일 때만 갱신했다.
    // 현재 계약은 inquiry 폴더 확보 시 path 판별 없이 inquiry 폴더 id 로 동기화한다.
    prisma.webhardFolder.findUnique.mockResolvedValueOnce({
      path: '/외부웹하드/거래처X(2265-1295)',
    });

    const result = await service.ensureInquiryFolder(CONTACT_ID);

    expect(result?.id).toBe(newInquiryFolderId);
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: CONTACT_ID },
      data: { webhardFolderId: newInquiryFolderId },
    });
  });

  it('F2: contact.webhardFolderId 가 이미 정식 inquiry 폴더 → no-op (update 미호출)', async () => {
    const { service, prisma } = buildService();
    const existing = inquiryFolderRow(INQUIRY_NUMBER, {
      parentId: INQUIRY_ROOT_FOLDER_ID,
      inquiryNumber: INQUIRY_NUMBER,
    });
    // existing 분기 진입
    prisma.webhardFolder.findFirst.mockResolvedValueOnce(existing);
    // syncContactWebhardFolderId 가 webhardFolderId 조회 → 이미 같은 id
    prisma.contact.findUnique.mockResolvedValueOnce({ webhardFolderId: INQUIRY_FOLDER_ID });

    await service.ensureInquiryFolder(CONTACT_ID);

    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it('F3: contact.webhardFolderId null → 새 inquiry 폴더 id 로 갱신', async () => {
    const { service, prisma } = buildService();
    const existing = inquiryFolderRow(INQUIRY_NUMBER, {
      parentId: INQUIRY_ROOT_FOLDER_ID,
      inquiryNumber: INQUIRY_NUMBER,
    });
    prisma.webhardFolder.findFirst.mockResolvedValueOnce(existing);
    // syncContactWebhardFolderId — webhardFolderId null
    prisma.contact.findUnique.mockResolvedValueOnce({ webhardFolderId: null });

    await service.ensureInquiryFolder(CONTACT_ID);

    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: CONTACT_ID },
      data: { webhardFolderId: INQUIRY_FOLDER_ID },
    });
  });

  it('F4: contact.webhardFolderId 가 정식 내부 폴더여도 inquiry 폴더 id 로 갱신', async () => {
    const { service, prisma } = buildService();
    const otherInternalFolderId = 'internal-other-id';
    const existing = inquiryFolderRow(INQUIRY_NUMBER, {
      parentId: INQUIRY_ROOT_FOLDER_ID,
      inquiryNumber: INQUIRY_NUMBER,
    });
    prisma.webhardFolder.findFirst.mockResolvedValueOnce(existing);
    // syncContactWebhardFolderId — 기존 업로드 위치가 정식 내부 폴더여도 현재 문의 폴더가 우선
    prisma.contact.findUnique.mockResolvedValueOnce({ webhardFolderId: otherInternalFolderId });
    prisma.webhardFolder.findUnique.mockResolvedValueOnce({
      path: `/${COMPANY_NAME}`,
    });

    await service.ensureInquiryFolder(CONTACT_ID);

    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: CONTACT_ID },
      data: { webhardFolderId: INQUIRY_FOLDER_ID },
    });
    expect(prisma.webhardFolder.findUnique).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════
// ensureInquiryRootFolder (task 20 신규)
// ══════════════════════════════════════════════════════════════

describe('FoldersService.ensureInquiryRootFolder', () => {
  it('P1-1: 업체 루트만 있고 `문의/` 폴더 없을 때 lazy 생성', async () => {
    const { service, prisma } = buildService();
    prisma.webhardFolder.findFirst.mockResolvedValueOnce(null); // 문의 폴더 미존재
    prisma.webhardFolder.create.mockResolvedValue({
      id: INQUIRY_ROOT_FOLDER_ID,
      name: '문의',
      parentId: ROOT_FOLDER_ID,
      companyId: COMPANY_ID,
      path: `/${COMPANY_NAME}/문의`,
      folderKind: 'template',
    });

    const result = await service.ensureInquiryRootFolder(ROOT_FOLDER_ID, COMPANY_ID);

    expect(result.name).toBe('문의');
    expect(result.folderKind).toBe('template');
    expect(result.parentId).toBe(ROOT_FOLDER_ID);
    const createCall = prisma.webhardFolder.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.name).toBe('문의');
    expect(createCall.data.parentId).toBe(ROOT_FOLDER_ID);
    expect(createCall.data.companyId).toBe(COMPANY_ID);
    expect(createCall.data.folderKind).toBe('template');
  });

  it('P1-2: 이미 `문의/` 폴더 존재 시 findFirst hit, 중복 create 안 함 (멱등)', async () => {
    const { service, prisma } = buildService();
    const existingInquiryRoot = {
      id: INQUIRY_ROOT_FOLDER_ID,
      name: '문의',
      parentId: ROOT_FOLDER_ID,
      companyId: COMPANY_ID,
      path: `/${COMPANY_NAME}/문의`,
      folderKind: 'template',
    };
    prisma.webhardFolder.findFirst.mockResolvedValueOnce(existingInquiryRoot); // 이미 존재

    const result = await service.ensureInquiryRootFolder(ROOT_FOLDER_ID, COMPANY_ID);

    expect(result.id).toBe(INQUIRY_ROOT_FOLDER_ID);
    expect(result.name).toBe('문의');
    expect(prisma.webhardFolder.create).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════
// renameInquiryFolderForContact (task 19 신규)
// ══════════════════════════════════════════════════════════════

describe('FoldersService.renameInquiryFolderForContact', () => {
  it('E3: 기존 `{O}` 에 F 추가 → `{O}_{F}` 로 rename, WebhardFile.update 호출 없음', async () => {
    const { service, prisma, contactsGateway } = buildService();
    const existingName = INQUIRY_NUMBER;
    const newName = `${INQUIRY_NUMBER}_${WORK_NUMBER}`;
    const existing = inquiryFolderRow(existingName, {
      parentId: INQUIRY_ROOT_FOLDER_ID,
      inquiryNumber: INQUIRY_NUMBER,
    });
    prisma.webhardFolder.findFirst.mockResolvedValueOnce(existing);
    prisma.webhardFolder.findUnique.mockResolvedValue({
      path: `/${COMPANY_NAME}/문의`,
      name: '문의',
      parentId: ROOT_FOLDER_ID,
    });
    prisma.contact.findUnique.mockResolvedValue({
      inquiryNumber: INQUIRY_NUMBER,
      workNumber: WORK_NUMBER,
    });
    prisma.webhardFolder.findMany.mockResolvedValue([]); // no descendants
    prisma.webhardFolder.update.mockResolvedValue({
      ...existing,
      name: newName,
      workNumber: WORK_NUMBER,
    });

    await service.renameInquiryFolderForContact(CONTACT_ID);

    expect(prisma.webhardFolder.update).toHaveBeenCalled();
    const updateCall = prisma.webhardFolder.update.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateCall.where.id).toBe(INQUIRY_FOLDER_ID);
    expect(updateCall.data.name).toBe(newName);
    expect(updateCall.data.workNumber).toBe(WORK_NUMBER);
    // WebhardFile.update 는 호출되지 않음 — R2 key 유지
    expect(prisma.webhardFile.update).not.toHaveBeenCalled();
    expect(contactsGateway.emitFolderRenamed).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
      folderId: INQUIRY_FOLDER_ID,
      oldName: existingName,
      newName,
    });
  });

  it('기존 폴더 없음 → no-op', async () => {
    const { service, prisma, contactsGateway } = buildService();
    prisma.webhardFolder.findFirst.mockResolvedValueOnce(null);

    await service.renameInquiryFolderForContact(CONTACT_ID);

    expect(prisma.webhardFolder.update).not.toHaveBeenCalled();
    expect(contactsGateway.emitFolderRenamed).not.toHaveBeenCalled();
  });

  it('현재 번호 전용 이름이면 update 호출 없음', async () => {
    const { service, prisma, contactsGateway } = buildService();
    const existingName = INQUIRY_NUMBER;
    const existing = inquiryFolderRow(existingName, {
      parentId: INQUIRY_ROOT_FOLDER_ID,
      inquiryNumber: INQUIRY_NUMBER,
    });
    prisma.webhardFolder.findFirst.mockResolvedValueOnce(existing);
    prisma.contact.findUnique.mockResolvedValue({
      inquiryNumber: INQUIRY_NUMBER,
      workNumber: null,
    });

    await service.renameInquiryFolderForContact(CONTACT_ID);

    expect(prisma.webhardFolder.update).not.toHaveBeenCalled();
    expect(contactsGateway.emitFolderRenamed).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════
// moveInquiryFolderToCompleted (task 19 신규)
// ══════════════════════════════════════════════════════════════

describe('FoldersService.moveInquiryFolderToCompleted', () => {
  const COMPLETED_FOLDER_ID = 'completed-folder-id';

  it('E4: 문의 하위 완료 폴더 없으면 lazy 생성 + 문의 폴더 parentId 변경', async () => {
    const { service, prisma } = buildService();
    const inquiryFolder = inquiryFolderRow(`${INQUIRY_NUMBER}_${WORK_NUMBER}`, {
      parentId: INQUIRY_ROOT_FOLDER_ID,
      inquiryNumber: INQUIRY_NUMBER,
      workNumber: WORK_NUMBER,
    });
    prisma.webhardFolder.findFirst
      .mockResolvedValueOnce(inquiryFolder) // inquiry folder 조회
      .mockResolvedValueOnce(rootFolderRow()) // root folder 조회
      .mockResolvedValueOnce(inquiryRootFolderRow()) // 문의/ 폴더 조회
      .mockResolvedValueOnce(null); // 문의/완료 폴더 미존재
    prisma.webhardFolder.findUnique
      .mockResolvedValueOnce({
        id: INQUIRY_ROOT_FOLDER_ID,
        name: '문의',
        companyId: COMPANY_ID,
        parentId: ROOT_FOLDER_ID,
      }) // parentId 검사용 — name !== '완료'
      .mockResolvedValueOnce({
        path: `/${COMPANY_NAME}/문의`,
        name: '문의',
        parentId: ROOT_FOLDER_ID,
      })
      .mockResolvedValue({
        path: `/${COMPANY_NAME}/문의/완료`,
        name: '완료',
        parentId: INQUIRY_ROOT_FOLDER_ID,
      });
    prisma.webhardFolder.create.mockResolvedValue({
      id: COMPLETED_FOLDER_ID,
    });
    prisma.webhardFolder.findMany.mockResolvedValue([]); // no descendants
    prisma.webhardFolder.update.mockResolvedValue({
      ...inquiryFolder,
      parentId: COMPLETED_FOLDER_ID,
    });

    await service.moveInquiryFolderToCompleted(CONTACT_ID);

    // 완료/ 폴더 create — 업체 루트가 아니라 문의/ 직하
    const createCall = prisma.webhardFolder.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createCall.data.name).toBe('완료');
    expect(createCall.data.parentId).toBe(INQUIRY_ROOT_FOLDER_ID);
    expect(createCall.data.path).toBe(`/${COMPANY_NAME}/문의/완료`);
    expect(createCall.data.folderKind).toBe('template');
    // inquiry 폴더 parentId 갱신
    const updateCall = prisma.webhardFolder.update.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateCall.where.id).toBe(INQUIRY_FOLDER_ID);
    expect(updateCall.data.parentId).toBe(COMPLETED_FOLDER_ID);
    expect(updateCall.data.path).toBe(
      `/${COMPANY_NAME}/문의/완료/${INQUIRY_NUMBER}_${WORK_NUMBER}`
    );
    // WebhardFile.update 는 호출되지 않음 — R2 key 유지
    expect(prisma.webhardFile.update).not.toHaveBeenCalled();
  });

  it('루트 하위 완료 폴더에 있던 legacy 문의 폴더는 문의/완료 아래로 다시 이동한다', async () => {
    const { service, prisma } = buildService();
    const legacyRootCompletedId = 'legacy-root-completed-id';
    const inquiryCompletedId = 'inquiry-completed-id';
    const inquiryFolder = inquiryFolderRow(`${INQUIRY_NUMBER}_${WORK_NUMBER}`, {
      parentId: legacyRootCompletedId,
      inquiryNumber: INQUIRY_NUMBER,
      workNumber: WORK_NUMBER,
      path: `/${COMPANY_NAME}/완료/${INQUIRY_NUMBER}_${WORK_NUMBER}`,
    });
    prisma.webhardFolder.findFirst
      .mockResolvedValueOnce(inquiryFolder)
      .mockResolvedValueOnce(rootFolderRow())
      .mockResolvedValueOnce(inquiryRootFolderRow())
      .mockResolvedValueOnce({ id: inquiryCompletedId });
    prisma.webhardFolder.findUnique
      .mockResolvedValueOnce({
        id: legacyRootCompletedId,
        name: '완료',
        companyId: COMPANY_ID,
        parentId: ROOT_FOLDER_ID,
      })
      .mockResolvedValue({
        path: `/${COMPANY_NAME}/문의/완료`,
        name: '완료',
        parentId: INQUIRY_ROOT_FOLDER_ID,
      });
    prisma.webhardFolder.findMany.mockResolvedValue([]);
    prisma.webhardFolder.update.mockResolvedValue({
      ...inquiryFolder,
      parentId: inquiryCompletedId,
    });

    await service.moveInquiryFolderToCompleted(CONTACT_ID);

    expect(prisma.webhardFolder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INQUIRY_FOLDER_ID },
        data: expect.objectContaining({
          parentId: inquiryCompletedId,
          path: `/${COMPANY_NAME}/문의/완료/${INQUIRY_NUMBER}_${WORK_NUMBER}`,
        }),
      })
    );
  });

  it('H7: 이미 완료/ 하위에 있으면 no-op (중복 이동 방지)', async () => {
    const { service, prisma } = buildService();
    const inquiryFolder = inquiryFolderRow(`${INQUIRY_NUMBER}_${WORK_NUMBER}`, {
      parentId: COMPLETED_FOLDER_ID,
      inquiryNumber: INQUIRY_NUMBER,
      workNumber: WORK_NUMBER,
    });
    prisma.webhardFolder.findFirst
      .mockResolvedValueOnce(inquiryFolder)
      .mockResolvedValueOnce(rootFolderRow())
      .mockResolvedValueOnce(inquiryRootFolderRow());
    prisma.webhardFolder.findUnique.mockResolvedValueOnce({
      id: COMPLETED_FOLDER_ID,
      name: '완료',
      companyId: COMPANY_ID,
      parentId: INQUIRY_ROOT_FOLDER_ID,
    });

    await service.moveInquiryFolderToCompleted(CONTACT_ID);

    // 추가 조회/생성/갱신 없음
    expect(prisma.webhardFolder.create).not.toHaveBeenCalled();
    expect(prisma.webhardFolder.update).not.toHaveBeenCalled();
  });

  it('기존 문의 폴더 없음 → no-op', async () => {
    const { service, prisma } = buildService();
    prisma.webhardFolder.findFirst.mockResolvedValueOnce(null);

    await service.moveInquiryFolderToCompleted(CONTACT_ID);

    expect(prisma.webhardFolder.create).not.toHaveBeenCalled();
    expect(prisma.webhardFolder.update).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════
// initializeCompanyFolders (task 19: template 보존)
// ══════════════════════════════════════════════════════════════

describe('FoldersService.initializeCompanyFolders', () => {
  it('E6: template (칼선의뢰, 목형의뢰, 문의) 폴더는 재호출 시 삭제되지 않음', async () => {
    const { service, prisma } = buildService();
    // systemSetting 은 없어 DEFAULT_FOLDER_TEMPLATE 이 사용됨
    const systemSettingMock = {
      findUnique: jest.fn().mockResolvedValue(null),
    };
    (prisma as unknown as { systemSetting: typeof systemSettingMock }).systemSetting =
      systemSettingMock;
    // 루트 / 목형의뢰 / 목형의뢰/완료 / 칼선의뢰 / 칼선의뢰/완료 / 문의 모두 이미 존재
    const existingRoot = { id: ROOT_FOLDER_ID };
    const existingTemplate = { id: 'template-x' };
    const existingCompleted = { id: 'completed-x' };
    const existingInquiryRoot = { id: 'inquiry-root-x' };
    prisma.webhardFolder.findFirst
      .mockResolvedValueOnce(existingRoot) // root
      .mockResolvedValueOnce(existingTemplate) // 목형의뢰
      .mockResolvedValueOnce(existingCompleted) // 목형의뢰/완료
      .mockResolvedValueOnce(existingTemplate) // 칼선의뢰
      .mockResolvedValueOnce(existingCompleted) // 칼선의뢰/완료
      .mockResolvedValueOnce(existingInquiryRoot); // 문의

    const result = await service.initializeCompanyFolders(COMPANY_ID, COMPANY_NAME);

    expect(result.success).toBe(true);
    // 기존 폴더는 재생성되지 않음 — findOrCreate 는 existing 반환하므로 create 호출 없음
    expect(prisma.webhardFolder.create).not.toHaveBeenCalled();
    // 삭제도 하지 않음
    expect(prisma.webhardFolder.update).not.toHaveBeenCalled();
  });

  it('P1-4: 신규 업체 초기화 시 `칼선의뢰`, `목형의뢰`, `문의` 모두 eager 생성', async () => {
    const { service, prisma } = buildService();
    const systemSettingMock = {
      findUnique: jest.fn().mockResolvedValue(null),
    };
    (prisma as unknown as { systemSetting: typeof systemSettingMock }).systemSetting =
      systemSettingMock;
    // 모든 폴더 미존재 → findOrCreate 가 create 로 진행
    prisma.webhardFolder.findFirst.mockResolvedValue(null);
    let createCounter = 0;
    prisma.webhardFolder.create.mockImplementation(async () => ({
      id: `folder-${createCounter++}`,
    }));

    const result = await service.initializeCompanyFolders(COMPANY_ID, COMPANY_NAME);

    expect(result.success).toBe(true);
    const createdNames = prisma.webhardFolder.create.mock.calls.map(
      (c) => (c[0] as { data: { name: string } }).data.name
    );
    // 업체 루트 (COMPANY_NAME) + 3 template (칼선의뢰, 목형의뢰, 문의) 가 모두 create 호출됨
    expect(createdNames).toContain('칼선의뢰');
    expect(createdNames).toContain('목형의뢰');
    expect(createdNames).toContain('문의');
  });
});

// ══════════════════════════════════════════════════════════════
// relocateContactFiles
// ══════════════════════════════════════════════════════════════

describe('FoldersService.relocateContactFiles', () => {
  function stubBasicContext(prisma: PrismaMock) {
    prisma.contact.findUnique.mockResolvedValue({
      id: CONTACT_ID,
      companyName: COMPANY_NAME,
      inquiryNumber: INQUIRY_NUMBER,
      workNumber: WORK_NUMBER,
    });
    prisma.company.findFirst.mockResolvedValue({ id: COMPANY_ID });
    // task 22: resolveCompanyRoot 1단계 — Company 매칭 후 그 companyId 의 루트 폴더 조회.
    prisma.webhardFolder.findFirst.mockResolvedValue({ id: 'root-folder-id' });
    prisma.webhardFolder.findUnique.mockResolvedValue({
      path: `/${COMPANY_NAME}/문의/${INQUIRY_NUMBER}`,
    });
  }

  it('DrawingRevision.webhardFileIds 로 연결된 파일 이동', async () => {
    const { service, prisma, contactsGateway } = buildService();
    stubBasicContext(prisma);
    prisma.drawingRevision.findMany.mockResolvedValue([{ webhardFileIds: ['file-a', 'file-b'] }]);
    prisma.webhardFile.findMany.mockResolvedValue([
      { id: 'file-a', name: 'a.dxf', folderId: 'other-folder' },
      { id: 'file-b', name: 'b.dxf', folderId: 'other-folder' },
    ]);
    prisma.webhardFile.update.mockResolvedValue({});

    const result = await service.relocateContactFiles(CONTACT_ID, INQUIRY_FOLDER_ID);

    expect(result.movedIds).toEqual(['file-a', 'file-b']);
    expect(prisma.webhardFile.update).toHaveBeenCalledTimes(2);
    const updateCalls = prisma.webhardFile.update.mock.calls.map((c) => c[0]) as Array<{
      where: { id: string };
      data: { folderId: string; path: string };
    }>;
    expect(updateCalls[0].data.folderId).toBe(INQUIRY_FOLDER_ID);
    expect(updateCalls[0].data.path).toBe(`/${COMPANY_NAME}/문의/${INQUIRY_NUMBER}/a.dxf`);
    expect(contactsGateway.emitFileMoved).toHaveBeenCalledTimes(2);
    expect(contactsGateway.emitFileMoved).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
      fileId: 'file-a',
      oldFolderId: 'other-folder',
      newFolderId: INQUIRY_FOLDER_ID,
    });
  });

  it('inquiryNumber/workNumber 매칭 파일 이동', async () => {
    const { service, prisma } = buildService();
    stubBasicContext(prisma);
    prisma.drawingRevision.findMany.mockResolvedValue([]);
    prisma.webhardFile.findMany.mockResolvedValue([
      { id: 'file-x', name: 'x.dxf', folderId: 'legacy-root' },
    ]);
    prisma.webhardFile.update.mockResolvedValue({});

    const result = await service.relocateContactFiles(CONTACT_ID, INQUIRY_FOLDER_ID);

    expect(result.movedIds).toEqual(['file-x']);
    // findMany 의 where 에 inquiryNumber + workNumber OR 절이 포함됨
    const findManyArg = prisma.webhardFile.findMany.mock.calls[0][0] as {
      where: { OR: Array<{ inquiryNumber?: { in: string[] } }> };
    };
    const inquiryNumberOr = findManyArg.where.OR.find((c) => c.inquiryNumber);
    expect(inquiryNumberOr?.inquiryNumber?.in).toEqual(
      expect.arrayContaining([INQUIRY_NUMBER, WORK_NUMBER])
    );
  });

  it('이미 target 에 있는 파일은 skip', async () => {
    const { service, prisma, contactsGateway } = buildService();
    stubBasicContext(prisma);
    prisma.drawingRevision.findMany.mockResolvedValue([]);
    prisma.webhardFile.findMany.mockResolvedValue([
      { id: 'file-already', name: 'ok.dxf', folderId: INQUIRY_FOLDER_ID }, // 이미 여기 있음
      { id: 'file-new', name: 'new.dxf', folderId: 'legacy-root' },
    ]);
    prisma.webhardFile.update.mockResolvedValue({});

    const result = await service.relocateContactFiles(CONTACT_ID, INQUIRY_FOLDER_ID);

    expect(result.movedIds).toEqual(['file-new']);
    expect(prisma.webhardFile.update).toHaveBeenCalledTimes(1);
    expect(contactsGateway.emitFileMoved).toHaveBeenCalledTimes(1);
  });

  it('companyName 없는 Contact → 빈 결과', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findUnique.mockResolvedValue({
      id: CONTACT_ID,
      companyName: null,
      inquiryNumber: null,
      workNumber: null,
    });

    const result = await service.relocateContactFiles(CONTACT_ID, INQUIRY_FOLDER_ID);

    expect(result.movedIds).toEqual([]);
    expect(prisma.webhardFile.update).not.toHaveBeenCalled();
  });

  // ════════════════════════════════════════════════════════════
  // task 22: silent bail-out 제거 — Company 미등록 가상 업체도 fallback rootFolder 로 이동
  // ════════════════════════════════════════════════════════════

  it('#5: Company 미등록 가상업체 + webhardFileIds 존재 → fallback rootFolder 로 파일 이동 (regression)', async () => {
    // task 22 핵심 회귀 테스트 — 이전 silent bail-out `if (!company) return { movedIds: [] }` 제거 확인.
    const { service, prisma, contactsGateway } = buildService();
    prisma.contact.findUnique.mockResolvedValue({
      id: CONTACT_ID,
      companyName: COMPANY_NAME,
      inquiryNumber: INQUIRY_NUMBER,
      workNumber: null,
    });
    // Company 미등록 → resolveCompanyRoot 1단계 실패, 2단계 (name 완전 일치) 로 virtual root 발견.
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.webhardFolder.findFirst.mockResolvedValue({ id: 'virtual-root-id' });
    prisma.webhardFolder.findUnique.mockResolvedValue({
      path: `/${COMPANY_NAME}/문의/${INQUIRY_NUMBER}`,
    });
    prisma.drawingRevision.findMany.mockResolvedValue([{ webhardFileIds: ['file-virtual-1'] }]);
    prisma.webhardFile.findMany.mockResolvedValue([
      { id: 'file-virtual-1', name: 'virtual.dxf', folderId: 'legacy-folder' },
    ]);
    prisma.webhardFile.update.mockResolvedValue({});

    const result = await service.relocateContactFiles(CONTACT_ID, INQUIRY_FOLDER_ID);

    // 기존 silent bail-out 이었다면 [] 반환 — 회귀 방지를 위해 실제 이동 완료 확인.
    expect(result.movedIds).toEqual(['file-virtual-1']);
    expect(prisma.webhardFile.update).toHaveBeenCalledTimes(1);
    const updateCall = prisma.webhardFile.update.mock.calls[0][0] as {
      where: { id: string };
      data: { folderId: string; path: string };
    };
    expect(updateCall.where.id).toBe('file-virtual-1');
    expect(updateCall.data.folderId).toBe(INQUIRY_FOLDER_ID);
    expect(contactsGateway.emitFileMoved).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
      fileId: 'file-virtual-1',
      oldFolderId: 'legacy-folder',
      newFolderId: INQUIRY_FOLDER_ID,
    });
    // companyId null 이므로 inquiryNumber 기반 OR 절은 findMany where 에 포함되지 않아야 함.
    const findManyArg = prisma.webhardFile.findMany.mock.calls[0][0] as {
      where: { OR: Array<{ inquiryNumber?: unknown; id?: { in: string[] } }> };
    };
    const hasInquiryNumberClause = findManyArg.where.OR.some((c) => 'inquiryNumber' in c);
    expect(hasInquiryNumberClause).toBe(false);
    const hasIdInClause = findManyArg.where.OR.some((c) => 'id' in c);
    expect(hasIdInClause).toBe(true);
  });

  it('#6: 정상 Company + webhardFileIds + inquiryNumber 매칭 → 합집합 이동 (회귀 방지)', async () => {
    const { service, prisma, contactsGateway } = buildService();
    stubBasicContext(prisma);
    prisma.drawingRevision.findMany.mockResolvedValue([{ webhardFileIds: ['file-rev-1'] }]);
    prisma.webhardFile.findMany.mockResolvedValue([
      { id: 'file-rev-1', name: 'rev.dxf', folderId: 'other-folder' },
      { id: 'file-num-1', name: 'num.dxf', folderId: 'other-folder' },
    ]);
    prisma.webhardFile.update.mockResolvedValue({});

    const result = await service.relocateContactFiles(CONTACT_ID, INQUIRY_FOLDER_ID);

    expect(result.movedIds).toEqual(['file-rev-1', 'file-num-1']);
    expect(prisma.webhardFile.update).toHaveBeenCalledTimes(2);
    const updatedFolderIds = (
      prisma.webhardFile.update.mock.calls as Array<[{ data: { folderId: string } }]>
    ).map((c) => c[0].data.folderId);
    expect(updatedFolderIds).toEqual([INQUIRY_FOLDER_ID, INQUIRY_FOLDER_ID]);
    // companyId 있을 때는 inquiryNumber OR 절 포함.
    const findManyArg = prisma.webhardFile.findMany.mock.calls[0][0] as {
      where: { OR: Array<{ inquiryNumber?: { in: string[] }; companyId?: number }> };
    };
    expect(findManyArg.where.OR.some((c) => c.inquiryNumber && c.companyId === COMPANY_ID)).toBe(
      true
    );
    expect(contactsGateway.emitFileMoved).toHaveBeenCalledTimes(2);
  });

  it('#7: Company 미등록 + webhardFileIds 빈 배열 → orClauses 비어 빈 결과 반환', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findUnique.mockResolvedValue({
      id: CONTACT_ID,
      companyName: COMPANY_NAME,
      inquiryNumber: INQUIRY_NUMBER,
      workNumber: WORK_NUMBER,
    });
    prisma.company.findFirst.mockResolvedValue(null);
    // fallback rootFolder 는 찾았지만 (companyId null), revisions 가 비어 있음.
    prisma.webhardFolder.findFirst.mockResolvedValue({ id: 'virtual-root-id' });
    prisma.drawingRevision.findMany.mockResolvedValue([]);

    const result = await service.relocateContactFiles(CONTACT_ID, INQUIRY_FOLDER_ID);

    expect(result.movedIds).toEqual([]);
    // orClauses 가 비어 있으므로 file.findMany 호출 없이 즉시 반환.
    expect(prisma.webhardFile.findMany).not.toHaveBeenCalled();
    expect(prisma.webhardFile.update).not.toHaveBeenCalled();
  });

  it('#8: 자동 문의 원본 파일이 revisionFileIds/inquiryNumber 없이 남아도 drawingFileUrl 로 이동한다', async () => {
    const { service, prisma } = buildService();
    prisma.contact.findUnique.mockResolvedValue({
      id: CONTACT_ID,
      companyName: COMPANY_NAME,
      inquiryNumber: INQUIRY_NUMBER,
      workNumber: null,
      webhardFolderId: 'source-folder-id',
      drawingFileUrl: 'webhard/test-company/original.dxf',
      drawingFileName: 'original.dxf',
      originalFilename: 'original.dxf',
    });
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.webhardFolder.findFirst.mockResolvedValue({ id: 'virtual-root-id' });
    prisma.webhardFolder.findUnique.mockResolvedValue({
      path: `/${COMPANY_NAME}/문의/${INQUIRY_NUMBER}`,
    });
    prisma.drawingRevision.findMany.mockResolvedValue([{ webhardFileIds: [] }]);
    prisma.webhardFile.findMany.mockResolvedValue([
      { id: 'file-by-source-url', name: 'original.dxf', folderId: 'source-folder-id' },
    ]);
    prisma.webhardFile.update.mockResolvedValue({});

    const result = await service.relocateContactFiles(CONTACT_ID, INQUIRY_FOLDER_ID);

    expect(result.movedIds).toEqual(['file-by-source-url']);
    const findManyArg = prisma.webhardFile.findMany.mock.calls[0][0] as {
      where: { OR: Array<{ path?: string }> };
    };
    expect(findManyArg.where.OR).toContainEqual({ path: 'webhard/test-company/original.dxf' });
  });
});

// ══════════════════════════════════════════════════════════════
// getFolderTree — Bug 3 회귀 가드 (task 25 U5 외부웹하드 가시성)
// ══════════════════════════════════════════════════════════════

describe('FoldersService — Bug 3 회귀 가드 (task 25 U5 외부웹하드 가시성)', () => {
  it('U5: getFolderTree 회사 사용자 응답에서 외부웹하드 root + 그 하위 (미가입업체/문의/title-O번호) 모두 제외', async () => {
    // 회사 사용자 시각: where 절이 EXTERNAL_WEBHARD_FOLDERS (외부웹하드, 올리기전용, 내리기전용) 를
    // companyId=null 조건과 결합해 차단. prisma mock 은 실제 where 동작을 흉내내어 외부웹하드 root 만 결과에서 누락.
    // 기존 트리 빌드 로직이 외부웹하드 하위 (parentId 가 외부웹하드 root 인 폴더) 를 회사 트리에 끌고 가는지를 검증.
    const { service, prisma } = buildService();

    const COMPANY_USER_COMPANY_ID = 42;
    const COMPANY_FOLDER_ID = 'company-root-42';
    const EXTERNAL_ROOT_ID = 'external-webhard-root';
    const VIRTUAL_COMPANY_ID = 'virtual-company-folder';
    const VIRTUAL_INQUIRY_ROOT_ID = 'virtual-inquiry-root';
    const VIRTUAL_INQUIRY_FOLDER_ID = 'virtual-inquiry-folder';

    // 전체 폴더 dataset (DB 에 실제 존재하는 모든 폴더 — companyId=null 미가입 업체 트리 + 회사 폴더 1개).
    const allRows = [
      // 회사 자체 루트 (companyId=42).
      {
        id: COMPANY_FOLDER_ID,
        name: 'ABC회사',
        parentId: null,
        companyId: COMPANY_USER_COMPANY_ID,
        path: '/ABC회사',
        folderKind: 'root',
        deletedAt: null,
      },
      // 외부웹하드 root (companyId=null, name='외부웹하드') — where 의 NOT 절로 제외.
      {
        id: EXTERNAL_ROOT_ID,
        name: '외부웹하드',
        parentId: null,
        companyId: null,
        path: '/외부웹하드',
        folderKind: 'root',
        deletedAt: null,
      },
      // 외부웹하드/{미가입업체} (companyId=null) — name 매칭 X 라 where 에서 차단되지 않음.
      {
        id: VIRTUAL_COMPANY_ID,
        name: '미가입업체A',
        parentId: EXTERNAL_ROOT_ID,
        companyId: null,
        path: '/외부웹하드/미가입업체A',
        folderKind: 'root',
        deletedAt: null,
      },
      // 외부웹하드/{미가입업체}/문의 (companyId=null).
      {
        id: VIRTUAL_INQUIRY_ROOT_ID,
        name: '문의',
        parentId: VIRTUAL_COMPANY_ID,
        companyId: null,
        path: '/외부웹하드/미가입업체A/문의',
        folderKind: 'template',
        deletedAt: null,
      },
      // 외부웹하드/{미가입업체}/문의/{O번호} (companyId=null).
      {
        id: VIRTUAL_INQUIRY_FOLDER_ID,
        name: '260417-O-002',
        parentId: VIRTUAL_INQUIRY_ROOT_ID,
        companyId: null,
        path: '/외부웹하드/미가입업체A/문의/260417-O-002',
        folderKind: 'inquiry',
        deletedAt: null,
      },
    ];

    // findMany 가 실제 where 절을 평가하는 방식을 흉내낸다. 회사 사용자 가시성 필터:
    //   - companyId 가 user.companyId 또는 null 인 폴더만 노출
    //   - companyId=null 이면서 (name in EXTERNAL_WEBHARD_FOLDERS OR path startsWith /<root>/) 차단
    // 즉 외부웹하드 root + 모든 하위 폴더는 차단, 그 외 companyId=null 시스템 폴더는 통과.
    prisma.webhardFolder.findMany.mockImplementationOnce(async () => {
      const EXTERNAL = ['외부웹하드', '올리기전용', '내리기전용'];
      return allRows.filter((row) => {
        if (row.companyId !== null && row.companyId !== COMPANY_USER_COMPANY_ID) return false;
        if (row.companyId === null) {
          if (EXTERNAL.includes(row.name)) return false;
          if (row.path && EXTERNAL.some((root) => row.path.startsWith(`/${root}/`))) return false;
        }
        return true;
      });
    });

    const companyUser: SessionUser = {
      userId: 'user-1',
      userType: 'company',
      companyId: COMPANY_USER_COMPANY_ID,
    } as unknown as SessionUser;

    const tree = await service.getFolderTree(companyUser);

    // 평탄화 헬퍼 — 모든 노드의 id 수집.
    const collectIds = (nodes: { id: string; children: typeof nodes }[]): string[] =>
      nodes.flatMap((n) => [n.id, ...collectIds(n.children)]);
    const allIds = collectIds(tree as never);

    // 회사 자체 루트만 트리에 포함.
    expect(allIds).toContain(COMPANY_FOLDER_ID);
    // 외부웹하드 root + 모든 하위 (미가입업체 / 문의 / O번호) 미포함.
    expect(allIds).not.toContain(EXTERNAL_ROOT_ID);
    expect(allIds).not.toContain(VIRTUAL_COMPANY_ID);
    expect(allIds).not.toContain(VIRTUAL_INQUIRY_ROOT_ID);
    expect(allIds).not.toContain(VIRTUAL_INQUIRY_FOLDER_ID);
    // 회사 자체 폴더만 root 로 노출.
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe(COMPANY_FOLDER_ID);
  });

  it('U5b: admin 사용자는 외부웹하드 root + 하위 폴더 모두 그대로 노출 (회귀 방지)', async () => {
    // admin 분기는 where 에 가시성 필터를 추가하지 않음 — 모든 폴더 노출.
    // companyVisibilityFilter 가 admin 트리를 깨지 않는지 검증.
    const { service, prisma } = buildService();

    const COMPANY_FOLDER_ID = 'company-root-42';
    const EXTERNAL_ROOT_ID = 'external-webhard-root';
    const VIRTUAL_COMPANY_ID = 'virtual-company-folder';
    const VIRTUAL_INQUIRY_ROOT_ID = 'virtual-inquiry-root';
    const VIRTUAL_INQUIRY_FOLDER_ID = 'virtual-inquiry-folder';

    const allRows = [
      {
        id: COMPANY_FOLDER_ID,
        name: 'ABC회사',
        parentId: null,
        companyId: 42,
        path: '/ABC회사',
        folderKind: 'root',
        deletedAt: null,
      },
      {
        id: EXTERNAL_ROOT_ID,
        name: '외부웹하드',
        parentId: null,
        companyId: null,
        path: '/외부웹하드',
        folderKind: 'root',
        deletedAt: null,
      },
      {
        id: VIRTUAL_COMPANY_ID,
        name: '미가입업체A',
        parentId: EXTERNAL_ROOT_ID,
        companyId: null,
        path: '/외부웹하드/미가입업체A',
        folderKind: 'root',
        deletedAt: null,
      },
      {
        id: VIRTUAL_INQUIRY_ROOT_ID,
        name: '문의',
        parentId: VIRTUAL_COMPANY_ID,
        companyId: null,
        path: '/외부웹하드/미가입업체A/문의',
        folderKind: 'template',
        deletedAt: null,
      },
      {
        id: VIRTUAL_INQUIRY_FOLDER_ID,
        name: '260417-O-002',
        parentId: VIRTUAL_INQUIRY_ROOT_ID,
        companyId: null,
        path: '/외부웹하드/미가입업체A/문의/260417-O-002',
        folderKind: 'inquiry',
        deletedAt: null,
      },
    ];

    // admin 분기는 where.AND 가 비어 있어 모든 폴더 통과.
    prisma.webhardFolder.findMany.mockImplementationOnce(async () => allRows);

    const adminUser: SessionUser = {
      userId: 'admin-1',
      userType: 'admin',
    } as unknown as SessionUser;

    const tree = await service.getFolderTree(adminUser);

    const collectIds = (nodes: { id: string; children: typeof nodes }[]): string[] =>
      nodes.flatMap((n) => [n.id, ...collectIds(n.children)]);
    const allIds = collectIds(tree as never);

    // admin 은 회사 폴더 + 외부웹하드 트리 전체를 본다.
    expect(allIds).toContain(COMPANY_FOLDER_ID);
    expect(allIds).toContain(EXTERNAL_ROOT_ID);
    expect(allIds).toContain(VIRTUAL_COMPANY_ID);
    expect(allIds).toContain(VIRTUAL_INQUIRY_ROOT_ID);
    expect(allIds).toContain(VIRTUAL_INQUIRY_FOLDER_ID);
    // 외부웹하드 root 가 트리 root 로 노출되며 하위 계층 보존.
    const externalRoot = tree.find((n) => n.id === EXTERNAL_ROOT_ID);
    expect(externalRoot).toBeDefined();
    expect(externalRoot?.children.map((c) => c.id)).toContain(VIRTUAL_COMPANY_ID);
  });
});

// ────────────────────────────────────────────────────────────────
// task 26 phase 2: getExternalUnmatchedFolders (F1, F2)
//
// 스펙: docs/specs/features/admin-folder-mapping-ui.md §신규 endpoint
//
// 검증:
//   F1: 반환 조건 — depth=2 + companyId=null + path '/외부웹하드/' + folderKind in (root,generic)
//       + approved alias 없음 (alias 매칭된 폴더 제외)
//   F2: contactCount / fileCount BFS 누적 정확성
// ────────────────────────────────────────────────────────────────

describe('FoldersService.getExternalUnmatchedFolders (task 26)', () => {
  function buildSpec(setup: {
    folders: Array<FolderRow & { createdAt?: Date }>;
    files?: Array<{ id: string; folderId: string; deletedAt?: Date | null }>;
    contacts?: Array<{ id: string; webhardFolderId: string }>;
    approvedAliasNames?: string[];
  }) {
    const prisma = makePrisma() as PrismaMock & {
      companyFolderAlias?: { findMany: jest.Mock };
      contact: PrismaMock['contact'] & { count: jest.Mock; groupBy: jest.Mock };
      webhardFile: PrismaMock['webhardFile'] & { count: jest.Mock; groupBy: jest.Mock };
    };

    // companyFolderAlias.findMany — 미존재 mock 추가
    (prisma as unknown as { companyFolderAlias: { findMany: jest.Mock } }).companyFolderAlias = {
      findMany: jest
        .fn()
        .mockResolvedValue((setup.approvedAliasNames ?? []).map((n) => ({ folderName: n }))),
    };

    // webhardFile.count
    (prisma.webhardFile as unknown as { count: jest.Mock }).count = jest
      .fn()
      .mockImplementation(async ({ where }: { where: { folderId: { in: string[] } } }) => {
        const ids = where.folderId.in;
        return (setup.files ?? []).filter(
          (f) => ids.includes(f.folderId) && (f.deletedAt ?? null) === null
        ).length;
      });
    (prisma.webhardFile as unknown as { groupBy: jest.Mock }).groupBy = jest
      .fn()
      .mockImplementation(async ({ where }: { where: { folderId: { in: string[] } } }) => {
        const ids = where.folderId.in;
        const counts = new Map<string, number>();
        for (const file of setup.files ?? []) {
          if (!ids.includes(file.folderId) || (file.deletedAt ?? null) !== null) continue;
          counts.set(file.folderId, (counts.get(file.folderId) ?? 0) + 1);
        }
        return Array.from(counts, ([folderId, count]) => ({ folderId, _count: count }));
      });

    // contact.count
    (prisma.contact as unknown as { count: jest.Mock }).count = jest
      .fn()
      .mockImplementation(async ({ where }: { where: { webhardFolderId: { in: string[] } } }) => {
        const ids = where.webhardFolderId.in;
        return (setup.contacts ?? []).filter((c) => ids.includes(c.webhardFolderId)).length;
      });
    (prisma.contact as unknown as { groupBy: jest.Mock }).groupBy = jest
      .fn()
      .mockImplementation(async ({ where }: { where: { webhardFolderId: { in: string[] } } }) => {
        const ids = where.webhardFolderId.in;
        const counts = new Map<string, number>();
        for (const contact of setup.contacts ?? []) {
          if (!ids.includes(contact.webhardFolderId)) continue;
          counts.set(contact.webhardFolderId, (counts.get(contact.webhardFolderId) ?? 0) + 1);
        }
        return Array.from(counts, ([webhardFolderId, count]) => ({
          webhardFolderId,
          _count: count,
        }));
      });

    // webhardFolder.findMany — candidates 1차 호출과 bulk subtree 조회 모두 처리
    prisma.webhardFolder.findMany.mockImplementation(
      async (args: {
        where: {
          path?: { startsWith: string };
          companyId?: null;
          deletedAt?: null;
          folderKind?: { in: string[] };
          parentId?: string | { in: string[] };
        };
        select?: Record<string, boolean>;
      }) => {
        const w = args.where;
        // candidates (depth=2)
        if (w.path?.startsWith && w.companyId === null) {
          const filtered = setup.folders
            .filter(
              (f) =>
                (f.path ?? '').startsWith(w.path!.startsWith) &&
                f.companyId === null &&
                (f.deletedAt ?? null) === null &&
                (w.folderKind === undefined || w.folderKind.in.includes(f.folderKind))
            )
            .map((f) => ({
              id: f.id,
              name: f.name,
              path: f.path,
              createdAt: f.createdAt ?? new Date('2026-04-15T09:00:00Z'),
            }));
          return filtered;
        }
        if (w.path?.startsWith) {
          return setup.folders
            .filter(
              (f) => (f.path ?? '').startsWith(w.path!.startsWith) && (f.deletedAt ?? null) === null
            )
            .map((f) => ({ id: f.id, parentId: f.parentId }));
        }
        if (typeof w.parentId === 'object' && 'in' in w.parentId) {
          const ids = w.parentId.in;
          return setup.folders
            .filter((f) => ids.includes(f.parentId ?? '') && (f.deletedAt ?? null) === null)
            .map((f) => ({ id: f.id, parentId: f.parentId }));
        }
        if (typeof w.parentId === 'string') {
          return setup.folders
            .filter((f) => f.parentId === w.parentId && (f.deletedAt ?? null) === null)
            .map((f) => ({ id: f.id }));
        }
        return [];
      }
    );

    const { service } = buildService(prisma);
    return { service, prisma };
  }

  it('F1: 반환 조건 — depth=2 + companyId=null + path /외부웹하드/ + folderKind in (root,generic) + approved alias 없음', async () => {
    const folders: Array<FolderRow & { createdAt?: Date }> = [
      // depth=2 unmatched (반환되어야 함)
      {
        id: 'ext-1',
        name: '대성목형',
        parentId: 'webhard-external-root-uuid',
        path: '/외부웹하드/대성목형',
        companyId: null,
        folderKind: 'generic',
        createdAt: new Date('2026-04-15T09:00:00Z'),
      },
      // depth=2 unmatched (반환되어야 함)
      {
        id: 'ext-2',
        name: '미매핑업체',
        parentId: 'webhard-external-root-uuid',
        path: '/외부웹하드/미매핑업체',
        companyId: null,
        folderKind: 'generic',
        createdAt: new Date('2026-04-16T09:00:00Z'),
      },
      // depth=2 BUT 이미 approved alias 있음 → 제외
      {
        id: 'ext-3',
        name: '이미매핑됨',
        parentId: 'webhard-external-root-uuid',
        path: '/외부웹하드/이미매핑됨',
        companyId: null,
        folderKind: 'generic',
        createdAt: new Date('2026-04-17T09:00:00Z'),
      },
      // depth=2 BUT companyId 가 채워져 있음 → 제외 (이미 매칭 완료)
      {
        id: 'ext-4',
        name: '이미통합',
        parentId: 'webhard-external-root-uuid',
        path: '/외부웹하드/이미통합',
        companyId: 7,
        folderKind: 'generic',
      },
      // depth=3 (외부 하위) — 반환되면 안 됨
      {
        id: 'ext-5-deep',
        name: '칼선의뢰',
        parentId: 'ext-1',
        path: '/외부웹하드/대성목형/칼선의뢰',
        companyId: null,
        folderKind: 'generic',
      },
      // template 폴더 — 반환되면 안 됨
      {
        id: 'ext-6-template',
        name: '문의',
        parentId: 'webhard-external-root-uuid',
        path: '/외부웹하드/문의',
        companyId: null,
        folderKind: 'template',
      },
    ];
    const { service } = buildSpec({
      folders,
      approvedAliasNames: ['이미매핑됨'],
    });

    const result = await service.getExternalUnmatchedFolders();

    const ids = result.map((r) => r.id).sort();
    expect(ids).toEqual(['ext-1', 'ext-2']);

    const ext1 = result.find((r) => r.id === 'ext-1');
    expect(ext1?.name).toBe('대성목형');
    expect(ext1?.path).toBe('/외부웹하드/대성목형');
    expect(typeof ext1?.createdAt).toBe('string');
  });

  it('F2: contactCount / fileCount BFS 누적 정확성', async () => {
    const folders: Array<FolderRow & { createdAt?: Date }> = [
      {
        id: 'ext-root',
        name: '대성목형',
        parentId: 'webhard-external-root-uuid',
        path: '/외부웹하드/대성목형',
        companyId: null,
        folderKind: 'generic',
        createdAt: new Date('2026-04-15T09:00:00Z'),
      },
      // BFS depth-1
      {
        id: 'ext-cutting',
        name: '칼선의뢰',
        parentId: 'ext-root',
        path: '/외부웹하드/대성목형/칼선의뢰',
        companyId: null,
        folderKind: 'generic',
      },
      // BFS depth-2
      {
        id: 'ext-inquiry',
        name: 'O123',
        parentId: 'ext-cutting',
        path: '/외부웹하드/대성목형/칼선의뢰/O123',
        companyId: null,
        folderKind: 'inquiry',
      },
    ];
    const files = [
      { id: 'f1', folderId: 'ext-root' },
      { id: 'f2', folderId: 'ext-cutting' },
      { id: 'f3', folderId: 'ext-inquiry' },
      { id: 'f4', folderId: 'ext-inquiry' },
      // soft-deleted — 카운트 제외
      { id: 'f5', folderId: 'ext-root', deletedAt: new Date() },
    ];
    const contacts = [
      { id: 'c1', webhardFolderId: 'ext-cutting' },
      { id: 'c2', webhardFolderId: 'ext-inquiry' },
      { id: 'c3', webhardFolderId: 'ext-inquiry' },
    ];
    const { service } = buildSpec({ folders, files, contacts });

    const result = await service.getExternalUnmatchedFolders();
    expect(result).toHaveLength(1);
    const ext = result[0];
    expect(ext.id).toBe('ext-root');
    expect(ext.fileCount).toBe(4); // f1, f2, f3, f4 (f5 deleted)
    expect(ext.contactCount).toBe(3); // c1, c2, c3
  });

  it('F3: 외부 root 500개도 root별 subtree/count 쿼리를 반복하지 않고 bulk count로 계산한다', async () => {
    const createdAt = new Date('2026-04-15T09:00:00Z');
    const roots: Array<FolderRow & { createdAt?: Date }> = Array.from({ length: 500 }, (_, i) => ({
      id: `ext-root-${i}`,
      name: `미매칭업체-${i}`,
      parentId: 'webhard-external-root-uuid',
      path: `/외부웹하드/미매칭업체-${i}`,
      companyId: null,
      folderKind: 'generic',
      createdAt,
    }));
    const children: Array<FolderRow & { createdAt?: Date }> = roots.map((root, i) => ({
      id: `ext-child-${i}`,
      name: '문의',
      parentId: root.id,
      path: `${root.path}/문의`,
      companyId: null,
      folderKind: 'template',
      createdAt,
    }));
    const files = [
      { id: 'file-a', folderId: 'ext-root-0' },
      { id: 'file-b', folderId: 'ext-child-0' },
      { id: 'file-c', folderId: 'ext-child-499' },
    ];
    const contacts = [
      { id: 'contact-a', webhardFolderId: 'ext-root-0' },
      { id: 'contact-b', webhardFolderId: 'ext-child-499' },
    ];
    const { service, prisma } = buildSpec({
      folders: [...roots, ...children],
      files,
      contacts,
    });

    const result = await service.getExternalUnmatchedFolders();

    expect(result).toHaveLength(500);
    expect(result.find((folder) => folder.id === 'ext-root-0')).toMatchObject({
      fileCount: 2,
      contactCount: 1,
    });
    expect(result.find((folder) => folder.id === 'ext-root-499')).toMatchObject({
      fileCount: 1,
      contactCount: 1,
    });
    expect(prisma.webhardFile.count).not.toHaveBeenCalled();
    expect(prisma.contact.count).not.toHaveBeenCalled();
    expect(prisma.webhardFile.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.contact.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.webhardFolder.findMany).toHaveBeenCalledTimes(2);
  });
});
