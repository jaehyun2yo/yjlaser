/**
 * FilesService 테스트
 * Task #1: 파일 업로드 시 상위 폴더 updated_at 갱신
 * Task #2: API Key(동기화 프로그램) 업로드 시 uploadedBy = 'admin' 저장
 */

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StorageProvider } from '@prisma/client';
import { FilesService } from '../files.service';
import { SessionUser } from '../../auth/auth.service';

// ============================================================
// Mock factories
// ============================================================

function makeFile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-uuid-1',
    name: 'test.dxf',
    originalName: 'test.dxf',
    size: BigInt(1024),
    mimeType: 'application/octet-stream',
    path: 'webhard/admin/test.dxf',
    folderId: 'folder-uuid-1',
    companyId: null,
    uploadedBy: 'admin',
    inquiryNumber: null,
    isDownloaded: false,
    createdAt: new Date('2026-03-19T00:00:00Z'),
    updatedAt: new Date('2026-03-19T00:00:00Z'),
    deletedAt: null,
    deletedBy: null,
    company: null,
    ...overrides,
  };
}

function makeFolder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'folder-uuid-1',
    name: '올리기전용',
    parentId: null,
    companyId: null,
    path: '/올리기전용',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    executeWithRetry: jest.fn((fn: () => unknown) => fn()),
    $transaction: jest.fn(function (
      this: { webhardFile: unknown; webhardFolder: unknown; company: unknown },
      input: unknown
    ) {
      if (typeof input === 'function') {
        const callback = input as (tx: unknown) => unknown;
        return callback({
          $executeRaw: jest.fn().mockResolvedValue(undefined),
          webhardFile: this.webhardFile,
          webhardFolder: this.webhardFolder,
          company: this.company,
        });
      }
      return Promise.all(input as Array<Promise<unknown>>);
    }),
    webhardFile: {
      create: jest.fn().mockResolvedValue(makeFile()),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(makeFile()),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    webhardFolder: {
      findUnique: jest.fn().mockResolvedValue(makeFolder()),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(),
    },
    companyFolderAlias: {
      findFirst: jest.fn(),
    },
    company: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    notification: {
      create: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

function makeStorageService() {
  return {
    generateStoragePath: jest.fn().mockReturnValue('webhard/admin/folder-uuid-1/test.dxf'),
    generateDriveIds: jest
      .fn()
      .mockImplementation((count: number) =>
        Promise.resolve(Array.from({ length: count }, (_, index) => `drive-generated-${index + 1}`))
      ),
    createDriveUploadSession: jest
      .fn()
      .mockImplementation(
        (input: { storageFileId?: string; mimeType: string; parentStorageFolderId: string }) =>
          Promise.resolve({
            provider: StorageProvider.GOOGLE_DRIVE,
            storageFileId: input.storageFileId ?? 'drive-generated-fallback',
            uploadUrl: `https://drive-upload/${input.storageFileId ?? 'fallback'}`,
            expiresAt: new Date('2026-06-11T00:00:00.000Z'),
            headers: { 'Content-Type': input.mimeType },
            parentStorageFolderId: input.parentStorageFolderId,
          })
      ),
    getUploadPresignedUrl: jest.fn().mockResolvedValue({
      url: 'https://r2/upload',
      key: 'webhard/admin/test.dxf',
      expiresAt: new Date(),
    }),
    getDownloadPresignedUrl: jest.fn().mockResolvedValue({
      url: 'https://r2/download',
      key: 'webhard/admin/test.dxf',
      expiresAt: new Date(),
    }),
    confirmDriveUploadedFile: jest.fn().mockResolvedValue({
      storageFileId: 'drive-file-1',
      mimeType: 'application/pdf',
      parentStorageFolderIds: ['drive-folder-1'],
    }),
    // FilesService.confirmUpload 은 업로드 완료 후 fire-and-forget 으로 storage cache 무효화 호출.
    invalidateStorageCache: jest.fn().mockResolvedValue(undefined),
    verifyDriveUploadProof: jest.fn().mockReturnValue({
      storageFileId: 'drive-file-1',
      mimeType: 'application/pdf',
      parentStorageFolderIds: ['drive-folder-1'],
    }),
    moveDriveFile: jest.fn().mockResolvedValue(undefined),
    moveDriveFiles: jest
      .fn()
      .mockImplementation((inputs: Array<{ storageFileId: string }>) =>
        Promise.resolve(
          inputs.map((input) => ({ storageFileId: input.storageFileId, success: true }))
        )
      ),
    trashDriveFile: jest.fn().mockResolvedValue(undefined),
    trashDriveFiles: jest
      .fn()
      .mockImplementation((inputs: Array<{ storageFileId: string }>) =>
        Promise.resolve(
          inputs.map((input) => ({ storageFileId: input.storageFileId, success: true }))
        )
      ),
  };
}

function makeEventsGateway() {
  return {
    emitToFolder: jest.fn(),
    emitToFolderBatched: jest.fn(),
    emitGlobal: jest.fn(),
  };
}

function makeAutoContactService() {
  return {
    detectAndCreate: jest.fn().mockResolvedValue(undefined),
  };
}

function makeFoldersService() {
  return {
    propagateUpdatedAt: jest.fn().mockResolvedValue(undefined),
  };
}

function makeWebhardConfigService() {
  return {
    getExcludedFolders: jest
      .fn()
      .mockResolvedValue(['올리기전용', '내리기전용', '목형의뢰', '칼선의뢰', '완료']),
    getFolderStatusMapping: jest.fn(),
    classifyByFolderPath: jest.fn(),
    getStatusForInquiryType: jest.fn(),
  };
}

function makeSyncLogService() {
  return {
    createPipelineEvent: jest.fn().mockResolvedValue(undefined),
  };
}

function makeStorageRepairService() {
  return {
    recordDriveDbMismatch: jest.fn().mockResolvedValue(undefined),
  };
}

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(prismaOverrides);
  const storage = makeStorageService();
  const events = makeEventsGateway();
  const autoContact = makeAutoContactService();
  const folders = makeFoldersService();
  const webhardConfig = makeWebhardConfigService();
  const syncLog = makeSyncLogService();
  const storageRepair = makeStorageRepairService();

  // FilesService는 constructor DI — 직접 주입
  const FilesServiceCtor = FilesService as unknown as new (...args: unknown[]) => FilesService;
  const service = new FilesServiceCtor(
    prisma as never,
    storage as never,
    events as never,
    autoContact as never,
    folders as never,
    webhardConfig as never,
    syncLog as never,
    undefined,
    undefined,
    storageRepair as never
  );

  return {
    service,
    prisma,
    storage,
    events,
    autoContact,
    folders,
    webhardConfig,
    syncLog,
    storageRepair,
  };
}

// ============================================================
// 공통 SessionUser 픽스처
// ============================================================

const adminUser = { userType: 'admin' as const, userId: 'admin', companyId: 0 };
const apiKeyUser = { userType: 'admin' as const, userId: 'api:sync', companyId: 0 };
const companyUser = { userType: 'company' as const, userId: '5', companyId: 5 };
const integrationUser: SessionUser = {
  userType: 'integration',
  userId: 'api:lgu-sync',
  companyId: null,
  programType: 'lgu-sync',
  permissions: [],
};

describe('FilesService.findExistingUploadMetadata', () => {
  it('driveFileId가 있으면 driveFileId 기준으로 기존 파일 metadata를 조회해 DTO로 반환한다', async () => {
    const { service, prisma } = makeService();
    prisma.webhardFile.findFirst.mockResolvedValueOnce(
      makeFile({
        id: 'file-existing',
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFileId: 'drive-file-1',
        path: 'folder-uuid-1/sanitized-name.dxf',
        company: { companyName: '대성목형', managerName: '홍길동' },
      })
    );

    const result = await service.findExistingUploadMetadata({
      driveFileId: 'drive-file-1',
      path: 'external/path/sanitized-name.dxf',
    });

    expect(prisma.webhardFile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { driveFileId: 'drive-file-1' },
        orderBy: { createdAt: 'asc' },
      })
    );
    expect(result).toMatchObject({
      id: 'file-existing',
      path: 'folder-uuid-1/sanitized-name.dxf',
      storage_provider: 'google_drive',
      companies: { company_name: '대성목형', manager_name: '홍길동' },
    });
  });

  it('driveFileId가 없으면 path만으로 조회한다', async () => {
    const { service, prisma } = makeService();

    await service.findExistingUploadMetadata({ path: 'legacy/path.dxf' });

    expect(prisma.webhardFile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { path: 'legacy/path.dxf' },
      })
    );
  });
});

describe('FilesService DB-only fast path', () => {
  it('getFiles 목록 조회는 Google Drive mutation/download API를 호출하지 않는다', async () => {
    const { service, prisma, storage } = makeService();
    prisma.webhardFile.count.mockResolvedValueOnce(1);
    prisma.webhardFile.findMany.mockResolvedValueOnce([
      makeFile({
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFileId: 'drive-file-1',
        companyId: 5,
        company: null,
      }),
    ]);

    const result = await service.getFiles({ folderId: 'folder-uuid-1' } as never, companyUser);

    expect(result.total).toBe(1);
    expect(storage.confirmDriveUploadedFile).not.toHaveBeenCalled();
    expect(storage.moveDriveFile).not.toHaveBeenCalled();
    expect(storage.trashDriveFile).not.toHaveBeenCalled();
  });

  it('searchFiles 검색 조회는 Google Drive mutation/download API를 호출하지 않는다', async () => {
    const { service, prisma, storage } = makeService();
    prisma.webhardFile.findMany.mockResolvedValueOnce([
      makeFile({
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFileId: 'drive-file-1',
        companyId: 5,
        company: null,
      }),
    ]);

    const result = await service.searchFiles({ query: 'test' } as never, companyUser);

    expect(result).toHaveLength(1);
    expect(storage.confirmDriveUploadedFile).not.toHaveBeenCalled();
    expect(storage.moveDriveFile).not.toHaveBeenCalled();
    expect(storage.trashDriveFile).not.toHaveBeenCalled();
  });
});

describe('FilesService batch upload session performance', () => {
  it('reuses folder checks and generates Drive ids in bulk for same-folder batch uploads', async () => {
    const { service, prisma, storage } = makeService();
    prisma.webhardFolder.findUnique
      .mockResolvedValueOnce(makeFolder({ id: 'folder-uuid-1', companyId: null }))
      .mockResolvedValueOnce(makeFolder({ id: 'folder-uuid-1', path: '/올리기전용' }))
      .mockResolvedValueOnce(
        makeFolder({
          id: 'folder-uuid-1',
          companyId: null,
          storageProvider: StorageProvider.GOOGLE_DRIVE,
          driveFolderId: 'drive-folder-1',
        })
      );

    const result = await service.getBatchUploadPresignedUrls(
      [
        {
          filename: 'a.pdf',
          contentType: 'application/pdf',
          size: 1024,
          folderId: 'folder-uuid-1',
        },
        {
          filename: 'b.pdf',
          contentType: 'application/pdf',
          size: 2048,
          folderId: 'folder-uuid-1',
        },
      ],
      adminUser as never
    );

    expect(result).toHaveLength(2);
    expect(storage.generateDriveIds).toHaveBeenCalledTimes(1);
    expect(storage.generateDriveIds).toHaveBeenCalledWith(2);
    expect(storage.createDriveUploadSession).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fileName: 'a.pdf',
        parentStorageFolderId: 'drive-folder-1',
        storageFileId: 'drive-generated-1',
      })
    );
    expect(storage.createDriveUploadSession).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fileName: 'b.pdf',
        parentStorageFolderId: 'drive-folder-1',
        storageFileId: 'drive-generated-2',
      })
    );
    expect(prisma.webhardFolder.findUnique).toHaveBeenCalledTimes(3);
  });
});

