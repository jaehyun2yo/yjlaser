import { FilesService } from './files.service';
import { ForbiddenException } from '@nestjs/common';
import { StorageProvider } from '@prisma/client';
import { ConfirmUploadDto } from './dto/file.dto';
import { GetNewFilesQueryDto } from './dto/new-files.dto';
import { GetBadgeCountsQueryDto } from './dto/badge-counts.dto';
import { SessionUser } from '../auth/auth.service';
import type { DeviceAccessPrincipal } from '../integration/device-auth/device-auth.types';
import { buildWebhardFileFixture, shouldRunWebhardPerfTests } from '../../test/helpers/test-utils';

// Minimal Prisma mock factory
function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    executeWithRetry: jest.fn((fn: () => unknown) => fn()),
    $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    webhardFile: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    webhardFolder: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

const adminUser: SessionUser = {
  userId: 'admin',
  userType: 'admin',
  companyId: null,
};
const externalDevice: DeviceAccessPrincipal = {
  deviceId: 'external-device',
  environment: 'prd',
  programType: 'external_webhard_sync',
  capabilityProfile: 'standard',
  permissions: ['file/read', 'file/write', 'file/move'],
  credentialVersion: 1,
};

describe('FilesService device-scoped authorization', () => {
  it.each([
    {
      label: 'wrong program',
      programType: 'management_program' as const,
      permissions: ['file/read', 'file/write', 'file/move'] as const,
    },
    {
      label: 'missing permission',
      programType: 'external_webhard_sync' as const,
      permissions: [] as const,
    },
  ])(
    'rejects $label before every approved persistence or storage path',
    async ({ programType, permissions }) => {
      const prisma = makePrisma();
      const storageService = { getUploadPresignedUrl: jest.fn() };
      const service = new FilesService(
        prisma as never,
        storageService as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never
      );
      const principal: DeviceAccessPrincipal = {
        deviceId: 'management-device',
        environment: 'prd',
        programType,
        capabilityProfile: 'standard',
        permissions,
        credentialVersion: 1,
      };
      const operations = [
        () => service.getFilesForDevice({}, principal),
        () => service.getUploadPresignedUrlForDevice({} as never, principal),
        () => service.confirmUploadForDevice({} as never, principal),
        () => service.renameFileForDevice('file-id', {} as never, principal),
        () => service.moveFileForDevice('file-id', {} as never, principal),
      ];

      for (const operation of operations) {
        await expect(operation()).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(prisma.executeWithRetry).not.toHaveBeenCalled();
      expect(storageService.getUploadPresignedUrl).not.toHaveBeenCalled();
    }
  );
});

describe('AUDIT-06 webhard file performance fixture helpers', () => {
  it('기본 CI에서는 소량 파일 fixture 정확도만 검증한다', () => {
    const files = buildWebhardFileFixture({
      prefix: 'perf-audit06',
      totalFiles: 4,
      folderIds: ['folder-a', 'folder-b'],
      companyId: 7,
    });

    expect(files).toEqual([
      expect.objectContaining({
        id: 'perf-audit06-file-000000',
        name: 'perf-audit06-file-000000.dxf',
        folderId: 'folder-a',
        companyId: 7,
        path: 'webhard/perf-audit06/folder-a/perf-audit06-file-000000.dxf',
      }),
      expect.objectContaining({
        id: 'perf-audit06-file-000001',
        folderId: 'folder-b',
      }),
      expect.objectContaining({
        id: 'perf-audit06-file-000002',
        folderId: 'folder-a',
      }),
      expect.objectContaining({
        id: 'perf-audit06-file-000003',
        folderId: 'folder-b',
      }),
    ]);
  });

  it('100k 파일 fixture 성능 테스트는 RUN_PERF_TESTS=1일 때만 켜진다', () => {
    expect(shouldRunWebhardPerfTests({ RUN_PERF_TESTS: undefined })).toBe(false);
    expect(shouldRunWebhardPerfTests({ RUN_PERF_TESTS: '0' })).toBe(false);
    expect(shouldRunWebhardPerfTests({ RUN_PERF_TESTS: '1' })).toBe(true);
  });
});

describe('FilesService.getNewFiles', () => {
  let service: FilesService;
  let prisma: ReturnType<typeof makePrisma>;
  let foldersStub: { getAllFoldersForPathMap: jest.Mock };

  beforeEach(() => {
    prisma = makePrisma();
    // StorageService, EventsGateway stubs
    const storageStub = {} as never;
    const eventsStub = {} as never;
    // FilesService.buildFolderPathMap 이 foldersService.getAllFoldersForPathMap 을 호출.
    // folderId 가 있는 파일이 1건이라도 있으면 호출되므로 항상 mock 필요.
    foldersStub = { getAllFoldersForPathMap: jest.fn().mockResolvedValue([]) };
    service = new FilesService(
      prisma as never,
      storageStub,
      eventsStub,
      {} as never,
      foldersStub as never,
      {} as never
    );
  });

  it('folder_path가 null일 때 (folder_id=null 파일)', async () => {
    prisma.executeWithRetry.mockImplementation((fn: () => unknown) => fn());
    prisma.$transaction.mockResolvedValue([
      1,
      [
        {
          id: 'file-1',
          name: 'test.dxf',
          originalName: 'test.dxf',
          size: BigInt(1024),
          mimeType: 'application/octet-stream',
          path: 'files/test.dxf',
          folderId: null,
          companyId: null,
          uploadedBy: 'admin',
          inquiryNumber: null,
          isDownloaded: false,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          deletedAt: null,
          deletedBy: null,
          company: null,
          folder: null,
        },
      ],
    ]);

    const result = await service.getNewFiles(new GetNewFilesQueryDto(), adminUser);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].folder_path).toBeNull();
    expect(result.files[0].uploader_display_name).toBe('관리자');
  });

  it('uploadedBy=admin → uploader_display_name=관리자', async () => {
    prisma.executeWithRetry.mockImplementation((fn: () => unknown) => fn());
    prisma.$transaction.mockResolvedValue([
      1,
      [
        {
          id: 'file-2',
          name: 'sample.dxf',
          originalName: 'sample.dxf',
          size: BigInt(512),
          mimeType: 'application/octet-stream',
          path: 'files/sample.dxf',
          folderId: null,
          companyId: null,
          uploadedBy: 'admin',
          inquiryNumber: null,
          isDownloaded: false,
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
          deletedAt: null,
          deletedBy: null,
          company: null,
          folder: null,
        },
      ],
    ]);

    const result = await service.getNewFiles(new GetNewFilesQueryDto(), adminUser);

    expect(result.files[0].uploader_display_name).toBe('관리자');
  });

  it('uploadedBy!=admin → uploader_display_name=companyName', async () => {
    prisma.executeWithRetry.mockImplementation((fn: () => unknown) => fn());
    prisma.$transaction.mockResolvedValue([
      1,
      [
        {
          id: 'file-3',
          name: 'order.dxf',
          originalName: 'order.dxf',
          size: BigInt(2048),
          mimeType: 'application/octet-stream',
          path: 'files/order.dxf',
          folderId: null,
          companyId: 10,
          uploadedBy: 'company-10',
          inquiryNumber: null,
          isDownloaded: false,
          createdAt: new Date('2024-01-03'),
          updatedAt: new Date('2024-01-03'),
          deletedAt: null,
          deletedBy: null,
          company: { companyName: '원컴퍼니', managerName: '홍길동' },
          folder: null,
        },
      ],
    ]);

    const result = await service.getNewFiles(new GetNewFilesQueryDto(), adminUser);

    expect(result.files[0].uploader_display_name).toBe('원컴퍼니');
  });

  it('folder가 있을 때 folder_path breadcrumb 계산', async () => {
    const folderId = 'folder-1';
    const parentFolderId = 'folder-0';

    // buildFolderPathMap 은 foldersService.getAllFoldersForPathMap 으로 위임됨 (shared cache).
    foldersStub.getAllFoldersForPathMap.mockResolvedValue([
      { id: parentFolderId, name: '부모폴더', parentId: null },
      { id: folderId, name: '자식폴더', parentId: parentFolderId },
    ]);

    prisma.executeWithRetry.mockImplementation((fn: () => unknown) => fn());
    prisma.$transaction.mockResolvedValue([
      1,
      [
        {
          id: 'file-4',
          name: 'nested.dxf',
          originalName: 'nested.dxf',
          size: BigInt(4096),
          mimeType: 'application/octet-stream',
          path: 'files/nested.dxf',
          folderId,
          companyId: null,
          uploadedBy: 'admin',
          inquiryNumber: null,
          isDownloaded: false,
          createdAt: new Date('2024-01-04'),
          updatedAt: new Date('2024-01-04'),
          deletedAt: null,
          deletedBy: null,
          company: null,
          folder: { id: folderId, name: '자식폴더', parentId: parentFolderId },
        },
      ],
    ]);

    const result = await service.getNewFiles(new GetNewFilesQueryDto(), adminUser);

    expect(result.files[0].folder_path).toBe('부모폴더 / 자식폴더');
  });

  it('sortBy=uploaded_by가 유효한 값으로 처리됨', async () => {
    prisma.executeWithRetry.mockImplementation((fn: () => unknown) => fn());
    prisma.$transaction.mockResolvedValue([0, []]);

    const query = new GetNewFilesQueryDto();
    query.sortBy = 'uploaded_by';
    query.sortOrder = 'asc';

    // 에러 없이 실행되는지만 확인
    await expect(service.getNewFiles(query, adminUser)).resolves.toBeDefined();
  });

  it('hasMore 계산 정확성', async () => {
    prisma.executeWithRetry.mockImplementation((fn: () => unknown) => fn());
    prisma.$transaction.mockResolvedValue([100, []]);

    const query = new GetNewFilesQueryDto();
    query.page = 1;
    query.limit = 50;

    const result = await service.getNewFiles(query, adminUser);

    expect(result.total).toBe(100);
    expect(result.hasMore).toBe(true);
  });
});

