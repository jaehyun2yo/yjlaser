import { NumberService } from '../number.service';

// ============================================================
// Mock factories
// ============================================================

function makePrisma(queryRawResult: unknown = [{ date_key: new Date('2026-03-29'), last_seq: BigInt(1) }]) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(queryRawResult),
  };
}

function makeService(queryRawResult?: unknown) {
  const prisma = makePrisma(queryRawResult);
  const service = new NumberService(prisma as never);
  return { service, prisma };
}

// ============================================================
// generateNumber
// ============================================================

describe('NumberService.generateNumber', () => {
  it('inquiry 타입 → O 접두사 번호 반환', async () => {
    const { service } = makeService([{ date_key: new Date('2026-03-29'), last_seq: BigInt(1) }]);

    const result = await service.generateNumber('inquiry');

    expect(result).toMatch(/^260329-O-001$/);
  });

  it('work 타입 → F 접두사 번호 반환', async () => {
    const { service } = makeService([{ date_key: new Date('2026-03-29'), last_seq: BigInt(1) }]);

    const result = await service.generateNumber('work');

    expect(result).toMatch(/^260329-F-001$/);
  });

  it('seq가 10이면 3자리 zero-padded (010)', async () => {
    const { service } = makeService([{ date_key: new Date('2026-03-29'), last_seq: BigInt(10) }]);

    const result = await service.generateNumber('inquiry');

    expect(result).toMatch(/^260329-O-010$/);
  });

  it('seq가 100이면 세 자리 (100)', async () => {
    const { service } = makeService([{ date_key: new Date('2026-03-29'), last_seq: BigInt(100) }]);

    const result = await service.generateNumber('inquiry');

    expect(result).toMatch(/^260329-O-100$/);
  });

  it('DB 에러 시 번호 생성 실패 에러 throw', async () => {
    const { service, prisma } = makeService();
    (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('DB error'));

    await expect(service.generateNumber('inquiry')).rejects.toThrow('번호 생성에 실패했습니다');
  });

  it('$queryRaw가 올바른 SQL UPSERT 호출 (type 파라미터 포함)', async () => {
    const { service, prisma } = makeService([{ date_key: new Date('2026-03-29'), last_seq: BigInt(1) }]);

    await service.generateNumber('inquiry');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// peekNextNumber
// ============================================================

describe('NumberService.peekNextNumber', () => {
  it('카운터가 있으면 next = last_seq + 1 반환', async () => {
    const { service } = makeService([{ date_key: new Date('2026-03-29'), last_seq: BigInt(5) }]);

    const result = await service.peekNextNumber('inquiry');

    expect(result).toMatch(/^260329-O-006$/);
  });

  it('카운터가 없으면 001 반환', async () => {
    const { service } = makeService([]); // 빈 결과

    const result = await service.peekNextNumber('inquiry');

    // 오늘 날짜로 -O-001 형식이어야 함
    expect(result).toMatch(/-O-001$/);
  });

  it('work 타입 카운터 없으면 F-001 반환', async () => {
    const { service } = makeService([]);

    const result = await service.peekNextNumber('work');

    expect(result).toMatch(/-F-001$/);
  });

  it('DB 에러 시 "예상 불가" 반환 (예외 전파 없음)', async () => {
    const { service, prisma } = makeService();
    (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('DB error'));

    const result = await service.peekNextNumber('inquiry');

    expect(result).toBe('예상 불가');
  });
});

// ============================================================
// formatDateKey (간접 테스트)
// ============================================================

describe('NumberService - formatDateKey 날짜 포맷', () => {
  it('2026년 1월 5일 → 260105', async () => {
    const { service } = makeService([{ date_key: new Date('2026-01-05'), last_seq: BigInt(1) }]);

    const result = await service.generateNumber('inquiry');

    expect(result.startsWith('260105-')).toBe(true);
  });

  it('2026년 12월 31일 → 261231', async () => {
    const { service } = makeService([{ date_key: new Date('2026-12-31'), last_seq: BigInt(1) }]);

    const result = await service.generateNumber('work');

    expect(result.startsWith('261231-')).toBe(true);
  });
});