describe('FilesService.markDownloaded integration access', () => {
  it('rejects markAll for integration principals because it is an unscoped global mutation', async () => {
    const { service, prisma } = makeService();

    await expect(service.markDownloaded({ markAll: true }, integrationUser)).rejects.toThrow(
      ForbiddenException
    );
    expect(prisma.webhardFile.updateMany).not.toHaveBeenCalled();
  });

  it('allows integration principals to mark explicit file ids without broadening the mutation scope', async () => {
    const { service, prisma } = makeService();
    prisma.webhardFile.updateMany.mockResolvedValueOnce({ count: 2 });

    const result = await service.markDownloaded({ fileIds: ['file-1', 'file-2'] }, integrationUser);

    expect(result).toEqual({ success: true, updatedCount: 2 });
    expect(prisma.webhardFile.updateMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        isDownloaded: false,
        id: { in: ['file-1', 'file-2'] },
      },
      data: { isDownloaded: true },
    });
  });
});

describe('FilesService upload safety policy', () => {
  it('rejects executable files before issuing a presigned upload URL', async () => {
    const { service, storage } = makeService();

    await expect(
      service.getUploadPresignedUrl(
        {
          filename: 'malicious.exe',
          contentType: 'application/x-msdownload',
        },
        adminUser
      )
    ).rejects.toThrow(BadRequestException);
    expect(storage.getUploadPresignedUrl).not.toHaveBeenCalled();
  });

  it('rejects executable files before confirming upload metadata', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.confirmUpload(
        {
          name: 'malicious.exe',
          originalName: 'malicious.exe',
          key: 'webhard/admin/malicious.exe',
          size: 512,
          mimeType: 'application/x-msdownload',
        },
        adminUser
      )
    ).rejects.toThrow(BadRequestException);
    expect(prisma.webhardFile.create).not.toHaveBeenCalled();
  });

  it('rejects executable files before batch-confirming upload metadata', async () => {
    const { service, prisma } = makeService();

    const result = await service.batchConfirmUpload(
      {
        files: [
          {
            name: 'malicious.exe',
            originalName: 'malicious.exe',
            key: 'webhard/admin/malicious.exe',
            size: 512,
            mimeType: 'application/x-msdownload',
          },
        ],
      },
      adminUser
    );

    expect(result).toEqual({
      success: 0,
      failed: 1,
      errors: ['업로드가 허용되지 않는 파일 형식입니다: malicious.exe'],
      results: [
        {
          fileName: 'malicious.exe',
          success: false,
          error: '업로드가 허용되지 않는 파일 형식입니다: malicious.exe',
        },
      ],
    });
    expect(prisma.webhardFile.createMany).not.toHaveBeenCalled();
  });
});

describe('FilesService.confirmUpload notifications', () => {
  it('파일 업로드 완료 시 관리자 웹하드 알림을 생성한다', async () => {
    const { service, prisma } = makeService();
    prisma.webhardFolder.findUnique.mockResolvedValueOnce(makeFolder({ companyId: 5 }));
    prisma.webhardFile.create.mockResolvedValueOnce(
      makeFile({
        id: 'file-uploaded',
        name: 'uploaded.dxf',
        originalName: 'uploaded.dxf',
        folderId: 'folder-uuid-1',
        companyId: 42,
        company: { companyName: '테스트업체', managerName: '담당자' },
      })
    );

    await service.confirmUpload(
      {
        name: 'uploaded.dxf',
        originalName: 'uploaded.dxf',
        size: 1024,
        mimeType: 'application/dxf',
        key: 'webhard/company/uploaded.dxf',
        folderId: 'folder-uuid-1',
      },
      companyUser as never
    );

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userType: 'admin',
        userId: null,
        type: 'file_uploaded',
        title: '웹하드 새 업로드',
        metadata: expect.objectContaining({
          fileId: 'file-uploaded',
          folderId: 'folder-uuid-1',
          companyId: 42,
          link: '/webhard?folderId=folder-uuid-1&fileId=file-uploaded',
        }),
      }),
    });
  });

  it('파일 업로드 응답은 알림 저장 완료를 기다리지 않는다', async () => {
    const { service, prisma } = makeService();
    prisma.webhardFile.create.mockResolvedValueOnce(
      makeFile({
        id: 'file-fast-uploaded',
        folderId: null,
        companyId: null,
        company: null,
      })
    );
    prisma.notification.create.mockImplementationOnce(() => new Promise<never>(() => undefined));

    const result = await Promise.race([
      service
        .confirmUpload(
          {
            name: 'fast-uploaded.dxf',
            originalName: 'fast-uploaded.dxf',
            size: 1024,
            mimeType: 'application/dxf',
            key: 'webhard/admin/fast-uploaded.dxf',
          },
          adminUser as never
        )
        .then(() => 'resolved' as const),
      new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), 50);
      }),
    ]);

    expect(result).toBe('resolved');
    expect(prisma.notification.create).toHaveBeenCalled();
  });
});

describe('FilesService.renameFile', () => {
  it('updates originalName together with name so frontend display does not rollback', async () => {
    const { service, prisma, events } = makeService();
    prisma.webhardFile.findUnique.mockResolvedValueOnce(
      makeFile({ id: 'file-rename-1', name: 'old.dxf', originalName: 'old.dxf' })
    );
    prisma.webhardFile.update.mockResolvedValueOnce(
      makeFile({
        id: 'file-rename-1',
        name: 'renamed.dxf',
        originalName: 'renamed.dxf',
        company: { companyName: '테스트업체', managerName: '담당자' },
      })
    );

    const result = await service.renameFile(
      'file-rename-1',
      { name: 'renamed.dxf' },
      adminUser as never
    );

    expect(prisma.webhardFile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'file-rename-1' },
        data: { name: 'renamed.dxf', originalName: 'renamed.dxf' },
      })
    );
    expect(result.name).toBe('renamed.dxf');
    expect(result.original_name).toBe('renamed.dxf');
    expect(events.emitToFolder).toHaveBeenCalledWith(
      'folder-uuid-1',
      expect.objectContaining({
        type: 'file:renamed',
        data: { fileId: 'file-rename-1', newName: 'renamed.dxf' },
      })
    );
  });

  it('sanitizes invalid filename characters before persisting a rename', async () => {
    const { service, prisma, events } = makeService();
    prisma.webhardFile.findUnique.mockResolvedValueOnce(
      makeFile({ id: 'file-rename-2', name: 'old.pdf', originalName: 'old.pdf' })
    );
    prisma.webhardFile.update.mockResolvedValueOnce(
      makeFile({
        id: 'file-rename-2',
        name: 'file.pdf',
        originalName: 'file.pdf',
        company: { companyName: '테스트업체', managerName: '담당자' },
      })
    );

    const result = await service.renameFile(
      'file-rename-2',
      { name: 'file<>:"|?*.pdf' },
      adminUser as never
    );

    expect(prisma.webhardFile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'file-rename-2' },
        data: { name: 'file.pdf', originalName: 'file.pdf' },
      })
    );
    expect(result.name).toBe('file.pdf');
    expect(result.original_name).toBe('file.pdf');
    expect(events.emitToFolder).toHaveBeenCalledWith(
      'folder-uuid-1',
      expect.objectContaining({
        type: 'file:renamed',
        data: { fileId: 'file-rename-2', newName: 'file.pdf' },
      })
    );
  });

  it('rejects duplicate filenames in the same folder during rename', async () => {
    const { service, prisma } = makeService();
    prisma.webhardFile.findUnique.mockResolvedValueOnce(
      makeFile({ id: 'file-rename-3', name: 'old.pdf', originalName: 'old.pdf' })
    );
    prisma.webhardFile.findFirst.mockResolvedValueOnce(
      makeFile({
        id: 'file-existing',
        name: 'target.pdf',
        originalName: 'target.pdf',
      })
    );

    await expect(
      service.renameFile('file-rename-3', { name: 'target.pdf' }, adminUser as never)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.webhardFile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: 'file-rename-3' },
          folderId: 'folder-uuid-1',
          originalName: 'target.pdf',
          deletedAt: null,
        }),
      })
    );
    expect(prisma.webhardFile.update).not.toHaveBeenCalled();
  });
});

