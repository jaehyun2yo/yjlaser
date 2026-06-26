import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { StorageProvider } from '@prisma/client';
import { TrashService } from '../trash.service';

// ============================================================
// Mock factories
// ============================================================

function makeTrashFile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-uuid-1',
    name: 'test.pdf',
    originalName: 'test.pdf',
    size: BigInt(1024),
    mimeType: 'application/pdf',
    path: 'webhard/test.pdf',
    storageProvider: StorageProvider.R2,
    driveFileId: null,
    folderId: null,
    companyId: null,
    uploadedBy: 'admin',
    isDownloaded: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: new Date('2026-03-27T00:00:00Z'),
    deletedBy: null,
    company: null,
    folder: null,
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    executeWithRetry: jest.fn((fn: () => unknown) => fn()),
    webhardFile: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  };
}

function makeStorageService() {
  return {
    deleteFile: jest.fn().mockResolvedValue(undefined),
    deleteFiles: jest.fn().mockResolvedValue(undefined),
    deleteDriveFile: jest.fn().mockResolvedValue(undefined),
  };
}

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(prismaOverrides);
  const storage = makeStorageService();
  const service = new TrashService(prisma as never, storage as never);
  return { service, prisma, storage };
}

const adminUser = { userType: 'admin' as const, userId: 'admin', companyId: 0 };
const companyUser = { userType: 'company' as const, userId: '5', companyId: 5 };
const permanentDeleteApproval = {
  confirmPermanentDelete: true,
  confirmationText: 'PERMANENT_DELETE' as const,
};

// ============================================================
// getTrashFiles
// ============================================================

describe('TrashService.getTrashFiles', () => {
  it('관리자: 삭제 파일 목록 반환', async () => {
    const files = [makeTrashFile()];
    const { service, prisma } = makeService();
    (prisma.webhardFile.count as jest.Mock).mockResolvedValue(1);
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue(files);

    const result = await service.getTrashFiles({ page: 1, limit: 50 }, adminUser);

    expect(result.total).toBe(1);
    expect(result.files).toHaveLength(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });

  it('hasMore: page * limit < total이면 true', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.count as jest.Mock).mockResolvedValue(200);
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 50 }, () => makeTrashFile())
    );

    const result = await service.getTrashFiles({ page: 1, limit: 50 }, adminUser);

    expect(result.hasMore).toBe(true);
  });

  it('마지막 페이지: hasMore = false', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.count as jest.Mock).mockResolvedValue(10);
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 10 }, () => makeTrashFile())
    );

    const result = await service.getTrashFiles({ page: 1, limit: 50 }, adminUser);

    expect(result.hasMore).toBe(false);
  });

  it('업체 사용자로 조회 시 에러 없이 동작', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.count as jest.Mock).mockResolvedValue(0);
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue([]);

    await expect(service.getTrashFiles({ page: 1, limit: 50 }, companyUser)).resolves.toBeDefined();
  });

  it('반환 파일에 days_until_delete 필드 포함', async () => {
    const recentlyDeleted = makeTrashFile({
      deletedAt: new Date(Date.now() - 1000 * 60 * 60), // 1시간 전
    });
    const { service, prisma } = makeService();
    (prisma.webhardFile.count as jest.Mock).mockResolvedValue(1);
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue([recentlyDeleted]);

    const result = await service.getTrashFiles({ page: 1, limit: 50 }, adminUser);

    expect(result.files[0]).toHaveProperty('days_until_delete');
    expect(result.files[0].days_until_delete).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// getTrashCount
// ============================================================

describe('TrashService.getTrashCount', () => {
  it('관리자: 전체 휴지통 파일 수 반환', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.count as jest.Mock).mockResolvedValue(7);

    const result = await service.getTrashCount(adminUser);

    expect(result.count).toBe(7);
  });

  it('업체 사용자로 조회 시 에러 없이 동작', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.count as jest.Mock).mockResolvedValue(3);

    const result = await service.getTrashCount(companyUser);

    expect(result.count).toBe(3);
  });
});

// ============================================================
// restoreFile
// ============================================================

describe('TrashService.restoreFile', () => {
  it('파일 복원: deletedAt/deletedBy를 null로 업데이트', async () => {
    const file = makeTrashFile();
    const { service, prisma } = makeService();
    (prisma.webhardFile.findUnique as jest.Mock).mockResolvedValue(file);
    (prisma.webhardFile.update as jest.Mock).mockResolvedValue({ ...file, deletedAt: null });

    await service.restoreFile('file-uuid-1', adminUser);

    expect(prisma.webhardFile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: null, deletedBy: null }),
      })
    );
  });

  it('파일이 없으면 NotFoundException', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.restoreFile('nonexistent', adminUser)).rejects.toThrow(NotFoundException);
  });

  it('deletedAt이 null인 파일 → NotFoundException', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.findUnique as jest.Mock).mockResolvedValue(
      makeTrashFile({ deletedAt: null })
    );

    await expect(service.restoreFile('file-uuid-1', adminUser)).rejects.toThrow(NotFoundException);
  });

  it('타 업체 파일에 업체 사용자 접근 → ForbiddenException', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.findUnique as jest.Mock).mockResolvedValue(
      makeTrashFile({ companyId: 999 })
    );

    await expect(service.restoreFile('file-uuid-1', companyUser)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('자신의 업체 파일은 복원 가능', async () => {
    const file = makeTrashFile({ companyId: 5 });
    const { service, prisma } = makeService();
    (prisma.webhardFile.findUnique as jest.Mock).mockResolvedValue(file);
    (prisma.webhardFile.update as jest.Mock).mockResolvedValue({ ...file, deletedAt: null });

    await expect(service.restoreFile('file-uuid-1', companyUser)).resolves.toBeUndefined();
  });
});