describe('FilesService.getBadgeCounts — folderCounts 부모 전파', () => {
  let service: FilesService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new FilesService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
  });

  function makeQuery(overrides: Partial<GetBadgeCountsQueryDto> = {}): GetBadgeCountsQueryDto {
    const q = new GetBadgeCountsQueryDto();
    q.includeFolderCounts = true;
    Object.assign(q, overrides);
    return q;
  }

  it('includeFolderCounts 기본값이 true임', () => {
    const q = new GetBadgeCountsQueryDto();
    expect(q.includeFolderCounts).toBe(true);
  });

  it('하위 폴더 없는 단일 폴더: folderCounts = directCounts', async () => {
    // groupBy: folder-1에 파일 3개
    prisma.executeWithRetry
      .mockImplementationOnce((fn: () => unknown) => fn()) // count → 3
      .mockImplementationOnce(() => Promise.resolve([{ folderId: 'folder-1', _count: 3 }])) // groupBy
      .mockImplementationOnce(() => Promise.resolve([{ id: 'folder-1', parentId: null }])); // allFolders

    prisma.webhardFile.count.mockResolvedValue(3);

    const result = await service.getBadgeCounts(makeQuery(), adminUser);

    expect(result.folderCounts?.['folder-1']).toBe(3);
  });

  it('2단계 중첩: 부모 folderCounts = 자신 직접 + 자식 합산', async () => {
    // parent: 2개, child: 5개 직접 파일
    prisma.executeWithRetry
      .mockImplementationOnce((fn: () => unknown) => fn()) // count
      .mockImplementationOnce(() =>
        Promise.resolve([
          { folderId: 'parent', _count: 2 },
          { folderId: 'child', _count: 5 },
        ])
      ) // groupBy
      .mockImplementationOnce(() =>
        Promise.resolve([
          { id: 'parent', parentId: null },
          { id: 'child', parentId: 'parent' },
        ])
      ); // allFolders

    prisma.webhardFile.count.mockResolvedValue(7);

    const result = await service.getBadgeCounts(makeQuery(), adminUser);

    expect(result.folderCounts?.['child']).toBe(5);
    expect(result.folderCounts?.['parent']).toBe(7); // 2 + 5
  });

  it('3단계 중첩: 최상위 folderCounts = 전체 합산', async () => {
    // top: 1, mid: 2, leaf: 4
    prisma.executeWithRetry
      .mockImplementationOnce((fn: () => unknown) => fn()) // count
      .mockImplementationOnce(() =>
        Promise.resolve([
          { folderId: 'folder-top', _count: 1 },
          { folderId: 'folder-mid', _count: 2 },
          { folderId: 'folder-leaf', _count: 4 },
        ])
      ) // groupBy
      .mockImplementationOnce(() =>
        Promise.resolve([
          { id: 'folder-top', parentId: null },
          { id: 'folder-mid', parentId: 'folder-top' },
          { id: 'folder-leaf', parentId: 'folder-mid' },
        ])
      ); // allFolders

    prisma.webhardFile.count.mockResolvedValue(7);

    const result = await service.getBadgeCounts(makeQuery(), adminUser);

    expect(result.folderCounts?.['folder-leaf']).toBe(4);
    expect(result.folderCounts?.['folder-mid']).toBe(6); // 2 + 4
    expect(result.folderCounts?.['folder-top']).toBe(7); // 1 + 2 + 4
  });

  it('직접 파일 없고 하위에만 파일 있는 폴더: folderCounts에 포함됨', async () => {
    // parent: 직접 파일 없음, child: 3개
    prisma.executeWithRetry
      .mockImplementationOnce((fn: () => unknown) => fn()) // count
      .mockImplementationOnce(() => Promise.resolve([{ folderId: 'child', _count: 3 }])) // groupBy (parent 없음)
      .mockImplementationOnce(() =>
        Promise.resolve([
          { id: 'parent', parentId: null },
          { id: 'child', parentId: 'parent' },
        ])
      ); // allFolders

    prisma.webhardFile.count.mockResolvedValue(3);

    const result = await service.getBadgeCounts(makeQuery(), adminUser);

    expect(result.folderCounts?.['parent']).toBe(3); // 하위 전파
    expect(result.folderCounts?.['child']).toBe(3);
  });

  it('includeFolderCounts=false이면 folderCounts 미포함', async () => {
    prisma.executeWithRetry.mockImplementation((fn: () => unknown) => fn());
    prisma.webhardFile.count.mockResolvedValue(5);

    const result = await service.getBadgeCounts(
      makeQuery({ includeFolderCounts: false }),
      adminUser
    );

    expect(result.folderCounts).toBeUndefined();
  });

  it('admin companyId 필터 조회는 업체 폴더와 legacy null bridge 폴더로 전파 범위를 좁힌다', async () => {
    prisma.executeWithRetry
      .mockImplementationOnce((fn: () => unknown) => fn())
      .mockImplementationOnce(() => Promise.resolve([]))
      .mockImplementationOnce((fn: () => unknown) => fn());
    prisma.webhardFile.count.mockResolvedValue(0);
    prisma.webhardFolder.findMany.mockResolvedValue([]);

    await service.getBadgeCounts(makeQuery({ companyId: 7 }), adminUser);

    expect(prisma.webhardFile.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        isDownloaded: false,
        companyId: 7,
      },
    });
    expect(prisma.webhardFolder.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        OR: [{ companyId: 7 }, { companyId: null }],
      },
      select: { id: true, parentId: true },
    });
  });
});

