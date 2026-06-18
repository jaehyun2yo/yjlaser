import { ForbiddenException } from '@nestjs/common';
import { FilesService } from './files.service';
import { SessionUser } from '../auth/auth.service';
import { WorkerContactAccessService } from '../worker-access/worker-contact-access.service';

const FILE_ID = '22222222-2222-2222-2222-222222222222';
const FOLDER_ID = '33333333-3333-3333-3333-333333333333';

function makeFile(overrides: Record<string, unknown> = {}) {
  return {
    id: FILE_ID,
    name: 'drawing.dxf',
    originalName: 'drawing.dxf',
    size: BigInt(1024),
    mimeType: 'application/dxf',
    path: 'webhard/company/drawing.dxf',
    folderId: FOLDER_ID,
    companyId: 10,
    uploadedBy: 'admin',
    inquiryNumber: null,
    isDownloaded: false,
    createdAt: new Date('2026-05-25T00:00:00.000Z'),
    updatedAt: new Date('2026-05-25T00:00:00.000Z'),
    deletedAt: null,
    deletedBy: null,
    company: null,
    ...overrides,
  };
}

function makePrisma() {
  return {
    executeWithRetry: jest.fn((fn: () => unknown) => fn()),
    $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    webhardFile: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([makeFile()]),
      findUnique: jest.fn().mockResolvedValue(makeFile()),
    },
  };
}

function makeService(workerAccessOverrides: Partial<WorkerContactAccessService> = {}) {
  const prisma = makePrisma();
  const storage = {
    getDownloadPresignedUrl: jest.fn().mockResolvedValue({
      url: 'https://r2.example.com/download',
      key: 'webhard/company/drawing.dxf',
      expiresAt: new Date('2026-05-25T01:00:00.000Z'),
    }),
  };
  const workerAccess = {
    assertCanAccessFolder: jest.fn().mockResolvedValue(undefined),
    assertCanAccessFile: jest.fn().mockResolvedValue(undefined),
    ...workerAccessOverrides,
  } as unknown as WorkerContactAccessService;
  const FilesServiceCtor = FilesService as unknown as new (...args: unknown[]) => FilesService;
  const service = new FilesServiceCtor(
    prisma,
    storage,
    {},
    {},
    {},
    {},
    undefined,
    undefined,
    workerAccess
  );

  return { service, prisma, storage, workerAccess };
}

const workerUser: SessionUser = {
  userType: 'worker',
  userId: 'worker-1',
  companyId: null,
  workerName: '작업자',
};

describe('FilesService worker access boundary', () => {
  it('worker 파일 목록은 folderId 없이 root 목록을 조회할 수 없다', async () => {
    const { service, prisma, workerAccess } = makeService();

    await expect(service.getFiles({}, workerUser)).rejects.toThrow(ForbiddenException);

    expect(workerAccess.assertCanAccessFolder).not.toHaveBeenCalled();
    expect(prisma.webhardFile.count).not.toHaveBeenCalled();
    expect(prisma.webhardFile.findMany).not.toHaveBeenCalled();
  });

  it('worker 파일 목록은 folder ACL을 통과한 뒤 조회한다', async () => {
    const { service, workerAccess } = makeService();

    await service.getFiles({ folderId: FOLDER_ID }, workerUser);

    expect(workerAccess.assertCanAccessFolder).toHaveBeenCalledWith(workerUser, FOLDER_ID);
  });

  it('worker 다운로드 URL은 파일 ACL을 통과한 뒤 presigned URL을 발급한다', async () => {
    const { service, storage, workerAccess } = makeService();

    await service.getDownloadUrl(FILE_ID, workerUser);

    expect(workerAccess.assertCanAccessFile).toHaveBeenCalledWith(workerUser, FILE_ID);
    expect(storage.getDownloadPresignedUrl).toHaveBeenCalled();
  });

  it('worker 파일 ACL 실패 시 presigned URL을 발급하지 않는다', async () => {
    const { service, storage, workerAccess } = makeService({
      assertCanAccessFile: jest
        .fn()
        .mockRejectedValue(new ForbiddenException('Worker file access denied')),
    });

    await expect(service.getDownloadUrl(FILE_ID, workerUser)).rejects.toThrow(ForbiddenException);

    expect(workerAccess.assertCanAccessFile).toHaveBeenCalledWith(workerUser, FILE_ID);
    expect(storage.getDownloadPresignedUrl).not.toHaveBeenCalled();
  });
});
