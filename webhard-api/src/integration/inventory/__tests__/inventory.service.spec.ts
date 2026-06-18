/**
 * InventoryService unit tests
 *
 * Phase 2 DB refactoring guard: Raw SQL 재고 부족 조회
 * 이 테스트는 리팩토링 전/후 모두 동일한 인터페이스로 동작하는지 검증합니다.
 *
 * Raw SQL 사용:
 * - getLowStockAlerts: inventory_items 재고 부족 조회 (1건 $queryRaw)
 */

import { InventoryService } from '../inventory.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

// $transaction 콜백에 주입되는 tx 타입 — 서비스 내부에서 사용하는 모델만 포함.
interface MockTx {
  inventoryItem: { findUnique: jest.Mock; update: jest.Mock };
  inventoryTransaction: { create: jest.Mock };
}

// ─── Mock 타입 정의 ──────────────────────────────────────────
interface MockPrisma {
  $queryRaw: jest.Mock;
  executeWithRetry: jest.Mock;
  inventoryItem: {
    count: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  inventoryTransaction: {
    count: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
  };
  $transaction: jest.Mock;
}

function makePrisma(): MockPrisma {
  return {
    $queryRaw: jest.fn(),
    executeWithRetry: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
    inventoryItem: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    inventoryTransaction: {
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-001',
    name: '4절 합판',
    category: 'plywood',
    unit: '장',
    currentStock: 100,
    minStock: 20,
    width: 900,
    height: 600,
    thickness: 18,
    unitPrice: 5000,
    supplier: '삼화목재',
    location: 'A-1-1',
    isActive: true,
    memo: null,
    createdAt: new Date('2026-03-01T00:00:00Z'),
    updatedAt: new Date('2026-03-20T00:00:00Z'),
    ...overrides,
  };
}

function makeTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-001',
    itemId: 'item-001',
    type: 'in',
    quantity: 50,
    previousStock: 50,
    newStock: 100,
    orderId: null,
    reason: '정기 입고',
    actorName: '관리자',
    createdAt: new Date('2026-03-20T09:00:00Z'),
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────
// 1. getItems — 재고 목록 조회
// ──────────────────────────────────────────────────────────────
describe('InventoryService.getItems', () => {
  let service: InventoryService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new InventoryService(prisma as never);
  });

  it('기본 조회 → 페이지네이션 응답', async () => {
    const item = makeItem();
    prisma.inventoryItem.count.mockResolvedValue(1);
    prisma.inventoryItem.findMany.mockResolvedValue([item]);

    const result = await service.getItems({ page: 1, limit: 50 });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('item-001');
    expect(result.items[0].name).toBe('4절 합판');
    expect(result.items[0].current_stock).toBe(100);
    expect(result.items[0].is_low_stock).toBe(false);
  });

  it('카테고리 필터 적용', async () => {
    prisma.inventoryItem.count.mockResolvedValue(0);
    prisma.inventoryItem.findMany.mockResolvedValue([]);

    await service.getItems({ category: 'plywood' as never, page: 1, limit: 50 });

    expect(prisma.inventoryItem.findMany).toHaveBeenCalled();
  });

  it('재고 부족 항목 → is_low_stock = true', async () => {
    const lowStockItem = makeItem({ currentStock: 5, minStock: 20 });
    prisma.inventoryItem.count.mockResolvedValue(1);
    prisma.inventoryItem.findMany.mockResolvedValue([lowStockItem]);

    const result = await service.getItems({ page: 1, limit: 50 });

    expect(result.items[0].is_low_stock).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────
// 2. getItem — 재고 상세 조회
// ──────────────────────────────────────────────────────────────
describe('InventoryService.getItem', () => {
  let service: InventoryService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new InventoryService(prisma as never);
  });

  it('존재하는 항목 → 상세 + 최근 거래 반환', async () => {
    const item = makeItem({
      transactions: [makeTransaction()],
    });
    prisma.inventoryItem.findUnique.mockResolvedValue(item);

    const result = await service.getItem('item-001');

    expect(result.id).toBe('item-001');
    expect(result.recent_transactions).toHaveLength(1);
    expect(result.recent_transactions[0].type).toBe('in');
    expect(result.recent_transactions[0].quantity).toBe(50);
  });

  it('존재하지 않는 항목 → NotFoundException', async () => {
    prisma.inventoryItem.findUnique.mockResolvedValue(null);

    await expect(service.getItem('nonexistent')).rejects.toThrow(NotFoundException);
  });
});

// ──────────────────────────────────────────────────────────────
// 3. createItem — 재고 항목 생성
// ──────────────────────────────────────────────────────────────
describe('InventoryService.createItem', () => {
  let service: InventoryService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new InventoryService(prisma as never);
  });

  it('재고 항목 생성 → DTO 반환', async () => {
    const created = makeItem();
    prisma.inventoryItem.create.mockResolvedValue(created);

    const result = await service.createItem({
      name: '4절 합판',
      category: 'plywood' as never,
      unit: '장',
    });

    expect(result.id).toBe('item-001');
    expect(result.name).toBe('4절 합판');
    expect(prisma.inventoryItem.create).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────────────────────
// 4. stockIn — 입고
// ──────────────────────────────────────────────────────────────
describe('InventoryService.stockIn', () => {
  let service: InventoryService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new InventoryService(prisma as never);
  });

  it('정상 입고 → 재고 증가 + 거래 기록', async () => {
    // 서비스는 $transaction(cb) 안에서 inventoryItem 조회/업데이트 + transaction 생성을 수행.
    // 테스트는 cb 실행 결과만 중요하므로 $transaction mock 을 호출 시 cb(tx) 실행하도록 설정.
    const updatedItem = makeItem({ currentStock: 80 });
    const transaction = makeTransaction({
      quantity: 30,
      previousStock: 50,
      newStock: 80,
    });
    const tx = {
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue(makeItem({ currentStock: 50 })),
        update: jest.fn().mockResolvedValue(updatedItem),
      },
      inventoryTransaction: {
        create: jest.fn().mockResolvedValue(transaction),
      },
    };
    prisma.$transaction.mockImplementation((cb: (tx: MockTx) => unknown) => cb(tx));

    const result = await service.stockIn('item-001', {
      quantity: 30,
      reason: '정기 입고',
      actorName: '관리자',
    });

    expect(result.item.current_stock).toBe(80);
    expect(result.transaction.quantity).toBe(30);
    expect(result.transaction.previous_stock).toBe(50);
    expect(result.transaction.new_stock).toBe(80);
  });

  it('존재하지 않는 항목 → NotFoundException', async () => {
    // $transaction 콜백 안에서 tx.inventoryItem.findUnique → null → NotFoundException throw
    const tx = {
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      inventoryTransaction: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation((cb: (tx: MockTx) => unknown) => cb(tx));

    await expect(service.stockIn('nonexistent', { quantity: 10 })).rejects.toThrow(
      NotFoundException
    );
  });
});

// ──────────────────────────────────────────────────────────────
// 5. stockOut — 출고
// ──────────────────────────────────────────────────────────────
describe('InventoryService.stockOut', () => {
  let service: InventoryService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new InventoryService(prisma as never);
  });

  it('정상 출고 → 재고 감소 + 거래 기록', async () => {
    const updatedItem = makeItem({ currentStock: 80 });
    const transaction = makeTransaction({
      type: 'out',
      quantity: 20,
      previousStock: 100,
      newStock: 80,
    });
    const tx = {
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue(makeItem({ currentStock: 100 })),
        update: jest.fn().mockResolvedValue(updatedItem),
      },
      inventoryTransaction: {
        create: jest.fn().mockResolvedValue(transaction),
      },
    };
    prisma.$transaction.mockImplementation((cb: (tx: MockTx) => unknown) => cb(tx));

    const result = await service.stockOut('item-001', {
      quantity: 20,
      reason: '작업 사용',
    });

    expect(result.item.current_stock).toBe(80);
    expect(result.transaction.type).toBe('out');
  });