describe('FilesService.batchMoveFiles realtime invalidation', () => {
  it('emits file:moved events to both source folders and the target folder', async () => {
    const { service, prisma, events } = makeService();
    prisma.webhardFile.findMany.mockResolvedValueOnce([
      { id: 'file-a', companyId: null, folderId: 'source-a' },
      { id: 'file-b', companyId: null, folderId: 'source-b' },
    ]);
    prisma.webhardFile.updateMany.mockResolvedValueOnce({ count: 2 });

    await service.batchMoveFiles(
      {
        fileIds: ['file-a', 'file-b'],
        targetFolderId: 'target-folder',
      },
      adminUser as never
    );

    expect(events.emitToFolder).toHaveBeenCalledWith(
      'source-a',
      expect.objectContaining({
        type: 'file:moved',
        folderId: 'source-a',
        data: expect.objectContaining({ targetFolderId: 'target-folder' }),
      })
    );
    expect(events.emitToFolder).toHaveBeenCalledWith(
      'source-b',
      expect.objectContaining({
        type: 'file:moved',
        folderId: 'source-b',
        data: expect.objectContaining({ targetFolderId: 'target-folder' }),
      })
    );
    expect(events.emitToFolder).toHaveBeenCalledWith(
      'target-folder',
      expect.objectContaining({
        type: 'file:moved',
        folderId: 'target-folder',
        data: expect.objectContaining({ count: 2 }),
      })
    );
  });

  it('records repair for moved Drive files and skips DB update when a batch Drive move fails', async () => {
    const { service, prisma, storage, storageRepair } = makeService();
    prisma.webhardFolder.findUnique
      .mockResolvedValueOnce(makeFolder({ id: 'target-folder', companyId: null }))
      .mockResolvedValueOnce(
        makeFolder({
          id: 'target-folder',
          companyId: null,
          storageProvider: StorageProvider.GOOGLE_DRIVE,
          driveFolderId: 'drive-target',
        })
      );
    prisma.webhardFile.findMany.mockResolvedValueOnce([
      {
        id: 'file-a',
        companyId: null,
        folderId: 'source-a',
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFileId: 'drive-a',
      },
      {
        id: 'file-b',
        companyId: null,
        folderId: 'source-b',
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFileId: 'drive-b',
      },
    ]);
    storage.moveDriveFiles.mockResolvedValueOnce([
      { storageFileId: 'drive-a', success: true },
      { storageFileId: 'drive-b', success: false, error: 'drive move failed' },
    ]);

    await expect(
      service.batchMoveFiles(
        {
          fileIds: ['file-a', 'file-b'],
          targetFolderId: 'target-folder',
        },
        adminUser as never
      )
    ).rejects.toThrow('drive move failed');

    expect(prisma.webhardFile.updateMany).not.toHaveBeenCalled();
    expect(storageRepair.recordDriveDbMismatch).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'file_move',
        driveFileId: 'drive-a',
        webhardFileId: 'file-a',
        actualDriveState: expect.objectContaining({
          moved: true,
          dbUpdateSkipped: true,
          batchMoveFailed: true,
        }),
      })
    );
  });

  it('passes source Drive parent ids during batch Drive move', async () => {
    const { service, prisma, storage } = makeService();
    prisma.webhardFolder.findUnique
      .mockResolvedValueOnce(makeFolder({ id: 'target-folder', companyId: null }))
      .mockResolvedValueOnce(
        makeFolder({
          id: 'target-folder',
          companyId: null,
          storageProvider: StorageProvider.GOOGLE_DRIVE,
          driveFolderId: 'drive-target',
        })
      );
    prisma.webhardFile.findMany.mockResolvedValueOnce([
      {
        id: 'file-a',
        companyId: null,
        folderId: 'source-a',
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFileId: 'drive-a',
      },
      {
        id: 'file-b',
        companyId: null,
        folderId: 'source-b',
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFileId: 'drive-b',
      },
    ]);
    prisma.webhardFolder.findMany.mockResolvedValueOnce([
      { id: 'source-a', driveFolderId: 'drive-source-a' },
      { id: 'source-b', driveFolderId: 'drive-source-b' },
    ]);
    prisma.webhardFile.updateMany.mockResolvedValueOnce({ count: 2 });

    await service.batchMoveFiles(
      {
        fileIds: ['file-a', 'file-b'],
        targetFolderId: 'target-folder',
      },
      adminUser as never
    );

    expect(storage.moveDriveFiles).toHaveBeenCalledWith([
      expect.objectContaining({
        storageFileId: 'drive-a',
        fromParentStorageFolderId: 'drive-source-a',
        toParentStorageFolderId: 'drive-target',
      }),
      expect.objectContaining({
        storageFileId: 'drive-b',
        fromParentStorageFolderId: 'drive-source-b',
        toParentStorageFolderId: 'drive-target',
      }),
    ]);
  });
});

describe('FilesService.batchDeleteFiles Drive repair', () => {
  it('records repair for trashed Drive files and skips DB update when a batch Drive trash fails', async () => {
    const { service, prisma, storage, storageRepair } = makeService();
    prisma.webhardFile.findMany.mockResolvedValueOnce([
      {
        id: 'file-a',
        companyId: null,
        folderId: 'source-a',
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFileId: 'drive-a',
      },
      {
        id: 'file-b',
        companyId: null,
        folderId: 'source-b',
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFileId: 'drive-b',
      },
    ]);
    storage.trashDriveFiles.mockResolvedValueOnce([
      { storageFileId: 'drive-a', success: true },
      { storageFileId: 'drive-b', success: false, error: 'drive trash failed' },
    ]);

    await expect(
      service.batchDeleteFiles(
        {
          fileIds: ['file-a', 'file-b'],
        },
        adminUser as never
      )
    ).rejects.toThrow('drive trash failed');

    expect(prisma.webhardFile.updateMany).not.toHaveBeenCalled();
    expect(storageRepair.recordDriveDbMismatch).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'trash',
        driveFileId: 'drive-a',
        webhardFileId: 'file-a',
        actualDriveState: expect.objectContaining({
          trashed: true,
          dbUpdateSkipped: true,
          batchDeleteFailed: true,
        }),
      })
    );
  });
});

// ============================================================
// Task #2: uploadedBy 저장값 테스트
// ============================================================

describe('FilesService.confirmUpload - uploadedBy 저장값', () => {
  const baseDto = {
    name: 'test.dxf',
    originalName: 'test.dxf',
    key: 'webhard/admin/test.dxf',
    size: 1024,
    mimeType: 'application/octet-stream',
    folderId: undefined,
    companyId: undefined,
    inquiryNumber: undefined,
  };

  it('관리자 세션으로 업로드 시 uploadedBy = "admin" 저장', async () => {
    const { service, prisma } = makeService();
    const createdFile = makeFile({ uploadedBy: 'admin', folderId: null });
    (prisma.webhardFile.create as jest.Mock).mockResolvedValue(createdFile);

    await service.confirmUpload(baseDto, adminUser);

    expect(prisma.webhardFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ uploadedBy: 'admin' }),
      })
    );
  });

  it('API Key(동기화 프로그램)로 업로드 시 uploadedBy = "admin" 저장', async () => {
    const { service, prisma } = makeService();
    const createdFile = makeFile({ uploadedBy: 'admin', folderId: null });
    (prisma.webhardFile.create as jest.Mock).mockResolvedValue(createdFile);

    // API Key 유저는 userId = 'api:sync', userType = 'admin'
    await service.confirmUpload(baseDto, apiKeyUser);

    expect(prisma.webhardFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ uploadedBy: 'admin' }),
      })
    );
  });

  it('업체 사용자로 업로드 시 uploadedBy = userId 문자열 저장', async () => {
    const { service, prisma } = makeService();
    const createdFile = makeFile({ uploadedBy: '5', folderId: null, companyId: 5 });
    (prisma.webhardFile.create as jest.Mock).mockResolvedValue(createdFile);

    await service.confirmUpload({ ...baseDto, companyId: undefined }, companyUser);

    expect(prisma.webhardFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ uploadedBy: '5' }),
      })
    );
  });
});

// ============================================================
// Task #1: 폴더 updated_at 갱신 테스트
// ============================================================

describe('FilesService.confirmUpload - 폴더 updated_at 갱신', () => {
  const uploadDto = {
    name: 'test.dxf',
    originalName: 'test.dxf',
    key: 'webhard/admin/folder-uuid-1/test.dxf',
    size: 2048,
    mimeType: 'application/octet-stream',
    folderId: 'folder-uuid-1',
    companyId: undefined,
    inquiryNumber: undefined,
  };

  it('파일 업로드 시 propagateUpdatedAt이 파일 createdAt으로 호출됨', async () => {
    const uploadTime = new Date('2026-03-19T10:00:00Z');
    const createdFile = makeFile({ folderId: 'folder-uuid-1', createdAt: uploadTime });

    const { service, prisma, folders } = makeService();
    (prisma.webhardFile.create as jest.Mock).mockResolvedValue(createdFile);

    await service.confirmUpload(uploadDto, adminUser);

    // propagateUpdatedAt은 비동기(catch)이므로 await로 flush
    await Promise.resolve();

    expect(folders.propagateUpdatedAt).toHaveBeenCalledWith('folder-uuid-1', uploadTime);
  });

  it('중첩 폴더일 때도 propagateUpdatedAt이 올바른 folderId로 호출됨', async () => {
    const uploadTime = new Date('2026-03-19T10:00:00Z');
    const createdFile = makeFile({ folderId: 'folder-child', createdAt: uploadTime });

    const { service, prisma, folders } = makeService();
    (prisma.webhardFile.create as jest.Mock).mockResolvedValue(createdFile);

    await service.confirmUpload({ ...uploadDto, folderId: 'folder-child' }, adminUser);
    await Promise.resolve();

    expect(folders.propagateUpdatedAt).toHaveBeenCalledWith('folder-child', uploadTime);
  });

  it('folderId가 없는 루트 파일 업로드 시 propagateUpdatedAt 미호출', async () => {
    const createdFile = makeFile({ folderId: null });
    const { service, prisma, folders } = makeService();
    (prisma.webhardFile.create as jest.Mock).mockResolvedValue(createdFile);

    await service.confirmUpload({ ...uploadDto, folderId: undefined }, adminUser);
    await Promise.resolve();

    expect(folders.propagateUpdatedAt).not.toHaveBeenCalled();
  });
});

// ============================================================
// Task #1: batchConfirmUpload - 폴더 updated_at 갱신
// ============================================================

describe('FilesService.batchConfirmUpload - 폴더 updated_at 갱신', () => {
  const batchDto = {
    files: [
      {
        name: 'a.dxf',
        originalName: 'a.dxf',
        key: 'webhard/admin/folder-1/a.dxf',
        size: 1024,
        mimeType: 'application/octet-stream',
        folderId: 'folder-1',
        companyId: undefined,
        inquiryNumber: undefined,
      },
      {
        name: 'b.dxf',
        originalName: 'b.dxf',
        key: 'webhard/admin/folder-1/b.dxf',
        size: 2048,
        mimeType: 'application/octet-stream',
        folderId: 'folder-1',
        companyId: undefined,
        inquiryNumber: undefined,
      },
    ],
  };

  it('배치 업로드 시 propagateUpdatedAt이 호출됨', async () => {
    const { service, prisma, folders } = makeService();
    (prisma.webhardFolder.findMany as jest.Mock).mockResolvedValue([
      { id: 'folder-1', companyId: null },
    ]);
    (prisma.webhardFile.createMany as jest.Mock).mockResolvedValue({ count: 2 });

    const result = await service.batchConfirmUpload(batchDto, adminUser);
    await Promise.resolve();

    expect(result.success).toBe(2);
    expect(folders.propagateUpdatedAt).toHaveBeenCalledWith('folder-1', expect.any(Date));
  });

  it('배치 업로드 시 uploadedBy = "admin" 저장', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFolder.findMany as jest.Mock).mockResolvedValue([
      { id: 'folder-1', companyId: null },
    ]);
    (prisma.webhardFile.createMany as jest.Mock).mockResolvedValue({ count: 2 });

    await service.batchConfirmUpload(batchDto, adminUser);

    const createManyCall = (prisma.webhardFile.createMany as jest.Mock).mock.calls[0][0];
    expect(createManyCall.data[0].uploadedBy).toBe('admin');
    expect(createManyCall.data[1].uploadedBy).toBe('admin');
  });
});

// ============================================================
// resolveUploaderName: 레거시 '0' 케이스 호환
// ============================================================

