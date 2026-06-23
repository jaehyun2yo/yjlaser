/**
 * StorageService unit tests (DB 관련 메서드만)
 *
 * Phase 2 DB refactoring guard: Raw SQL 집계 쿼리
 * 이 테스트는 리팩토링 전/후 모두 동일한 인터페이스로 동작하는지 검증합니다.
 *
 * Raw SQL 사용:
 * - fetchPerformanceMetrics: webhard_files 크기 분포 + webhard_folders 깊이 (2건 $queryRaw)
 * - getStorageUsage: companyStorage fallback 시 aggregate (간접 raw SQL 가능)
 * - getStorageBreakdown: webhardFile groupBy (Prisma ORM)
 *
 * 참고: S3/R2 관련 메서드는 이 테스트 범위에 포함되지 않습니다.
 */

import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SessionUser } from '../../auth/auth.service';
import { DEFAULT_STORAGE_LIMIT, ADMIN_STORAGE_LIMIT } from '../dto/storage.dto';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

// ─── Mock 타입 정의 ──────────────────────────────────────────
interface MockPrisma {
  $queryRaw: jest.Mock;
  executeWithRetry: jest.Mock;
  webhardFile: {
    count: jest.Mock;
    aggregate: jest.Mock;
    groupBy: jest.Mock;
  };
  webhardFolder: {
    count: jest.Mock;
    findMany: jest.Mock;
  };
  company: {
    count: jest.Mock;
    findMany: jest.Mock;
  };
  companyStorage: {
    findUnique: jest.Mock;
    aggregate: jest.Mock;
  };
}

