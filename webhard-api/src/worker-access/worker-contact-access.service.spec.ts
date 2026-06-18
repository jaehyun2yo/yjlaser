import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkerContactAccessService } from './worker-contact-access.service';
import { SessionUser } from '../auth/auth.service';

const CONTACT_ID = '11111111-1111-1111-1111-111111111111';
const FILE_ID = '22222222-2222-2222-2222-222222222222';
const FOLDER_ID = '33333333-3333-3333-3333-333333333333';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    contact: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    webhardFolder: {
      findUnique: jest.fn(),
    },
    webhardFile: {
      findUnique: jest.fn(),
    },
    drawingRevision: {
      findFirst: jest.fn(),
    },
    ...overrides,
  };
}

function makeService(prisma = makePrisma()) {
  return {
    prisma,
    service: new WorkerContactAccessService(prisma as never),
  };
}

const workerUser: SessionUser = {
  userType: 'worker',
  userId: 'worker-1',
  companyId: null,
  workerName: '작업자',
};

const integrationUser: SessionUser = {
  userType: 'integration',
  userId: 'api:sync',
  companyId: null,
  programType: 'sync',
  permissions: ['contacts:read'],
};

function workerVisibleContact(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTACT_ID,
    source: 'webhard',
    inquiryType: 'laser_cutting',
    processStage: 'laser',
    status: 'in_progress',
    deletedAt: null,
    ...overrides,
  };
}

describe('WorkerContactAccessService.assertCanAccessContact', () => {
  it('worker dashboard에 노출되는 현장 문의는 허용한다', async () => {
    const { service, prisma } = makeService();
    prisma.contact.findUnique.mockResolvedValueOnce(workerVisibleContact());

    await expect(service.assertCanAccessContact(workerUser, CONTACT_ID)).resolves.toBeUndefined();
  });

  it('삭제/완료 등 worker dashboard 범위 밖 문의는 거부한다', async () => {
    const { service, prisma } = makeService();
    prisma.contact.findUnique.mockResolvedValueOnce(
      workerVisibleContact({
        processStage: null,
        status: 'completed',
      })
    );

    await expect(service.assertCanAccessContact(workerUser, CONTACT_ID)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('API key integration principal은 worker contact ACL을 통과할 수 없다', async () => {
    const { service, prisma } = makeService();

    await expect(service.assertCanAccessContact(integrationUser, CONTACT_ID)).rejects.toThrow(
      ForbiddenException
    );
    expect(prisma.contact.findUnique).not.toHaveBeenCalled();
  });
});

describe('WorkerContactAccessService.assertCanAccessFile', () => {
  it('DrawingRevision webhardFileIds로 worker-visible contact에 연결된 파일은 허용한다', async () => {
    const { service, prisma } = makeService();
    prisma.webhardFile.findUnique.mockResolvedValueOnce({
      id: FILE_ID,
      folderId: null,
      deletedAt: null,
    });
    prisma.webhardFolder.findUnique.mockResolvedValueOnce(null);
    prisma.drawingRevision.findFirst.mockResolvedValueOnce({ contactId: CONTACT_ID });
    prisma.contact.findUnique.mockResolvedValueOnce(workerVisibleContact());

    await expect(service.assertCanAccessFile(workerUser, FILE_ID)).resolves.toBeUndefined();
  });

  it('문의와 연결되지 않은 일반 웹하드 파일은 worker 다운로드를 거부한다', async () => {
    const { service, prisma } = makeService();
    prisma.webhardFile.findUnique.mockResolvedValueOnce({
      id: FILE_ID,
      folderId: FOLDER_ID,
      deletedAt: null,
    });
    prisma.webhardFolder.findUnique.mockResolvedValueOnce({
      id: FOLDER_ID,
      contactId: null,
      parentId: null,
      deletedAt: null,
    });
    prisma.drawingRevision.findFirst.mockResolvedValueOnce(null);

    await expect(service.assertCanAccessFile(workerUser, FILE_ID)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('문의 폴더의 하위 폴더 파일도 ancestor contact ACL을 재사용해 허용한다', async () => {
    const { service, prisma } = makeService();
    prisma.webhardFile.findUnique.mockResolvedValueOnce({
      id: FILE_ID,
      folderId: 'child-folder',
      deletedAt: null,
    });
    prisma.webhardFolder.findUnique
      .mockResolvedValueOnce({
        id: 'child-folder',
        contactId: null,
        parentId: FOLDER_ID,
        deletedAt: null,
      })
      .mockResolvedValueOnce({
        id: FOLDER_ID,
        contactId: CONTACT_ID,
        parentId: null,
        deletedAt: null,
      });
    prisma.contact.findUnique.mockResolvedValueOnce(workerVisibleContact());

    await expect(service.assertCanAccessFile(workerUser, FILE_ID)).resolves.toBeUndefined();
    expect(prisma.drawingRevision.findFirst).not.toHaveBeenCalled();
  });

  it('삭제된 파일은 접근 여부를 계산하기 전에 NotFound로 중단한다', async () => {
    const { service, prisma } = makeService();
    prisma.webhardFile.findUnique.mockResolvedValueOnce({
      id: FILE_ID,
      folderId: FOLDER_ID,
      deletedAt: new Date('2026-05-25T00:00:00.000Z'),
    });

    await expect(service.assertCanAccessFile(workerUser, FILE_ID)).rejects.toThrow(
      NotFoundException
    );
    expect(prisma.webhardFolder.findUnique).not.toHaveBeenCalled();
  });
});

describe('WorkerContactAccessService.assertCanAccessFolder', () => {
  it('contactId가 있는 문의 폴더는 연결 문의 ACL을 재사용한다', async () => {
    const { service, prisma } = makeService();
    prisma.webhardFolder.findUnique.mockResolvedValueOnce({
      id: FOLDER_ID,
      contactId: CONTACT_ID,
      parentId: null,
      deletedAt: null,
    });
    prisma.contact.findUnique.mockResolvedValueOnce(workerVisibleContact());

    await expect(service.assertCanAccessFolder(workerUser, FOLDER_ID)).resolves.toBeUndefined();
  });

  it('문의와 연결되지 않은 폴더 목록 조회는 worker에게 허용하지 않는다', async () => {
    const { service, prisma } = makeService();
    prisma.webhardFolder.findUnique.mockResolvedValueOnce({
      id: FOLDER_ID,
      contactId: null,
      parentId: null,
      deletedAt: null,
    });

    await expect(service.assertCanAccessFolder(workerUser, FOLDER_ID)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('문의 폴더의 하위 폴더 목록 조회도 ancestor contact ACL을 재사용한다', async () => {
    const { service, prisma } = makeService();
    prisma.webhardFolder.findUnique
      .mockResolvedValueOnce({
        id: 'child-folder',
        contactId: null,
        parentId: FOLDER_ID,
        deletedAt: null,
      })
      .mockResolvedValueOnce({
        id: FOLDER_ID,
        contactId: CONTACT_ID,
        parentId: null,
        deletedAt: null,
      });
    prisma.contact.findUnique.mockResolvedValueOnce(workerVisibleContact());

    await expect(
      service.assertCanAccessFolder(workerUser, 'child-folder')
    ).resolves.toBeUndefined();
  });
});
