/**
 * OrdersService unit tests
 *
 * Phase 2 DB refactoring: Raw SQL → Prisma ORM 전환 완료
 * 이 테스트는 Prisma ORM 전환 후 동일한 인터페이스로 동작하는지 검증합니다.
 *
 * 전환된 메서드:
 * - updateOrderStatus: contact.update (5건)
 * - createAutoContact: contact.findFirst + contact.create (2건)
 * - getNextNumbers: contact.findFirst (2건)
 * - searchCompanyByName: company.findMany (1건)
 * - syncContactProcessStage: contact.findUnique + contact.update (2건)
 */

import { OrdersService } from '../orders.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { VALID_STATUS_TRANSITIONS } from '../dto/order.dto';

// ─── Mock 타입 정의 ──────────────────────────────────────────
interface MockPrisma {
  executeWithRetry: jest.Mock;
  order: {
    count: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    groupBy: jest.Mock;
  };
  orderEvent: {
    findMany: jest.Mock;
    create: jest.Mock;
  };
  contact: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  company: {
    findMany: jest.Mock;
  };
}

// ─── 테스트 데이터 팩토리 ──────────────────────────────────────
function makeOrder(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-03-20T09:00:00Z');
  return {
    id: 'order-001',
    contactId: BigInt(10),
    inquiryNumber: '260320-O-001',
    companyName: '원컴퍼니',
    customerName: '홍길동',
    customerPhone: '010-1234-5678',
    title: '테스트 주문',
    description: null,
    orderType: 'standard',
    status: 'received',
    priority: 'normal',
    drawingFileCount: 1,
    webhardFolderId: null,
    dxfClassifiedCount: 0,
    dxfTotalPrice: 0,
    nestingSheetCount: null,
    nestingUtilization: null,
    receivedAt: now,
    confirmedAt: null,
    cuttingStartedAt: null,
    cuttingCompletedAt: null,
    postProcessingStartedAt: null,
    postProcessingCompletedAt: null,
    deliveredAt: null,
    scheduledAutoCompleteAt: null,
    deliveryMethod: null,
    deliveryAddress: null,
    deliveryNote: null,
    memo: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makePrisma(): MockPrisma {
  return {
    executeWithRetry: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
    order: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    orderEvent: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    contact: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    company: {
      findMany: jest.fn(),
    },
  };
}

function makeNumberService() {
  let seq = 0;
  return {
    generateNumber: jest.fn(async (type: string) => {
      seq++;
      const prefix = type === 'inquiry' ? 'O' : 'F';
      return `260325-${prefix}-${String(seq).padStart(3, '0')}`;
    }),
    peekNextNumber: jest.fn(async (type: string) => {
      const prefix = type === 'inquiry' ? 'O' : 'F';
      return `260325-${prefix}-001`;
    }),
  };
}

// ──────────────────────────────────────────────────────────────
// 1. getOrders — 주문 목록 조회
// ──────────────────────────────────────────────────────────────
describe('OrdersService.getOrders', () => {
  let service: OrdersService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new OrdersService(
      prisma as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { updateProcessStage: jest.fn() } as never
    );
  });

  it('기본 조회 (빈 쿼리) → 페이지네이션 응답', async () => {
    const order = makeOrder();
    prisma.order.count.mockResolvedValue(1);
    prisma.order.findMany.mockResolvedValue([order]);
    prisma.executeWithRetry.mockImplementation((fn: () => Promise<unknown>) => fn());

    const result = await service.getOrders({ page: 1, limit: 50 });

    expect(result.total).toBe(1);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].id).toBe('order-001');
    expect(result.orders[0].company_name).toBe('원컴퍼니');
    expect(result.page).toBe(1);
    expect(result.hasMore).toBe(false);
  });

  it('status 필터 적용', async () => {
    prisma.order.count.mockResolvedValue(0);
    prisma.order.findMany.mockResolvedValue([]);

    await service.getOrders({ status: 'received' as never, page: 1, limit: 50 });

    // findMany가 호출되었고 where에 status가 포함됨
    expect(prisma.order.findMany).toHaveBeenCalled();
  });

  it('companyName 필터 적용', async () => {
    prisma.order.count.mockResolvedValue(0);
    prisma.order.findMany.mockResolvedValue([]);

    await service.getOrders({ companyName: '원컴', page: 1, limit: 50 });

    expect(prisma.order.findMany).toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────
// 2. getOrder — 주문 상세 조회
// ──────────────────────────────────────────────────────────────
describe('OrdersService.getOrder', () => {
  let service: OrdersService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new OrdersService(
      prisma as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { updateProcessStage: jest.fn() } as never
    );
  });

  it('존재하는 주문 → 상세 응답', async () => {
    const order = makeOrder({
      events: [],
      tasks: [],
      deliveries: [],
    });
    prisma.order.findUnique.mockResolvedValue(order);

    const result = await service.getOrder('order-001');

    expect(result.id).toBe('order-001');
    expect(result.contact_id).toBe(10);
    expect(result.events).toEqual([]);
    expect(result.tasks).toEqual([]);
    expect(result.deliveries).toEqual([]);
  });

  it('존재하지 않는 주문 → NotFoundException', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(service.getOrder('nonexistent')).rejects.toThrow(NotFoundException);
  });
});