describe('FilesService - resolveUploaderName 레거시 호환', () => {
  it('uploadedBy = "0" (레거시 admin)도 "관리자"로 표시', async () => {
    const { service, prisma } = makeService();

    // getNewFiles를 통해 resolveUploaderName 간접 테스트
    const legacyFile = makeFile({ uploadedBy: '0', folderId: null });
    (prisma.$transaction as jest.Mock).mockResolvedValue([
      1,
      [{ ...legacyFile, folder: null, company: null }],
    ]);
    (prisma.webhardFolder.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.getNewFiles({ page: 1, limit: 10 }, adminUser);

    expect(result.files[0].uploader_display_name).toBe('관리자');
  });

  it('uploadedBy = "admin"도 "관리자"로 표시', async () => {
    const { service, prisma } = makeService();

    const adminFile = makeFile({ uploadedBy: 'admin', folderId: null });
    (prisma.$transaction as jest.Mock).mockResolvedValue([
      1,
      [{ ...adminFile, folder: null, company: null }],
    ]);
    (prisma.webhardFolder.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.getNewFiles({ page: 1, limit: 10 }, adminUser);

    expect(result.files[0].uploader_display_name).toBe('관리자');
  });

  it('uploadedBy = "1" (레거시 동기화 저장값)도 "관리자"로 표시', async () => {
    const { service, prisma } = makeService();

    const legacySyncFile = makeFile({ uploadedBy: '1', folderId: null });
    (prisma.$transaction as jest.Mock).mockResolvedValue([
      1,
      [{ ...legacySyncFile, folder: null, company: null }],
    ]);
    (prisma.webhardFolder.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.getNewFiles({ page: 1, limit: 10 }, adminUser);

    expect(result.files[0].uploader_display_name).toBe('관리자');
  });
});

// ============================================================
// resolveCompanyFolder: 제외 목록 기반 상향 탐색
// ============================================================

/** microtask queue를 완전히 flush (fire-and-forget async chain 대기) */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('FilesService.resolveCompanyFolder - 업체명 추출', () => {
  // resolveCompanyFolder는 private → triggerAutoContact를 통해 간접 테스트
  // triggerAutoContact는 confirmUpload 내부에서 folderId가 있을 때 fire-and-forget 호출됨

  const uploadDto = (folderId: string) => ({
    name: 'test.dxf',
    originalName: 'test.dxf',
    key: 'webhard/admin/test.dxf',
    size: 1024,
    mimeType: 'application/octet-stream',
    folderId,
    companyId: undefined,
    inquiryNumber: undefined,
  });

  /**
   * 폴더 체인 시뮬레이션 헬퍼
   * chain: [{ id, name, parentId }] 순서 = 파일의 부모 → ... → root
   */
  function setupFolderChain(
    prisma: ReturnType<typeof makePrisma>,
    chain: { id: string; name: string; parentId: string | null }[]
  ) {
    (prisma.webhardFolder.findUnique as jest.Mock).mockImplementation(
      (args: { where: { id: string } }) => {
        const folder = chain.find((f) => f.id === args.where.id);
        if (!folder) return Promise.resolve(null);
        return Promise.resolve({
          ...folder,
          path:
            '/' +
            [...chain]
              .reverse()
              .map((f) => f.name)
              .join('/'),
          companyId: null,
        });
      }
    );
  }

  // root > 올리기전용 > 박스메이커스 > 목형의뢰 > file
  it('3-level 구조 + 하위 구조폴더: root > 올리기전용 > 박스메이커스 > 목형의뢰', async () => {
    const { service, prisma, autoContact } = makeService();

    const chain = [
      { id: 'f-mokhyung', name: '목형의뢰', parentId: 'f-boxmakers' },
      { id: 'f-boxmakers', name: '박스메이커스', parentId: 'f-upload' },
      { id: 'f-upload', name: '올리기전용', parentId: 'f-root' },
      { id: 'f-root', name: '외부웹하드', parentId: null },
    ];
    setupFolderChain(prisma, chain);
    (prisma.webhardFile.create as jest.Mock).mockResolvedValue(
      makeFile({ folderId: 'f-mokhyung' })
    );

    await service.confirmUpload(uploadDto('f-mokhyung'), adminUser);
    await flushPromises();

    expect(autoContact.detectAndCreate).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: '박스메이커스' })
    );
  });

  // root > 올리기전용 > 박스메이커스 > 칼선의뢰 > 완료 > file
  it('깊은 구조폴더 중첩: root > 올리기전용 > 박스메이커스 > 칼선의뢰 > 완료', async () => {
    const { service, prisma, autoContact } = makeService();

    const chain = [
      { id: 'f-done', name: '완료', parentId: 'f-kalson' },
      { id: 'f-kalson', name: '칼선의뢰', parentId: 'f-boxmakers' },
      { id: 'f-boxmakers', name: '박스메이커스', parentId: 'f-upload' },
      { id: 'f-upload', name: '올리기전용', parentId: 'f-root' },
      { id: 'f-root', name: '외부웹하드', parentId: null },
    ];
    setupFolderChain(prisma, chain);
    (prisma.webhardFile.create as jest.Mock).mockResolvedValue(makeFile({ folderId: 'f-done' }));

    await service.confirmUpload(uploadDto('f-done'), adminUser);
    await flushPromises();

    expect(autoContact.detectAndCreate).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: '박스메이커스' })
    );
  });

  // root > 올리기전용 > 박스메이커스 > file (업체 폴더 직접)
  it('업체 폴더에 직접 파일: root > 올리기전용 > 박스메이커스', async () => {
    const { service, prisma, autoContact } = makeService();

    const chain = [
      { id: 'f-boxmakers', name: '박스메이커스', parentId: 'f-upload' },
      { id: 'f-upload', name: '올리기전용', parentId: 'f-root' },
      { id: 'f-root', name: '외부웹하드', parentId: null },
    ];
    setupFolderChain(prisma, chain);
    (prisma.webhardFile.create as jest.Mock).mockResolvedValue(
      makeFile({ folderId: 'f-boxmakers' })
    );

    await service.confirmUpload(uploadDto('f-boxmakers'), adminUser);
    await flushPromises();

    expect(autoContact.detectAndCreate).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: '박스메이커스' })
    );
  });

  // root > 박스메이커스 > 목형의뢰 > file (카테고리 폴더 없는 구조)
  it('카테고리 없는 구조: root > 박스메이커스 > 목형의뢰', async () => {
    const { service, prisma, autoContact } = makeService();

    const chain = [
      { id: 'f-mokhyung', name: '목형의뢰', parentId: 'f-boxmakers' },
      { id: 'f-boxmakers', name: '박스메이커스', parentId: 'f-root' },
      { id: 'f-root', name: '외부웹하드', parentId: null },
    ];
    setupFolderChain(prisma, chain);
    (prisma.webhardFile.create as jest.Mock).mockResolvedValue(
      makeFile({ folderId: 'f-mokhyung' })
    );

    await service.confirmUpload(uploadDto('f-mokhyung'), adminUser);
    await flushPromises();

    expect(autoContact.detectAndCreate).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: '박스메이커스' })
    );
  });

  // root > 박스메이커스 > file (2-level 구조)
  it('2-level 구조: root > 박스메이커스', async () => {
    const { service, prisma, autoContact } = makeService();

    const chain = [
      { id: 'f-boxmakers', name: '박스메이커스', parentId: 'f-root' },
      { id: 'f-root', name: '외부웹하드', parentId: null },
    ];
    setupFolderChain(prisma, chain);
    (prisma.webhardFile.create as jest.Mock).mockResolvedValue(
      makeFile({ folderId: 'f-boxmakers' })
    );

    await service.confirmUpload(uploadDto('f-boxmakers'), adminUser);
    await flushPromises();

    expect(autoContact.detectAndCreate).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: '박스메이커스' })
    );
  });

  it('companyId 없는 등록 업체 루트 폴더에 직접 파일 → 업체명 lookup 후 auto-contact 실행', async () => {
    const { service, prisma, autoContact } = makeService();

    const chain = [{ id: 'f-company-root', name: '테스트업체', parentId: null }];
    setupFolderChain(prisma, chain);
    (prisma.company.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: 77, companyName: '테스트업체' })
      .mockResolvedValueOnce(null);
    (prisma.webhardFile.create as jest.Mock).mockResolvedValue(
      makeFile({ folderId: 'f-company-root', companyId: null })
    );

    await service.confirmUpload(uploadDto('f-company-root'), adminUser);
    await flushPromises();

    expect(autoContact.detectAndCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: '테스트업체',
        folderId: 'f-company-root',
      })
    );
  });

  // root > 올리기전용 > file (업체 폴더 없음 → auto-contact 스킵)
  it('올리기전용에 직접 파일 → auto-contact 스킵', async () => {
    const { service, prisma, autoContact } = makeService();

    const chain = [
      { id: 'f-upload', name: '올리기전용', parentId: 'f-root' },
      { id: 'f-root', name: '외부웹하드', parentId: null },
    ];
    setupFolderChain(prisma, chain);
    (prisma.webhardFile.create as jest.Mock).mockResolvedValue(makeFile({ folderId: 'f-upload' }));

    await service.confirmUpload(uploadDto('f-upload'), adminUser);
    await flushPromises();

    expect(autoContact.detectAndCreate).not.toHaveBeenCalled();
  });

  // root 폴더에 직접 파일 → auto-contact 스킵
  it('root 폴더에 직접 파일 → auto-contact 스킵', async () => {
    const { service, prisma, autoContact } = makeService();

    const chain = [{ id: 'f-root', name: '외부웹하드', parentId: null }];
    setupFolderChain(prisma, chain);
    (prisma.webhardFile.create as jest.Mock).mockResolvedValue(makeFile({ folderId: 'f-root' }));

    await service.confirmUpload(uploadDto('f-root'), adminUser);
    await flushPromises();

    expect(autoContact.detectAndCreate).not.toHaveBeenCalled();
  });

  // 내리기전용도 구조 폴더로 건너뛰기
  it('내리기전용 구조 폴더 건너뛰기: root > 내리기전용 > 업체명 > 완료', async () => {
    const { service, prisma, autoContact } = makeService();

    const chain = [
      { id: 'f-done', name: '완료', parentId: 'f-company' },
      { id: 'f-company', name: '대성목형', parentId: 'f-download' },
      { id: 'f-download', name: '내리기전용', parentId: 'f-root' },
      { id: 'f-root', name: '외부웹하드', parentId: null },
    ];
    setupFolderChain(prisma, chain);
    (prisma.webhardFile.create as jest.Mock).mockResolvedValue(makeFile({ folderId: 'f-done' }));

    await service.confirmUpload(uploadDto('f-done'), adminUser);
    await flushPromises();

    expect(autoContact.detectAndCreate).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: '대성목형' })
    );
  });
});

// ============================================================
// Task 25 F6: getUploadPresignedUrl — companyId 상속
// admin 업로드 시 폴더의 companyId 를 상속하여 회사 격리 필터에서
// 파일이 누락되지 않도록 함 (Bug 1 fix)
// ============================================================

describe('FilesService.getUploadPresignedUrl — companyId 상속 (task 25 F6)', () => {
  it('admin + 폴더(companyId=42) + dto.companyId 미지정 → key 가 webhard/company-42/...', async () => {
    const { service, prisma, storage } = makeService();
    // verifyFolderAccess + 상속 조회 모두 동일 mock 으로 처리
    (prisma.webhardFolder.findUnique as jest.Mock).mockResolvedValue(
      makeFolder({ id: 'folder-uuid-1', companyId: 42 })
    );

    await service.getUploadPresignedUrl(
      {
        folderId: 'folder-uuid-1',
        filename: 'a.dxf',
        contentType: 'application/octet-stream',
      } as never,
      adminUser
    );

    expect(storage.generateStoragePath).toHaveBeenCalledWith(42, 'folder-uuid-1', 'a.dxf');
  });
});