describe('GetNewFilesQueryDto sortBy validation', () => {
  it('uploaded_by가 유효한 sortBy 값임', () => {
    const dto = new GetNewFilesQueryDto();
    dto.sortBy = 'uploaded_by';
    // class-validator 직접 테스트는 validate() 필요하므로 타입만 확인
    expect(dto.sortBy).toBe('uploaded_by');
  });

  it('기본값은 created_at', () => {
    const dto = new GetNewFilesQueryDto();
    expect(dto.sortBy).toBe('created_at');
    expect(dto.sortOrder).toBe('desc');
  });
});

interface UploadRoutingFolderRow {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  companyId: number | null;
  folderKind: string;
  deletedAt: Date | null;
  storageProvider: StorageProvider;
  driveFolderId: string | null;
}

function buildConfirmUploadRoutingService() {
  const company = { id: 4, companyName: '대성목형', managerName: null };
  const externalRoot: UploadRoutingFolderRow = {
    id: 'external-root-folder',
    name: '대성목형(2265-1295)',
    path: '/외부웹하드/대성목형(2265-1295)',
    parentId: 'webhard-external-root',
    companyId: null,
    folderKind: 'generic',
    deletedAt: null,
    storageProvider: StorageProvider.R2,
    driveFolderId: null,
  };
  const nestedExternal: UploadRoutingFolderRow = {
    id: 'nested-external-folder',
    name: '목형의뢰',
    path: `${externalRoot.path}/목형의뢰`,
    parentId: externalRoot.id,
    companyId: null,
    folderKind: 'generic',
    deletedAt: null,
    storageProvider: StorageProvider.R2,
    driveFolderId: null,
  };
  const companyRoot: UploadRoutingFolderRow = {
    id: 'company-root-folder',
    name: company.companyName,
    path: `/${company.companyName}`,
    parentId: null,
    companyId: company.id,
    folderKind: 'company_root',
    deletedAt: null,
    storageProvider: StorageProvider.R2,
    driveFolderId: null,
  };
  const foldersById = new Map([
    [externalRoot.id, externalRoot],
    [nestedExternal.id, nestedExternal],
    [companyRoot.id, companyRoot],
  ]);
  const createdAt = new Date('2026-06-24T09:00:00.000Z');

  const prisma = {
    executeWithRetry: jest.fn(async (fn: () => unknown) => fn()),
    $transaction: jest.fn(),
    webhardFolder: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        return foldersById.get(where.id) ?? null;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.companyId === company.id && where.parentId === null) {
          return { id: companyRoot.id };
        }
        return null;
      }),
      create: jest.fn(),
    },
    companyFolderAlias: {
      findFirst: jest.fn(async ({ where }: { where: { folderName: string; status: string } }) => {
        if (where.folderName === externalRoot.name && where.status === 'approved') {
          return { company };
        }
        return null;
      }),
    },
    company: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async ({ where }: { where: { id: number } }) => {
        return where.id === company.id ? company : null;
      }),
    },
    notification: {
      create: jest.fn().mockResolvedValue({}),
    },
    webhardFile: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'routed-file',
        name: data.name,
        originalName: data.originalName,
        size: BigInt(Number(data.size)),
        mimeType: data.mimeType,
        path: data.path,
        folderId: data.folderId,
        companyId: data.companyId,
        uploadedBy: data.uploadedBy,
        inquiryNumber: data.inquiryNumber,
        isDownloaded: data.isDownloaded,
        storageProvider: data.storageProvider,
        driveFileId: null,
        driveMimeType: null,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
        deletedBy: null,
        company: { companyName: company.companyName, managerName: null },
      })),
      update: jest.fn(),
    },
  };
  const storageService = {
    invalidateStorageCache: jest.fn().mockResolvedValue(undefined),
    generateStoragePath: jest.fn(
      (companyId: number | null, folderId: string | null, filename: string) =>
        ['webhard', companyId === null ? 'admin' : `company-${companyId}`, folderId, filename]
          .filter((segment): segment is string => Boolean(segment))
          .join('/')
    ),
    getUploadPresignedUrl: jest.fn(async (key: string) => ({
      url: 'https://storage.invalid/upload',
      key,
      expiresAt: new Date('2026-07-20T00:10:00.000Z'),
    })),
    createDriveFolder: jest.fn(),
  };
  const eventsGateway = {
    emitToFolder: jest.fn(),
  };
  const autoContactService = {
    detectAndCreate: jest.fn().mockResolvedValue({ contactId: 'auto-contact' }),
  };
  const foldersService = {
    propagateUpdatedAt: jest.fn().mockResolvedValue(undefined),
  };
  const service = new FilesService(
    prisma as never,
    storageService as never,
    eventsGateway as never,
    autoContactService as never,
    foldersService as never,
    {} as never
  );

  return {
    service,
    prisma,
    storageService,
    eventsGateway,
    foldersService,
    externalRoot,
    nestedExternal,
    companyRoot,
    company,
  };
}

