import 'reflect-metadata';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { StorageProvider } from '@prisma/client';
import { StorageService } from '../storage.service';

interface MockPrisma {
  executeWithRetry: jest.Mock;
  webhardFolder: {
    count: jest.Mock;
    findMany: jest.Mock;
  };
  webhardFile: {
    count: jest.Mock;
    findMany: jest.Mock;
  };
  syncLog: {
    findMany: jest.Mock;
  };
}

function makePrisma(): MockPrisma {
  return {
    executeWithRetry: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
    webhardFolder: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    webhardFile: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    syncLog: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function makeConfigService(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    R2_ACCOUNT_ID: 'test-account',
    R2_ACCESS_KEY_ID: 'test-key',
    R2_SECRET_ACCESS_KEY: 'test-secret',
    R2_BUCKET_NAME: 'test-bucket',
    R2_PUBLIC_BASE_URL: 'https://test.example.com',
    ...overrides,
  };
  return {
    get: jest.fn((key: string, defaultValue?: string) => values[key] ?? defaultValue),
  };
}

function makeCacheManager() {
  return { get: jest.fn(), set: jest.fn(), del: jest.fn() };
}

describe('Google Drive webhard consistency migration', () => {
  it('Google Drive id 필수 CHECK와 업체 active root unique index를 포함한다', () => {
    const sql = readFileSync(
      resolve(
        __dirname,
        '../../../prisma/migrations/20260602110000_google_drive_webhard_consistency/migration.sql'
      ),
      'utf8'
    );

    expect(sql).toContain('webhard_files_google_drive_file_id_required');
    expect(sql).toContain(
      "CHECK (storage_provider <> 'google_drive' OR drive_file_id IS NOT NULL)"
    );
    expect(sql).toContain('webhard_folders_google_drive_folder_id_required');
    expect(sql).toContain(
      "CHECK (storage_provider <> 'google_drive' OR drive_folder_id IS NOT NULL)"
    );
    expect(sql).toContain('webhard_folders_one_active_company_root_idx');
    expect(sql).toContain('WHERE company_id IS NOT NULL');
    expect(sql).toContain('AND parent_id IS NULL');
    expect(sql).toContain('AND deleted_at IS NULL');
  });
});

describe('StorageService.getWebhardConsistencyDiagnostics', () => {
  it('Drive id 누락과 업체 active root 중복을 카운트한다', async () => {
    const prisma = makePrisma();
    prisma.webhardFolder.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    prisma.webhardFile.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    prisma.webhardFolder.findMany
      .mockResolvedValueOnce([
        { id: 'folder-missing', name: '누락폴더', companyId: 7, path: '/누락폴더' },
      ])
      .mockResolvedValueOnce([
        { id: 'root-1', name: '업체', companyId: 7, path: '/업체' },
        { id: 'root-2', name: '업체 복제', companyId: 7, path: '/업체 복제' },
      ])
      .mockResolvedValueOnce([]);
    prisma.webhardFile.findMany
      .mockResolvedValueOnce([
        { id: 'file-missing', name: '누락파일.dxf', companyId: 7, path: '/누락파일.dxf' },
      ])
      .mockResolvedValueOnce([]);

    const service = new StorageService(
      makeConfigService() as never,
      prisma as never,
      makeCacheManager() as never
    );

    const result = await service.getWebhardConsistencyDiagnostics();

    expect(result.missingDriveIds.folders.count).toBe(1);
    expect(result.missingDriveIds.files.count).toBe(1);
    expect(result.duplicateActiveCompanyRoots.companyCount).toBe(1);
    expect(result.duplicateActiveCompanyRoots.companies[0]?.companyId).toBe(7);
    expect(result.driveApi404.skippedReason).toBe('verifyDriveApi=false');
    expect(result.lastCheckedAt).toEqual(expect.any(String));
    expect(result.quotaBackoffCount).toBe(0);
    expect(result.recentRepairEvents).toEqual([]);
  });

  it('Drive API 검증을 켜면 404 항목을 별도 카운트한다', async () => {
    const prisma = makePrisma();
    prisma.webhardFolder.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    prisma.webhardFile.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    prisma.webhardFolder.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'folder-ok',
          name: '정상폴더',
          companyId: 7,
          path: '/정상폴더',
          driveFolderId: 'drive-folder-ok',
        },
      ]);
    prisma.webhardFile.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'file-missing-drive',
        name: 'Drive누락.dxf',
        companyId: 7,
        path: '/Drive누락.dxf',
        driveFileId: 'drive-file-missing',
      },
    ]);
    const googleDriveProvider = {
      getItemMetadata: jest
        .fn()
        .mockResolvedValueOnce({
          provider: StorageProvider.GOOGLE_DRIVE,
          storageFileId: 'drive-folder-ok',
          name: '정상폴더',
          mimeType: 'application/vnd.google-apps.folder',
          size: 0,
          parentStorageFolderIds: [],
        })
        .mockRejectedValueOnce({ code: 404, message: 'not found' }),
    };
    const storageRepairService = {
      recordDriveDbMismatch: jest.fn().mockResolvedValue(undefined),
    };

    const service = new StorageService(
      makeConfigService({
        GOOGLE_SERVICE_ACCOUNT_JSON: '{"client_email":"test@example.com"}',
        GOOGLE_DRIVE_SHARED_DRIVE_ID: 'shared-drive-id',
      }) as never,
      prisma as never,
      makeCacheManager() as never,
      googleDriveProvider as never,
      storageRepairService as never
    );

    const result = await service.getWebhardConsistencyDiagnostics({
      verifyDriveApi: true,
      verifyDriveApiLimit: 10,
    });

    expect(result.driveApi404.checkedFolders).toBe(1);
    expect(result.driveApi404.checkedFiles).toBe(1);
    expect(result.driveApi404.missingFolders.count).toBe(0);
    expect(result.driveApi404.missingFiles.count).toBe(1);
    expect(result.driveApi404.missingFiles.samples[0]?.driveId).toBe('drive-file-missing');
    expect(storageRepairService.recordDriveDbMismatch).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'diagnostic',
        resourceType: 'file',
        resourceId: 'file-missing-drive',
        driveFileId: 'drive-file-missing',
        reason: 'drive_api_404',
      })
    );
  });

  it('Drive API quota/backoff 오류를 진단 카운트와 repair 이벤트로 남긴다', async () => {
    const prisma = makePrisma();
    prisma.webhardFolder.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    prisma.webhardFile.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prisma.webhardFolder.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'folder-rate-limited',
          name: '제한폴더',
          companyId: 7,
          path: '/제한폴더',
          driveFolderId: 'drive-folder-rate-limited',
        },
      ]);
    prisma.webhardFile.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const googleDriveProvider = {
      getItemMetadata: jest.fn().mockRejectedValueOnce({ code: 429, message: 'rate limited' }),
    };
    const storageRepairService = {
      recordDriveDbMismatch: jest.fn().mockResolvedValue(undefined),
    };

    const service = new StorageService(
      makeConfigService({
        GOOGLE_SERVICE_ACCOUNT_JSON: '{"client_email":"test@example.com"}',
        GOOGLE_DRIVE_SHARED_DRIVE_ID: 'shared-drive-id',
      }) as never,
      prisma as never,
      makeCacheManager() as never,
      googleDriveProvider as never,
      storageRepairService as never
    );

    const result = await service.getWebhardConsistencyDiagnostics({
      verifyDriveApi: true,
      verifyDriveApiLimit: 10,
    });

    expect(result.driveApi404.errors[0]?.status).toBe(429);
    expect(result.quotaBackoffCount).toBe(1);
    expect(storageRepairService.recordDriveDbMismatch).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'diagnostic',
        resourceType: 'folder',
        reason: 'drive_quota_or_backoff',
      })
    );
  });
});
