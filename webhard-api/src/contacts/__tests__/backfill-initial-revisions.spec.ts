/**
 * 초기 revision 백필 스크립트 단위 테스트.
 *
 * 스펙: tasks/18-drawing-consistency Phase 3
 *
 * 검증:
 *   B1: findBackfillTargets — drawingFileUrl 있고 reason='initial' 없는 contact 만 반환.
 *   B2: applyBackfill — 각 대상에 createInitialRevision({ createdAt, skipInitial: true }) 호출,
 *       성공/실패 카운트 정확.
 *   B3: applyBackfill — 일부 실패해도 나머지는 계속 처리 (continue-on-error).
 */

import { applyBackfill, findBackfillTargets } from '../../../scripts/backfill-initial-revisions';

describe('backfill-initial-revisions', () => {
  describe('findBackfillTargets', () => {
    it('B1: drawingFileUrl 있고 initial revision 없는 contact 만 반환', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 'c1',
          drawingFileUrl: 'https://cdn/a.dxf',
          drawingFileName: 'a.dxf',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: 'c2',
          drawingFileUrl: 'https://cdn/b.dxf',
          drawingFileName: null,
          createdAt: new Date('2026-02-01T00:00:00Z'),
        },
      ]);
      const prisma = { contact: { findMany } } as never;

      const result = await findBackfillTargets(prisma);

      expect(findMany).toHaveBeenCalledWith({
        where: {
          drawingFileUrl: { not: null },
          drawingRevisions: { none: { reason: 'initial' } },
        },
        select: {
          id: true,
          drawingFileUrl: true,
          drawingFileName: true,
          createdAt: true,
        },
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'c1',
        drawingFileUrl: 'https://cdn/a.dxf',
        drawingFileName: 'a.dxf',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
    });
  });

  describe('applyBackfill', () => {
    const logger = { log: jest.fn(), error: jest.fn() };

    beforeEach(() => {
      logger.log.mockReset();
      logger.error.mockReset();
    });

    it('B2: 각 대상에 createInitialRevision({ createdAt, skipInitial: true }) 호출', async () => {
      const createInitialRevision = jest.fn().mockResolvedValue({ id: 'rev' });
      const drawingRevisionService = { createInitialRevision } as never;

      const targets = [
        {
          id: 'c1',
          drawingFileUrl: 'https://cdn/a.dxf',
          drawingFileName: 'a.dxf',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: 'c2',
          drawingFileUrl: 'https://cdn/b.dxf',
          drawingFileName: null,
          createdAt: new Date('2026-02-01T00:00:00Z'),
        },
      ];

      const result = await applyBackfill(drawingRevisionService, targets, logger);

      expect(createInitialRevision).toHaveBeenCalledTimes(2);
      expect(createInitialRevision).toHaveBeenNthCalledWith(1, 'c1', 'https://cdn/a.dxf', 'a.dxf', {
        createdAt: new Date('2026-01-01T00:00:00Z'),
        skipInitial: true,
      });
      expect(createInitialRevision).toHaveBeenNthCalledWith(2, 'c2', 'https://cdn/b.dxf', null, {
        createdAt: new Date('2026-02-01T00:00:00Z'),
        skipInitial: true,
      });
      expect(result).toEqual({ scanned: 2, applied: 2, failed: 0, failures: [] });
    });

    it('B3: 일부 실패해도 나머지 처리 + 실패 항목 수집', async () => {
      const createInitialRevision = jest
        .fn()
        .mockResolvedValueOnce({ id: 'rev1' })
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ id: 'rev3' });
      const drawingRevisionService = { createInitialRevision } as never;

      const targets = [
        {
          id: 'c1',
          drawingFileUrl: 'https://cdn/a.dxf',
          drawingFileName: 'a.dxf',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: 'c2',
          drawingFileUrl: 'https://cdn/b.dxf',
          drawingFileName: 'b.dxf',
          createdAt: new Date('2026-02-01T00:00:00Z'),
        },
        {
          id: 'c3',
          drawingFileUrl: 'https://cdn/c.dxf',
          drawingFileName: 'c.dxf',
          createdAt: new Date('2026-03-01T00:00:00Z'),
        },
      ];

      const result = await applyBackfill(drawingRevisionService, targets, logger);

      expect(createInitialRevision).toHaveBeenCalledTimes(3);
      expect(result.scanned).toBe(3);
      expect(result.applied).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.failures).toEqual([{ contactId: 'c2', error: 'boom' }]);
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });
});