function makePrisma(): MockPrisma {
  return {
    $queryRaw: jest.fn(),
    executeWithRetry: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
    webhardFile: {
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    webhardFolder: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    company: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    companyStorage: {
      findUnique: jest.fn(),
      aggregate: jest.fn(),
    },
  };
}

// StorageService 생성 시 ConfigService가 필요하므로 mock
function makeConfigService() {
  const config: Record<string, string> = {
    R2_ACCOUNT_ID: 'test-account',
    R2_ACCESS_KEY_ID: 'test-key',
    R2_SECRET_ACCESS_KEY: 'test-secret',
    R2_BUCKET_NAME: 'test-bucket',
    R2_PUBLIC_BASE_URL: 'https://test.example.com',
    SESSION_SECRET: 's'.repeat(32),
  };
  return {
    get: jest.fn((key: string, defaultValue?: string) => config[key] ?? defaultValue),
  };
}

const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

// StorageService를 동적으로 import하기 위한 helper
// S3Client 생성 등 외부 의존성이 있어서 직접 new 대신 private 메서드 테스트 불가
// 대신 서비스의 공개 메서드를 테스트합니다.

function serializeLoggerCalls(spy: jest.SpyInstance): string {
  return spy.mock.calls
    .map((args: unknown[]) =>
      args
        .map((arg: unknown) => {
          if (arg instanceof Error) {
            return `${arg.name} ${arg.message} ${arg.stack ?? ''}`;
          }
          return typeof arg === 'string' ? arg : JSON.stringify(arg);
        })
        .join(' ')
    )
    .join('\n');
}

// ──────────────────────────────────────────────────────────────
// Presigned URL failure logs — raw URL/token/path 차단
// ──────────────────────────────────────────────────────────────
describe('StorageService presigned URL failure logging', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: any;
  let prisma: MockPrisma;
  let errorSpy: jest.SpyInstance;

  beforeEach(async () => {
    prisma = makePrisma();
    const configService = makeConfigService();
    const { StorageService } = await import('../storage.service');
    const mockCacheManager = { get: async () => null, set: async () => {}, del: async () => {} };
    service = new StorageService(
      configService as never,
      prisma as never,
      mockCacheManager as never
    );
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    mockedGetSignedUrl.mockReset();
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('upload/download/multipart presigned URL 생성 실패 로그에 raw URL/token/local path를 남기지 않는다', async () => {
    const rawError = new Error(
      'url=https://storage.example.com/file.dxf?X-Amz-Signature=raw-signature token=raw-token path=C:\\Users\\jaehy\\secret-file.dxf'
    );
    mockedGetSignedUrl.mockRejectedValue(rawError);

    await expect(
      service.getUploadPresignedUrl('webhard/company-1/raw-file.dxf', 'application/dxf')
    ).rejects.toThrow('Failed to generate upload URL');
    await expect(
      service.getDownloadPresignedUrl('webhard/company-1/raw-file.dxf', 300, 'raw-file.dxf')
    ).rejects.toThrow('Failed to generate download URL');
    await expect(
      service.getMultipartPresignedUrl('webhard/company-1/raw-file.dxf', 'upload-id-1', 1)
    ).rejects.toThrow('Failed to generate part upload URL');

    const serialized = serializeLoggerCalls(errorSpy);
    expect(serialized).toContain('presigned_url_generation_failed');
    expect(serialized).toContain('operation=upload');
    expect(serialized).toContain('operation=download');
    expect(serialized).toContain('operation=multipart');
    expect(serialized).not.toContain('raw-signature');
    expect(serialized).not.toContain('raw-token');
    expect(serialized).not.toContain('C:\\Users\\jaehy');
    expect(serialized).not.toContain('webhard/company-1/raw-file.dxf');
  });
});

// ──────────────────────────────────────────────────────────────
// Drive upload proof — confirm-time Drive GET 제거용 서명 검증
// ──────────────────────────────────────────────────────────────
describe('StorageService Drive upload proof', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: any;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = makePrisma();
    const configService = makeConfigService();
    const { StorageService } = await import('../storage.service');
    const mockCacheManager = { get: async () => null, set: async () => {}, del: async () => {} };
    service = new StorageService(
      configService as never,
      prisma as never,
      mockCacheManager as never
    );
  });

  it('verifies a server-signed Drive upload proof for the expected parent', () => {
    const proof = service.createDriveUploadProof({
      provider: 'google_drive',
      storageFileId: 'drive-file-1',
      name: 'sample.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      parentStorageFolderIds: ['drive-folder-1'],
    });

    const metadata = service.verifyDriveUploadProof({
      proof,
      storageFileId: 'drive-file-1',
      expectedParentStorageFolderId: 'drive-folder-1',
    });

    expect(metadata).toMatchObject({
      storageFileId: 'drive-file-1',
      mimeType: 'application/pdf',
      parentStorageFolderIds: ['drive-folder-1'],
    });
  });

  it('rejects a Drive upload proof when the expected parent differs', () => {
    const proof = service.createDriveUploadProof({
      provider: 'google_drive',
      storageFileId: 'drive-file-1',
      name: 'sample.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      parentStorageFolderIds: ['drive-folder-1'],
    });

    expect(() =>
      service.verifyDriveUploadProof({
        proof,
        storageFileId: 'drive-file-1',
        expectedParentStorageFolderId: 'other-drive-folder',
      })
    ).toThrow('Drive file parent mismatch');
  });

  it('rejects a Drive upload proof with extra segments', () => {
    const proof = service.createDriveUploadProof({
      provider: 'google_drive',
      storageFileId: 'drive-file-1',
      name: 'sample.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      parentStorageFolderIds: ['drive-folder-1'],
    });

    expect(() =>
      service.verifyDriveUploadProof({
        proof: `${proof}.extra`,
        storageFileId: 'drive-file-1',
        expectedParentStorageFolderId: 'drive-folder-1',
      })
    ).toThrow('Invalid Drive upload proof');
  });
});