// ============================================================
// Task 25 F1-F4: confirmUpload — companyId 상속
// admin 업로드 시 폴더의 companyId 를 상속하여 회사 격리 필터에서
// 파일이 누락되지 않도록 함 (Bug 1 fix)
// ============================================================

describe('FilesService.confirmUpload — companyId 상속 (task 25 F1-F4)', () => {
  function setupCompanyIdInheritance(folderCompanyId: number | null) {
    const { service, prisma } = makeService();
    // verifyFolderAccess + inheritance 조회 모두 동일 mock — folder.companyId 만 변경
    (prisma.webhardFolder.findUnique as jest.Mock).mockResolvedValue(
      makeFolder({ id: 'folder-uuid-1', companyId: folderCompanyId })
    );
    // create 는 입력 데이터를 그대로 반환 (companyId 검증을 위해)
    (prisma.webhardFile.create as jest.Mock).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(makeFile({ ...data, company: null }))
    );
    return { service, prisma };
  }

  it('F1: admin + 폴더(companyId=42) + dto.companyId 미지정 → file.companyId === 42', async () => {
    const { service, prisma } = setupCompanyIdInheritance(42);

    await service.confirmUpload(
      {
        name: 'a',
        originalName: 'a',
        size: 1,
        mimeType: 'x',
        key: 'k',
        folderId: 'folder-uuid-1',
      } as never,
      adminUser
    );

    expect((prisma.webhardFile.create as jest.Mock).mock.calls[0][0].data.companyId).toBe(42);
  });

  it('F2: 명시값 우선 — admin + 폴더(companyId=42) + dto.companyId=99 → 99', async () => {
    const { service, prisma } = setupCompanyIdInheritance(42);

    await service.confirmUpload(
      {
        name: 'a',
        originalName: 'a',
        size: 1,
        mimeType: 'x',
        key: 'k',
        folderId: 'folder-uuid-1',
        companyId: 99,
      } as never,
      adminUser
    );

    expect((prisma.webhardFile.create as jest.Mock).mock.calls[0][0].data.companyId).toBe(99);
  });

  it('F3: folderId 없음 → companyId=null (root 업로드)', async () => {
    const { service, prisma } = setupCompanyIdInheritance(42);

    await service.confirmUpload(
      {
        name: 'a',
        originalName: 'a',
        size: 1,
        mimeType: 'x',
        key: 'k',
      } as never,
      adminUser
    );

    expect((prisma.webhardFile.create as jest.Mock).mock.calls[0][0].data.companyId).toBeNull();
  });

  it('F4: folder.companyId === null (외부웹하드) → file.companyId === null', async () => {
    const { service, prisma } = setupCompanyIdInheritance(null);

    await service.confirmUpload(
      {
        name: 'a',
        originalName: 'a',
        size: 1,
        mimeType: 'x',
        key: 'k',
        folderId: 'folder-uuid-1',
      } as never,
      adminUser
    );

    expect((prisma.webhardFile.create as jest.Mock).mock.calls[0][0].data.companyId).toBeNull();
  });
});

// ============================================================
// Task 25 F5: batchConfirmUpload — companyId 상속 (batch)
// admin 배치 업로드 시 폴더의 companyId 를 상속하여 회사 격리 필터에서
// 파일이 누락되지 않도록 함 (Bug 1 fix). 폴더 fetch 는 한 번만.
// ============================================================

describe('FilesService.batchConfirmUpload — companyId 상속 (task 25 F5)', () => {
  it('F5: 항목 5개 (3개 cid=42 폴더, 2개 cid=null 폴더) → 3개 42, 2개 null + 폴더 조회 1회', async () => {
    const { service, prisma } = makeService();

    const folderA = makeFolder({ id: 'fA', companyId: 42 });
    const folderB = makeFolder({ id: 'fB', companyId: null });
    (prisma.webhardFolder.findMany as jest.Mock).mockResolvedValue([folderA, folderB]);

    (prisma.webhardFile.createMany as jest.Mock).mockImplementation(
      ({ data }: { data: Array<Record<string, unknown>> }) =>
        Promise.resolve({ count: data.length })
    );

    await service.batchConfirmUpload(
      {
        files: [
          { name: '1', originalName: '1', size: 1, mimeType: 'x', key: 'k', folderId: 'fA' },
          { name: '2', originalName: '2', size: 1, mimeType: 'x', key: 'k', folderId: 'fA' },
          { name: '3', originalName: '3', size: 1, mimeType: 'x', key: 'k', folderId: 'fA' },
          { name: '4', originalName: '4', size: 1, mimeType: 'x', key: 'k', folderId: 'fB' },
          { name: '5', originalName: '5', size: 1, mimeType: 'x', key: 'k', folderId: 'fB' },
        ],
      } as never,
      adminUser
    );

    const captured = (prisma.webhardFile.createMany as jest.Mock).mock.calls[0][0].data as Array<{
      companyId: number | null;
    }>;

    expect(captured.map((d) => d.companyId)).toEqual([42, 42, 42, null, null]);
    expect((prisma.webhardFolder.findMany as jest.Mock).mock.calls.length).toBe(1);
  });

  it('F5b: 항목별 f.companyId=99 명시 → 폴더(cid=42) 와 무관하게 99 (admin explicit override)', async () => {
    const { service, prisma } = makeService();

    const folderA = makeFolder({ id: 'fA', companyId: 42 });
    (prisma.webhardFolder.findMany as jest.Mock).mockResolvedValue([folderA]);

    (prisma.webhardFile.createMany as jest.Mock).mockImplementation(
      ({ data }: { data: Array<Record<string, unknown>> }) =>
        Promise.resolve({ count: data.length })
    );

    await service.batchConfirmUpload(
      {
        files: [
          // 1번: 명시 없음 → 폴더 cid=42 상속
          { name: '1', originalName: '1', size: 1, mimeType: 'x', key: 'k', folderId: 'fA' },
          // 2번: companyId=99 명시 → 폴더 cid=42 무시, 99 사용
          {
            name: '2',
            originalName: '2',
            size: 1,
            mimeType: 'x',
            key: 'k',
            folderId: 'fA',
            companyId: 99,
          },
          // 3번: folderId 없음 + companyId 명시도 없음 → null (root 업로드)
          { name: '3', originalName: '3', size: 1, mimeType: 'x', key: 'k' },
        ],
      } as never,
      adminUser
    );

    const captured = (prisma.webhardFile.createMany as jest.Mock).mock.calls[0][0].data as Array<{
      companyId: number | null;
    }>;

    expect(captured.map((d) => d.companyId)).toEqual([42, 99, null]);
  });

  it('Google Drive metadata retry is idempotent when driveFileId already exists', async () => {
    const { service, prisma, storage } = makeService();
    const folder = makeFolder({
      id: 'folder-drive-1',
      companyId: null,
      storageProvider: StorageProvider.GOOGLE_DRIVE,
      driveFolderId: 'drive-folder-1',
    });
    (prisma.webhardFolder.findMany as jest.Mock).mockResolvedValue([folder]);
    (prisma.webhardFolder.findUnique as jest.Mock).mockResolvedValue(folder);
    (storage.confirmDriveUploadedFile as jest.Mock).mockResolvedValue({
      storageFileId: 'drive-file-1',
      mimeType: 'application/pdf',
      parentStorageFolderIds: ['drive-folder-1'],
    });
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue([
      { driveFileId: 'drive-file-1', path: 'folder-drive-1/sample.pdf' },
    ]);

    const result = await service.batchConfirmUpload(
      {
        files: [
          {
            name: 'sample.pdf',
            originalName: 'sample.pdf',
            size: 1024,
            mimeType: 'application/pdf',
            key: 'folder-drive-1/sample.pdf',
            folderId: 'folder-drive-1',
            storageProvider: 'google_drive',
            driveFileId: 'drive-file-1',
          },
        ],
      } as never,
      adminUser
    );

    expect(prisma.webhardFile.createMany).not.toHaveBeenCalled();
    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results).toEqual([{ fileName: 'sample.pdf', success: true }]);
  });

  it('uses signed Drive upload proof instead of a confirm-time Drive metadata GET', async () => {
    const { service, prisma, storage } = makeService();
    const folder = makeFolder({
      id: 'folder-drive-1',
      companyId: null,
      storageProvider: StorageProvider.GOOGLE_DRIVE,
      driveFolderId: 'drive-folder-1',
    });
    (prisma.webhardFolder.findMany as jest.Mock).mockResolvedValue([folder]);
    (prisma.webhardFolder.findUnique as jest.Mock).mockResolvedValue(folder);
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.webhardFile.createMany as jest.Mock).mockResolvedValue({ count: 1 });

    const result = await service.batchConfirmUpload(
      {
        files: [
          {
            name: 'sample.pdf',
            originalName: 'sample.pdf',
            size: 1024,
            mimeType: 'application/pdf',
            key: 'folder-drive-1/sample.pdf',
            folderId: 'folder-drive-1',
            storageProvider: 'google_drive',
            driveFileId: 'drive-file-1',
            driveUploadProof: 'signed-proof',
          },
        ],
      } as never,
      adminUser
    );

    expect(result.success).toBe(1);
    expect(storage.verifyDriveUploadProof).toHaveBeenCalledWith({
      proof: 'signed-proof',
      storageFileId: 'drive-file-1',
      expectedParentStorageFolderId: 'drive-folder-1',
    });
    expect(storage.confirmDriveUploadedFile).not.toHaveBeenCalled();
  });
});

// ============================================================
// Task 25 F7: service-level integration — admin 업로드 후 회사 가시성
// admin 이 폴더(cid=42) 에 업로드한 file 이 같은 cid 회사 사용자의 getFiles 응답에
// 포함되는지를 confirmUpload + getFiles 결합으로 검증 (Bug 1 fix 의 e2e 의도 재현).
// e2e 인프라 부재 — 2026-04-28 결정으로 service-level integration 으로 대체.
// ============================================================