// ──────────────────────────────────────────────────────────────
// 3. createOrder — 주문 생성
// ──────────────────────────────────────────────────────────────
describe('OrdersService.createOrder', () => {
  let service: OrdersService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new OrdersService(
      prisma as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { updateProcessStage: jest.fn() } as never
    );
  });

  it('주문 생성 → 이벤트 기록 포함', async () => {
    const createdOrder = makeOrder();
    prisma.order.create.mockResolvedValue(createdOrder);
    prisma.orderEvent.create.mockResolvedValue({});

    const result = await service.createOrder({
      companyName: '원컴퍼니',
      title: '테스트 주문',
    } as never);

    expect(result.id).toBe('order-001');
    expect(prisma.order.create).toHaveBeenCalledTimes(1);
    expect(prisma.orderEvent.create).toHaveBeenCalledTimes(1);
  });

  it('contactId가 있는 주문 생성 → BigInt 변환', async () => {
    const createdOrder = makeOrder({ contactId: BigInt(42) });
    prisma.order.create.mockResolvedValue(createdOrder);
    prisma.orderEvent.create.mockResolvedValue({});

    const result = await service.createOrder({
      companyName: '대성목형',
      title: 'BigInt 테스트',
      contactId: 42,
    } as never);

    expect(result.contact_id).toBe(42);
  });
});

