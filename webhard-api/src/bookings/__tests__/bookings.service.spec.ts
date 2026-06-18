import { BadRequestException } from '@nestjs/common';
import { BookingsService } from '../bookings.service';

// ============================================================
// Mock factories
// ============================================================

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(1),
    visitDate: new Date('2026-04-01'),
    visitTimeSlot: '10:00',
    companyName: '테스트업체',
    contactId: null,
    status: 'confirmed',
    notes: null,
    createdAt: new Date('2026-03-29T00:00:00Z'),
    updatedAt: new Date('2026-03-29T00:00:00Z'),
    createdBy: 'company',
    deliveryMethod: null,
    deliveryName: null,
    deliveryPhone: null,
    deliveryAddress: null,
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    executeWithRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
    visitBooking: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue(makeBooking()),
      update: jest.fn().mockResolvedValue(makeBooking()),
      delete: jest.fn().mockResolvedValue(makeBooking()),
      count: jest.fn().mockResolvedValue(0),
    },
    contact: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    notification: {
      create: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

function makeGateway() {
  return {
    emitBookingCreated: jest.fn(),
    emitBookingUpdated: jest.fn(),
    emitBookingDeleted: jest.fn(),
  };
}

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(prismaOverrides);
  const gateway = makeGateway();
  const service = new BookingsService(prisma as never, gateway as never);
  return { service, prisma, gateway };
}

// ============================================================
// findAll
// ============================================================

describe('BookingsService.findAll', () => {
  it('예약 목록을 snake_case로 반환한다', async () => {
    const booking = makeBooking();
    const { service, prisma } = makeService();
    (prisma.visitBooking.findMany as jest.Mock).mockResolvedValue([booking]);

    const result = await service.findAll({});

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 1,
      visit_date: '2026-04-01',
      visit_time_slot: '10:00',
      company_name: '테스트업체',
      status: 'confirmed',
    });
  });

  it('contact_id가 있으면 예약에 연결된 문의 요약을 contacts로 반환한다', async () => {
    const booking = makeBooking({ contactId: '4f8eb880-1aec-44e5-87d3-7f5f7cd45b4c' });
    const { service, prisma } = makeService();
    (prisma.visitBooking.findMany as jest.Mock).mockResolvedValue([booking]);
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([
      {
        id: '4f8eb880-1aec-44e5-87d3-7f5f7cd45b4c',
        companyName: '테스트업체',
        processStage: 'sample',
        name: '홍길동',
        status: 'received',
        inquiryTitle: '테스트업체 518테스트',
      },
    ]);

    const result = await service.findAll({ companyName: '테스트업체', status: 'confirmed' });

    expect(prisma.contact.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['4f8eb880-1aec-44e5-87d3-7f5f7cd45b4c'] } },
      select: {
        id: true,
        companyName: true,
        processStage: true,
        name: true,
        status: true,
        inquiryTitle: true,
      },
    });
    expect(result[0].contacts).toEqual({
      process_stage: 'sample',
      name: '홍길동',
      status: 'received',
      inquiry_title: '테스트업체 518테스트',
    });
  });

  it('contact_id가 다른 업체 문의를 가리키면 문의 요약을 붙이지 않는다', async () => {
    const booking = makeBooking({ contactId: '4f8eb880-1aec-44e5-87d3-7f5f7cd45b4c' });
    const { service, prisma } = makeService();
    (prisma.visitBooking.findMany as jest.Mock).mockResolvedValue([booking]);
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([
      {
        id: '4f8eb880-1aec-44e5-87d3-7f5f7cd45b4c',
        companyName: '다른업체',
        processStage: 'sample',
        name: '홍길동',
        status: 'received',
        inquiryTitle: '다른업체 비공개 문의',
      },
    ]);

    const result = await service.findAll({ companyName: '테스트업체', status: 'confirmed' });

    expect(result[0].contacts).toBeNull();
  });

  it('날짜 필터가 있으면 where.visitDate에 Date 객체 전달', async () => {
    const { service, prisma } = makeService();
    (prisma.visitBooking.findMany as jest.Mock).mockResolvedValue([]);

    await service.findAll({ date: '2026-04-01' });

    expect(prisma.visitBooking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { visitDate: new Date('2026-04-01') },
      })
    );
  });

  it('startDate/endDate 범위 필터 전달', async () => {
    const { service, prisma } = makeService();
    (prisma.visitBooking.findMany as jest.Mock).mockResolvedValue([]);

    await service.findAll({ startDate: '2026-04-01', endDate: '2026-04-30' });

    expect(prisma.visitBooking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          visitDate: {
            gte: new Date('2026-04-01'),
            lte: new Date('2026-04-30'),
          },
        },
      })
    );
  });
});