describe('FilesService — F7 service-level integration (task 25)', () => {
  it('F7: admin confirmUpload → 회사 사용자 getFiles 응답에 file 포함', async () => {
    const folderId = 'folder-uuid-F7';
    const folderCompanyId = 42;
    const folder = makeFolder({ id: folderId, companyId: folderCompanyId });

    // Shared in-memory store — confirmUpload 가 push, getFiles 가 where 필터로 read
    type StoredFile = ReturnType<typeof makeFile>;
    const fileStore: StoredFile[] = [];

    const { service, prisma } = makeService();

    // verifyFolderAccess + companyId 상속 모두 동일 mock — folder 객체 재사용
    (prisma.webhardFolder.findUnique as jest.Mock).mockResolvedValue(folder);

    // create: store 에 push 후 created file 반환 (mapToDto 입력으로 사용 가능한 shape)
    (prisma.webhardFile.create as jest.Mock).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        const created = makeFile({
          ...data,
          id: `file-${fileStore.length + 1}`,
          company: null,
        });
        fileStore.push(created);
        return Promise.resolve(created);
      }
    );

    // getFiles 는 $transaction([count, findMany]) 사용 — 각 항목 호출 시 store 에서 필터링
    (prisma.webhardFile.count as jest.Mock).mockImplementation(
      ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(filterStore(fileStore, where).length)
    );
    (prisma.webhardFile.findMany as jest.Mock).mockImplementation(
      ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(filterStore(fileStore, where))
    );

    // 1. admin 업로드 — companyId 상속으로 file.companyId === 42 가 됨
    await service.confirmUpload(
      {
        name: 'doc.dxf',
        originalName: 'doc.dxf',
        size: 1024,
        mimeType: 'application/octet-stream',
        key: 'k',
        folderId,
      } as never,
      adminUser
    );

    // 2. 회사 사용자 (companyId=42) 로 같은 폴더 조회
    const companyUserSameCompany = {
      userType: 'company' as const,
      userId: 'comp-1',
      companyId: folderCompanyId,
    };
    const result = await service.getFiles({ folderId } as never, companyUserSameCompany);

    // 3. 검증 — file 이 응답에 포함됨 (mapToDto 통한 snake_case 응답)
    expect(result.total).toBe(1);
    expect(result.files.length).toBe(1);
    const docFile = result.files.find((f) => f.name === 'doc.dxf');
    expect(docFile).toBeDefined();
    expect(docFile?.company_id).toBe(folderCompanyId);
    expect(docFile?.folder_id).toBe(folderId);
  });
});

/**
 * F7 in-memory store 의 where 필터 시뮬레이션.
 * getFiles 가 사용하는 조건들을 처리:
 *   - deletedAt: null (모두 통과 — 신규 file 은 deletedAt=null)
 *   - folderId: 일치 검사
 *   - companyId: 일치 검사 (회사 사용자 격리)
 */
function filterStore(
  store: Array<ReturnType<typeof makeFile>>,
  where: Record<string, unknown>
): Array<ReturnType<typeof makeFile>> {
  return store.filter((f) => {
    if (where.folderId !== undefined && f.folderId !== where.folderId) return false;
    if (where.companyId !== undefined && f.companyId !== where.companyId) return false;
    return true;
  });
}

// ============================================================
// task 26 phase 1.5: getUploadPresignedUrl routing (R1~R5)
//
// 스펙: docs/specs/features/external-folder-migration.md §정책 — 신규 동기화 routing
//
// 검증:
//   R1: 외부웹하드 + 매칭 성공 → 응답 folderId 가 업체 폴더 id, redirected=true
//   R2: 외부웹하드 + 매칭 실패 → 요청 folderId echo, redirected=false
//   R3: routing target lazy create — 업체 루트에 동명 template 폴더 없으면 자동 생성
//   R4: 비외부 folderId → routing 발동 안 함 (redirected=false, 요청값 echo)
//   R5: ensureRoutingTarget 예외 흡수 — throw 시 fallback (요청 folderId echo)
// ============================================================

interface RoutingFolderRow {
  id: string;
  name: string;
  parentId: string | null;
  path: string | null;
  companyId: number | null;
  folderKind: string;
  deletedAt: Date | null;
}

function makeRoutingPrisma(opts: {
  folders: RoutingFolderRow[];
  companyByName?: Map<string, { id: number; companyName: string }>;
  approvedAliasByName?: Map<string, { id: number; companyName: string }>;
  forceRoutingThrow?: boolean;
}) {
  const folders = opts.folders;
  const companyByName = opts.companyByName ?? new Map();
  const approvedAliasByName = opts.approvedAliasByName ?? new Map();

  const webhardFolder = {
    findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
      return folders.find((f) => f.id === where.id) ?? null;
    }),
    findFirst: jest.fn().mockImplementation(async (args: { where: Record<string, unknown> }) => {
      const w = args.where as {
        parentId?: string | null;
        companyId?: number;
        name?: string;
        deletedAt?: null;
      };
      return (
        folders.find(
          (f) =>
            f.deletedAt === null &&
            (w.parentId === undefined || f.parentId === w.parentId) &&
            (w.name === undefined || f.name === w.name) &&
            (w.companyId === undefined || f.companyId === w.companyId)
        ) ?? null
      );
    }),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation(
      async ({
        data,
      }: {
        data: {
          name: string;
          parentId: string;
          companyId: number;
          path: string;
          folderKind: string;
        };
      }) => {
        if (opts.forceRoutingThrow) {
          throw new Error('ensureRoutingChildFolder forced throw');
        }
        const created: RoutingFolderRow = {
          id: `created-routing-${folders.length + 1}`,
          name: data.name,
          parentId: data.parentId,
          path: data.path,
          companyId: data.companyId,
          folderKind: data.folderKind,
          deletedAt: null,
        };
        folders.push(created);
        return created;
      }
    ),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  };

  const company = {
    findFirst: jest
      .fn()
      .mockImplementation(async ({ where }: { where: { companyName: { equals: string } } }) => {
        const name = where.companyName.equals;
        return companyByName.get(name) ?? null;
      }),
    findUnique: jest.fn(),
  };

  const companyFolderAlias = {
    findFirst: jest
      .fn()
      .mockImplementation(async ({ where }: { where: { folderName: string; status: string } }) => {
        const matched = approvedAliasByName.get(where.folderName);
        if (!matched) return null;
        return { folderName: where.folderName, status: 'approved', company: matched };
      }),
  };

  const webhardFile = {
    create: jest.fn(),
    createMany: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  };

  return {
    executeWithRetry: jest.fn((fn: () => unknown) => fn()),
    $transaction: jest.fn((input: unknown) => {
      if (typeof input === 'function') {
        const callback = input as (tx: unknown) => unknown;
        return callback({
          $executeRaw: jest.fn().mockResolvedValue(undefined),
          webhardFile,
          webhardFolder,
          company,
        });
      }
      return Promise.all(input as Array<Promise<unknown>>);
    }),
    webhardFile,
    webhardFolder,
    company,
    companyFolderAlias,
  };
}

describe('FilesService.getUploadPresignedUrl routing (task 26)', () => {
  const apiKeyAdmin = { userType: 'admin' as const, userId: 'api:sync', companyId: 0 };
  const baseDto = {
    filename: 'sample.dxf',
    contentType: 'application/octet-stream',
    size: 1024,
  };

  function buildService(prisma: unknown) {
    const storage = makeStorageService();
    const events = makeEventsGateway();
    const autoContact = makeAutoContactService();
    const folders = makeFoldersService();
    const webhardConfig = makeWebhardConfigService();
    return {
      service: new FilesService(
        prisma as never,
        storage as never,
        events as never,
        autoContact as never,
        folders as never,
        webhardConfig as never
      ),
      storage,
    };
  }

  it('R1: 외부웹하드 하위 folderId + 매칭 성공 → folderId routed, redirected=true', async () => {
    const externalCutting: RoutingFolderRow = {
      id: 'ext-cutting',
      name: '칼선의뢰',
      parentId: 'ext-root',
      path: '/외부웹하드/대성목형/칼선의뢰',
      companyId: null,
      folderKind: 'generic',
      deletedAt: null,
    };
    const companyRoot: RoutingFolderRow = {
      id: 'company-root',
      name: '대성목형',
      parentId: null,
      path: '/대성목형',
      companyId: 4,
      folderKind: 'root',
      deletedAt: null,
    };
    const companyCutting: RoutingFolderRow = {
      id: 'company-cutting',
      name: '칼선의뢰',
      parentId: 'company-root',
      path: '/대성목형/칼선의뢰',
      companyId: 4,
      folderKind: 'template',
      deletedAt: null,
    };
    const prisma = makeRoutingPrisma({
      folders: [externalCutting, companyRoot, companyCutting],
      companyByName: new Map([['대성목형', { id: 4, companyName: '대성목형' }]]),
    });
    const { service } = buildService(prisma);

    const result = await service.getUploadPresignedUrl(
      { ...baseDto, folderId: 'ext-cutting' },
      apiKeyAdmin
    );

    expect(result.redirected).toBe(true);
    expect(result.folderId).toBe('company-cutting');
  });

  it('R2: 외부웹하드 + 매칭 실패 → 요청 folderId echo, redirected=false', async () => {
    const externalArbitrary: RoutingFolderRow = {
      id: 'ext-unmatched',
      name: '미등록업체',
      parentId: 'ext-root',
      path: '/외부웹하드/미등록업체',
      companyId: null,
      folderKind: 'generic',
      deletedAt: null,
    };
    const prisma = makeRoutingPrisma({
      folders: [externalArbitrary],
      companyByName: new Map(), // 매칭 실패
    });
    const { service } = buildService(prisma);

    const result = await service.getUploadPresignedUrl(
      { ...baseDto, folderId: 'ext-unmatched' },
      apiKeyAdmin
    );

    expect(result.redirected).toBe(false);
    expect(result.folderId).toBe('ext-unmatched');
  });

  it('R3: routing target lazy create — 업체 루트에 동명 template 폴더 없으면 자동 생성', async () => {
    const externalMold: RoutingFolderRow = {
      id: 'ext-mold',
      name: '목형의뢰',
      parentId: 'ext-root',
      path: '/외부웹하드/대성목형/목형의뢰',
      companyId: null,
      folderKind: 'generic',
      deletedAt: null,
    };
    const companyRoot: RoutingFolderRow = {
      id: 'company-root-r3',
      name: '대성목형',
      parentId: null,
      path: '/대성목형',
      companyId: 4,
      folderKind: 'root',
      deletedAt: null,
    };
    // 업체 루트 하위 '목형의뢰' template 폴더 미존재 → lazy create 트리거
    const prisma = makeRoutingPrisma({
      folders: [externalMold, companyRoot],
      companyByName: new Map([['대성목형', { id: 4, companyName: '대성목형' }]]),
    });
    const { service } = buildService(prisma);

    const result = await service.getUploadPresignedUrl(
      { ...baseDto, folderId: 'ext-mold' },
      apiKeyAdmin
    );

    // create 호출 발생 + folderKind='template'
    expect(prisma.webhardFolder.create).toHaveBeenCalledTimes(1);
    const createArg = (
      prisma.webhardFolder.create.mock.calls[0] as Array<{ data: Record<string, unknown> }>
    )[0];
    expect(createArg.data.name).toBe('목형의뢰');
    expect(createArg.data.parentId).toBe('company-root-r3');
    expect(createArg.data.folderKind).toBe('template');
    expect(createArg.data.companyId).toBe(4);

    // 응답에서 새 폴더 id 사용
    expect(result.redirected).toBe(true);
    expect(result.folderId).toMatch(/^created-routing-/);
  });

  it('R4: 비외부 folderId → routing 발동 안 함 (redirected=false, 요청값 echo)', async () => {
    const innerFolder: RoutingFolderRow = {
      id: 'inner-folder',
      name: 'O123',
      parentId: 'company-something',
      path: '/대성목형/문의/O123',
      companyId: 4,
      folderKind: 'inquiry',
      deletedAt: null,
    };
    const prisma = makeRoutingPrisma({
      folders: [innerFolder],
    });
    const { service } = buildService(prisma);

    const result = await service.getUploadPresignedUrl(
      { ...baseDto, folderId: 'inner-folder' },
      apiKeyAdmin
    );

    expect(result.redirected).toBe(false);
    expect(result.folderId).toBe('inner-folder');
    // routing 안 들어가므로 company 조회 자체가 0회
    expect(prisma.company.findFirst).not.toHaveBeenCalled();
  });

  it('R5: ensureRoutingTarget 예외 → fallback (요청 folderId echo, redirected=false)', async () => {
    const externalCutting: RoutingFolderRow = {
      id: 'ext-cutting-r5',
      name: '칼선의뢰',
      parentId: 'ext-root',
      path: '/외부웹하드/대성목형/칼선의뢰',
      companyId: null,
      folderKind: 'generic',
      deletedAt: null,
    };
    const companyRoot: RoutingFolderRow = {
      id: 'company-root-r5',
      name: '대성목형',
      parentId: null,
      path: '/대성목형',
      companyId: 4,
      folderKind: 'root',
      deletedAt: null,
    };
    // 업체 루트 하위에 '칼선의뢰' 미존재 → create 호출하는데 forceRoutingThrow=true 로 throw 유도
    const prisma = makeRoutingPrisma({
      folders: [externalCutting, companyRoot],
      companyByName: new Map([['대성목형', { id: 4, companyName: '대성목형' }]]),
      forceRoutingThrow: true,
    });
    const { service } = buildService(prisma);

    const result = await service.getUploadPresignedUrl(
      { ...baseDto, folderId: 'ext-cutting-r5' },
      apiKeyAdmin
    );

    // 예외 흡수 → fallback. 업로드 자체는 진행 (url 응답 정상).
    expect(result.redirected).toBe(false);
    expect(result.folderId).toBe('ext-cutting-r5');
    expect(result.url).toBeDefined();
  });

  it('routing 실패 시 업로드는 fallback하되 pipeline backlog event를 남긴다', async () => {
    const { service, syncLog } = makeService();
    jest
      .spyOn(
        service as unknown as {
          tryRouteExternalUpload(
            folderId: string
          ): Promise<{ folderId: string; companyId: number } | null>;
        },
        'tryRouteExternalUpload'
      )
      .mockRejectedValue(new Error('lookup down'));

    const result = await service.getUploadPresignedUrl(
      {
        filename: 'routing-fail.dxf',
        contentType: 'application/dxf',
        folderId: 'external-folder-1',
      },
      adminUser
    );

    expect(result.redirected).toBe(false);
    expect(syncLog.createPipelineEvent).toHaveBeenCalledWith({
      filename: 'routing-fail.dxf',
      stage: 'routing',
      status: 'failed',
      reasonCode: 'routing_failed',
      folderId: 'external-folder-1',
      context: {
        requestedFolderId: 'external-folder-1',
        source: 'getUploadPresignedUrl',
      },
    });
  });
});

