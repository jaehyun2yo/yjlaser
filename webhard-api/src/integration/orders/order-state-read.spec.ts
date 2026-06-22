import { OrdersService } from './orders.service';
import { mapOrderStateReadModel } from './order-state-read';

function makeOrder(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-03-20T09:00:00Z');
  return {
    id: 'order-state-001',
    contactId: null,
    inquiryNumber: '260320-O-001',
    companyName: '원컴퍼니',
    customerName: null,
    customerPhone: null,
    title: '상태 축 조회 테스트',
    description: null,
    orderType: 'standard',
    status: 'received',
    priority: 'normal',
    drawingFileCount: 0,
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

function makePrisma(order: Record<string, unknown>) {
  return {
    executeWithRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
    order: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([order]),
      findUnique: jest.fn().mockResolvedValue({
        ...order,
        events: [],
        tasks: [],
        deliveries: [],
      }),
    },
    contact: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
}

function makeService(prisma: object) {
  return new OrdersService(
    prisma as never,
    {} as never,
    { recordChange: jest.fn() } as never,
    { updateProcessStage: jest.fn() } as never
  );
}

describe('Order state read model', () => {
  it('기존 Order.status만 있는 주문은 status를 유지하고 신규 상태 축을 null로 반환한다', () => {
    expect(mapOrderStateReadModel(makeOrder())).toEqual({
      production_status: null,
      confirmation_status: null,
      classification_status: null,
      nesting_status: null,
      billing_status: null,
    });
  });

  it('신규 상태 축이 있는 주문은 snake_case order_state로 병행 노출한다', () => {
    expect(
      mapOrderStateReadModel(
        makeOrder({
          productionStatus: 'DXF_READY',
          confirmationStatus: 'CONFIRMED',
          classificationStatus: 'CLASSIFIED',
          nestingStatus: 'NESTING_PENDING',
          billingStatus: 'BILLING_READY',
        })
      )
    ).toEqual({
      production_status: 'DXF_READY',
      confirmation_status: 'CONFIRMED',
      classification_status: 'CLASSIFIED',
      nesting_status: 'NESTING_PENDING',
      billing_status: 'BILLING_READY',
    });
  });

  it('주문 목록과 상세 조회는 기존 status와 신규 order_state를 함께 반환한다', async () => {
    const order = makeOrder({
      status: 'received',
      productionStatus: 'DXF_READY',
      classificationStatus: 'CLASSIFIED',
    });
    const prisma = makePrisma(order);
    const service = makeService(prisma);

    const list = await service.getOrders({ page: 1, limit: 50 });
    const detail = await service.getOrder('order-state-001');

    expect(list.orders[0]).toMatchObject({
      status: 'received',
      order_state: {
        production_status: 'DXF_READY',
        confirmation_status: null,
        classification_status: 'CLASSIFIED',
        nesting_status: null,
        billing_status: null,
      },
    });
    expect(detail).toMatchObject({
      status: 'received',
      order_state: {
        production_status: 'DXF_READY',
        classification_status: 'CLASSIFIED',
      },
    });
  });
});