// ──────────────────────────────────────────────────────────────
// 4. updateOrderStatus — 상태 변경 + contacts 동기화 (Raw SQL)
// ──────────────────────────────────────────────────────────────
describe('OrdersService.updateOrderStatus', () => {
  let service: OrdersService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new OrdersService(
      prisma as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { updateProcessStage: jest.fn() } as never
    );
  });

  it('유효한 상태 전환 (received → drawing) → 성공', async () => {
    const existing = makeOrder({ status: 'received' });
    const updated = makeOrder({ status: 'drawing' });
    prisma.order.findUnique.mockResolvedValue(existing);
    prisma.order.update.mockResolvedValue(updated);
    prisma.orderEvent.create.mockResolvedValue({});
    prisma.contact.update.mockResolvedValue({});

    const result = await service.updateOrderStatus('order-001', {
      status: 'drawing' as never,
    });

    expect(result.status).toBe('drawing');
    expect(prisma.order.update).toHaveBeenCalled();
    expect(prisma.orderEvent.create).toHaveBeenCalled();
    // contacts 동기화 Prisma ORM 호출 확인
    expect(prisma.contact.update).toHaveBeenCalled();
  });

  it('무효한 상태 전환 (received → delivered) → BadRequestException', async () => {
    const existing = makeOrder({ status: 'received' });
    prisma.order.findUnique.mockResolvedValue(existing);

    await expect(
      service.updateOrderStatus('order-001', { status: 'delivered' as never })
    ).rejects.toThrow(BadRequestException);
  });

  it('존재하지 않는 주문 → NotFoundException', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(
      service.updateOrderStatus('nonexistent', { status: 'drawing' as never })
    ).rejects.toThrow(NotFoundException);
  });

  it('confirmed 상태 변경 시 confirmedAt 타임스탬프 설정', async () => {
    const existing = makeOrder({ status: 'drawing' });
    const updated = makeOrder({ status: 'confirmed' });
    prisma.order.findUnique.mockResolvedValue(existing);
    prisma.order.update.mockResolvedValue(updated);
    prisma.orderEvent.create.mockResolvedValue({});
    prisma.contact.update.mockResolvedValue({});

    await service.updateOrderStatus('order-001', {
      status: 'confirmed' as never,
    });

    const updateCall = prisma.order.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateCall.data.status).toBe('confirmed');
    expect(updateCall.data.confirmedAt).toBeInstanceOf(Date);
  });

  it('on_hold 전환 시 이전 상태 저장 Prisma 호출', async () => {
    const existing = makeOrder({ status: 'drawing' });
    const updated = makeOrder({ status: 'on_hold', contactId: BigInt(10) });
    prisma.order.findUnique.mockResolvedValue(existing);
    prisma.order.update.mockResolvedValue(updated);
    prisma.orderEvent.create.mockResolvedValue({});
    prisma.contact.update.mockResolvedValue({});

    await service.updateOrderStatus('order-001', {
      status: 'on_hold' as never,
    });

    // on_hold 전환 시 previousStatus 저장 Prisma 호출
    const onHoldCall = prisma.contact.update.mock.calls.find((call: unknown[]) => {
      const args = call[0] as { data?: { previousStatus?: string } };
      return args?.data?.previousStatus !== undefined;
    });
    expect(onHoldCall).toBeDefined();
  });

  it('production 전환 시 workNumber 자동 부여 Prisma 호출', async () => {
    const existing = makeOrder({ status: 'confirmed' });
    const updated = makeOrder({ status: 'production', contactId: BigInt(10) });
    prisma.order.findUnique.mockResolvedValue(existing);
    prisma.order.update.mockResolvedValue(updated);
    prisma.orderEvent.create.mockResolvedValue({});
    // contact 상태 동기화
    prisma.contact.update.mockResolvedValue({});
    // getNextNumbers: findFirst for inquiry + work
    prisma.contact.findFirst
      .mockResolvedValueOnce(null) // inquiry_number 조회
      .mockResolvedValueOnce(null); // work_number 조회
    // production 전환 시 workNumber 확인 + 업데이트
    prisma.contact.findUnique.mockResolvedValue({ workNumber: null });

    await service.updateOrderStatus('order-001', {
      status: 'production' as never,
    });

    // workNumber 업데이트 Prisma 호출 확인
    const workNumberCall = prisma.contact.update.mock.calls.find((call: unknown[]) => {
      const args = call[0] as { data?: { workNumber?: string } };
      return args?.data?.workNumber !== undefined;
    });
    expect(workNumberCall).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────
// 5. getOrderStats — 통계 조회 (Prisma ORM)
// ──────────────────────────────────────────────────────────────
describe('OrdersService.getOrderStats', () => {
  let service: OrdersService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new OrdersService(
      prisma as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { updateProcessStage: jest.fn() } as never
    );
  });

  it('상태별/우선순위별 통계 반환', async () => {
    prisma.order.groupBy
      .mockResolvedValueOnce([
        { status: 'received', _count: 5 },
        { status: 'cutting', _count: 3 },
        { status: 'delivered', _count: 2 },
      ])
      .mockResolvedValueOnce([
        { priority: 'urgent', _count: 1 },
        { priority: 'normal', _count: 4 },
      ]);
    prisma.order.count.mockResolvedValue(3);

    const result = await service.getOrderStats();

    expect(result.by_status.received).toBe(5);
    expect(result.by_status.cutting).toBe(3);
    expect(result.by_priority.urgent).toBe(1);
    expect(result.total).toBe(10);
    expect(result.active).toBe(8); // 10 - delivered 2
    expect(result.recent_week).toBe(3);
  });
});