// task 28: confirmUpload routing consistency (C1~C5)
describe('FilesService.confirmUpload routing consistency (task 28)', () => {
  let service: FilesService;
  let prisma: ReturnType<typeof makePrisma>;
  let storage: { invalidateStorageCache: jest.Mock };
  let events: { emitToFolder: jest.Mock; emitToFolderBatched: jest.Mock };
  let autoContact: { detectAndCreate: jest.Mock };
  let folders: { propagateUpdatedAt: jest.Mock };
  let webhardConfig: { getStatusMapping: jest.Mock };

  // 외부 husk root + 회사 root setup helper
  const HUSK_ID = 'husk-root-uuid';
  const COMPANY_ROOT_ID = 'company-root-uuid';
  const COMPANY_ID = 4;

  beforeEach(() => {
    prisma = makePrisma();
    storage = { invalidateStorageCache: jest.fn().mockResolvedValue(undefined) };
    events = { emitToFolder: jest.fn(), emitToFolderBatched: jest.fn() };
    autoContact = { detectAndCreate: jest.fn().mockResolvedValue(undefined) };
    folders = { propagateUpdatedAt: jest.fn().mockResolvedValue(undefined) };
    webhardConfig = { getStatusMapping: jest.fn() };
    service = new FilesService(
      prisma as never,
      storage as never,
      events as never,
      autoContact as never,
      folders as never,
      webhardConfig as never
    );
  });

  it('C1: external husk folderId → DB row 가 routed folderId/companyId 로 생성', async () => {
    // verifyFolderAccess 응답: husk 폴더 살아있음
    prisma.webhardFolder.findUnique
      .mockResolvedValueOnce({ id: HUSK_ID, companyId: null, deletedAt: null })
      // tryRouteExternalUpload 의 findUnique: husk path 반환
      .mockResolvedValueOnce({
        id: HUSK_ID,
        name: '대성목형(2265-1295)',
        path: '/외부웹하드/대성목형(2265-1295)',
        folderKind: 'generic',
        companyId: null,
      });

    // lookupCompanyByFolderName 의 의존: companyFolderAlias.findFirst → approved
    prisma.companyFolderAlias.findFirst.mockResolvedValueOnce({
      company: { id: COMPANY_ID, companyName: '대성목형' },
    });

    // 회사 root 폴더 조회
    prisma.webhardFolder.findFirst.mockResolvedValueOnce({ id: COMPANY_ROOT_ID });

    prisma.webhardFile.create.mockResolvedValueOnce(
      makeFile({
        id: 'file-1',
        name: 'test.dxf',
        folderId: COMPANY_ROOT_ID,
        companyId: COMPANY_ID,
      })
    );

    const dto = {
      key: 'webhard/company-4/company-root-uuid/test.dxf',
      name: 'test.dxf',
      originalName: 'test.dxf',
      size: 1234,
      mimeType: 'application/octet-stream',
      folderId: HUSK_ID,
    };
    const adminUser = { userType: 'admin' as const, userId: 'admin' };

    await service.confirmUpload(dto as never, adminUser as never);

    expect(prisma.webhardFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          folderId: COMPANY_ROOT_ID,
          companyId: COMPANY_ID,
        }),
      })
    );
  });

  it('C4: routing throw → catch + warn 로그 + fallback (dto.folderId 사용), confirm 자체는 성공', async () => {
    const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();

    prisma.webhardFolder.findUnique
      .mockResolvedValueOnce({ id: HUSK_ID, companyId: null, deletedAt: null })
      .mockRejectedValueOnce(new Error('DB connection lost'));

    prisma.webhardFile.create.mockResolvedValueOnce(
      makeFile({
        id: 'file-1',
        name: 'test.dxf',
        folderId: HUSK_ID,
        companyId: null,
      })
    );

    const dto = {
      key: 'webhard/test.dxf',
      name: 'test.dxf',
      originalName: 'test.dxf',
      size: 1234,
      mimeType: 'application/octet-stream',
      folderId: HUSK_ID,
    };
    const adminUser = { userType: 'admin' as const, userId: 'admin' };

    await expect(service.confirmUpload(dto as never, adminUser as never)).resolves.toBeDefined();

    expect(prisma.webhardFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          folderId: HUSK_ID,
        }),
      })
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/confirmUpload routing failed.*folderId=husk-root-uuid/)
    );
  });

  it('C2: non-external folderId (회사 폴더) → routing 미적용, dto.folderId 그대로 사용', async () => {
    const COMPANY_FOLDER_ID = 'company-folder-uuid';
    prisma.webhardFolder.findUnique
      // verifyFolderAccess
      .mockResolvedValueOnce({ id: COMPANY_FOLDER_ID, companyId: COMPANY_ID, deletedAt: null })
      // tryRouteExternalUpload — 회사 폴더는 path 가 /외부웹하드/ 로 시작 안 함
      .mockResolvedValueOnce({
        id: COMPANY_FOLDER_ID,
        name: '대성목형',
        path: '/대성목형',
        folderKind: 'generic',
        companyId: COMPANY_ID,
      });

    prisma.webhardFile.create.mockResolvedValueOnce(
      makeFile({
        id: 'file-2',
        folderId: COMPANY_FOLDER_ID,
        companyId: COMPANY_ID,
      })
    );

    const dto = {
      key: 'webhard/company-4/company-folder-uuid/test.dxf',
      name: 'test.dxf',
      originalName: 'test.dxf',
      size: 1234,
      mimeType: 'application/octet-stream',
      folderId: COMPANY_FOLDER_ID,
    };
    const adminUser = { userType: 'admin' as const, userId: 'admin' };

    await service.confirmUpload(dto as never, adminUser as never);

    expect(prisma.webhardFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          folderId: COMPANY_FOLDER_ID,
          companyId: COMPANY_ID, // folder.companyId 상속 (precedence #4)
        }),
      })
    );
  });

  it('C3: folderId=null (root upload) → routing skip, 기존 동작 유지', async () => {
    prisma.webhardFile.create.mockResolvedValueOnce(
      makeFile({
        id: 'file-3',
        folderId: null,
        companyId: null,
      })
    );

    const dto = {
      key: 'webhard/root-test.dxf',
      name: 'root-test.dxf',
      originalName: 'root-test.dxf',
      size: 1234,
      mimeType: 'application/octet-stream',
      // folderId 없음
    };
    const adminUser = { userType: 'admin' as const, userId: 'admin' };

    await service.confirmUpload(dto as never, adminUser as never);

    // tryRouteExternalUpload 자체가 호출 안 됨 (verifyFolderAccess 도 skip)
    expect(prisma.webhardFolder.findUnique).not.toHaveBeenCalled();
    expect(prisma.webhardFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          folderId: null,
          companyId: null,
        }),
      })
    );
  });

  it('C5: redirected 시 emitToFolder event payload 의 folderId 도 routed 값 사용', async () => {
    prisma.webhardFolder.findUnique
      .mockResolvedValueOnce({ id: HUSK_ID, companyId: null, deletedAt: null })
      .mockResolvedValueOnce({
        id: HUSK_ID,
        name: '대성목형(2265-1295)',
        path: '/외부웹하드/대성목형(2265-1295)',
        folderKind: 'generic',
        companyId: null,
      });
    prisma.companyFolderAlias.findFirst.mockResolvedValueOnce({
      company: { id: COMPANY_ID, companyName: '대성목형' },
    });
    prisma.webhardFolder.findFirst.mockResolvedValueOnce({ id: COMPANY_ROOT_ID });
    prisma.webhardFile.create.mockResolvedValueOnce(
      makeFile({
        id: 'file-5',
        folderId: COMPANY_ROOT_ID,
        companyId: COMPANY_ID,
      })
    );

    const dto = {
      key: 'webhard/company-4/company-root-uuid/test.dxf',
      name: 'test.dxf',
      originalName: 'test.dxf',
      size: 1234,
      mimeType: 'application/octet-stream',
      folderId: HUSK_ID,
    };
    const adminUser = { userType: 'admin' as const, userId: 'admin' };

    await service.confirmUpload(dto as never, adminUser as never);

    // emitToFolder 호출 검증 — folderId 인자 + payload.folderId 둘 다 routed
    expect(events.emitToFolder).toHaveBeenCalledWith(
      COMPANY_ROOT_ID,
      expect.objectContaining({
        type: 'file:created',
        folderId: COMPANY_ROOT_ID,
      })
    );
  });
});

