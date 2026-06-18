import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LaserOnlyMappingService } from '../laser-only-mapping.service';

function makePrisma() {
  return {
    laserOnlyMapping: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    company: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    contact: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    contactStatusHistory: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    executeWithRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
  };
}

describe('LaserOnlyMappingService', () => {
  let service: LaserOnlyMappingService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new LaserOnlyMappingService(prisma as never);
  });

  describe('addMapping', () => {
    it('폴더명만으로 매핑 생성 — companyId=null', async () => {
      prisma.laserOnlyMapping.findUnique.mockResolvedValueOnce(null);
      prisma.laserOnlyMapping.create.mockResolvedValueOnce({
        id: 1,
        folderName: '레이저업체A',
        companyId: null,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        company: null,
      });

      const result = await service.addMapping('레이저업체A');

      expect(result.folder_name).toBe('레이저업체A');
      expect(result.company_id).toBeNull();
      expect(result.company_name).toBeNull();
      expect(result.is_active).toBe(true);
      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it('폴더명 + companyId로 매핑 생성 — Company.laserOnly=true 동기화', async () => {
      prisma.laserOnlyMapping.findUnique.mockResolvedValueOnce(null);
      prisma.laserOnlyMapping.create.mockResolvedValueOnce({
        id: 2,
        folderName: '레이저업체B',
        companyId: 10,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        company: { companyName: '레이저업체B' },
      });
      prisma.company.update.mockResolvedValueOnce({});

      const result = await service.addMapping('레이저업체B', 10);

      expect(result.folder_name).toBe('레이저업체B');
      expect(result.company_id).toBe(10);
      expect(result.company_name).toBe('레이저업체B');
      expect(prisma.company.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10 },
          data: expect.objectContaining({ laserOnly: true }),
        })
      );
    });

    it('중복 폴더명 → BadRequestException', async () => {
      prisma.laserOnlyMapping.findUnique.mockResolvedValueOnce({
        id: 1,
        folderName: '중복폴더',
      });

      await expect(service.addMapping('중복폴더')).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeMapping', () => {
    it('매핑 삭제 — Company.laserOnly=false 동기화', async () => {
      prisma.laserOnlyMapping.findUnique.mockResolvedValueOnce({
        id: 1,
        folderName: '삭제대상',
        companyId: 5,
      });
      prisma.laserOnlyMapping.delete.mockResolvedValueOnce({});
      // 같은 Company를 참조하는 다른 매핑 없음
      prisma.laserOnlyMapping.count.mockResolvedValueOnce(0);
      prisma.company.update.mockResolvedValueOnce({});

      await service.removeMapping(1);

      expect(prisma.laserOnlyMapping.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(prisma.company.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 5 },
          data: expect.objectContaining({ laserOnly: false }),
        })
      );
    });

    it('매핑 삭제 — 다른 매핑이 같은 Company 참조 시 laserOnly 유지', async () => {
      prisma.laserOnlyMapping.findUnique.mockResolvedValueOnce({
        id: 1,
        folderName: '삭제대상',
        companyId: 5,
      });
      prisma.laserOnlyMapping.delete.mockResolvedValueOnce({});
      // 같은 Company를 참조하는 다른 매핑 있음
      prisma.laserOnlyMapping.count.mockResolvedValueOnce(1);

      await service.removeMapping(1);

      expect(prisma.laserOnlyMapping.delete).toHaveBeenCalled();
      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it('존재하지 않는 매핑 → NotFoundException', async () => {
      prisma.laserOnlyMapping.findUnique.mockResolvedValueOnce(null);

      await expect(service.removeMapping(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('linkCompany', () => {
    it('미연결 매핑에 업체 연결 — Company.laserOnly=true', async () => {
      prisma.laserOnlyMapping.findUnique.mockResolvedValueOnce({
        id: 1,
        folderName: '미연결폴더',
        companyId: null,
      });
      prisma.company.findUnique.mockResolvedValueOnce({
        id: 10,
        companyName: '연결업체',
      });
      prisma.laserOnlyMapping.update.mockResolvedValueOnce({
        id: 1,
        folderName: '미연결폴더',
        companyId: 10,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        company: { companyName: '연결업체' },
      });
      prisma.company.update.mockResolvedValueOnce({});

      const result = await service.linkCompany(1, 10);

      expect(result.company_id).toBe(10);
      expect(result.company_name).toBe('연결업체');
      expect(prisma.company.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10 },
          data: expect.objectContaining({ laserOnly: true }),
        })
      );
    });

    it('존재하지 않는 매핑 → NotFoundException', async () => {
      prisma.laserOnlyMapping.findUnique.mockResolvedValueOnce(null);

      await expect(service.linkCompany(999, 10)).rejects.toThrow(NotFoundException);
    });

    it('존재하지 않는 업체 → NotFoundException', async () => {
      prisma.laserOnlyMapping.findUnique.mockResolvedValueOnce({
        id: 1,
        folderName: '폴더',
        companyId: null,
      });
      prisma.company.findUnique.mockResolvedValueOnce(null);

      await expect(service.linkCompany(1, 999)).rejects.toThrow(NotFoundException);
    });

    it('업체 연결 시 기존 Contact의 companyName을 업데이트한다', async () => {
      prisma.laserOnlyMapping.findUnique.mockResolvedValueOnce({
        id: 1,
        folderName: 'ABC',
        companyId: null,
      });
      prisma.company.findUnique.mockResolvedValueOnce({
        id: 10,
        companyName: 'ABC포장',
      });
      prisma.laserOnlyMapping.update.mockResolvedValueOnce({
        id: 1,
        folderName: 'ABC',
        companyId: 10,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        company: { companyName: 'ABC포장' },
      });
      prisma.company.update.mockResolvedValueOnce({});
      prisma.contact.findMany.mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]);
      prisma.contact.updateMany.mockResolvedValueOnce({ count: 3 });
      prisma.contactStatusHistory.createMany.mockResolvedValueOnce({ count: 3 });

      const result = await service.linkCompany(1, 10);

      expect(result.updated_contact_count).toBe(3);
      expect(prisma.contact.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['c1', 'c2', 'c3'] } },
        data: expect.objectContaining({ companyName: 'ABC포장' }),
      });
    });

    it('folderName과 companyName이 동일하면 Contact 업데이트를 스킵한다', async () => {
      prisma.laserOnlyMapping.findUnique.mockResolvedValueOnce({
        id: 1,
        folderName: '동일업체',
        companyId: null,
      });
      prisma.company.findUnique.mockResolvedValueOnce({
        id: 10,
        companyName: '동일업체',
      });
      prisma.laserOnlyMapping.update.mockResolvedValueOnce({
        id: 1,
        folderName: '동일업체',
        companyId: 10,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        company: { companyName: '동일업체' },
      });
      prisma.company.update.mockResolvedValueOnce({});

      await service.linkCompany(1, 10);

      expect(prisma.contact.findMany).not.toHaveBeenCalled();
    });

    it('deleting 상태 Contact는 제외한다', async () => {
      prisma.laserOnlyMapping.findUnique.mockResolvedValueOnce({
        id: 1,
        folderName: 'ABC',
        companyId: null,
      });
      prisma.company.findUnique.mockResolvedValueOnce({
        id: 10,
        companyName: 'ABC포장',
      });
      prisma.laserOnlyMapping.update.mockResolvedValueOnce({
        id: 1,
        folderName: 'ABC',
        companyId: 10,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        company: { companyName: 'ABC포장' },
      });
      prisma.company.update.mockResolvedValueOnce({});

      await service.linkCompany(1, 10);

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: 'deleting' },
          }),
        })
      );
    });

    it('기존 Contact이 없으면 updatedContactCount=0', async () => {
      prisma.laserOnlyMapping.findUnique.mockResolvedValueOnce({
        id: 1,
        folderName: 'ABC',
        companyId: null,
      });
      prisma.company.findUnique.mockResolvedValueOnce({
        id: 10,
        companyName: 'ABC포장',
      });
      prisma.laserOnlyMapping.update.mockResolvedValueOnce({
        id: 1,
        folderName: 'ABC',
        companyId: 10,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        company: { companyName: 'ABC포장' },
      });
      prisma.company.update.mockResolvedValueOnce({});
      prisma.contact.findMany.mockResolvedValueOnce([]);

      const result = await service.linkCompany(1, 10);

      expect(result.updated_contact_count).toBe(0);
      expect(prisma.contact.updateMany).not.toHaveBeenCalled();
    });

    it('ContactStatusHistory에 변경 이력을 기록한다', async () => {
      prisma.laserOnlyMapping.findUnique.mockResolvedValueOnce({
        id: 1,
        folderName: 'ABC',
        companyId: null,
      });
      prisma.company.findUnique.mockResolvedValueOnce({
        id: 10,
        companyName: 'ABC포장',
      });
      prisma.laserOnlyMapping.update.mockResolvedValueOnce({
        id: 1,
        folderName: 'ABC',
        companyId: 10,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        company: { companyName: 'ABC포장' },
      });
      prisma.company.update.mockResolvedValueOnce({});
      prisma.contact.findMany.mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }]);
      prisma.contact.updateMany.mockResolvedValueOnce({ count: 2 });
      prisma.contactStatusHistory.createMany.mockResolvedValueOnce({ count: 2 });

      await service.linkCompany(1, 10);

      expect(prisma.contactStatusHistory.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            changeType: 'company_linked',
            actorType: 'system',
            source: 'admin',
            companyName: 'ABC포장',
          }),
        ]),
      });
    });
  });

  describe('isLaserOnlyFolder', () => {
    it('존재하는 폴더명 → true', async () => {
      prisma.laserOnlyMapping.count.mockResolvedValueOnce(1);

      const result = await service.isLaserOnlyFolder('레이저업체');
      expect(result).toBe(true);
    });

    it('존재하지 않는 폴더명 → false', async () => {
      prisma.laserOnlyMapping.count.mockResolvedValueOnce(0);

      const result = await service.isLaserOnlyFolder('일반업체');
      expect(result).toBe(false);
    });
  });
});
