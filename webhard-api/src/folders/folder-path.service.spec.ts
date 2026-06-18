import { FolderPathService } from './folder-path.service';

interface FolderPathPrismaMock {
  webhardFolder: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  $executeRaw: jest.Mock;
}

function makePrisma(): FolderPathPrismaMock {
  return {
    webhardFolder: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    $executeRaw: jest.fn().mockResolvedValue(3),
  };
}

describe('AUDIT-16 FolderPathService', () => {
  it('computes folder path using parent materialized path', async () => {
    const prisma = makePrisma();
    prisma.webhardFolder.findUnique.mockResolvedValueOnce({
      path: '/업체/문의',
      name: '문의',
      parentId: 'root',
    });
    const service = new FolderPathService(prisma as never);

    await expect(service.computeFolderPath('parent', '문의-001')).resolves.toBe(
      '/업체/문의/문의-001'
    );
  });

  it('updates descendant paths with a bound prefix replacement and slash boundary', async () => {
    const prisma = makePrisma();
    prisma.webhardFolder.findUnique.mockResolvedValueOnce({ path: '/상위/기존' });
    const service = new FolderPathService(prisma as never);

    await service.updateDescendantPaths('folder-a', '/대상/기존', prisma as never);

    expect(prisma.webhardFolder.update).toHaveBeenCalledWith({
      where: { id: 'folder-a' },
      data: { path: '/대상/기존' },
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const raw = prisma.$executeRaw.mock.calls[0]?.[0] as
      | { strings?: readonly string[]; values?: readonly unknown[] }
      | undefined;
    expect(raw?.values).toEqual(expect.arrayContaining(['/대상/기존', '/상위/기존']));
    expect(raw?.strings?.join('')).toContain('left("path"');
    expect(raw?.strings?.join('')).toContain('::integer');
    expect(raw?.strings?.join('')).toContain("= '/'");
  });
});
