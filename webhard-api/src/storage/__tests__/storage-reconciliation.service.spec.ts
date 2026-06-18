import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { StorageReconciliationService } from '../storage-reconciliation.service';

interface MockPrisma {
  executeWithRetry: jest.Mock;
  webhardFolder: {
    findMany: jest.Mock;
  };
  webhardFile: {
    findMany: jest.Mock;
  };
}

function makePrisma(): MockPrisma {
  return {
    executeWithRetry: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
    webhardFolder: {
      findMany: jest.fn(),
    },
    webhardFile: {
      findMany: jest.fn(),
    },
  };
}

function makeConfigService(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    GOOGLE_DRIVE_WEBHOOK_TOKEN: 'expected-token',
    ...overrides,
  };
  return {
    get: jest.fn((key: string, defaultValue?: string) => values[key] ?? defaultValue),
  };
}

describe('StorageReconciliationService.handleDriveChangeWebhook', () => {
  it('Google Drive webhook token이 맞으면 변경 알림을 queue와 repair log에 기록한다', async () => {
    const prisma = makePrisma();
    const storageRepairService = {
      recordDriveDbMismatch: jest.fn().mockResolvedValue(undefined),
    };
    const service = new StorageReconciliationService(
      makeConfigService() as never,
      prisma as never,
      undefined,
      storageRepairService as never
    );

    const result = await service.handleDriveChangeWebhook({
      'x-goog-channel-token': 'expected-token',
      'x-goog-channel-id': 'channel-1',
      'x-goog-resource-id': 'resource-1',
      'x-goog-resource-state': 'change',
      'x-goog-message-number': '3',
    });

    expect(result).toMatchObject({
      accepted: true,
      enqueued: true,
      queueDepth: 1,
      resourceState: 'change',
    });
    expect(storageRepairService.recordDriveDbMismatch).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'drive_change',
        resourceType: 'drive_change',
        resourceId: 'resource-1',
        reason: 'drive_change_change',
      })
    );
  });

  it('Google Drive webhook token이 없거나 다르면 거부한다', async () => {
    const service = new StorageReconciliationService(
      makeConfigService() as never,
      makePrisma() as never
    );

    await expect(
      service.handleDriveChangeWebhook({ 'x-goog-channel-token': 'wrong-token' })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('StorageReconciliationService.runReconciliation', () => {
  it('Drive API 404를 storage repair 이벤트와 누락 카운트로 기록한다', async () => {
    const prisma = makePrisma();
    prisma.webhardFolder.findMany.mockResolvedValueOnce([
      {
        id: 'folder-missing',
        name: '누락폴더',
        companyId: 7,
        path: '/누락폴더',
        driveFolderId: 'drive-folder-missing',
      },
    ]);
    prisma.webhardFile.findMany.mockResolvedValueOnce([
      {
        id: 'file-ok',
        name: '정상파일.dxf',
        companyId: 7,
        path: '/정상파일.dxf',
        driveFileId: 'drive-file-ok',
      },
    ]);
    const googleDriveProvider = {
      getItemMetadata: jest
        .fn()
        .mockRejectedValueOnce({ code: 404, message: 'not found' })
        .mockResolvedValueOnce({ id: 'drive-file-ok' }),
    };
    const storageRepairService = {
      recordDriveDbMismatch: jest.fn().mockResolvedValue(undefined),
    };
    const service = new StorageReconciliationService(
      makeConfigService() as never,
      prisma as never,
      googleDriveProvider as never,
      storageRepairService as never
    );

    const result = await service.runReconciliation({ limit: 10, reason: 'test' });

    expect(result).toMatchObject({
      checkedFolders: 1,
      checkedFiles: 1,
      missingFolders: 1,
      missingFiles: 0,
      quotaBackoffCount: 0,
      errors: 0,
    });
    expect(storageRepairService.recordDriveDbMismatch).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'reconciliation',
        resourceType: 'folder',
        resourceId: 'folder-missing',
        driveFolderId: 'drive-folder-missing',
        reason: 'drive_api_404',
      })
    );
  });

  it('Drive API 429를 quota/backoff 카운트와 repair 이벤트로 기록한다', async () => {
    const prisma = makePrisma();
    prisma.webhardFolder.findMany.mockResolvedValueOnce([]);
    prisma.webhardFile.findMany.mockResolvedValueOnce([
      {
        id: 'file-rate-limited',
        name: '제한파일.dxf',
        companyId: 7,
        path: '/제한파일.dxf',
        driveFileId: 'drive-file-rate-limited',
      },
    ]);
    const googleDriveProvider = {
      getItemMetadata: jest.fn().mockRejectedValueOnce({ code: 429, message: 'rate limited' }),
    };
    const storageRepairService = {
      recordDriveDbMismatch: jest.fn().mockResolvedValue(undefined),
    };
    const service = new StorageReconciliationService(
      makeConfigService() as never,
      prisma as never,
      googleDriveProvider as never,
      storageRepairService as never
    );

    const result = await service.runReconciliation({ limit: 10, reason: 'test' });

    expect(result.quotaBackoffCount).toBe(1);
    expect(storageRepairService.recordDriveDbMismatch).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'reconciliation',
        resourceType: 'file',
        reason: 'drive_quota_or_backoff',
      })
    );
  });
});