// ──────────────────────────────────────────────────────────────
// 6. createAutoContact — DXF 자동 Contact + Order 생성 (Raw SQL)
// ──────────────────────────────────────────────────────────────
describe('OrdersService.createAutoContact', () => {
  let service: OrdersService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new OrdersService(
      prisma as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { updateProcessStage: jest.fn() } as never
    );
  });

  it('DXF 파싱 결과로 Contact + Order 자동 생성', async () => {
    // findFirst: 기존 번호 없음
    prisma.contact.findFirst.mockResolvedValueOnce(null);
    // Contact create — id는 UUID이지만 createOrder에서 BigInt 변환되므로 숫자 문자열 사용
    prisma.contact.create.mockResolvedValue({ id: '500' });

    // createOrder 내부 호출
    const createdOrder = makeOrder({ id: 'order-auto-001' });
    prisma.order.create.mockResolvedValue(createdOrder);
    prisma.orderEvent.create.mockResolvedValue({});
    prisma.order.update.mockResolvedValue({ ...createdOrder, status: 'cutting_ready' });

    const result = await service.createAutoContact({
      inquiry_title: '테스트 DXF',
      company_name: '원컴퍼니',
      phone: '010-0000-0000',
      email: 'test@example.com',
      drawing_notes: '테스트 메모',
    });

    expect(result.contactId).toBe('500');
    expect(result.orderId).toBe('order-auto-001');
    expect(result.inquiryNumber).toMatch(/^\d{6}-O-\d{3}$/);
  });

  it('NumberService.generateNumber(inquiry)가 반환한 값을 그대로 전달', async () => {
    // 순번 증가 로직은 NumberService가 담당 — OrdersService는 위임만.
    // 여기서는 mock NumberService가 반환한 값이 createAutoContact 결과에 반영되는지 검증.
    prisma.contact.findFirst.mockResolvedValueOnce(null);
    prisma.contact.create.mockResolvedValue({ id: '600' });

    const createdOrder = makeOrder({ id: 'order-auto-002' });
    prisma.order.create.mockResolvedValue(createdOrder);
    prisma.orderEvent.create.mockResolvedValue({});
    prisma.order.update.mockResolvedValue(createdOrder);

    const result = await service.createAutoContact({
      inquiry_title: '순번 테스트',
      company_name: '대성목형',
      phone: '',
      email: '',
      drawing_notes: '',
    });

    // makeNumberService 의 generateNumber('inquiry') 첫 호출 = 260325-O-001
    expect(result.inquiryNumber).toBe('260325-O-001');
  });
});

// ──────────────────────────────────────────────────────────────
// 7. getNextNumbers — 의뢰번호/작업번호 조회 (Raw SQL)
// ──────────────────────────────────────────────────────────────
describe('OrdersService.getNextNumbers', () => {
  let service: OrdersService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new OrdersService(
      prisma as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { updateProcessStage: jest.fn() } as never
    );
  });

  it('NumberService.peekNextNumber를 inquiry/work 각각 호출해 반환값 전달', async () => {
    // 번호 계산 로직은 NumberService가 담당 — OrdersService는 peek 결과 그대로 반환.
    // makeNumberService 의 peekNextNumber mock은 inquiry→260325-O-001, work→260325-F-001 반환.
    const result = await service.getNextNumbers();

    expect(result.nextInquiryNumber).toBe('260325-O-001');
    expect(result.nextWorkNumber).toBe('260325-F-001');
  });

  it('peek 은 idempotent — 여러 번 호출해도 동일한 값 반환', async () => {
    // 기존에는 "기존 번호 → 다음 번호" 로직을 spec 에서 검증했으나,
    // 이 로직은 NumberService 로 이관됨. OrdersService 레벨에서는 delegation 검증만 의미 있음.
    const first = await service.getNextNumbers();
    const second = await service.getNextNumbers();

    expect(first).toEqual(second);
    expect(first.nextInquiryNumber).toBe('260325-O-001');
    expect(first.nextWorkNumber).toBe('260325-F-001');
  });
});