  it('재고 부족 → BadRequestException', async () => {
    const tx = {
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue(makeItem({ currentStock: 5 })),
        update: jest.fn(),
      },
      inventoryTransaction: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation((cb: (tx: MockTx) => unknown) => cb(tx));

    await expect(service.stockOut('item-001', { quantity: 10 })).rejects.toThrow(
      BadRequestException
    );
  });

  it('재고 부족 에러 메시지에 현재/요청 수량 포함', async () => {
    const tx = {
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue(makeItem({ currentStock: 3 })),
        update: jest.fn(),
      },
      inventoryTransaction: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation((cb: (tx: MockTx) => unknown) => cb(tx));

    await expect(service.stockOut('item-001', { quantity: 10 })).rejects.toThrow(
      /current 3.*requested 10/
    );
  });
});

// ──────────────────────────────────────────────────────────────
// 6. stockAdjust — 재고 조정
// ──────────────────────────────────────────────────────────────
describe('InventoryService.stockAdjust', () => {
  let service: InventoryService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new InventoryService(prisma as never);
  });

  it('재고 조정 → 새 재고 설정 + 차이값 기록', async () => {
    const updatedItem = makeItem({ currentStock: 75 });
    const transaction = makeTransaction({
      type: 'adjust',
      quantity: 25, // 75 - 50
      previousStock: 50,
      newStock: 75,
    });
    const tx = {
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue(makeItem({ currentStock: 50 })),
        update: jest.fn().mockResolvedValue(updatedItem),
      },
      inventoryTransaction: {
        create: jest.fn().mockResolvedValue(transaction),
      },
    };
    prisma.$transaction.mockImplementation((cb: (tx: MockTx) => unknown) => cb(tx));

    const result = await service.stockAdjust('item-001', {
      newStock: 75,
      reason: '재고 실사',
    });

    expect(result.item.current_stock).toBe(75);
    expect(result.transaction.type).toBe('adjust');
    expect(result.transaction.quantity).toBe(25);
  });
});

