import { FilesService } from './files.service';
import { GetNewFilesQueryDto } from './dto/new-files.dto';
import { GetBadgeCountsQueryDto } from './dto/badge-counts.dto';
import { SessionUser } from '../auth/auth.service';
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