describe('BookingsService notifications', () => {
  it('예약 생성 시 통합관리 알림을 생성한다', async () => {
    const { service, prisma } = makeService();
    prisma.visitBooking.create.mockResolvedValueOnce(makeBooking({ contactId: 'contact-1' }));

    await service.create({
      visitDate: '2026-04-01',
      visitTimeSlot: '10:00',
      companyName: '테스트업체',
      contactId: 'contact-1',
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userType: 'admin',
        userId: null,
        type: 'booking_created',
        title: '방문 예약 생성',
        metadata: expect.objectContaining({
          bookingId: '1',
          contactId: 'contact-1',
          link: '/admin/integration/bookings',
        }),
      }),
    });
  });
});

// ============================================================
// findById
// ============================================================

describe('BookingsService.findById', () => {
  it('존재하는 예약 반환', async () => {
    const booking = makeBooking({ id: BigInt(42) });
    const { service, prisma } = makeService();
    (prisma.visitBooking.findUnique as jest.Mock).mockResolvedValue(booking);

    const result = await service.findById(BigInt(42));

    expect(result).not.toBeNull();
    expect(result?.id).toBe(42);
  });

  it('존재하지 않으면 null 반환', async () => {
    const { service, prisma } = makeService();
    (prisma.visitBooking.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await service.findById(BigInt(999));

    expect(result).toBeNull();
  });
});

// ============================================================
// create
// ============================================================

describe('BookingsService.create', () => {
  const createData = {
    visitDate: '2026-04-01',
    visitTimeSlot: '10:00',
    companyName: '테스트업체',
  };

  it('예약을 생성하고 Gateway 이벤트 emit', async () => {
    const { service, prisma, gateway } = makeService();
    (prisma.visitBooking.count as jest.Mock).mockResolvedValue(0);
    (prisma.visitBooking.create as jest.Mock).mockResolvedValue(makeBooking());

    const result = await service.create(createData);

    expect(result.company_name).toBe('테스트업체');
    expect(gateway.emitBookingCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it('타임슬롯이 2건 이상이면 BadRequestException', async () => {
    const { service, prisma } = makeService();
    (prisma.visitBooking.count as jest.Mock).mockResolvedValue(2);

    await expect(service.create(createData)).rejects.toThrow(BadRequestException);
    await expect(service.create(createData)).rejects.toThrow('최대 2건');
  });

  it('BigInt id를 Number로 변환하여 반환', async () => {
    const { service, prisma } = makeService();
    (prisma.visitBooking.count as jest.Mock).mockResolvedValue(0);
    (prisma.visitBooking.create as jest.Mock).mockResolvedValue(makeBooking({ id: BigInt(100) }));

    const result = await service.create(createData);

    expect(typeof result.id).toBe('number');
    expect(result.id).toBe(100);
  });
});

// ============================================================
// update
// ============================================================

describe('BookingsService.update', () => {
  it('예약 수정 후 Gateway 이벤트 emit', async () => {
    const updated = makeBooking({ status: 'cancelled' });
    const { service, prisma, gateway } = makeService();
    (prisma.visitBooking.update as jest.Mock).mockResolvedValue(updated);

    const result = await service.update(BigInt(1), { status: 'cancelled' });

    expect(result.status).toBe('cancelled');
    expect(gateway.emitBookingUpdated).toHaveBeenCalled();
  });

  it('status 를 DB 에 전달할 때 where.id 가 정확히 일치', async () => {
    const { service, prisma } = makeService();
    (prisma.visitBooking.update as jest.Mock).mockResolvedValue(
      makeBooking({ id: BigInt(42), status: 'confirmed' })
    );

    await service.update(BigInt(42), { status: 'confirmed' });

    expect(prisma.visitBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BigInt(42) },
        data: expect.objectContaining({ status: 'confirmed' }),
      })
    );
  });

  it('adminNote 는 notes 컬럼으로 매핑되어 저장 (스키마 단일화)', async () => {
    const { service, prisma } = makeService();
    (prisma.visitBooking.update as jest.Mock).mockResolvedValue(
      makeBooking({ notes: '관리자 메모입니다' })
    );

    await service.update(BigInt(1), { adminNote: '관리자 메모입니다' });

    expect(prisma.visitBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notes: '관리자 메모입니다' }),
      })
    );
  });

  it('emit payload 는 snake_case 로 변환된 booking', async () => {
    const updated = makeBooking({ status: 'cancelled' });
    const { service, prisma, gateway } = makeService();
    (prisma.visitBooking.update as jest.Mock).mockResolvedValue(updated);

    await service.update(BigInt(1), { status: 'cancelled' });

    expect(gateway.emitBookingUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        status: 'cancelled',
        visit_date: expect.any(String),
        visit_time_slot: expect.any(String),
      })
    );
  });
});

