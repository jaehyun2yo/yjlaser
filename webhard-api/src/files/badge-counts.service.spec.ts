import { BadgeCountsService } from './badge-counts.service';
import type { SessionUser } from '../auth/auth.service';

interface BadgePrismaMock {
  webhardFile: {
    count: jest.Mock;
    groupBy: jest.Mock;
  };
  webhardFolder: {
    findMany: jest.Mock;
  };
  executeWithRetry: jest.Mock;
}

const adminUser: SessionUser = {
  userId: 'admin',
  userType: 'admin',
  companyId: null,
};

function makePrisma(): BadgePrismaMock {
  const prisma: BadgePrismaMock = {
    webhardFile: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    webhardFolder: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    executeWithRetry: jest.fn().mockImplementation(async (op: () => Promise<unknown>) => op()),
  };
  return prisma;
}

describe('AUDIT-16 BadgeCountsService', () => {
  it('propagates direct child counts to parent folders', async () => {
    const prisma = makePrisma();
    prisma.webhardFile.count.mockResolvedValueOnce(7);
    prisma.webhardFile.groupBy.mockResolvedValueOnce([
      { folderId: 'parent', _count: 2 },
      { folderId: 'child', _count: 5 },
    ]);
    prisma.webhardFolder.findMany.mockResolvedValueOnce([
      { id: 'parent', parentId: null },
      { id: 'child', parentId: 'parent' },
    ]);
    const service = new BadgeCountsService(prisma as never);

    const result = await service.getBadgeCounts(
      { includeFolderCounts: true, companyId: 7 },
      adminUser
    );

    expect(result).toMatchObject({
      companyId: 7,
      totalCount: 7,
      folderCounts: {
        child: 5,
        parent: 7,
      },
    });
    expect(prisma.webhardFolder.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, OR: [{ companyId: 7 }, { companyId: null }] },
      select: { id: true, parentId: true },
    });
  });

  it('keeps badge propagation through legacy null-company bridge folders in company scope', async () => {
    const prisma = makePrisma();
    prisma.webhardFile.count.mockResolvedValueOnce(2);
    prisma.webhardFile.groupBy.mockResolvedValueOnce([{ folderId: 'leaf-folder', _count: 2 }]);
    prisma.webhardFolder.findMany.mockResolvedValueOnce([
      { id: 'company-root', parentId: null },
      { id: 'legacy-admin-child', parentId: 'company-root' },
      { id: 'leaf-folder', parentId: 'legacy-admin-child' },
    ]);
    const service = new BadgeCountsService(prisma as never);

    const result = await service.getBadgeCounts(
      { includeFolderCounts: true, companyId: 7 },
      adminUser
    );

    expect(result.folderCounts).toMatchObject({
      'leaf-folder': 2,
      'legacy-admin-child': 2,
      'company-root': 2,
    });
    expect(prisma.webhardFolder.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, OR: [{ companyId: 7 }, { companyId: null }] },
      select: { id: true, parentId: true },
    });
  });
});