// ──────────────────────────────────────────────────────────────
// 1. getStorageUsage — 저장공간 사용량 조회
// ──────────────────────────────────────────────────────────────
describe('StorageService.getStorageUsage', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: any;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = makePrisma();
    prisma.webhardFile.aggregate.mockResolvedValue({ _sum: { size: BigInt(0) } });
    const configService = makeConfigService();

    // StorageService를 직접 인스턴스화 (constructor에서 S3Client 생성)
    const { StorageService } = await import('../storage.service');
    const mockCacheManager = { get: async () => null, set: async () => {}, del: async () => {} };
    service = new StorageService(
      configService as never,
      prisma as never,
      mockCacheManager as never
    );
  });

  it('company 사용자 → companyStorage 테이블에서 조회', async () => {
    const user: SessionUser = {
      userType: 'company',
      userId: 1,
      companyId: 10,
    };

    prisma.companyStorage.findUnique.mockResolvedValue({
      companyId: 10,
      usedBytes: BigInt(1024 * 1024 * 100), // 100MB
    });

    const result = await service.getStorageUsage(user);

    expect(result.current).toBe(1024 * 1024 * 100);
    expect(result.active).toBe(1024 * 1024 * 100);
    expect(result.trash).toBe(0);
    expect(result.max).toBe(DEFAULT_STORAGE_LIMIT);
    expect(result.companyId).toBe(10);
    expect(typeof result.percentage).toBe('number');
  });

  it('admin 사용자 (queryCompanyId 없음) → 전체 companyStorage 합계와 ADMIN_STORAGE_LIMIT', async () => {
    const user: SessionUser = {
      userType: 'admin',
      userId: 'admin',
      companyId: null,
    };

    prisma.companyStorage.aggregate.mockResolvedValue({
      _sum: {
        usedBytes: BigInt(1024 * 1024 * 500), // 500MB
      },
    });

    const result = await service.getStorageUsage(user);

    expect(result.max).toBe(ADMIN_STORAGE_LIMIT);
    expect(result.current).toBe(1024 * 1024 * 500);
    expect(result.active).toBe(1024 * 1024 * 500);
    expect(result.trash).toBe(0);
    expect(prisma.companyStorage.aggregate).toHaveBeenCalledWith({
      _sum: { usedBytes: true },
    });
    expect(prisma.companyStorage.findUnique).not.toHaveBeenCalled();
  });

  it('admin 사용자 + queryCompanyId → DEFAULT_STORAGE_LIMIT', async () => {
    const user: SessionUser = {
      userType: 'admin',
      userId: 'admin',
      companyId: null,
    };

    prisma.companyStorage.findUnique.mockResolvedValue({
      companyId: 20,
      usedBytes: BigInt(1024 * 1024 * 200),
    });

    const result = await service.getStorageUsage(user, 20);

    expect(result.max).toBe(DEFAULT_STORAGE_LIMIT);
    expect(result.companyId).toBe(20);
  });

  it('companyStorage 테이블 없을 때 → aggregate fallback', async () => {
    const user: SessionUser = {
      userType: 'company',
      userId: 1,
      companyId: 10,
    };

    prisma.companyStorage.findUnique.mockRejectedValue(new Error('Table not found'));
    prisma.webhardFile.aggregate
      .mockResolvedValueOnce({
        _sum: { size: BigInt(1024 * 1024 * 50) }, // 50MB active
      })
      .mockResolvedValueOnce({
        _sum: { size: BigInt(1024 * 1024 * 10) }, // 10MB trash
      });

    const result = await service.getStorageUsage(user);

    expect(result.active).toBe(1024 * 1024 * 50);
    expect(result.trash).toBe(1024 * 1024 * 10);
    expect(result.current).toBe(1024 * 1024 * 60);
    expect(prisma.webhardFile.aggregate).toHaveBeenCalledTimes(2);
  });

  it('admin 전체 companyStorage 조회 실패 시 전체 파일 aggregate fallback', async () => {
    const user: SessionUser = {
      userType: 'admin',
      userId: 'admin',
      companyId: null,
    };

    prisma.companyStorage.aggregate.mockRejectedValue(new Error('Table not found'));
    prisma.webhardFile.aggregate
      .mockResolvedValueOnce({
        _sum: { size: BigInt(1024 * 1024 * 75) },
      })
      .mockResolvedValueOnce({
        _sum: { size: BigInt(1024 * 1024 * 25) },
      });

    const result = await service.getStorageUsage(user);

    expect(result.active).toBe(1024 * 1024 * 75);
    expect(result.trash).toBe(1024 * 1024 * 25);
    expect(result.current).toBe(1024 * 1024 * 100);
    expect(prisma.webhardFile.aggregate).toHaveBeenNthCalledWith(1, {
      where: {
        deletedAt: null,
      },
      _sum: { size: true },
    });
    expect(prisma.webhardFile.aggregate).toHaveBeenNthCalledWith(2, {
      where: {
        deletedAt: { not: null },
      },
      _sum: { size: true },
    });
  });

  it('휴지통 파일 용량을 전체 저장공간에 포함하고 별도 필드로 반환', async () => {
    const user: SessionUser = {
      userType: 'company',
      userId: 1,
      companyId: 10,
    };

    prisma.companyStorage.findUnique.mockResolvedValue({
      companyId: 10,
      usedBytes: BigInt(1024 * 1024 * 100),
    });
    prisma.webhardFile.aggregate.mockResolvedValue({
      _sum: { size: BigInt(1024 * 1024 * 30) },
    });

    const result = await service.getStorageUsage(user);

    expect(result.active).toBe(1024 * 1024 * 100);
    expect(result.trash).toBe(1024 * 1024 * 30);
    expect(result.current).toBe(1024 * 1024 * 130);
    expect(result.trashPercentage).toBeGreaterThan(0);
    expect(prisma.webhardFile.aggregate).toHaveBeenCalledWith({
      where: {
        deletedAt: { not: null },
        companyId: 10,
      },
      _sum: { size: true },
    });
  });

  it('companyStorage 데이터 없을 때 → current = 0', async () => {
    const user: SessionUser = {
      userType: 'company',
      userId: 1,
      companyId: 10,
    };

    prisma.companyStorage.findUnique.mockResolvedValue(null);

    const result = await service.getStorageUsage(user);

    expect(result.current).toBe(0);
  });

  it('percentage 계산 정확성', async () => {
    const user: SessionUser = {
      userType: 'company',
      userId: 1,
      companyId: 10,
    };

    // DEFAULT_STORAGE_LIMIT = 10GB = 10737418240 bytes
    // 5GB = 5368709120 bytes → 50%
    prisma.companyStorage.findUnique.mockResolvedValue({
      companyId: 10,
      usedBytes: BigInt(5368709120),
    });

    const result = await service.getStorageUsage(user);

    expect(result.percentage).toBe(50);
  });
});

