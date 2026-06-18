import { NotFoundException } from '@nestjs/common';
import { FolderAliasService } from './folder-alias.service';

type PrismaMock = ReturnType<typeof makePrisma>;

function makePrisma() {
  const prisma = {
    company: {
      findUnique: jest.fn(),
    },
    companyFolderAlias: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    // task 26: runCascadeBackfill 가 tx.webhardFolder.findFirst 로 외부 root 탐색.
    // default null 반환 → migrate 호출 skip (외부 root 미존재 케이스).
    // task 29 Phase 1: 3-step fallback 추가 (path 정확 매칭 → name 일치 → 정규화 매칭)
    // findMany 는 정규화 매칭 후보 조회용 (3차 fallback). default 빈 배열.
    webhardFolder: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
  };

  // $transaction supports both array (Promise.all) and callback (tx) forms.
  prisma.$transaction.mockImplementation((arg: unknown) => {
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    if (typeof arg === 'function') {
      return (arg as (tx: PrismaMock) => Promise<unknown>)(prisma);
    }
    return undefined;
  });

  return prisma;
}

function makeContactFolderSync() {
  return {
    relocateAfterAliasApproved: jest.fn().mockResolvedValue({ relocated: 0, skipped: 0 }),
    // task 26: alias 1건당 1 tx 의 두 번째 단계
    migrateExternalFolderTreeToCompany: jest.fn().mockResolvedValue({
      movedFolders: 0,
      movedFiles: 0,
      deletedExternalFolders: 0,
      conflicts: [],
    }),
  };
}

const EMPTY_MIGRATION = {
  movedFolders: 0,
  movedFiles: 0,
  deletedExternalFolders: 0,
  conflicts: [],
  externalRootFound: false,
};