// task 28 Phase B: batchConfirmUpload routing consistency (BC1, BC2)
describe('FilesService.batchConfirmUpload routing consistency (task 28)', () => {
  let service: FilesService;
  let prisma: ReturnType<typeof makePrisma>;
  let storage: { invalidateStorageCache: jest.Mock };
  let events: { emitToFolder: jest.Mock; emitToFolderBatched: jest.Mock };
  let autoContact: { detectAndCreate: jest.Mock };
  let folders: { propagateUpdatedAt: jest.Mock };
  let webhardConfig: { getStatusMapping: jest.Mock };

  const HUSK_ID = 'husk-root-uuid';
  const COMPANY_ROOT_ID = 'company-root-uuid';
  const COMPANY_FOLDER_ID = 'company-folder-uuid';
  const COMPANY_ID = 4;

  beforeEach(() => {
    prisma = makePrisma();
    storage = { invalidateStorageCache: jest.fn().mockResolvedValue(undefined) };
    events = { emitToFolder: jest.fn(), emitToFolderBatched: jest.fn() };
    autoContact = { detectAndCreate: jest.fn().mockResolvedValue(undefined) };
    folders = { propagateUpdatedAt: jest.fn().mockResolvedValue(undefined) };
    webhardConfig = { getStatusMapping: jest.fn() };
    service = new FilesService(
      prisma as never,
      storage as never,
      events as never,
      autoContact as never,
      folders as never,
      webhardConfig as never
    );
  });

  it('BC1: 배치 내 일부 file 만 external → 해당 file 만 redirected, 나머지 그대로', async () => {
    // 폴더 일괄 fetch (uniqueFolderIds = [HUSK_ID, COMPANY_FOLDER_ID])
    prisma.webhardFolder.findMany.mockResolvedValueOnce([
      {
        id: HUSK_ID,
        name: '대성목형(2265-1295)',
        path: '/외부웹하드/대성목형(2265-1295)',
        companyId: null,
        parentId: 'external-root',
      },
      {
        id: COMPANY_FOLDER_ID,
        name: '대성목형',
        path: '/대성목형',
        companyId: COMPANY_ID,
        parentId: null,
      },
    ]);

    // tryRouteExternalUpload — HUSK_ID 만 external (path startsWith /외부웹하드/)
    // findUnique 는 per-file 호출. 첫 번째 = HUSK_ID, 두 번째 = COMPANY_FOLDER_ID
    prisma.webhardFolder.findUnique
      .mockResolvedValueOnce({
        id: HUSK_ID,
        name: '대성목형(2265-1295)',
        path: '/외부웹하드/대성목형(2265-1295)',
        folderKind: 'generic',
        companyId: null,
      })
      .mockResolvedValueOnce({
        id: COMPANY_FOLDER_ID,
        name: '대성목형',
        path: '/대성목형',
        folderKind: 'generic',
        companyId: COMPANY_ID,
      });

    // husk 의 alias 매칭
    prisma.companyFolderAlias.findFirst.mockResolvedValueOnce({
      company: { id: COMPANY_ID, companyName: '대성목형' },
    });
    prisma.webhardFolder.findFirst.mockResolvedValueOnce({ id: COMPANY_ROOT_ID });

    prisma.webhardFile.createMany.mockResolvedValueOnce({ count: 2 });

    const dto = {
      files: [
        {
          key: 'webhard/company-4/company-root-uuid/file1.dxf',
          name: 'file1.dxf',
          originalName: 'file1.dxf',
          size: 1234,
          mimeType: 'application/octet-stream',
          folderId: HUSK_ID, // → routed
        },
        {
          key: 'webhard/company-4/company-folder-uuid/file2.dxf',
          name: 'file2.dxf',
          originalName: 'file2.dxf',
          size: 5678,
          mimeType: 'application/octet-stream',
          folderId: COMPANY_FOLDER_ID, // → 그대로
        },
      ],
    };
    const adminUser = { userType: 'admin' as const, userId: 'admin' };

    await service.batchConfirmUpload(dto as never, adminUser as never);

    expect(prisma.webhardFile.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            folderId: COMPANY_ROOT_ID, // routed
            companyId: COMPANY_ID,
          }),
          expect.objectContaining({
            folderId: COMPANY_FOLDER_ID, // 그대로
            companyId: COMPANY_ID, // folder.companyId 상속
          }),
        ]),
      })
    );
  });

  it('BC2: 배치 내 1건 routing throw → 그 1건만 fallback, 나머지 영향 없음', async () => {
    const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();

    prisma.webhardFolder.findMany.mockResolvedValueOnce([
      {
        id: HUSK_ID,
        name: '대성목형(2265-1295)',
        path: '/외부웹하드/대성목형(2265-1295)',
        companyId: null,
        parentId: 'external-root',
      },
      {
        id: COMPANY_FOLDER_ID,
        name: '대성목형',
        path: '/대성목형',
        companyId: COMPANY_ID,
        parentId: null,
      },
    ]);

    // tryRouteExternalUpload per-file:
    //   첫 번째 (HUSK_ID) → throw
    //   두 번째 (COMPANY_FOLDER_ID) → 정상
    prisma.webhardFolder.findUnique
      .mockRejectedValueOnce(new Error('DB connection lost'))
      .mockResolvedValueOnce({
        id: COMPANY_FOLDER_ID,
        name: '대성목형',
        path: '/대성목형',
        folderKind: 'generic',
        companyId: COMPANY_ID,
      });

    prisma.webhardFile.createMany.mockResolvedValueOnce({ count: 2 });

    const dto = {
      files: [
        {
          key: 'webhard/file1.dxf',
          name: 'file1.dxf',
          originalName: 'file1.dxf',
          size: 1234,
          mimeType: 'application/octet-stream',
          folderId: HUSK_ID,
        },
        {
          key: 'webhard/company-4/company-folder-uuid/file2.dxf',
          name: 'file2.dxf',
          originalName: 'file2.dxf',
          size: 5678,
          mimeType: 'application/octet-stream',
          folderId: COMPANY_FOLDER_ID,
        },
      ],
    };
    const adminUser = { userType: 'admin' as const, userId: 'admin' };

    await service.batchConfirmUpload(dto as never, adminUser as never);

    // 첫 번째 file: fallback (HUSK_ID 그대로), 두 번째: 정상 (COMPANY_FOLDER_ID 그대로)
    expect(prisma.webhardFile.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            folderId: HUSK_ID, // fallback
          }),
          expect.objectContaining({
            folderId: COMPANY_FOLDER_ID, // 정상
          }),
        ]),
      })
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/batchConfirmUpload routing failed/)
    );
  });

  it('BC3: redirected batch file 의 routed folder metadata 를 AutoContact 훅에 전달', async () => {
    const batchHook = jest.fn().mockResolvedValue(undefined);
    (
      service as unknown as {
        batchTriggerAutoContact: typeof batchHook;
      }
    ).batchTriggerAutoContact = batchHook;

    prisma.webhardFolder.findMany
      .mockResolvedValueOnce([
        {
          id: HUSK_ID,
          name: '대성목형(2265-1295)',
          path: '/외부웹하드/대성목형(2265-1295)',
          companyId: null,
          parentId: 'external-root',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: COMPANY_ROOT_ID,
          name: '대성목형',
          path: '/대성목형',
          companyId: COMPANY_ID,
          parentId: null,
        },
      ]);

    prisma.webhardFolder.findUnique.mockResolvedValueOnce({
      id: HUSK_ID,
      name: '대성목형(2265-1295)',
      path: '/외부웹하드/대성목형(2265-1295)',
      folderKind: 'generic',
      companyId: null,
    });
    prisma.companyFolderAlias.findFirst.mockResolvedValueOnce({
      company: { id: COMPANY_ID, companyName: '대성목형' },
    });
    prisma.webhardFolder.findFirst.mockResolvedValueOnce({ id: COMPANY_ROOT_ID });
    prisma.webhardFile.createMany.mockResolvedValueOnce({ count: 1 });

    await service.batchConfirmUpload(
      {
        files: [
          {
            key: 'webhard/company-4/company-root-uuid/file1.dxf',
            name: 'file1.dxf',
            originalName: 'file1.dxf',
            size: 1234,
            mimeType: 'application/octet-stream',
            folderId: HUSK_ID,
          },
        ],
      } as never,
      adminUser as never
    );

    expect(batchHook).toHaveBeenCalledTimes(1);
    const [items, folderMap] = batchHook.mock.calls[0] as [
      Array<{ folderId: string; originalName: string; path: string; companyId: number | null }>,
      Map<string, { id: string; path: string | null; companyId: number | null }>,
    ];
    expect(items[0]).toMatchObject({
      folderId: COMPANY_ROOT_ID,
      originalName: 'file1.dxf',
      companyId: COMPANY_ID,
    });
    expect(folderMap.get(COMPANY_ROOT_ID)).toMatchObject({
      id: COMPANY_ROOT_ID,
      path: '/대성목형',
      companyId: COMPANY_ID,
    });
  });
});

describe('FilesService.batchTriggerAutoContact — 외부웹하드 자동문의 생성 최적화', () => {
  it('서로 다른 파일의 자동문의 생성을 제한 병렬로 시작한다', async () => {
    const { service, prisma, autoContact } = makeService();
    prisma.company.findMany.mockResolvedValueOnce([{ id: 7, companyName: '동기화업체' }]);

    let releaseFirst: () => void = () => undefined;
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    autoContact.detectAndCreate.mockImplementationOnce(() => firstPending);
    autoContact.detectAndCreate.mockResolvedValue(undefined);

    const call = (
      service as unknown as {
        batchTriggerAutoContact: (
          items: Array<{
            folderId: string | null;
            originalName: string;
            path: string;
            companyId: number | null;
          }>,
          folderMap: Map<
            string,
            {
              id: string;
              name: string;
              path: string | null;
              companyId: number | null;
              parentId: string | null;
            }
          >
        ) => Promise<void>;
      }
    ).batchTriggerAutoContact.bind(service);

    const folderMap = new Map([
      [
        'folder-sync',
        {
          id: 'folder-sync',
          name: '동기화업체',
          path: '/동기화업체/칼선의뢰',
          companyId: 7,
          parentId: null,
        },
      ],
    ]);

    const promise = call(
      [
        {
          folderId: 'folder-sync',
          originalName: 'a.dxf',
          path: 'webhard/a.dxf',
          companyId: 7,
        },
        {
          folderId: 'folder-sync',
          originalName: 'b.dxf',
          path: 'webhard/b.dxf',
          companyId: 7,
        },
        {
          folderId: 'folder-sync',
          originalName: 'c.dxf',
          path: 'webhard/c.dxf',
          companyId: 7,
        },
      ],
      folderMap
    );

    for (let i = 0; i < 20 && autoContact.detectAndCreate.mock.calls.length === 0; i++) {
      await Promise.resolve();
    }
    await Promise.resolve();

    expect(autoContact.detectAndCreate).toHaveBeenCalledTimes(3);

    releaseFirst();
    await promise;
  });
});