// ──────────────────────────────────────────────────────────────
// 2. getStorageBreakdown — 저장공간 내역 조회
// ──────────────────────────────────────────────────────────────
describe('StorageService.getStorageBreakdown', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: any;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = makePrisma();
    const configService = makeConfigService();

    const { StorageService } = await import('../storage.service');
    const mockCacheManager = { get: async () => null, set: async () => {}, del: async () => {} };
    service = new StorageService(
      configService as never,
      prisma as never,
      mockCacheManager as never
    );
  });

  it('admin → 업체별 breakdown', async () => {
    const adminUser: SessionUser = {
      userType: 'admin',
      userId: 'admin',
      companyId: null,
    };

    prisma.webhardFile.groupBy.mockResolvedValue([
      { companyId: 10, _sum: { size: BigInt(1000000) }, _count: 5 },
      { companyId: 20, _sum: { size: BigInt(2000000) }, _count: 10 },
      { companyId: null, _sum: { size: BigInt(500000) }, _count: 2 },
    ]);

    prisma.company.findMany.mockResolvedValue([
      { id: 10, companyName: '원컴퍼니' },
      { id: 20, companyName: '대성목형' },
    ]);

    const result = await service.getStorageBreakdown(adminUser);

    expect(result.byCompany).toHaveLength(3);
    expect(result.byCompany[0].companyName).toBe('원컴퍼니');
    expect(result.byCompany[0].used).toBe(1000000);
    expect(result.byCompany[0].fileCount).toBe(5);
    expect(result.byCompany[2].companyName).toBe('관리자'); // null → 관리자
    expect(result.total).toBe(3500000);
  });

  it('company → 폴더별 breakdown', async () => {
    const companyUser: SessionUser = {
      userType: 'company',
      userId: 1,
      companyId: 10,
    };

    prisma.webhardFile.groupBy.mockResolvedValue([
      { folderId: 'folder-001', _sum: { size: BigInt(800000) }, _count: 3 },
      { folderId: null, _sum: { size: BigInt(200000) }, _count: 1 },
    ]);

    prisma.webhardFolder.findMany.mockResolvedValue([{ id: 'folder-001', name: '칼선의뢰' }]);

    const result = await service.getStorageBreakdown(companyUser);

    expect(result.byFolder).toHaveLength(2);
    expect(result.byFolder[0].folderName).toBe('칼선의뢰');
    expect(result.byFolder[0].used).toBe(800000);
    expect(result.byFolder[1].folderName).toBe('루트'); // null → 루트
    expect(result.total).toBe(1000000);
  });

  it('company breakdown은 자기 companyId 파일만 집계하고 null 관리자 파일을 포함하지 않는다', async () => {
    const companyUser: SessionUser = {
      userType: 'company',
      userId: 1,
      companyId: 10,
    };

    prisma.webhardFile.groupBy.mockResolvedValue([
      { folderId: 'folder-001', _sum: { size: BigInt(800000) }, _count: 3 },
    ]);
    prisma.webhardFolder.findMany.mockResolvedValue([{ id: 'folder-001', name: '칼선의뢰' }]);

    await service.getStorageBreakdown(companyUser);

    expect(prisma.webhardFile.groupBy).toHaveBeenCalledWith({
      by: ['folderId'],
      where: {
        deletedAt: null,
        companyId: 10,
      },
      _sum: {
        size: true,
      },
      _count: true,
    });
  });

  it('admin — 알 수 없는 업체 → Unknown', async () => {
    const adminUser: SessionUser = {
      userType: 'admin',
      userId: 'admin',
      companyId: null,
    };

    prisma.webhardFile.groupBy.mockResolvedValue([
      { companyId: 99, _sum: { size: BigInt(100) }, _count: 1 },
    ]);

    // company 99가 존재하지 않음
    prisma.company.findMany.mockResolvedValue([]);

    const result = await service.getStorageBreakdown(adminUser);

    expect(result.byCompany[0].companyName).toBe('Unknown');
  });
});