function buildDeviceFileMoveService(sourceCompanyId: number | null) {
  const createdAt = new Date('2026-07-20T00:00:00.000Z');
  const file = {
    id: 'file-1',
    name: 'drawing.dxf',
    originalName: 'drawing.dxf',
    size: BigInt(128),
    mimeType: 'application/dxf',
    path: 'drawing.dxf',
    folderId: sourceCompanyId === null ? 'external-source' : 'company-source',
    companyId: sourceCompanyId,
    uploadedBy: 'device',
    inquiryNumber: null,
    isDownloaded: false,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    deletedBy: null,
    storageProvider: StorageProvider.R2,
    driveFileId: null,
    driveMimeType: null,
    company: null,
  };
  const prisma = {
    executeWithRetry: jest.fn((fn: () => unknown) => fn()),
    webhardFile: {
      findUnique: jest.fn().mockResolvedValue(file),
      update: jest.fn(async ({ data }: { data: { folderId: string | null } }) => ({
        ...file,
        folderId: data.folderId,
      })),
    },
    webhardFolder: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        companyId: where.id === 'target-company-8' ? 8 : null,
        deletedAt: null,
        storageProvider: StorageProvider.R2,
        driveFolderId: null,
      })),
    },
  };
  const storageService = { moveDriveFile: jest.fn() };
  const eventsGateway = { emitToFolder: jest.fn() };
  const service = new FilesService(
    prisma as never,
    storageService as never,
    eventsGateway as never,
    {} as never,
    {} as never,
    {} as never
  );
  return { service, prisma, storageService, eventsGateway };
}

