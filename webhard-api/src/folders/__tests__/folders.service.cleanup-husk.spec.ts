import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { FoldersService } from '../folders.service';

function makePrisma() {
  return {
    webhardFolder: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    webhardFile: {
      count: jest.fn(),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
    executeWithRetry: jest.fn(<T>(fn: () => Promise<T>) => fn()),
  };
}

describe('FoldersService — Phase C cleanupEmptyExternalHusk', () => {
  let service: FoldersService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    prisma.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: unknown) => Promise<unknown>)(prisma);
      }
      return undefined;
    });
    service = new FoldersService(
      prisma as never,
      undefined as never,
      undefined as never,
      undefined as never
    );
  });

  describe('getEmptyExternalHusks', () => {
    it('H1: 빈 husk 만 후보로 반환 — companyId IS NULL + 자식·파일 0', async () => {
      prisma.webhardFolder.findMany.mockResolvedValueOnce([
        { id: 'h1', name: 'A업체(123)', path: '/외부웹하드/A업체(123)', createdAt: new Date() },
        { id: 'h2', name: 'B업체', path: '/외부웹하드/B업체', createdAt: new Date() },
      ]);
      prisma.webhardFolder.findMany.mockResolvedValueOnce([{ id: 'h2-child', parentId: 'h2' }]);
      prisma.webhardFile.groupBy.mockResolvedValueOnce([]);

      const result = await service.getEmptyExternalHusks();

      expect(result).toEqual([expect.objectContaining({ id: 'h1', name: 'A업체(123)' })]);
    });

    it('H1b: 빈 husk 후보 기준은 depth=2 root의 직접 자식/직접 파일 0이고 count 쿼리를 root 수만큼 반복하지 않는다', async () => {
      const createdAt = new Date('2026-05-10T00:00:00.000Z');
      const candidates = Array.from({ length: 500 }, (_, index) => ({
        id: `h-${index}`,
        name: `외부업체-${index}`,
        path: `/외부웹하드/외부업체-${index}`,
        createdAt,
      }));
      prisma.webhardFolder.findMany
        .mockResolvedValueOnce(candidates)
        .mockResolvedValueOnce([{ id: 'child-1', parentId: 'h-1' }]);
      prisma.webhardFile.groupBy.mockResolvedValueOnce([{ folderId: 'h-2', _count: 3 }]);

      const result = await service.getEmptyExternalHusks();

      expect(result).toHaveLength(498);
      expect(result.map((folder) => folder.id)).not.toContain('h-1');
      expect(result.map((folder) => folder.id)).not.toContain('h-2');
      expect(prisma.webhardFolder.count).not.toHaveBeenCalled();
      expect(prisma.webhardFile.count).not.toHaveBeenCalled();
      expect(prisma.webhardFolder.findMany).toHaveBeenCalledTimes(2);
      expect(prisma.webhardFile.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.webhardFolder.findMany).toHaveBeenNthCalledWith(2, {
        where: { parentId: { in: candidates.map((folder) => folder.id) }, deletedAt: null },
        select: { id: true, parentId: true },
      });
      expect(prisma.webhardFile.groupBy).toHaveBeenCalledWith({
        by: ['folderId'],
        where: { folderId: { in: candidates.map((folder) => folder.id) }, deletedAt: null },
        _count: true,
      });
    });
  });

  describe('cleanupEmptyExternalHusk', () => {
    it('H2: depth=2 root husk + 자식 0 → cascade soft-delete', async () => {
      prisma.webhardFolder.findUnique.mockResolvedValueOnce({
        id: 'h1',
        name: 'A업체',
        path: '/외부웹하드/A업체',
        companyId: null,
        deletedAt: null,
      });
      // checkEmptyHusk 의 child / file count
      prisma.webhardFolder.count.mockResolvedValueOnce(0); // child folders
      prisma.webhardFile.count
        .mockResolvedValueOnce(0) // direct files (root)
        .mockResolvedValueOnce(0); // descendants files
      // BFS 자식 없음
      prisma.webhardFolder.findMany.mockResolvedValueOnce([]);
      // updateMany cascade
      prisma.webhardFolder.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.cleanupEmptyExternalHusk('h1');

      expect(result.deletedFolderIds).toEqual(['h1']);
      expect(prisma.webhardFolder.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['h1'] } },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      });
    });

    it('H3: 자식 폴더 ≥1 → UnprocessableEntityException (안전 가드)', async () => {
      prisma.webhardFolder.findUnique.mockResolvedValueOnce({
        id: 'h1',
        name: 'A업체',
        path: '/외부웹하드/A업체',
        companyId: null,
        deletedAt: null,
      });
      prisma.webhardFolder.count.mockResolvedValueOnce(2); // 2 children → not empty
      prisma.webhardFile.count.mockResolvedValueOnce(0);

      await expect(service.cleanupEmptyExternalHusk('h1')).rejects.toThrow(
        UnprocessableEntityException
      );
    });

    it('H4: depth=2 아닌 폴더 → BadRequestException', async () => {
      prisma.webhardFolder.findUnique.mockResolvedValueOnce({
        id: 'h1',
        name: '칼선의뢰',
        path: '/외부웹하드/A업체/칼선의뢰', // depth=3
        companyId: null,
        deletedAt: null,
      });
      prisma.webhardFolder.count.mockResolvedValueOnce(0);
      prisma.webhardFile.count.mockResolvedValueOnce(0);

      await expect(service.cleanupEmptyExternalHusk('h1')).rejects.toThrow(BadRequestException);
    });

    it('H5: companyId IS NOT NULL → BadRequestException (husk 아님)', async () => {
      prisma.webhardFolder.findUnique.mockResolvedValueOnce({
        id: 'h1',
        name: 'A업체',
        path: '/외부웹하드/A업체',
        companyId: 5, // ← 회사 폴더
        deletedAt: null,
      });

      await expect(service.cleanupEmptyExternalHusk('h1')).rejects.toThrow(BadRequestException);
    });

    it('H6: 이미 deletedAt set → BadRequestException', async () => {
      prisma.webhardFolder.findUnique.mockResolvedValueOnce({
        id: 'h1',
        name: 'A업체',
        path: '/외부웹하드/A업체',
        companyId: null,
        deletedAt: new Date(),
      });

      await expect(service.cleanupEmptyExternalHusk('h1')).rejects.toThrow(BadRequestException);
    });

    it('H7: descendants 에 파일 ≥1 → UnprocessableEntityException', async () => {
      prisma.webhardFolder.findUnique.mockResolvedValueOnce({
        id: 'h1',
        name: 'A업체',
        path: '/외부웹하드/A업체',
        companyId: null,
        deletedAt: null,
      });
      prisma.webhardFolder.count.mockResolvedValueOnce(0); // root 직접 자식 0
      prisma.webhardFile.count
        .mockResolvedValueOnce(0) // root 직접 파일 0
        .mockResolvedValueOnce(3); // descendants 파일 3건 → 거절
      prisma.webhardFolder.findMany.mockResolvedValueOnce([]);

      await expect(service.cleanupEmptyExternalHusk('h1')).rejects.toThrow(
        UnprocessableEntityException
      );
    });
  });
});
