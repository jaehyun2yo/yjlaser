import { ShareLinksService } from '../share-links.service';
import { SessionUser } from '../../auth/auth.service';

// ============================================================
// Mock factories
// ============================================================

function makeShareLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'link-uuid-1',
    token: 'abc123',
    filePath: 'webhard/admin/test.dxf',
    fileName: 'test.dxf',
    companyId: null,
    createdBy: 1,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24시간 후
    maxDownloads: null,
    downloadCount: 0,
    isActive: true,
    createdAt: new Date('2026-03-29T00:00:00Z'),
    updatedAt: new Date('2026-03-29T00:00:00Z'),
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    shareLink: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(makeShareLink()),
    },
    $transaction: jest.fn(),
    ...overrides,
  };
}

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(prismaOverrides);
  const service = new ShareLinksService(prisma as never);
  return { service, prisma };
}

// ============================================================
// validateAndIncrement
// ============================================================

describe('ShareLinksService.validateAndIncrement', () => {
  it('유효한 링크 → is_valid: true & 파일 정보 반환', async () => {
    const link = makeShareLink();
    const { service, prisma } = makeService();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        shareLink: {
          findUnique: jest.fn().mockResolvedValue(link),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return fn(tx);
    });

    const result = await service.validateAndIncrement('abc123');

    expect(result.is_valid).toBe(true);
    expect(result.file_path).toBe('webhard/admin/test.dxf');
    expect(result.file_name).toBe('test.dxf');
  });

  it('존재하지 않는 토큰 → is_valid: false', async () => {
    const { service, prisma } = makeService();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        shareLink: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      return fn(tx);
    });

    const result = await service.validateAndIncrement('invalid-token');

    expect(result.is_valid).toBe(false);
    expect(result.error_message).toBe('존재하지 않는 공유 링크입니다.');
  });

  it('비활성화된 링크 → is_valid: false', async () => {
    const link = makeShareLink({ isActive: false });
    const { service, prisma } = makeService();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        shareLink: {
          findUnique: jest.fn().mockResolvedValue(link),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return fn(tx);
    });

    const result = await service.validateAndIncrement('abc123');

    expect(result.is_valid).toBe(false);
    expect(result.error_message).toBe('비활성화된 공유 링크입니다.');
  });

  it('만료된 링크 → is_valid: false', async () => {
    const link = makeShareLink({ expiresAt: new Date('2020-01-01') }); // 과거
    const { service, prisma } = makeService();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        shareLink: {
          findUnique: jest.fn().mockResolvedValue(link),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return fn(tx);
    });

    const result = await service.validateAndIncrement('abc123');

    expect(result.is_valid).toBe(false);
    expect(result.error_message).toBe('만료된 공유 링크입니다.');
  });

  it('maxDownloads 초과 → is_valid: false', async () => {
    const link = makeShareLink({ maxDownloads: 3, downloadCount: 3 });
    const { service, prisma } = makeService();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        shareLink: {
          findUnique: jest.fn().mockResolvedValue(link),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return fn(tx);
    });

    const result = await service.validateAndIncrement('abc123');

    expect(result.is_valid).toBe(false);
    expect(result.error_message).toBe('최대 다운로드 횟수를 초과했습니다.');
  });

  it('유효 시 downloadCount +1 업데이트', async () => {
    const link = makeShareLink({ downloadCount: 2 });
    const updateMock = jest.fn().mockResolvedValue({ count: 1 });
    const { service, prisma } = makeService();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        shareLink: {
          findUnique: jest.fn().mockResolvedValue(link),
          updateMany: updateMock,
        },
      };
      return fn(tx);
    });

    await service.validateAndIncrement('abc123');

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: link.id },
        data: expect.objectContaining({ downloadCount: { increment: 1 } }),
      })
    );
  });

  it('maxDownloads가 있으면 조건부 update로 동시 초과를 차단한다', async () => {
    const link = makeShareLink({ maxDownloads: 3, downloadCount: 2 });
    const updateMock = jest.fn().mockResolvedValue({ count: 0 });
    const { service, prisma } = makeService();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        shareLink: {
          findUnique: jest.fn().mockResolvedValue(link),
          updateMany: updateMock,
        },
      };
      return fn(tx);
    });

    const result = await service.validateAndIncrement('abc123');

    expect(result.is_valid).toBe(false);
    expect(result.error_message).toBe('최대 다운로드 횟수를 초과했습니다.');
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: link.id, downloadCount: { lt: 3 } },
      })
    );
  });
});