describe('FilesService device resource namespace integrity', () => {
  it('rejects device presign companyId before routing can lazy-create folders', async () => {
    const { service, prisma, storageService, eventsGateway, externalRoot } =
      buildConfirmUploadRoutingService();
    const lazyCreate = jest.fn().mockResolvedValue('lazy-company-folder');
    const routingAttempt = jest.fn(async () => {
      await lazyCreate();
      return { folderId: 'lazy-company-folder', companyId: 4 };
    });
    const pipelineEvent = jest.fn();
    const internals = service as unknown as {
      tryRouteExternalUpload: typeof routingAttempt;
      recordPipelineEvent: typeof pipelineEvent;
    };
    internals.tryRouteExternalUpload = routingAttempt;
    internals.recordPipelineEvent = pipelineEvent;

    await expect(
      service.getUploadPresignedUrlForDevice(
        {
          filename: 'drawing.dxf',
          contentType: 'application/dxf',
          folderId: externalRoot.id,
          companyId: 4,
        },
        externalDevice
      )
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(routingAttempt).not.toHaveBeenCalled();
    expect(lazyCreate).not.toHaveBeenCalled();
    expect(pipelineEvent).not.toHaveBeenCalled();
    expect(prisma.executeWithRetry).not.toHaveBeenCalled();
    expect(prisma.webhardFile.create).not.toHaveBeenCalled();
    expect(storageService.getUploadPresignedUrl).not.toHaveBeenCalled();
    expect(eventsGateway.emitToFolder).not.toHaveBeenCalled();
  });

  it('rejects device confirm companyId before throwing routing or pipeline logging', async () => {
    const { service, prisma, storageService, eventsGateway, externalRoot } =
      buildConfirmUploadRoutingService();
    const routingAttempt = jest.fn().mockRejectedValue(new Error('routing must not run'));
    const pipelineEvent = jest.fn();
    const internals = service as unknown as {
      tryRouteExternalUpload: typeof routingAttempt;
      recordPipelineEvent: typeof pipelineEvent;
    };
    internals.tryRouteExternalUpload = routingAttempt;
    internals.recordPipelineEvent = pipelineEvent;

    await expect(
      service.confirmUploadForDevice(
        {
          key: 'routed/drawing.dxf',
          name: 'drawing.dxf',
          originalName: 'drawing.dxf',
          size: 128,
          mimeType: 'application/dxf',
          folderId: externalRoot.id,
          companyId: 4,
          storageProvider: 'r2',
        },
        externalDevice
      )
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(routingAttempt).not.toHaveBeenCalled();
    expect(pipelineEvent).not.toHaveBeenCalled();
    expect(prisma.executeWithRetry).not.toHaveBeenCalled();
    expect(prisma.webhardFile.create).not.toHaveBeenCalled();
    expect(storageService.invalidateStorageCache).not.toHaveBeenCalled();
    expect(eventsGateway.emitToFolder).not.toHaveBeenCalled();
  });

  it.each([
    ['presign', 'getUploadPresignedUrlForDevice' as const],
    ['confirm', 'confirmUploadForDevice' as const],
  ])(
    'rejects routed %s companyId mismatch before storage, create, or event work',
    async (_label, method) => {
      const { service, prisma, storageService, eventsGateway, externalRoot } =
        buildConfirmUploadRoutingService();
      const dto =
        method === 'getUploadPresignedUrlForDevice'
          ? {
              filename: 'drawing.dxf',
              contentType: 'application/dxf',
              folderId: externalRoot.id,
              companyId: 999,
            }
          : {
              key: 'routed/drawing.dxf',
              name: 'drawing.dxf',
              originalName: 'drawing.dxf',
              size: 128,
              mimeType: 'application/dxf',
              folderId: externalRoot.id,
              companyId: 999,
              storageProvider: 'r2' as const,
            };

      const operation =
        method === 'getUploadPresignedUrlForDevice'
          ? service.getUploadPresignedUrlForDevice(dto as never, externalDevice)
          : service.confirmUploadForDevice(dto as never, externalDevice);
      await expect(operation).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.webhardFile.create).not.toHaveBeenCalled();
      expect(storageService.getUploadPresignedUrl).not.toHaveBeenCalled();
      expect(storageService.invalidateStorageCache).not.toHaveBeenCalled();
      expect(eventsGateway.emitToFolder).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['presign', 'getUploadPresignedUrlForDevice' as const],
    ['confirm', 'confirmUploadForDevice' as const],
  ])(
    'rejects folderless device %s with a non-null companyId before mutation',
    async (_label, method) => {
      const { service, prisma, storageService, eventsGateway } = buildConfirmUploadRoutingService();
      const dto =
        method === 'getUploadPresignedUrlForDevice'
          ? { filename: 'drawing.dxf', contentType: 'application/dxf', companyId: 4 }
          : {
              key: 'root/drawing.dxf',
              name: 'drawing.dxf',
              originalName: 'drawing.dxf',
              size: 128,
              mimeType: 'application/dxf',
              companyId: 4,
              storageProvider: 'r2' as const,
            };

      const operation =
        method === 'getUploadPresignedUrlForDevice'
          ? service.getUploadPresignedUrlForDevice(dto as never, externalDevice)
          : service.confirmUploadForDevice(dto as never, externalDevice);
      await expect(operation).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.webhardFile.create).not.toHaveBeenCalled();
      expect(storageService.getUploadPresignedUrl).not.toHaveBeenCalled();
      expect(storageService.invalidateStorageCache).not.toHaveBeenCalled();
      expect(eventsGateway.emitToFolder).not.toHaveBeenCalled();
    }
  );

  it('preserves routed device confirm when companyId is omitted', async () => {
    const { service, company, companyRoot } = buildConfirmUploadRoutingService();
    const result = await service.confirmUploadForDevice(
      {
        key: `webhard/company-${company.id}/${companyRoot.id}/drawing.dxf`,
        name: 'drawing.dxf',
        originalName: 'drawing.dxf',
        size: 128,
        mimeType: 'application/dxf',
        folderId: companyRoot.id,
        storageProvider: 'r2',
      },
      externalDevice
    );
    expect(result).toMatchObject({ folder_id: companyRoot.id, company_id: company.id });
  });

  it('rejects a nested device confirm wrong key without rerouting or lazy side effects', async () => {
    const { service, prisma, storageService, eventsGateway, nestedExternal } =
      buildConfirmUploadRoutingService();
    const lazyFolderCreate = jest.fn().mockResolvedValue('lazy-company-child');
    const routingAttempt = jest.fn(async () => {
      await lazyFolderCreate();
      await storageService.createDriveFolder();
      return { folderId: 'lazy-company-child', companyId: 4 };
    });
    const pipelineEvent = jest.fn();
    const internals = service as unknown as {
      tryRouteExternalUpload: typeof routingAttempt;
      recordPipelineEvent: typeof pipelineEvent;
    };
    internals.tryRouteExternalUpload = routingAttempt;
    internals.recordPipelineEvent = pipelineEvent;

    await expect(
      service.confirmUploadForDevice(
        {
          key: 'webhard/company-40/lazy-company-child/stolen.dxf',
          name: 'drawing.dxf',
          originalName: 'drawing.dxf',
          size: 128,
          mimeType: 'application/dxf',
          folderId: nestedExternal.id,
          storageProvider: 'r2',
        },
        externalDevice
      )
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(routingAttempt).not.toHaveBeenCalled();
    expect(lazyFolderCreate).not.toHaveBeenCalled();
    expect(storageService.createDriveFolder).not.toHaveBeenCalled();
    expect(pipelineEvent).not.toHaveBeenCalled();
    expect(prisma.webhardFolder.create).not.toHaveBeenCalled();
    expect(prisma.webhardFile.create).not.toHaveBeenCalled();
    expect(prisma.webhardFile.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(storageService.invalidateStorageCache).not.toHaveBeenCalled();
    expect(eventsGateway.emitToFolder).not.toHaveBeenCalled();
  });

  it('rejects a device R2 confirm key outside the server-derived company and folder prefix', async () => {
    const { service, prisma, storageService, eventsGateway, externalRoot } =
      buildConfirmUploadRoutingService();
    const pipelineEvent = jest.fn();
    (
      service as unknown as {
        recordPipelineEvent: typeof pipelineEvent;
      }
    ).recordPipelineEvent = pipelineEvent;

    await expect(
      service.confirmUploadForDevice(
        {
          key: 'webhard/company-8/company-8-folder/stolen.dxf',
          name: 'drawing.dxf',
          originalName: 'drawing.dxf',
          size: 128,
          mimeType: 'application/dxf',
          folderId: externalRoot.id,
          storageProvider: 'r2',
        },
        externalDevice
      )
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.webhardFile.create).not.toHaveBeenCalled();
    expect(prisma.webhardFile.update).not.toHaveBeenCalled();
    expect(prisma.webhardFolder.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(pipelineEvent).not.toHaveBeenCalled();
    expect(storageService.getUploadPresignedUrl).not.toHaveBeenCalled();
    expect(storageService.invalidateStorageCache).not.toHaveBeenCalled();
    expect(eventsGateway.emitToFolder).not.toHaveBeenCalled();
  });

  it('accepts the exact R2 key returned by device presign for the routed destination', async () => {
    const { service, company, companyRoot, externalRoot } = buildConfirmUploadRoutingService();
    const presign = await service.getUploadPresignedUrlForDevice(
      {
        filename: 'drawing.dxf',
        contentType: 'application/dxf',
        folderId: externalRoot.id,
      },
      externalDevice
    );
    if (!presign.folderId) throw new Error('expected routed presign folderId');

    const result = await service.confirmUploadForDevice(
      {
        key: presign.key,
        name: 'drawing.dxf',
        originalName: 'drawing.dxf',
        size: 128,
        mimeType: 'application/dxf',
        folderId: presign.folderId,
        storageProvider: 'r2',
      },
      externalDevice
    );

    expect(presign.key).toMatch(new RegExp(`^webhard/company-${company.id}/${companyRoot.id}/`));
    expect(result).toMatchObject({ folder_id: companyRoot.id, company_id: company.id });
  });

  it.each([
    ['cross-company target', 7, 'target-company-8'],
    ['non-null source to null root', 7, null],
  ])(
    'rejects device file move to $label before update, storage, or events',
    async (_label, sourceCompanyId, folderId) => {
      const { service, prisma, storageService, eventsGateway } =
        buildDeviceFileMoveService(sourceCompanyId);
      await expect(
        service.moveFileForDevice('file-1', { folderId }, externalDevice)
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.webhardFile.update).not.toHaveBeenCalled();
      expect(storageService.moveDriveFile).not.toHaveBeenCalled();
      expect(eventsGateway.emitToFolder).not.toHaveBeenCalled();
    }
  );

  it('allows a null-namespace device file to move to the null root', async () => {
    const { service, prisma } = buildDeviceFileMoveService(null);
    await service.moveFileForDevice('file-1', { folderId: null }, externalDevice);
    expect(prisma.webhardFile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { folderId: null } })
    );
  });
});

describe('FilesService.confirmUpload — 외부웹하드 매핑 후 신규 업로드 라우팅', () => {
  it('원본 외부웹하드 husk folderId로 confirm해도 파일 DB row는 매핑된 업체 root folder/companyId로 저장된다', async () => {
    const { service, prisma, eventsGateway, foldersService, externalRoot, companyRoot, company } =
      buildConfirmUploadRoutingService();
    const dto: ConfirmUploadDto = {
      key: 'webhard/company-root-folder/routed-file.dxf',
      name: 'routed-file.dxf',
      originalName: 'routed-file.dxf',
      size: 1024,
      mimeType: 'application/dxf',
      folderId: externalRoot.id,
      storageProvider: 'r2',
    };

    const result = await service.confirmUpload(dto, adminUser);

    expect(prisma.companyFolderAlias.findFirst).toHaveBeenCalledWith({
      where: { folderName: externalRoot.name, status: 'approved' },
      include: {
        company: {
          select: { id: true, companyName: true },
        },
      },
    });
    expect(prisma.webhardFile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        folderId: companyRoot.id,
        companyId: company.id,
        path: dto.key,
        storageProvider: StorageProvider.R2,
      }),
      include: {
        company: {
          select: {
            companyName: true,
            managerName: true,
          },
        },
      },
    });
    expect(result.folder_id).toBe(companyRoot.id);
    expect(result.company_id).toBe(company.id);
    expect(eventsGateway.emitToFolder).toHaveBeenCalledWith(companyRoot.id, {
      type: 'file:created',
      folderId: companyRoot.id,
      data: { fileId: 'routed-file' },
    });
    expect(foldersService.propagateUpdatedAt).toHaveBeenCalledWith(
      companyRoot.id,
      expect.any(Date)
    );
  });
});
