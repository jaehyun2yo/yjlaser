import { SearchService } from '../search.service';

// ============================================================
// Mock factories
// ============================================================

function makeFileRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-uuid-1',
    name: 'test.pdf',
    originalName: 'test.pdf',
    size: BigInt(1024),
    mimeType: 'application/pdf',
    path: 'webhard/test.pdf',
    folderId: null,
    companyId: null,
    uploadedBy: 'admin',
    inquiryNumber: null,
    isDownloaded: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    deletedBy: null,
    company: null,
    folder: null,
    ...overrides,
  };
}

function makeFolderRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'folder-uuid-1',
    name: '테스트폴더',
    parentId: null,
    companyId: null,
    path: '/테스트폴더',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    company: null,
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    executeWithRetry: jest.fn((fn: () => unknown) => fn()),
    webhardFile: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    webhardFolder: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(prismaOverrides);
  const mockFoldersService = { getAllFoldersForPathMap: async () => [] };
  const service = new SearchService(prisma as never, mockFoldersService as never);
  return { service, prisma };
}

const adminUser = { userType: 'admin' as const, userId: 'admin', companyId: 0 };
const companyUser = { userType: 'company' as const, userId: '5', companyId: 5 };

// ============================================================
// search
// ============================================================

describe('SearchService.search', () => {
  it('type=all: 파일과 폴더 모두 검색', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue([makeFileRecord()]);
    (prisma.webhardFolder.findMany as jest.Mock)
      .mockResolvedValueOnce([makeFolderRecord()]) // 폴더 검색 결과
      .mockResolvedValue([]); // buildFolderPathMap 용

    const result = await service.search({ q: 'test', type: 'all', limit: 50 }, adminUser);

    expect(result.files).toHaveLength(1);
    expect(result.folders).toHaveLength(1);
    expect(result.total).toBe(2);
  });

  it('type=file: 파일만 검색', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue([makeFileRecord()]);
    (prisma.webhardFolder.findMany as jest.Mock).mockResolvedValue([]); // buildFolderPathMap

    const result = await service.search({ q: 'test', type: 'file', limit: 50 }, adminUser);

    expect(result.files).toHaveLength(1);
    expect(result.folders).toHaveLength(0);
    expect(result.total).toBe(1);
  });

  it('type=folder: 폴더만 검색', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.webhardFolder.findMany as jest.Mock)
      .mockResolvedValueOnce([makeFolderRecord()]) // 폴더 검색 결과
      .mockResolvedValue([]); // buildFolderPathMap

    const result = await service.search({ q: 'test', type: 'folder', limit: 50 }, adminUser);

    expect(result.files).toHaveLength(0);
    expect(result.folders).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('빈 결과: files/folders 빈 배열, total=0', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.webhardFolder.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.search({ q: 'nonexistent', type: 'all', limit: 50 }, adminUser);

    expect(result.files).toEqual([]);
    expect(result.folders).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('업체 사용자: 에러 없이 결과 반환', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.webhardFolder.findMany as jest.Mock).mockResolvedValue([]);

    await expect(
      service.search({ q: 'test', type: 'all', limit: 50 }, companyUser)
    ).resolves.toBeDefined();
  });

  it('파일에 folder 정보 있으면 folder_path 포함', async () => {
    const { service, prisma } = makeService();
    const fileWithFolder = makeFileRecord({
      folderId: 'folder-uuid-1',
      folder: { id: 'folder-uuid-1', name: '작업폴더', parentId: null, path: '/작업폴더' },
    });
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue([fileWithFolder]);
    (prisma.webhardFolder.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.search({ q: '작업', type: 'all', limit: 50 }, adminUser);

    const fileResult = result.files[0] as unknown as Record<string, unknown>;
    expect(fileResult).toHaveProperty('folder_path');
    expect(fileResult.folder_path).toContain('작업폴더');
  });

  it('folder 정보 없는 파일은 folder_path = null', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue([makeFileRecord()]);
    (prisma.webhardFolder.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.search({ q: 'test', type: 'all', limit: 50 }, adminUser);

    const fileResult = result.files[0] as unknown as Record<string, unknown>;
    expect(fileResult.folder_path).toBeNull();
  });

  it('관리자가 companyId 필터로 검색', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.webhardFolder.findMany as jest.Mock).mockResolvedValue([]);

    await expect(
      service.search({ q: 'test', type: 'all', companyId: 5, limit: 50 }, adminUser)
    ).resolves.toBeDefined();

    expect(prisma.executeWithRetry).toHaveBeenCalled();
  });

  it('폴더 부모 경로 구성: 부모 있는 폴더는 path 포함', async () => {
    const { service, prisma } = makeService();
    const childFolder = makeFolderRecord({
      id: 'child-uuid',
      name: '자식폴더',
      parentId: 'parent-uuid',
    });
    const parentFolder = {
      id: 'parent-uuid',
      name: '부모폴더',
      parentId: null,
    };

    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.webhardFolder.findMany as jest.Mock)
      .mockResolvedValueOnce([childFolder]) // 검색 결과
      .mockResolvedValue([parentFolder, childFolder]); // buildFolderPathMap

    const result = await service.search({ q: '폴더', type: 'folder', limit: 50 }, adminUser);

    expect(result.folders).toHaveLength(1);
    // 부모 폴더가 있으면 path 구성됨
    expect(result.folders[0]).toHaveProperty('path');
  });

  it('폴더 DTO 필드: id, name, company_id, created_at 포함', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.webhardFolder.findMany as jest.Mock)
      .mockResolvedValueOnce([makeFolderRecord()])
      .mockResolvedValue([]);

    const result = await service.search({ q: '테스트', type: 'folder', limit: 50 }, adminUser);

    const folder = result.folders[0];
    expect(folder).toHaveProperty('id');
    expect(folder).toHaveProperty('name');
    expect(folder).toHaveProperty('company_id');
    expect(folder).toHaveProperty('created_at');
  });
});