// ============================================================
// delete
// ============================================================

describe('BookingsService.delete', () => {
  it('예약 삭제 후 success: true 반환 및 Gateway emit', async () => {
    const { service, prisma, gateway } = makeService();
    (prisma.visitBooking.delete as jest.Mock).mockResolvedValue(makeBooking());

    const result = await service.delete(BigInt(1));

    expect(result.success).toBe(true);
    expect(gateway.emitBookingDeleted).toHaveBeenCalledWith('1');
  });

  it('prisma.visitBooking.delete 가 where.id 와 함께 호출', async () => {
    const { service, prisma } = makeService();
    (prisma.visitBooking.delete as jest.Mock).mockResolvedValue(makeBooking({ id: BigInt(99) }));

    await service.delete(BigInt(99));

    expect(prisma.visitBooking.delete).toHaveBeenCalledWith({ where: { id: BigInt(99) } });
  });
});

// ============================================================
// getAvailableSlots
// ============================================================

describe('BookingsService.getAvailableSlots', () => {
  it('슬롯별 예약 건수를 반환', async () => {
    const { service, prisma } = makeService();
    (prisma.visitBooking.findMany as jest.Mock).mockResolvedValue([
      { visitTimeSlot: '10:00' },
      { visitTimeSlot: '10:00' },
      { visitTimeSlot: '14:00' },
    ]);

    const result = await service.getAvailableSlots('2026-04-01');

    expect(result.date).toBe('2026-04-01');
    expect(result.slotCounts['10:00']).toBe(2);
    expect(result.slotCounts['14:00']).toBe(1);
  });

  it('응답에 maxCapacity 필드가 포함된다 (task 23 phase 7)', async () => {
    const { service, prisma } = makeService();
    (prisma.visitBooking.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.getAvailableSlots('2026-04-01');

    expect(result.maxCapacity).toBe(2);
  });

  it('기존 slotCounts 구조를 유지한다 (하위 호환)', async () => {
    const { service, prisma } = makeService();
    (prisma.visitBooking.findMany as jest.Mock).mockResolvedValue([{ visitTimeSlot: '10:00' }]);

    const result = await service.getAvailableSlots('2026-04-01');

    expect(result).toEqual(
      expect.objectContaining({
        date: '2026-04-01',
        slotCounts: expect.any(Object),
        maxCapacity: expect.any(Number),
      })
    );
    expect(typeof result.slotCounts).toBe('object');
  });
});

// ============================================================
// findByContactId
// ============================================================

describe('BookingsService.findByContactId', () => {
  it('contactId로 예약 목록 반환', async () => {
    const { service, prisma } = makeService();
    (prisma.visitBooking.findMany as jest.Mock).mockResolvedValue([
      makeBooking({ contactId: 'contact-1' }),
    ]);

    const result = await service.findByContactId('contact-1');

    expect(result).toHaveLength(1);
    expect(result[0].contact_id).toBe('contact-1');
  });
});