// ============================================================
// permanentlyDeleteFile
// ============================================================

describe('TrashService.permanentlyDeleteFile', () => {
  it('명시 승인 없이는 영구 삭제하지 않음', async () => {
    const { service, prisma, storage } = makeService();

    await expect(service.permanentlyDeleteFile('file-uuid-1', adminUser)).rejects.toThrow(
      BadRequestException
    );

    expect(prisma.webhardFile.findUnique).not.toHaveBeenCalled();
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it('파일을 스토리지와 DB에서 모두 삭제', async () => {
    const file = makeTrashFile();
    const { service, prisma, storage } = makeService();
    (prisma.webhardFile.findUnique as jest.Mock).mockResolvedValue(file);
    (prisma.webhardFile.delete as jest.Mock).mockResolvedValue(file);

    await service.permanentlyDeleteFile('file-uuid-1', adminUser, permanentDeleteApproval);

    expect(storage.deleteFile).toHaveBeenCalledWith('webhard/test.pdf');
    expect(prisma.webhardFile.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'file-uuid-1' } })
    );
  });

  it('Google Drive 파일은 승인 플래그와 함께 휴지통 영구삭제 경로로 전달', async () => {
    const file = makeTrashFile({
      storageProvider: StorageProvider.GOOGLE_DRIVE,
      driveFileId: 'drive-file-1',
    });
    const { service, prisma, storage } = makeService();
    (prisma.webhardFile.findUnique as jest.Mock).mockResolvedValue(file);
    (prisma.webhardFile.delete as jest.Mock).mockResolvedValue(file);

    await service.permanentlyDeleteFile('file-uuid-1', adminUser, permanentDeleteApproval);

    expect(storage.deleteDriveFile).toHaveBeenCalledWith({
      storageFileId: 'drive-file-1',
      permanentDeleteApproved: true,
    });
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it('파일이 없으면 NotFoundException', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      service.permanentlyDeleteFile('nonexistent', adminUser, permanentDeleteApproval)
    ).rejects.toThrow(NotFoundException);
  });

  it('deletedAt이 null인 파일 → NotFoundException', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.findUnique as jest.Mock).mockResolvedValue(
      makeTrashFile({ deletedAt: null })
    );

    await expect(
      service.permanentlyDeleteFile('file-uuid-1', adminUser, permanentDeleteApproval)
    ).rejects.toThrow(NotFoundException);
  });

  it('타 업체 파일에 업체 사용자 접근 → ForbiddenException', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.findUnique as jest.Mock).mockResolvedValue(
      makeTrashFile({ companyId: 999 })
    );

    await expect(
      service.permanentlyDeleteFile('file-uuid-1', companyUser, permanentDeleteApproval)
    ).rejects.toThrow(ForbiddenException);
  });
});

// ============================================================
// emptyTrash
// ============================================================

describe('TrashService.emptyTrash', () => {
  it('명시 승인 없이는 휴지통을 비우지 않음', async () => {
    const { service, prisma, storage } = makeService();

    await expect(service.emptyTrash(adminUser)).rejects.toThrow(BadRequestException);

    expect(prisma.webhardFile.findMany).not.toHaveBeenCalled();
    expect(storage.deleteFiles).not.toHaveBeenCalled();
  });

  it('파일이 없으면 deleted: 0 반환, deleteMany 미호출', async () => {
    const { service, prisma } = makeService();
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.emptyTrash(adminUser, permanentDeleteApproval);

    expect(result.deleted).toBe(0);
    expect(prisma.webhardFile.deleteMany).not.toHaveBeenCalled();
  });

  it('모든 파일 삭제 후 deleted 수 반환', async () => {
    const files = [
      makeTrashFile({ id: 'f-1', path: 'webhard/a.pdf' }),
      makeTrashFile({ id: 'f-2', path: 'webhard/b.pdf' }),
    ];
    const { service, prisma, storage } = makeService();
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue(files);
    (prisma.webhardFile.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });

    const result = await service.emptyTrash(adminUser, permanentDeleteApproval);

    expect(storage.deleteFiles).toHaveBeenCalledWith(['webhard/a.pdf', 'webhard/b.pdf']);
    expect(result.deleted).toBe(2);
  });

  it('업체 사용자: 자신의 파일만 비움', async () => {
    const files = [makeTrashFile({ id: 'f-1', path: 'webhard/company.pdf', companyId: 5 })];
    const { service, prisma, storage } = makeService();
    (prisma.webhardFile.findMany as jest.Mock).mockResolvedValue(files);
    (prisma.webhardFile.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    const result = await service.emptyTrash(companyUser, permanentDeleteApproval);

    expect(storage.deleteFiles).toHaveBeenCalled();
    expect(result.deleted).toBe(1);
  });
});

describe('TrashService.cleanupExpiredFiles', () => {
  it('자동 영구 삭제는 실행하지 않음', async () => {
    const { service, prisma, storage } = makeService();

    const result = await service.cleanupExpiredFiles();

    expect(result).toEqual({ deleted: 0 });
    expect(prisma.webhardFile.findMany).not.toHaveBeenCalled();
    expect(storage.deleteFiles).not.toHaveBeenCalled();
  });
});