// ──────────────────────────────────────────────────────────────
// 3. getPerformanceMetrics — 성능 메트릭 (캐시 + Raw SQL)
// ──────────────────────────────────────────────────────────────
describe('StorageService.getPerformanceMetrics', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: any;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = makePrisma();
    const configService = makeConfigService();

    const { StorageService } = await import('../storage.service');
    // 캐시 동작을 실제로 시뮬레이션 — set 으로 저장된 값이 get 에서 반환되어야
    // 5분 캐시 hit 테스트가 의미 있음 (항상 null 반환 시 매 호출마다 DB 쿼리 재실행).
    const cacheStore = new Map<string, unknown>();
    const mockCacheManager = {
      get: async (key: string) => cacheStore.get(key) ?? null,
      set: async (key: string, value: unknown) => {
        cacheStore.set(key, value);
      },
      del: async (key: string) => {
        cacheStore.delete(key);
      },
    };
    service = new StorageService(
      configService as never,
      prisma as never,
      mockCacheManager as never
    );
  });

  it('성능 메트릭 전체 데이터 반환', async () => {
    prisma.webhardFile.count
      .mockResolvedValueOnce(100) // totalFiles
      .mockResolvedValueOnce(10) // newFiles
      .mockResolvedValueOnce(25); // undownloaded

    prisma.webhardFolder.count.mockResolvedValueOnce(20); // totalFolders

    prisma.webhardFile.aggregate.mockResolvedValueOnce({
      _sum: { size: BigInt(1073741824) }, // 1GB
    });

    prisma.company.count.mockResolvedValueOnce(5);

    // Raw SQL: 파일 크기 분포
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { category: 'small', count: BigInt(50) },
        { category: 'medium', count: BigInt(30) },
        { category: 'large', count: BigInt(15) },
        { category: 'xlarge', count: BigInt(5) },
      ])
      // Raw SQL: 폴더 깊이
      .mockResolvedValueOnce([{ max_depth: 5, avg_depth: 2.3 }]);

    const result = await service.getPerformanceMetrics();

    expect(result.totalFiles).toBe(100);
    expect(result.totalFolders).toBe(20);
    expect(result.totalSize).toBe(1073741824);
    expect(result.totalCompanies).toBe(5);
    expect(result.newFilesLast24h).toBe(10);
    expect(result.undownloadedFiles).toBe(25);
    expect(result.fileSizeDistribution.small).toBe(50);
    expect(result.fileSizeDistribution.medium).toBe(30);
    expect(result.fileSizeDistribution.large).toBe(15);
    expect(result.fileSizeDistribution.xlarge).toBe(5);
    expect(result.maxFolderDepth).toBe(5);
    expect(result.avgFolderDepth).toBe(2.3);
  });

  it('5분 캐시 → 두 번째 호출은 DB 쿼리 없이 캐시 반환', async () => {
    prisma.webhardFile.count.mockResolvedValue(50);
    prisma.webhardFolder.count.mockResolvedValue(10);
    prisma.webhardFile.aggregate.mockResolvedValue({
      _sum: { size: BigInt(0) },
    });
    prisma.company.count.mockResolvedValue(1);
    prisma.$queryRaw
      .mockResolvedValueOnce([]) // 파일 크기 분포 빈 결과
      .mockResolvedValueOnce([{ max_depth: 0, avg_depth: 0 }]); // 폴더 깊이

    // 첫 번째 호출
    const result1 = await service.getPerformanceMetrics();

    // 두 번째 호출 (캐시 히트)
    const result2 = await service.getPerformanceMetrics();

    expect(result1).toEqual(result2);

    // executeWithRetry는 첫 번째 호출 시에만 실행됨 (8회)
    // 두 번째 호출은 캐시에서 반환이므로 추가 쿼리 없음
    const firstCallCount = prisma.executeWithRetry.mock.calls.length;
    expect(firstCallCount).toBe(8); // 8개 병렬 쿼리
  });

  it('빈 파일 크기 분포 → 기본값 0', async () => {
    prisma.webhardFile.count.mockResolvedValue(0);
    prisma.webhardFolder.count.mockResolvedValue(0);
    prisma.webhardFile.aggregate.mockResolvedValue({
      _sum: { size: null },
    });
    prisma.company.count.mockResolvedValue(0);
    prisma.$queryRaw
      .mockResolvedValueOnce([]) // 빈 파일 크기 분포
      .mockResolvedValueOnce([]); // 빈 폴더 깊이

    const result = await service.getPerformanceMetrics();

    expect(result.fileSizeDistribution).toEqual({
      small: 0,
      medium: 0,
      large: 0,
      xlarge: 0,
    });
    expect(result.maxFolderDepth).toBe(0);
    expect(result.avgFolderDepth).toBe(0);
    expect(result.totalSize).toBe(0);
  });
});