describe('FolderAliasService', () => {
  let service: FolderAliasService;
  let prisma: ReturnType<typeof makePrisma>;
  let contactFolderSync: ReturnType<typeof makeContactFolderSync>;

  beforeEach(() => {
    prisma = makePrisma();
    contactFolderSync = makeContactFolderSync();
    service = new FolderAliasService(prisma as never, contactFolderSync as never);
  });

  describe('approve', () => {
    it('B1: status=approved + approvedBy/approvedAt 기록', async () => {
      prisma.companyFolderAlias.findUnique.mockResolvedValueOnce({
        id: 1,
        folderName: 'ABC업체',
        companyId: 10,
        status: 'pending',
      });
      prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.companyFolderAlias.update.mockResolvedValueOnce({
        id: 1,
        folderName: 'ABC업체',
        companyId: 10,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: new Date('2026-04-27'),
      });

      const result = await service.approve(1, { cascadeBackfill: false }, 'admin');

      expect(prisma.companyFolderAlias.update).toHaveBeenCalledTimes(1);
      expect(prisma.companyFolderAlias.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            status: 'approved',
            approvedBy: 'admin',
            approvedAt: expect.any(Date),
          }),
        })
      );
      expect(result.alias).toBeDefined();
    });

    it('B2: 동일 folderName 의 다른 pending → 자동 rejected', async () => {
      prisma.companyFolderAlias.findUnique.mockResolvedValueOnce({
        id: 1,
        folderName: '중복폴더',
        companyId: 10,
        status: 'pending',
      });
      prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 2 });
      prisma.companyFolderAlias.update.mockResolvedValueOnce({
        id: 1,
        folderName: '중복폴더',
        companyId: 10,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: new Date(),
      });

      await service.approve(1, { cascadeBackfill: false }, 'admin');

      expect(prisma.companyFolderAlias.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.companyFolderAlias.updateMany).toHaveBeenCalledWith({
        where: {
          folderName: '중복폴더',
          id: { not: 1 },
          status: 'pending',
        },
        data: { status: 'rejected' },
      });
    });

    it('B3: cascadeBackfill=true → relocateAfterAliasApproved 호출 (folderName, companyId, tx)', async () => {
      prisma.companyFolderAlias.findUnique.mockResolvedValueOnce({
        id: 1,
        folderName: 'XYZ',
        companyId: 20,
        status: 'pending',
      });
      prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.companyFolderAlias.update.mockResolvedValueOnce({
        id: 1,
        folderName: 'XYZ',
        companyId: 20,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: new Date(),
      });
      contactFolderSync.relocateAfterAliasApproved.mockResolvedValueOnce({
        relocated: 3,
        skipped: 1,
      });

      const result = await service.approve(1, { cascadeBackfill: true }, 'admin');

      expect(contactFolderSync.relocateAfterAliasApproved).toHaveBeenCalledTimes(1);
      expect(contactFolderSync.relocateAfterAliasApproved).toHaveBeenCalledWith('XYZ', 20, prisma);
      // task 26: backfill 응답에 migration 카운트 포함 (외부 root 미존재 → 0)
      expect(result.backfill).toEqual({ relocated: 3, skipped: 1, ...EMPTY_MIGRATION });
    });

    it('B4: cascadeBackfill=false → relocateAfterAliasApproved 미호출', async () => {
      prisma.companyFolderAlias.findUnique.mockResolvedValueOnce({
        id: 1,
        folderName: 'XYZ',
        companyId: 20,
        status: 'pending',
      });
      prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.companyFolderAlias.update.mockResolvedValueOnce({
        id: 1,
        folderName: 'XYZ',
        companyId: 20,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: new Date(),
      });

      const result = await service.approve(1, { cascadeBackfill: false }, 'admin');

      expect(contactFolderSync.relocateAfterAliasApproved).not.toHaveBeenCalled();
      expect(result.backfill).toBeUndefined();
    });

    it('B5: 멱등 — 이미 approved 인 alias 에 다시 호출 시 NoOp', async () => {
      prisma.companyFolderAlias.findUnique.mockResolvedValueOnce({
        id: 1,
        folderName: 'ABC',
        companyId: 10,
        status: 'approved',
      });

      const result = await service.approve(1, { cascadeBackfill: true }, 'admin');

      expect(prisma.companyFolderAlias.updateMany).not.toHaveBeenCalled();
      expect(prisma.companyFolderAlias.update).not.toHaveBeenCalled();
      expect(contactFolderSync.relocateAfterAliasApproved).not.toHaveBeenCalled();
      expect(result.alias).toMatchObject({ id: 1, status: 'approved' });
    });

    it('비존재 id → NotFoundException', async () => {
      prisma.companyFolderAlias.findUnique.mockResolvedValueOnce(null);

      await expect(service.approve(999, { cascadeBackfill: false }, 'admin')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('reject', () => {
    it('B6: status=rejected + update 호출 1회', async () => {
      prisma.companyFolderAlias.findUnique.mockResolvedValueOnce({
        id: 1,
        folderName: 'ABC',
        companyId: 10,
        status: 'pending',
      });
      prisma.companyFolderAlias.update.mockResolvedValueOnce({
        id: 1,
        folderName: 'ABC',
        companyId: 10,
        status: 'rejected',
      });

      await service.reject(1);

      expect(prisma.companyFolderAlias.update).toHaveBeenCalledTimes(1);
      expect(prisma.companyFolderAlias.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'rejected' },
      });
    });

    it('비존재 id → NotFoundException', async () => {
      prisma.companyFolderAlias.findUnique.mockResolvedValueOnce(null);

      await expect(service.reject(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('B7: row 삭제 — delete 호출 1회', async () => {
      prisma.companyFolderAlias.delete.mockResolvedValueOnce({ id: 1 });

      await service.delete(1);

      expect(prisma.companyFolderAlias.delete).toHaveBeenCalledTimes(1);
      expect(prisma.companyFolderAlias.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });
  });

  describe('list', () => {
    it('B8: page=2 + pageSize=25 → skip=25, take=25', async () => {
      prisma.companyFolderAlias.findMany.mockResolvedValueOnce([]);
      prisma.companyFolderAlias.count.mockResolvedValueOnce(0);

      const result = await service.list({
        status: 'pending',
        page: 2,
        pageSize: 25,
      });

      expect(prisma.companyFolderAlias.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'pending' },
          skip: 25,
          take: 25,
        })
      );
      expect(result).toEqual({ items: [], total: 0, page: 2, pageSize: 25 });
    });

    it('status 미지정 시 전체 조회 (where=빈 객체)', async () => {
      prisma.companyFolderAlias.findMany.mockResolvedValueOnce([]);
      prisma.companyFolderAlias.count.mockResolvedValueOnce(0);

      await service.list({});

      expect(prisma.companyFolderAlias.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });
  });

  describe('createApprovedAlias (task 25 A1-A6)', () => {
    it('A1: 신규 호출 → upsert(approved) + approvedBy/At 기록', async () => {
      const fixedNow = new Date('2026-04-27T10:00:00Z');
      jest.useFakeTimers().setSystemTime(fixedNow);

      prisma.company.findUnique.mockResolvedValueOnce({ id: 10, companyName: 'ABC업체' });
      prisma.companyFolderAlias.upsert.mockResolvedValueOnce({
        id: 1,
        folderName: 'ABC업체',
        companyId: 10,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: fixedNow,
      });
      prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 0 });
      contactFolderSync.relocateAfterAliasApproved.mockResolvedValueOnce({
        relocated: 0,
        skipped: 0,
      });

      const result = await service.createApprovedAlias(
        { folderName: 'ABC업체', companyId: 10, cascadeBackfill: false },
        'admin'
      );

      expect(prisma.company.findUnique).toHaveBeenCalledWith({ where: { id: 10 } });
      expect(prisma.companyFolderAlias.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.companyFolderAlias.upsert).toHaveBeenCalledWith({
        where: { folderName_companyId: { folderName: 'ABC업체', companyId: 10 } },
        update: {
          status: 'approved',
          approvedBy: 'admin',
          approvedAt: fixedNow,
        },
        create: {
          folderName: 'ABC업체',
          companyId: 10,
          status: 'approved',
          approvedBy: 'admin',
          approvedAt: fixedNow,
        },
      });
      expect(result.alias).toMatchObject({
        id: 1,
        folderName: 'ABC업체',
        companyId: 10,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: fixedNow,
      });

      jest.useRealTimers();
    });

    it('A2: 동일 folderName 의 다른 pending 자동 rejected', async () => {
      prisma.company.findUnique.mockResolvedValueOnce({ id: 10, companyName: '회사' });
      prisma.companyFolderAlias.upsert.mockResolvedValueOnce({
        id: 5,
        folderName: '중복폴더',
        companyId: 10,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: new Date(),
      });
      prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 2 });

      await service.createApprovedAlias(
        { folderName: '중복폴더', companyId: 10, cascadeBackfill: false },
        'admin'
      );

      expect(prisma.companyFolderAlias.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.companyFolderAlias.updateMany).toHaveBeenCalledWith({
        where: {
          folderName: '중복폴더',
          status: 'pending',
          NOT: { id: 5 },
        },
        data: { status: 'rejected' },
      });
    });

    it('A3: cascadeBackfill default true → backfill 호출 + 응답에 backfill 포함', async () => {
      prisma.company.findUnique.mockResolvedValueOnce({ id: 20, companyName: 'XYZ' });
      prisma.companyFolderAlias.upsert.mockResolvedValueOnce({
        id: 7,
        folderName: 'XYZ',
        companyId: 20,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: new Date(),
      });
      prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 0 });
      contactFolderSync.relocateAfterAliasApproved.mockResolvedValueOnce({
        relocated: 4,
        skipped: 1,
      });

      // cascadeBackfill 미지정 → default true
      const result = await service.createApprovedAlias(
        { folderName: 'XYZ', companyId: 20 },
        'admin'
      );

      expect(contactFolderSync.relocateAfterAliasApproved).toHaveBeenCalledTimes(1);
      expect(contactFolderSync.relocateAfterAliasApproved).toHaveBeenCalledWith('XYZ', 20, prisma);
      // task 26: backfill 응답에 migration 카운트 포함 (외부 root 미존재 → 0)
      expect(result.backfill).toEqual({ relocated: 4, skipped: 1, ...EMPTY_MIGRATION });
    });

    it('A4: cascadeBackfill false → backfill 미호출, 응답 backfill undefined', async () => {
      prisma.company.findUnique.mockResolvedValueOnce({ id: 20, companyName: 'XYZ' });
      prisma.companyFolderAlias.upsert.mockResolvedValueOnce({
        id: 7,
        folderName: 'XYZ',
        companyId: 20,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: new Date(),
      });
      prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 0 });

      const result = await service.createApprovedAlias(
        { folderName: 'XYZ', companyId: 20, cascadeBackfill: false },
        'admin'
      );

      expect(contactFolderSync.relocateAfterAliasApproved).not.toHaveBeenCalled();
      expect(result.backfill).toBeUndefined();
    });

    it('A5: 멱등 재호출 — alias status 변경 없음, backfill 멱등 추가 실행', async () => {
      // 이미 approved 상태인 alias 에 대해 재호출 — upsert 의 update 분기로 status='approved' 유지.
      // 단일 진입점 (relocateAfterAliasApproved) 의 멱등성에 의존하므로 backfill 은 다시 호출됨.
      prisma.company.findUnique.mockResolvedValueOnce({ id: 10, companyName: 'ABC' });
      prisma.companyFolderAlias.upsert.mockResolvedValueOnce({
        id: 1,
        folderName: 'ABC',
        companyId: 10,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: new Date(),
      });
      prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 0 });
      contactFolderSync.relocateAfterAliasApproved.mockResolvedValueOnce({
        relocated: 0,
        skipped: 0,
      });

      const result = await service.createApprovedAlias(
        { folderName: 'ABC', companyId: 10 }, // default cascadeBackfill=true
        'admin'
      );

      // upsert 는 항상 status=approved 로 정규화
      expect(prisma.companyFolderAlias.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ status: 'approved' }),
        })
      );
      // backfill 은 멱등하게 다시 호출되며, 이미 이동된 contact 는 companyId IS NULL 필터로 0건 처리됨
      expect(contactFolderSync.relocateAfterAliasApproved).toHaveBeenCalledTimes(1);
      expect(result.alias.status).toBe('approved');
      expect(result.backfill).toEqual({ relocated: 0, skipped: 0, ...EMPTY_MIGRATION });
    });

    it('A6: 비존재 companyId → NotFoundException', async () => {
      prisma.company.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.createApprovedAlias(
          { folderName: 'ABC', companyId: 999, cascadeBackfill: true },
          'admin'
        )
      ).rejects.toThrow(NotFoundException);

      expect(prisma.companyFolderAlias.upsert).not.toHaveBeenCalled();
      expect(prisma.companyFolderAlias.updateMany).not.toHaveBeenCalled();
      expect(contactFolderSync.relocateAfterAliasApproved).not.toHaveBeenCalled();
    });
  });

  describe('FolderAliasService — A7 service-level integration (task 25)', () => {
    it('A7: 대성목형(2265-1295) 폴더 + companyId=null contact 3건 → createApprovedAlias 호출 → 3건 companyId=4 + relocateAfterAliasApproved 호출 + 응답 backfill', async () => {
      // === 사전 시드 mock (Task 1.3 운영 시나리오 재현) ===
      // - Company id=4 ('대성목형') 존재
      // - 외부웹하드 폴더 '대성목형(2265-1295)' (companyId=null)
      // - Contact 3건 (companyName='대성목형(2265-1295)', companyId=null, inquiryType='laser_cutting')
      const folderName = '대성목형(2265-1295)';
      const companyId = 4;
      const fixedNow = new Date('2026-04-28T09:00:00Z');
      jest.useFakeTimers().setSystemTime(fixedNow);

      // 시드: company id=4 ('대성목형') 존재
      prisma.company.findUnique.mockResolvedValueOnce({
        id: companyId,
        companyName: '대성목형',
      });

      // 시드: 신규 alias row 생성 (status='approved', approvedBy='admin')
      const seededAlias = {
        id: 3,
        folderName,
        companyId,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: fixedNow,
        createdAt: fixedNow,
        updatedAt: fixedNow,
      };
      prisma.companyFolderAlias.upsert.mockResolvedValueOnce(seededAlias);

      // 시드: 다른 pending alias 없음 (count=0)
      prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 0 });

      // 시드: relocateAfterAliasApproved → contact 3건 이동 시뮬 (Task 1.3 처럼 contacts.companyId=null → 4 갱신)
      contactFolderSync.relocateAfterAliasApproved.mockResolvedValueOnce({
        relocated: 3,
        skipped: 0,
      });

      // === 호출 ===
      const result = await service.createApprovedAlias(
        { folderName, companyId, cascadeBackfill: true },
        'admin'
      );

      // === 통합 검증 1: 응답 shape 정확성 ===
      expect(result.alias).toMatchObject({
        id: 3,
        folderName: '대성목형(2265-1295)',
        companyId: 4,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: fixedNow,
      });
      expect(result.backfill).toEqual({ relocated: 3, skipped: 0, ...EMPTY_MIGRATION });

      // === 통합 검증 2: company 존재 선검증 ===
      expect(prisma.company.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.company.findUnique).toHaveBeenCalledWith({ where: { id: 4 } });

      // === 통합 검증 3: upsert 호출 (status='approved' 정규화) ===
      expect(prisma.companyFolderAlias.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.companyFolderAlias.upsert).toHaveBeenCalledWith({
        where: {
          folderName_companyId: { folderName: '대성목형(2265-1295)', companyId: 4 },
        },
        update: {
          status: 'approved',
          approvedBy: 'admin',
          approvedAt: fixedNow,
        },
        create: {
          folderName: '대성목형(2265-1295)',
          companyId: 4,
          status: 'approved',
          approvedBy: 'admin',
          approvedAt: fixedNow,
        },
      });

      // === 통합 검증 4: 단일 진입점 (relocateAfterAliasApproved) 만 호출, tx propagation ===
      expect(contactFolderSync.relocateAfterAliasApproved).toHaveBeenCalledTimes(1);
      expect(contactFolderSync.relocateAfterAliasApproved).toHaveBeenCalledWith(
        '대성목형(2265-1295)',
        4,
        prisma // tx propagation: $transaction 콜백 인자로 prisma mock 자체가 tx 로 전달됨
      );

      // === 통합 검증 5: side-effect order (company 검증 → upsert → updateMany → relocate) ===
      const companyFindUniqueOrder = prisma.company.findUnique.mock.invocationCallOrder[0];
      const upsertOrder = prisma.companyFolderAlias.upsert.mock.invocationCallOrder[0];
      const updateManyOrder = prisma.companyFolderAlias.updateMany.mock.invocationCallOrder[0];
      const relocateOrder =
        contactFolderSync.relocateAfterAliasApproved.mock.invocationCallOrder[0];

      expect(companyFindUniqueOrder).toBeLessThan(upsertOrder);
      expect(upsertOrder).toBeLessThan(updateManyOrder);
      expect(updateManyOrder).toBeLessThan(relocateOrder);

      // === 통합 검증 6: $transaction 단일 호출 (전체가 단일 트랜잭션) ===
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });

  describe('FolderAliasService — A8 chained migration (task 26)', () => {
    // task 26: cascadeBackfill 시 relocate 직후 migrate 가 동일 tx 안에서 chained call.
    // 외부 root 폴더가 존재하면 migrate 호출 + 응답에 카운트 포함.

    it('A8-1: createApprovedAlias — 외부 root 존재 시 migrate 호출 + 응답에 폴더 트리 이동 결과 포함', async () => {
      // 시드: company id=4 ('대성목형') 존재
      prisma.company.findUnique.mockResolvedValueOnce({ id: 4, companyName: '대성목형' });
      // 시드: alias upsert 성공
      prisma.companyFolderAlias.upsert.mockResolvedValueOnce({
        id: 9,
        folderName: '대성목형(2265-1295)',
        companyId: 4,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: new Date(),
      });
      prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 0 });
      // relocate: 5건 통합
      contactFolderSync.relocateAfterAliasApproved.mockResolvedValueOnce({
        relocated: 5,
        skipped: 0,
      });
      // 외부 root 폴더 존재
      prisma.webhardFolder.findFirst.mockResolvedValueOnce({
        id: 'ext-root-uuid',
        name: '대성목형(2265-1295)',
        path: '/외부웹하드/대성목형(2265-1295)',
        parentId: 'ext-parent-id',
      });
      // migrate: 폴더 12개, 파일 47개 이동, 외부 폴더는 husk 로 유지 (task 27)
      contactFolderSync.migrateExternalFolderTreeToCompany.mockResolvedValueOnce({
        movedFolders: 12,
        movedFiles: 47,
        deletedExternalFolders: 0,
        conflicts: [{ originalName: '원본임의', renamedTo: '원본임의 (1)' }],
      });

      const result = await service.createApprovedAlias(
        { folderName: '대성목형(2265-1295)', companyId: 4, cascadeBackfill: true },
        'admin'
      );

      // === migrate chained call 검증 (depth=2 정확 매칭) ===
      // task 29 Phase 1: select 에 name/path/parentId 추가 (fallback 분기에서 사용)
      expect(prisma.webhardFolder.findFirst).toHaveBeenNthCalledWith(1, {
        where: {
          name: '대성목형(2265-1295)',
          path: '/외부웹하드/대성목형(2265-1295)',
          deletedAt: null,
        },
        select: { id: true, name: true, path: true, parentId: true },
      });
      expect(contactFolderSync.migrateExternalFolderTreeToCompany).toHaveBeenCalledTimes(1);
      expect(contactFolderSync.migrateExternalFolderTreeToCompany).toHaveBeenCalledWith(
        'ext-root-uuid',
        4,
        prisma // tx propagation
      );

      // === 응답 backfill 에 relocate + migration 카운트 모두 포함 ===
      // task 27: deletedExternalFolders 는 husk 정책으로 항상 0
      expect(result.backfill).toEqual({
        relocated: 5,
        skipped: 0,
        movedFolders: 12,
        movedFiles: 47,
        deletedExternalFolders: 0,
        conflicts: [{ originalName: '원본임의', renamedTo: '원본임의 (1)' }],
        externalRootFound: true,
      });

      // === 단일 진입점 정책: relocate → migrate 순서 ===
      const relocOrder = contactFolderSync.relocateAfterAliasApproved.mock.invocationCallOrder[0];
      const migOrder =
        contactFolderSync.migrateExternalFolderTreeToCompany.mock.invocationCallOrder[0];
      expect(relocOrder).toBeLessThan(migOrder);

      // === 단일 트랜잭션 ===
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('A8-2: createApprovedAlias — 외부 root 미존재 시 migrate 호출 skip + migration 카운트 0', async () => {
      prisma.company.findUnique.mockResolvedValueOnce({ id: 4, companyName: '대성목형' });
      prisma.companyFolderAlias.upsert.mockResolvedValueOnce({
        id: 9,
        folderName: '사전매뉴얼등록폴더',
        companyId: 4,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: new Date(),
      });
      prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 0 });
      contactFolderSync.relocateAfterAliasApproved.mockResolvedValueOnce({
        relocated: 0,
        skipped: 0,
      });
      // findFirst 가 null 반환 → 외부 root 없음
      prisma.webhardFolder.findFirst.mockResolvedValueOnce(null);

      const result = await service.createApprovedAlias(
        { folderName: '사전매뉴얼등록폴더', companyId: 4, cascadeBackfill: true },
        'admin'
      );

      // migrate 미호출
      expect(contactFolderSync.migrateExternalFolderTreeToCompany).not.toHaveBeenCalled();
      // 카운트 0
      expect(result.backfill).toEqual({ relocated: 0, skipped: 0, ...EMPTY_MIGRATION });
    });

    it('A8-3: approve(id) — 외부 root 존재 시 migrate chained call + 단일 tx', async () => {
      prisma.companyFolderAlias.findUnique.mockResolvedValueOnce({
        id: 1,
        folderName: 'XYZ',
        companyId: 20,
        status: 'pending',
      });
      prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.companyFolderAlias.update.mockResolvedValueOnce({
        id: 1,
        folderName: 'XYZ',
        companyId: 20,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: new Date(),
      });
      contactFolderSync.relocateAfterAliasApproved.mockResolvedValueOnce({
        relocated: 2,
        skipped: 0,
      });
      prisma.webhardFolder.findFirst.mockResolvedValueOnce({
        id: 'ext-root-xyz',
        name: 'XYZ',
        path: '/외부웹하드/XYZ',
        parentId: 'ext-parent-id',
      });
      contactFolderSync.migrateExternalFolderTreeToCompany.mockResolvedValueOnce({
        movedFolders: 4,
        movedFiles: 9,
        deletedExternalFolders: 0, // task 27: husk 정책으로 항상 0
        conflicts: [],
      });

      const result = await service.approve(1, { cascadeBackfill: true }, 'admin');

      expect(contactFolderSync.migrateExternalFolderTreeToCompany).toHaveBeenCalledWith(
        'ext-root-xyz',
        20,
        prisma
      );
      expect(result.backfill).toEqual({
        relocated: 2,
        skipped: 0,
        movedFolders: 4,
        movedFiles: 9,
        deletedExternalFolders: 0, // task 27: husk 정책으로 항상 0
        conflicts: [],
        externalRootFound: true,
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('FolderAliasService — E2E (task 26 phase 5)', () => {
    // task 26 Phase 5 service-level integration 테스트.
    //
    // E2E-1: 대성목형 시나리오 (Contact 5건 + 폴더 트리) — 매뉴얼 매핑 1회 호출로
    //   relocate (contact 5건) + migrate (폴더/파일/외부폴더 cascade) 모두 chained 호출.
    // E2E-2: 동일 (folderName, companyId) 재호출 시 멱등 — alias upsert 가 status='approved' 정규화,
    //   relocate / migrate 모두 0 건 처리 (이미 통합되어 idempotent).

    it('E2E-1: 대성목형 시나리오 — 매뉴얼 매핑 1회 → relocate(5) + migrate(폴더 12, 파일 47, 외부폴더 3) chained', async () => {
      const folderName = '대성목형(2265-1295)';
      const companyId = 4;
      const fixedNow = new Date('2026-04-29T09:00:00Z');
      jest.useFakeTimers().setSystemTime(fixedNow);

      prisma.company.findUnique.mockResolvedValueOnce({ id: companyId, companyName: '대성목형' });
      prisma.companyFolderAlias.upsert.mockResolvedValueOnce({
        id: 30,
        folderName,
        companyId,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: fixedNow,
      });
      prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 0 });
      contactFolderSync.relocateAfterAliasApproved.mockResolvedValueOnce({
        relocated: 5,
        skipped: 0,
      });
      prisma.webhardFolder.findFirst.mockResolvedValueOnce({
        id: 'ext-root-대성목형',
        name: folderName,
        path: `/외부웹하드/${folderName}`,
        parentId: 'ext-parent-id',
      });
      contactFolderSync.migrateExternalFolderTreeToCompany.mockResolvedValueOnce({
        movedFolders: 12,
        movedFiles: 47,
        deletedExternalFolders: 0, // task 27: husk 정책으로 항상 0
        conflicts: [{ originalName: '원본임의', renamedTo: '원본임의 (1)' }],
      });

      const result = await service.createApprovedAlias(
        { folderName, companyId, cascadeBackfill: true },
        'admin'
      );

      // === relocate + migrate chained call (단일 진입점 + 단일 tx) ===
      expect(contactFolderSync.relocateAfterAliasApproved).toHaveBeenCalledWith(
        folderName,
        companyId,
        prisma
      );
      expect(contactFolderSync.migrateExternalFolderTreeToCompany).toHaveBeenCalledWith(
        'ext-root-대성목형',
        companyId,
        prisma
      );
      const relocOrder = contactFolderSync.relocateAfterAliasApproved.mock.invocationCallOrder[0];
      const migOrder =
        contactFolderSync.migrateExternalFolderTreeToCompany.mock.invocationCallOrder[0];
      expect(relocOrder).toBeLessThan(migOrder);

      // === 응답 backfill — 운영자 toast 표시용 통계 ===
      // task 27: deletedExternalFolders 는 husk 정책으로 항상 0
      expect(result.backfill).toEqual({
        relocated: 5,
        skipped: 0,
        movedFolders: 12,
        movedFiles: 47,
        deletedExternalFolders: 0,
        conflicts: [{ originalName: '원본임의', renamedTo: '원본임의 (1)' }],
        externalRootFound: true,
      });

      // === 단일 트랜잭션 (alias 1건당 1 tx 원칙) ===
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });

    it('E2E-2: 멱등 — 동일 (folderName, companyId) 재호출 시 alias upsert 만 발생, relocate/migrate 카운트 모두 0', async () => {
      const folderName = '대성목형(2265-1295)';
      const companyId = 4;

      prisma.company.findUnique.mockResolvedValueOnce({ id: companyId, companyName: '대성목형' });
      // 이미 approved 상태인 alias 에 upsert → status='approved' 그대로 유지
      prisma.companyFolderAlias.upsert.mockResolvedValueOnce({
        id: 30,
        folderName,
        companyId,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: new Date(),
      });
      prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 0 });
      // relocate: 첫 호출에서 모두 통합되었으므로 (companyId IS NULL 필터로 자동 제외) 0건
      contactFolderSync.relocateAfterAliasApproved.mockResolvedValueOnce({
        relocated: 0,
        skipped: 0,
      });
      // 외부 root: 첫 호출에서 cascade soft delete 되었으므로 findFirst null 반환 → migrate skip
      prisma.webhardFolder.findFirst.mockResolvedValueOnce(null);

      const result = await service.createApprovedAlias(
        { folderName, companyId, cascadeBackfill: true },
        'admin'
      );

      // alias 는 status='approved' 정규화 (멱등 upsert)
      expect(result.alias.status).toBe('approved');
      // migrate 미호출 (외부 root 없음)
      expect(contactFolderSync.migrateExternalFolderTreeToCompany).not.toHaveBeenCalled();
      // 카운트 모두 0 + externalRootFound=false (운영 UI 진단 신호)
      expect(result.backfill).toEqual({
        relocated: 0,
        skipped: 0,
        movedFolders: 0,
        movedFiles: 0,
        deletedExternalFolders: 0,
        conflicts: [],
        externalRootFound: false,
      });
    });

    it('E2E-3: depth=2 정확 매칭 — `/외부웹하드/` 직하만 root 후보, 깊은 경로 false-match 차단', async () => {
      // 외부웹하드 트리 깊은 곳 (`/외부웹하드/foo/대성목형(2265-1295)`) 에 동명 폴더가 있어도
      // depth=2 정확 매칭 (`path = '/외부웹하드/{folderName}'`) 으로 root 가 아니면 매칭 안 됨.
      const folderName = '대성목형(2265-1295)';
      const companyId = 4;

      prisma.company.findUnique.mockResolvedValueOnce({ id: companyId, companyName: '대성목형' });
      prisma.companyFolderAlias.upsert.mockResolvedValueOnce({
        id: 31,
        folderName,
        companyId,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: new Date(),
      });
      prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 0 });
      contactFolderSync.relocateAfterAliasApproved.mockResolvedValueOnce({
        relocated: 0,
        skipped: 0,
      });
      // findFirst 가 null 반환 — depth=2 정확 매칭으로 root 후보 0건
      prisma.webhardFolder.findFirst.mockResolvedValueOnce(null);

      const result = await service.createApprovedAlias(
        { folderName, companyId, cascadeBackfill: true },
        'admin'
      );

      // 정확 매칭 쿼리 검증 (1차 호출만 — task 29 Phase 1 select 확장)
      expect(prisma.webhardFolder.findFirst).toHaveBeenNthCalledWith(1, {
        where: {
          name: folderName,
          path: `/외부웹하드/${folderName}`,
          deletedAt: null,
        },
        select: { id: true, name: true, path: true, parentId: true },
      });
      // migrate 미호출 + externalRootFound=false
      expect(contactFolderSync.migrateExternalFolderTreeToCompany).not.toHaveBeenCalled();
      expect(result.backfill?.externalRootFound).toBe(false);
    });
  });

  describe('FolderAliasService — runCascadeBackfill 3-step fallback (task 29 Phase 1)', () => {
    // task 29 Phase 1: runCascadeBackfill 외부 root lookup 3-step fallback.
    // 1차: path 정확 매칭 (가장 안전)
    // 2차: 외부웹하드 root 직속 자식 중 name 일치 (공백·괄호 변형 흡수)
    // 3차: 정규화 매칭 (NFKC + 특수문자 제거)
    // 모두 실패 → externalRootFound=false 응답.

    /** createApprovedAlias 호출 시 alias upsert 가 매번 거치는 공통 mock 시드. */
    const seedAliasMocks = (
      prisma: ReturnType<typeof makePrisma>,
      folderName: string,
      companyId: number
    ) => {
      prisma.company.findUnique.mockResolvedValueOnce({ id: companyId, companyName: '회사' });
      prisma.companyFolderAlias.upsert.mockResolvedValueOnce({
        id: 1,
        folderName,
        companyId,
        status: 'approved',
        approvedBy: 'admin',
        approvedAt: new Date(),
      });
      prisma.companyFolderAlias.updateMany.mockResolvedValueOnce({ count: 0 });
    };

    it('E1: path 정확 매칭 성공 시 1차 매칭으로 종료 — 2/3차 미실행', async () => {
      const folderName = '대성목형(2265-1295)';
      const companyId = 4;
      const externalRootId = 'ext-root-id';
      seedAliasMocks(prisma, folderName, companyId);

      prisma.webhardFolder.findFirst.mockResolvedValueOnce({
        id: externalRootId,
        name: folderName,
        path: `/외부웹하드/${folderName}`,
        parentId: 'ext-parent-id',
      });
      contactFolderSync.relocateAfterAliasApproved.mockResolvedValueOnce({
        relocated: 0,
        skipped: 0,
      });
      contactFolderSync.migrateExternalFolderTreeToCompany.mockResolvedValueOnce({
        movedFolders: 1,
        movedFiles: 2,
        deletedExternalFolders: 0,
        conflicts: [],
      });

      await service.createApprovedAlias({ folderName, companyId, cascadeBackfill: true }, 'admin');

      // 1차 매칭만 호출되고 외부웹하드 parent / 정규화 후보 조회는 없음
      expect(prisma.webhardFolder.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.webhardFolder.findMany).not.toHaveBeenCalled();
      expect(contactFolderSync.migrateExternalFolderTreeToCompany).toHaveBeenCalledWith(
        externalRootId,
        companyId,
        prisma
      );
    });

    it('E2: path 정확 매칭 실패 + 외부웹하드 root 자식 name 일치 → 2차 fallback 으로 migrate 호출', async () => {
      const folderName = '대성목형(2265-1295)';
      const companyId = 4;
      const externalParentId = 'ext-parent-id';
      const externalRootId = 'ext-root-id';
      seedAliasMocks(prisma, folderName, companyId);

      prisma.webhardFolder.findFirst
        .mockResolvedValueOnce(null) // 1차: path 정확 매칭 실패
        .mockResolvedValueOnce({ id: externalParentId }) // 외부웹하드 parent
        .mockResolvedValueOnce({
          id: externalRootId,
          name: folderName,
          path: `/외부웹하드/${folderName}`,
          parentId: externalParentId,
        }); // 2차: 자식 중 name 일치

      contactFolderSync.relocateAfterAliasApproved.mockResolvedValueOnce({
        relocated: 0,
        skipped: 0,
      });
      contactFolderSync.migrateExternalFolderTreeToCompany.mockResolvedValueOnce({
        movedFolders: 5,
        movedFiles: 12,
        deletedExternalFolders: 0,
        conflicts: [],
      });

      const result = await service.createApprovedAlias(
        { folderName, companyId, cascadeBackfill: true },
        'admin'
      );

      expect(contactFolderSync.migrateExternalFolderTreeToCompany).toHaveBeenCalledWith(
        externalRootId,
        companyId,
        expect.anything()
      );
      expect(result.backfill?.externalRootFound).toBe(true);
      expect(result.backfill?.movedFolders).toBe(5);
      expect(result.backfill?.movedFiles).toBe(12);
    });

    it('E3: 1/2차 실패 + 정규화 매칭 성공 → 3차 fallback', async () => {
      const folderName = '대성목형(2265-1295)';
      const companyId = 4;
      const externalParentId = 'ext-parent-id';
      const candidateId = 'cand-1';
      seedAliasMocks(prisma, folderName, companyId);

      prisma.webhardFolder.findFirst
        .mockResolvedValueOnce(null) // 1차
        .mockResolvedValueOnce({ id: externalParentId }) // 외부웹하드 parent
        .mockResolvedValueOnce(null); // 2차: 자식 name 일치 안됨

      // 3차: 외부웹하드 자식 중 정규화 일치 후보 (공백 차이 흡수)
      prisma.webhardFolder.findMany.mockResolvedValueOnce([
        {
          id: candidateId,
          name: '대성 목형 (2265-1295)', // 공백 차이
          path: '/외부웹하드/대성 목형 (2265-1295)',
          parentId: externalParentId,
        },
      ]);

      contactFolderSync.relocateAfterAliasApproved.mockResolvedValueOnce({
        relocated: 0,
        skipped: 0,
      });
      contactFolderSync.migrateExternalFolderTreeToCompany.mockResolvedValueOnce({
        movedFolders: 3,
        movedFiles: 7,
        deletedExternalFolders: 0,
        conflicts: [],
      });

      const result = await service.createApprovedAlias(
        { folderName, companyId, cascadeBackfill: true },
        'admin'
      );

      expect(contactFolderSync.migrateExternalFolderTreeToCompany).toHaveBeenCalledWith(
        candidateId,
        companyId,
        expect.anything()
      );
      expect(result.backfill?.externalRootFound).toBe(true);
    });

    it('E4: 1/2/3차 모두 실패 시 externalRootFound=false 반환', async () => {
      const folderName = '대성목형(2265-1295)';
      const companyId = 4;
      seedAliasMocks(prisma, folderName, companyId);

      prisma.webhardFolder.findFirst
        .mockResolvedValueOnce(null) // 1차
        .mockResolvedValueOnce({ id: 'ext-parent-id' }) // 외부웹하드 parent
        .mockResolvedValueOnce(null); // 2차

      // 3차: 정규화 매칭 후보 없음 (전혀 다른 업체)
      prisma.webhardFolder.findMany.mockResolvedValueOnce([
        { id: 'other', name: '다른업체', path: '/외부웹하드/다른업체', parentId: 'ext-parent-id' },
      ]);

      contactFolderSync.relocateAfterAliasApproved.mockResolvedValueOnce({
        relocated: 0,
        skipped: 0,
      });

      const result = await service.createApprovedAlias(
        { folderName, companyId, cascadeBackfill: true },
        'admin'
      );

      expect(contactFolderSync.migrateExternalFolderTreeToCompany).not.toHaveBeenCalled();
      expect(result.backfill?.externalRootFound).toBe(false);
      expect(result.backfill?.movedFolders).toBe(0);
    });

    it('E5: 외부웹하드 parent 자체가 없으면 2/3차 skip → externalRootFound=false', async () => {
      const folderName = 'ABC';
      const companyId = 4;
      seedAliasMocks(prisma, folderName, companyId);

      prisma.webhardFolder.findFirst
        .mockResolvedValueOnce(null) // 1차
        .mockResolvedValueOnce(null); // 외부웹하드 parent 없음

      contactFolderSync.relocateAfterAliasApproved.mockResolvedValueOnce({
        relocated: 0,
        skipped: 0,
      });

      const result = await service.createApprovedAlias(
        { folderName, companyId, cascadeBackfill: true },
        'admin'
      );

      // 정규화 후보 조회는 외부웹하드 parent 가 없으면 skip
      expect(prisma.webhardFolder.findMany).not.toHaveBeenCalled();
      expect(result.backfill?.externalRootFound).toBe(false);
    });
  });
});