// ──────────────────────────────────────────────────────────────
// 7. getLowStockAlerts — 재고 부족 알림 (Raw SQL)
// ──────────────────────────────────────────────────────────────
describe('InventoryService.getLowStockAlerts', () => {
  let service: InventoryService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new InventoryService(prisma as never);
  });

  it('재고 부족 항목 반환 + shortage 계산', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'item-low-001',
        name: '레이저 칼날',
        category: 'blade',
        unit: '개',
        current_stock: 2,
        min_stock: 10,
      },
      {
        id: 'item-low-002',
        name: '4절 합판',
        category: 'plywood',
        unit: '장',
        current_stock: 5,
        min_stock: 20,
      },
    ]);

    const result = await service.getLowStockAlerts();

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('레이저 칼날');
    expect(result[0].shortage).toBe(8); // 10 - 2
    expect(result[1].shortage).toBe(15); // 20 - 5
  });

  it('재고 부족 없음 → 빈 배열', async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await service.getLowStockAlerts();

    expect(result).toHaveLength(0);
  });

  it('current_stock == min_stock → shortage = 0 (경계값)', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'item-boundary',
        name: '스펀지',
        category: 'sponge',
        unit: '개',
        current_stock: 10,
        min_stock: 10,
      },
    ]);

    const result = await service.getLowStockAlerts();

    expect(result[0].shortage).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────
// 8. getTransactions — 거래 내역 조회
// ──────────────────────────────────────────────────────────────
describe('InventoryService.getTransactions', () => {
  let service: InventoryService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new InventoryService(prisma as never);
  });

  it('거래 내역 페이지네이션', async () => {
    const item = makeItem();
    prisma.inventoryItem.findUnique.mockResolvedValue(item);
    prisma.inventoryTransaction.count.mockResolvedValue(1);
    prisma.inventoryTransaction.findMany.mockResolvedValue([makeTransaction()]);

    const result = await service.getTransactions('item-001', {
      page: 1,
      limit: 50,
    });

    expect(result.total).toBe(1);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe('in');
  });

  it('존재하지 않는 항목의 거래 내역 → NotFoundException', async () => {
    prisma.inventoryItem.findUnique.mockResolvedValue(null);

    await expect(service.getTransactions('nonexistent', { page: 1, limit: 50 })).rejects.toThrow(
      NotFoundException
    );
  });

  it('type 필터 + 날짜 필터 적용', async () => {
    const item = makeItem();
    prisma.inventoryItem.findUnique.mockResolvedValue(item);
    prisma.inventoryTransaction.count.mockResolvedValue(0);
    prisma.inventoryTransaction.findMany.mockResolvedValue([]);

    await service.getTransactions('item-001', {
      type: 'in',
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
      page: 1,
      limit: 50,
    });

    expect(prisma.inventoryTransaction.findMany).toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────
// 9. DTO 매핑 검증
// ──────────────────────────────────────────────────────────────
describe('InventoryService DTO mapping', () => {
  let service: InventoryService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new InventoryService(prisma as never);
  });

  it('날짜 → ISO 문자열 변환', async () => {
    const item = makeItem({
      transactions: [makeTransaction()],
    });
    prisma.inventoryItem.findUnique.mockResolvedValue(item);

    const result = await service.getItem('item-001');

    expect(result.created_at).toBe('2026-03-01T00:00:00.000Z');
    expect(result.updated_at).toBe('2026-03-20T00:00:00.000Z');
    expect(result.recent_transactions[0].created_at).toBe('2026-03-20T09:00:00.000Z');
  });

  it('null 필드 유지', async () => {
    const item = makeItem({
      width: null,
      height: null,
      thickness: null,
      unitPrice: null,
      supplier: null,
      location: null,
      memo: null,
      transactions: [],
    });
    prisma.inventoryItem.findUnique.mockResolvedValue(item);

    const result = await service.getItem('item-001');

    expect(result.width).toBeNull();
    expect(result.height).toBeNull();
    expect(result.supplier).toBeNull();
    expect(result.memo).toBeNull();
  });
});