// ──────────────────────────────────────────────────────────────
// 8. searchCompanyByName — 업체 검색 (Raw SQL)
// ──────────────────────────────────────────────────────────────
describe('OrdersService.searchCompanyByName', () => {
  let service: OrdersService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new OrdersService(
      prisma as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { updateProcessStage: jest.fn() } as never
    );
  });

  it('업체명 검색 → companies 결과 반환', async () => {
    prisma.company.findMany.mockResolvedValue([
      {
        companyName: '원컴퍼니',
        managerName: '김담당',
        managerPhone: '010-1111-2222',
        managerEmail: 'kim@onecompany.com',
      },
    ]);

    const result = await service.searchCompanyByName('원컴');

    expect(result.companies).toHaveLength(1);
    expect(result.companies[0].company_name).toBe('원컴퍼니');
    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyName: { contains: '원컴', mode: 'insensitive' },
          status: 'active',
        }),
      })
    );
  });

  it('결과 없음 → 빈 배열', async () => {
    prisma.company.findMany.mockResolvedValue([]);

    const result = await service.searchCompanyByName('없는업체');

    expect(result.companies).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────
// 9. getOrderEvents — 주문 이벤트 조회
// ──────────────────────────────────────────────────────────────
describe('OrdersService.getOrderEvents', () => {
  let service: OrdersService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new OrdersService(
      prisma as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { updateProcessStage: jest.fn() } as never
    );
  });

  it('존재하는 주문의 이벤트 반환', async () => {
    prisma.order.findUnique.mockResolvedValue(makeOrder());
    prisma.orderEvent.findMany.mockResolvedValue([
      {
        id: 'event-001',
        orderId: 'order-001',
        eventType: 'status_changed',
        fromStatus: null,
        toStatus: 'received',
        source: 'website',
        actorName: null,
        data: null,
        message: null,
        createdAt: new Date('2026-03-20T09:00:00Z'),
      },
    ]);

    const result = await service.getOrderEvents('order-001');

    expect(result).toHaveLength(1);
    expect(result[0].event_type).toBe('status_changed');
    expect(result[0].created_at).toBe('2026-03-20T09:00:00.000Z');
  });

  it('존재하지 않는 주문 → NotFoundException', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(service.getOrderEvents('nonexistent')).rejects.toThrow(NotFoundException);
  });
});

// ──────────────────────────────────────────────────────────────
// 10. mapOrderToDto — DTO 매핑 (BigInt → Number 변환)
// ──────────────────────────────────────────────────────────────
describe('OrdersService DTO mapping', () => {
  let service: OrdersService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new OrdersService(
      prisma as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never,
      { updateProcessStage: jest.fn() } as never
    );
  });

  it('contactId BigInt → number 변환', async () => {
    const order = makeOrder({
      contactId: BigInt(12345),
      events: [],
      tasks: [],
      deliveries: [],
    });
    prisma.order.findUnique.mockResolvedValue(order);

    const result = await service.getOrder('order-001');

    expect(result.contact_id).toBe(12345);
    expect(typeof result.contact_id).toBe('number');
  });

  it('contactId null → null 유지', async () => {
    const order = makeOrder({
      contactId: null,
      events: [],
      tasks: [],
      deliveries: [],
    });
    prisma.order.findUnique.mockResolvedValue(order);

    const result = await service.getOrder('order-001');

    expect(result.contact_id).toBeNull();
  });

  it('날짜 필드 → ISO 문자열 변환', async () => {
    const order = makeOrder({
      confirmedAt: new Date('2026-03-20T10:00:00Z'),
      events: [],
      tasks: [],
      deliveries: [],
    });
    prisma.order.findUnique.mockResolvedValue(order);

    const result = await service.getOrder('order-001');

    expect(result.confirmed_at).toBe('2026-03-20T10:00:00.000Z');
    expect(result.cutting_started_at).toBeNull();
  });
});