// ============================================================
// findAll
// ============================================================

describe('ShareLinksService.findAll', () => {
  it('링크 목록을 snake_case로 반환', async () => {
    const link = makeShareLink();
    const { service, prisma } = makeService();
    (prisma.shareLink.findMany as jest.Mock).mockResolvedValue([link]);

    const result = await service.findAll();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      token: 'abc123',
      file_path: 'webhard/admin/test.dxf',
      file_name: 'test.dxf',
      is_active: true,
    });
  });

  it('companyId로 필터링', async () => {
    const { service, prisma } = makeService();
    (prisma.shareLink.findMany as jest.Mock).mockResolvedValue([]);

    await service.findAll(5);

    expect(prisma.shareLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 5 } })
    );
  });
});

// ============================================================
// create
// ============================================================

describe('ShareLinksService.create', () => {
  it('링크 생성 후 id/token 반환', async () => {
    const link = makeShareLink({ id: 'new-link-id', token: 'tok-xyz' });
    const { service, prisma } = makeService();
    (prisma.shareLink.create as jest.Mock).mockResolvedValue(link);

    const result = await service.create({
      token: 'tok-xyz',
      filePath: 'webhard/admin/test.dxf',
      fileName: 'test.dxf',
      createdBy: 1,
      expiresAt: '2026-12-31T00:00:00Z',
    });

    expect(result.id).toBe('new-link-id');
    expect(result.token).toBe('tok-xyz');
  });

  it('company 사용자가 다른 업체 webhardFileId로 공유 링크를 만들 수 없다', async () => {
    const createMock = jest.fn();
    const { service, prisma } = makeService({
      webhardFile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'victim-file-id',
          name: 'victim.dxf',
          path: 'webhard/company-2/victim.dxf',
          companyId: 2,
        }),
      },
      shareLink: {
        create: createMock,
      },
    });
    const companyUser: SessionUser = {
      userType: 'company',
      userId: 1,
      companyId: 1,
    };

    await expect(
      service.create(
        {
          token: 'tok-forged',
          webhardFileId: 'victim-file-id',
          filePath: 'webhard/company-2/victim.dxf',
          fileName: 'victim.dxf',
          companyId: 1,
          createdBy: 1,
          expiresAt: '2026-12-31T00:00:00Z',
        },
        companyUser
      )
    ).rejects.toThrow('해당 파일에 대한 공유 권한이 없습니다.');
    expect(createMock).not.toHaveBeenCalled();
    expect(prisma.shareLink.create).not.toHaveBeenCalled();
  });

  it('company 사용자의 정상 공유 링크는 파일 metadata에서 path/name/companyId를 확정한다', async () => {
    const link = makeShareLink({ id: 'owned-link-id', token: 'tok-owned' });
    const createMock = jest.fn().mockResolvedValue(link);
    const { service } = makeService({
      webhardFile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'owned-file-id',
          name: 'resolved-name.dxf',
          path: 'webhard/company-1/resolved-name.dxf',
          companyId: 1,
        }),
      },
      shareLink: {
        create: createMock,
      },
    });
    const companyUser: SessionUser = {
      userType: 'company',
      userId: 1,
      companyId: 1,
    };

    await service.create(
      {
        token: 'tok-owned',
        webhardFileId: 'owned-file-id',
        filePath: 'spoofed/path.dxf',
        fileName: 'spoofed-name.dxf',
        companyId: 999,
        createdBy: 1,
        expiresAt: '2026-12-31T00:00:00Z',
      },
      companyUser
    );

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          filePath: 'webhard/company-1/resolved-name.dxf',
          fileName: 'resolved-name.dxf',
          companyId: 1,
          webhardFileId: 'owned-file-id',
        }),
      })
    );
  });
});
