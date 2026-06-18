import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberService } from '../../number/number.service';
import {
  CreateOrderDto,
  UpdateOrderDto,
  UpdateOrderStatusDto,
  OrderQueryDto,
  WorkshopQueryDto,
  OrderStatus,
  VALID_STATUS_TRANSITIONS,
} from './dto/order.dto';
import { ContactTimelineService } from '../../contacts/contact-timeline.service';
import { ContactsService } from '../../contacts/contacts.service';
import { UpdateProcessStageDto, VALID_PROCESS_STAGES } from './dto/order.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private numberService: NumberService,
    private timelineService: ContactTimelineService,
    private contactsService: ContactsService
  ) {}

  async getOrders(query: OrderQueryDto) {
    const {
      status,
      statuses,
      companyName,
      priority,
      contactId,
      workNumber,
      page = 1,
      limit = 50,
      dateFrom,
      dateTo,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = query;

    const where: Record<string, unknown> = {};
    if (statuses) {
      where.status = { in: statuses.split(',').map((s) => s.trim()) };
    } else if (status) {
      where.status = status;
    }
    if (companyName) where.companyName = { contains: companyName, mode: 'insensitive' };
    if (priority) where.priority = priority;
    if (contactId) where.contactId = BigInt(contactId);

    // workNumber → Contact에서 inquiryNumber를 찾아 Order 필터링
    if (workNumber) {
      const contact = await this.prisma.contact.findFirst({
        where: { workNumber },
        select: { inquiryNumber: true, workNumber: true },
      });
      if (contact?.inquiryNumber) {
        where.inquiryNumber = contact.inquiryNumber;
      } else {
        // Contact이 없거나 inquiryNumber가 null → 결과 없음
        where.inquiryNumber = '__no_match__';
      }
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo);
    }

    const [total, orders] = await this.prisma.executeWithRetry(
      () =>
        Promise.all([
          this.prisma.order.count({ where }),
          this.prisma.order.findMany({
            where,
            include: { _count: { select: { events: true, tasks: true, deliveries: true } } },
            orderBy: this.buildOrderBy(sortBy, sortOrder),
            skip: (page - 1) * limit,
            take: limit,
          }),
        ]),
      { operationName: 'getOrders' }
    );

    return {
      orders: orders.map(this.mapOrderToDto),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  async getOrderStats() {
    const [statusCounts, priorityCounts, recentOrders] = await this.prisma.executeWithRetry(
      () =>
        Promise.all([
          this.prisma.order.groupBy({ by: ['status'], _count: true }),
          this.prisma.order.groupBy({
            by: ['priority'],
            _count: true,
            where: { status: { notIn: ['delivered', 'closed'] } },
          }),
          this.prisma.order.count({
            where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          }),
        ]),
      { operationName: 'getOrderStats' }
    );

    const statusMap: Record<string, number> = {};
    statusCounts.forEach((s) => {
      statusMap[s.status] = s._count;
    });

    const priorityMap: Record<string, number> = {};
    priorityCounts.forEach((p) => {
      priorityMap[p.priority] = p._count;
    });

    return {
      by_status: statusMap,
      by_priority: priorityMap,
      recent_week: recentOrders,
      total: Object.values(statusMap).reduce((a, b) => a + b, 0),
      active: Object.entries(statusMap)
        .filter(([k]) => !['delivered', 'closed'].includes(k))
        .reduce((a, [, v]) => a + v, 0),
    };
  }

  async getOrder(id: string) {
    const order = await this.prisma.executeWithRetry(
      () =>
        this.prisma.order.findUnique({
          where: { id },
          include: {
            events: { orderBy: { createdAt: 'desc' }, take: 50 },
            tasks: {
              include: { machine: { select: { name: true } } },
              orderBy: { createdAt: 'desc' },
            },
            deliveries: { orderBy: { createdAt: 'desc' } },
          },
        }),
      { operationName: 'getOrder' }
    );

    if (!order) throw new NotFoundException('Order not found');

    // Fetch delivery proof image from related Contact via inquiryNumber
    let deliveryProofImage: string | null = null;
    if (order.inquiryNumber) {
      const contact = await this.prisma.executeWithRetry(
        () =>
          this.prisma.contact.findFirst({
            where: { inquiryNumber: order.inquiryNumber! },
            select: { id: true, deliveryProofImage: true },
          }),
        { operationName: 'getOrderContactProofImage' }
      );
      deliveryProofImage = contact?.deliveryProofImage ?? null;
      return {
        ...this.mapOrderDetailToDto(order),
        deliveryProofImage,
        contactUuid: contact?.id ?? null,
      };
    }

    return { ...this.mapOrderDetailToDto(order), deliveryProofImage, contactUuid: null };
  }

  async createOrder(dto: CreateOrderDto) {
    const order = await this.prisma.executeWithRetry(
      () =>
        this.prisma.order.create({
          data: {
            contactId: dto.contactId ? BigInt(dto.contactId) : null,
            inquiryNumber: dto.inquiryNumber,
            companyName: dto.companyName,
            customerName: dto.customerName,
            customerPhone: dto.customerPhone,
            title: dto.title,
            description: dto.description,
            orderType: dto.orderType ?? 'standard',
            priority: dto.priority ?? 'normal',
            webhardFolderId: dto.webhardFolderId,
            deliveryMethod: dto.deliveryMethod,
            deliveryAddress: dto.deliveryAddress,
            memo: dto.memo,
          },
        }),
      { operationName: 'createOrder' }
    );

    // 주문 생성 이벤트 기록
    await this.createOrderEvent(order.id, 'order_created', null, 'inquiry_received', 'website');

    this.logger.log(`Order created: ${order.id} (${dto.companyName})`);
    return this.mapOrderToDto(order);
  }

  async updateOrder(id: string, dto: UpdateOrderDto) {
    const existing = await this.prisma.order.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Order not found');

    const data: Record<string, unknown> = {};
    if (dto.companyName !== undefined) data.companyName = dto.companyName;
    if (dto.customerName !== undefined) data.customerName = dto.customerName;
    if (dto.customerPhone !== undefined) data.customerPhone = dto.customerPhone;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.webhardFolderId !== undefined) data.webhardFolderId = dto.webhardFolderId;
    if (dto.drawingFileCount !== undefined) data.drawingFileCount = dto.drawingFileCount;
    if (dto.dxfClassifiedCount !== undefined) data.dxfClassifiedCount = dto.dxfClassifiedCount;
    if (dto.dxfTotalPrice !== undefined) data.dxfTotalPrice = dto.dxfTotalPrice;
    if (dto.deliveryMethod !== undefined) data.deliveryMethod = dto.deliveryMethod;
    if (dto.deliveryAddress !== undefined) data.deliveryAddress = dto.deliveryAddress;
    if (dto.deliveryNote !== undefined) data.deliveryNote = dto.deliveryNote;
    if (dto.memo !== undefined) data.memo = dto.memo;

    const order = await this.prisma.executeWithRetry(
      () => this.prisma.order.update({ where: { id }, data }),
      { operationName: 'updateOrder' }
    );

    return this.mapOrderToDto(order);
  }

  async updateOrderStatus(id: string, dto: UpdateOrderStatusDto) {
    const existing = await this.prisma.order.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Order not found');

    // 상태 전환 유효성 검사
    const validNextStatuses = VALID_STATUS_TRANSITIONS[existing.status] || [];
    if (!validNextStatuses.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from '${existing.status}' to '${dto.status}'. Valid: ${validNextStatuses.join(', ')}`
      );
    }

    // 상태별 타임스탬프 업데이트 (통합 8단계)
    const data: Record<string, unknown> = { status: dto.status };
    if (dto.status === 'confirmed') data.confirmedAt = new Date();
    if (dto.status === 'cutting') data.cuttingStartedAt = new Date();
    if (dto.status === 'finishing') data.postProcessingStartedAt = new Date();
    if (dto.status === 'delivered') data.deliveredAt = new Date();

    const order = await this.prisma.executeWithRetry(
      () => this.prisma.order.update({ where: { id }, data }),
      { operationName: 'updateOrderStatus' }
    );

    // 이벤트 기록
    await this.createOrderEvent(
      id,
      'status_changed',
      existing.status,
      dto.status,
      'admin',
      dto.actorName,
      null,
      dto.message
    );

    this.logger.log(`Order ${id} status: ${existing.status} -> ${dto.status}`);

    // Sync Contact table: collect all field updates in one object, then single update call
    if (order.contactId) {
      const contactId = String(order.contactId);
      const now = new Date();

      // Timestamp fields per status transition
      const timestampMap: Record<string, string> = {
        confirmed: 'confirmedAt',
        production: 'productionStartedAt',
        cutting: 'cuttingStartedAt',
        finishing: 'finishingStartedAt',
      };

      const contactUpdate: Record<string, unknown> = {
        status: dto.status,
        updatedAt: now,
      };

      // Add timestamp for this status if applicable
      const tsField = timestampMap[dto.status];
      if (tsField) contactUpdate[tsField] = now;

      // on_hold: save previous status for later restoration
      if (dto.status === 'on_hold') {
        contactUpdate.previousStatus = existing.status;
      }

      // Restoring from on_hold: clear previousStatus
      if (existing.status === 'on_hold' && dto.status !== 'on_hold') {
        contactUpdate.previousStatus = null;
      }

      try {
        await this.prisma.contact.update({ where: { id: contactId }, data: contactUpdate });
      } catch (syncError) {
        this.logger.warn(`Contact sync failed for order ${id}: ${syncError}`);
      }
    }

    // Auto-assign work_number on confirmed → production (idempotent)
    if (dto.status === 'production' && order.contactId) {
      try {
        const contact = await this.prisma.contact.findUnique({
          where: { id: String(order.contactId) },
          select: { workNumber: true },
        });
        if (contact && !contact.workNumber) {
          const workNumber = await this.numberService.generateNumber('work');
          await this.prisma.contact.update({
            where: { id: String(order.contactId) },
            data: { workNumber, productionStartedAt: new Date(), updatedAt: new Date() },
          });
        }
      } catch (error) {
        this.logger.error('현장번호 자동 부여 실패', {
          orderId: id,
          contactId: order.contactId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    return this.mapOrderToDto(order);
  }

  async getOrderEvents(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');

    const events = await this.prisma.executeWithRetry(
      () =>
        this.prisma.orderEvent.findMany({
          where: { orderId: id },
          orderBy: { createdAt: 'desc' },
        }),
      { operationName: 'getOrderEvents' }
    );

    return events.map((e) => ({
      id: e.id,
      order_id: e.orderId,
      event_type: e.eventType,
      from_status: e.fromStatus,
      to_status: e.toStatus,
      source: e.source,
      actor_name: e.actorName,
      data: e.data,
      message: e.message,
      created_at: e.createdAt.toISOString(),
    }));
  }

  /**
   * DXF 파일 파싱 결과로 Contact + Order 자동 생성
   * 관리프로그램에서 DXF 파일 분류 시 호출
   */
  async createAutoContact(dto: {
    inquiry_title: string;
    company_name: string;
    phone: string;
    email: string;
    drawing_notes: string;
  }) {
    // 1. 문의번호 + 현장번호 자동 생성 (NumberService 원자적 UPSERT)
    const inquiryNumber = await this.numberService.generateNumber('inquiry');
    const workNumber = await this.numberService.generateNumber('work');

    // 2. Contact INSERT
    const newContact = await this.prisma.contact.create({
      data: {
        inquiryNumber,
        inquiryTitle: dto.inquiry_title,
        companyName: dto.company_name,
        contactType: 'company',
        name: '자동등록',
        position: '-',
        phone: dto.phone || '-',
        email: dto.email || 'auto@yjlaser.com',
        referralSource: '자동생성',
        drawingType: 'have',
        drawingNotes: dto.drawing_notes || '',
        workNumber,
        inquiryType: 'mold_request',
        status: 'cutting',
        processStage: 'cutting',
        productionStartedAt: new Date(),
      },
      select: { id: true },
    });

    const contactId = newContact?.id;

    // 3. Create Order linked via inquiryNumber (Contact.id is UUID String, Order.contactId is BigInt — not compatible)
    const order = await this.createOrder({
      inquiryNumber: inquiryNumber,
      companyName: dto.company_name,
      title: dto.inquiry_title,
      orderType: 'standard',
    } as CreateOrderDto);

    // 4. Order 상태를 cutting_ready로 설정
    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'cutting_ready' },
    });

    await this.createOrderEvent(
      order.id,
      'status_changed',
      'inquiry_received',
      'cutting_ready',
      'management_program',
      'system',
      null,
      'DXF 자동 동기화 - 레이저가공 대기'
    );

    this.logger.log(`Auto contact+order created: ${dto.company_name} (${inquiryNumber})`);

    // Timeline: record auto-creation from DXF management
    await this.timelineService.recordChange({
      contactId,
      changeType: 'created',
      toStatus: 'cutting',
      toStage: 'cutting',
      actorType: 'system',
      companyName: dto.company_name,
      source: 'order_auto',
      note: '관리프로그램 DXF 자동 생성',
    });

    return {
      contactId,
      orderId: order.id,
      inquiryNumber,
    };
  }

  /**
   * 내부 헬퍼: OrderEvent 생성
   */
  async createOrderEvent(
    orderId: string,
    eventType: string,
    fromStatus: string | null,
    toStatus: string | null,
    source: string,
    actorName?: string | null,
    data?: unknown,
    message?: string | null
  ) {
    return this.prisma.orderEvent.create({
      data: {
        orderId,
        eventType,
        fromStatus,
        toStatus,
        source,
        actorName: actorName ?? null,
        data: data ? (data as object) : undefined,
        message: message ?? null,
      },
    });
  }

  async getWorkshopOrders(query: WorkshopQueryDto) {
    const { stage, period, search } = query;

    const stageStatuses: Record<string, string[]> = {
      cutting: ['cutting_ready', 'cutting_in_progress'],
      post_processing: ['post_processing'],
      delivery: ['delivery_ready', 'delivering'],
    };

    let statuses: string[];
    if (stage) {
      statuses = stageStatuses[stage] || [];
    } else {
      statuses = [
        ...stageStatuses.cutting,
        ...stageStatuses.post_processing,
        ...stageStatuses.delivery,
      ];
    }

    const where: Record<string, unknown> = {
      status: { in: statuses },
    };

    if (period === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      where.createdAt = { gte: today };
    } else if (period === 'week') {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      where.createdAt = { gte: weekAgo };
    }

    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { inquiryNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orders = await this.prisma.executeWithRetry(
      () =>
        this.prisma.order.findMany({
          where,
          orderBy: [{ createdAt: 'asc' }],
          select: {
            id: true,
            inquiryNumber: true,
            companyName: true,
            title: true,
            status: true,
            priority: true,
            memo: true,
            dxfTotalPrice: true,
            cuttingStartedAt: true,
            cuttingCompletedAt: true,
            postProcessingStartedAt: true,
            postProcessingCompletedAt: true,
            scheduledAutoCompleteAt: true,
            createdAt: true,
          },
        }),
      { operationName: 'getWorkshopOrders' }
    );

    // urgent를 맨 앞으로 정렬
    const sorted = orders.sort((a, b) => {
      const priorityOrder: Record<string, number> = { urgent: 0, normal: 1, low: 2 };
      const pa = priorityOrder[a.priority] ?? 1;
      const pb = priorityOrder[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const grouped = {
      cutting: sorted.filter((o) => stageStatuses.cutting.includes(o.status)),
      post_processing: sorted.filter((o) => stageStatuses.post_processing.includes(o.status)),
      delivery: sorted.filter((o) => stageStatuses.delivery.includes(o.status)),
    };

    // ISO 문자열로 변환
    const toDto = (o: (typeof sorted)[0]) => ({
      ...o,
      cuttingStartedAt: o.cuttingStartedAt?.toISOString() ?? null,
      cuttingCompletedAt: o.cuttingCompletedAt?.toISOString() ?? null,
      postProcessingStartedAt: o.postProcessingStartedAt?.toISOString() ?? null,
      postProcessingCompletedAt: o.postProcessingCompletedAt?.toISOString() ?? null,
      scheduledAutoCompleteAt: o.scheduledAutoCompleteAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    });

    return {
      orders: sorted.map(toDto),
      grouped: {
        cutting: grouped.cutting.map(toDto),
        post_processing: grouped.post_processing.map(toDto),
        delivery: grouped.delivery.map(toDto),
      },
      counts: {
        cutting: grouped.cutting.length,
        post_processing: grouped.post_processing.length,
        delivery: grouped.delivery.length,
        total: sorted.length,
      },
    };
  }

  /**
   * 당일 다음 예상 번호 조회 (읽기 전용, 번호를 소비하지 않음).
   * 주의: 근사값이며 동시 생성 시 실제 번호와 다를 수 있음.
   */
  async getNextNumbers(): Promise<{ nextInquiryNumber: string; nextWorkNumber: string }> {
    const [nextInquiryNumber, nextWorkNumber] = await Promise.all([
      this.numberService.peekNextNumber('inquiry'),
      this.numberService.peekNextNumber('work'),
    ]);

    return { nextInquiryNumber, nextWorkNumber };
  }

  /**
   * 업체명으로 companies 테이블 검색
   */
  async searchCompanyByName(name: string) {
    const companies = await this.prisma.company.findMany({
      where: {
        companyName: { contains: name, mode: 'insensitive' },
        status: 'active',
      },
      select: {
        companyName: true,
        managerName: true,
        managerPhone: true,
        managerEmail: true,
      },
      take: 1,
    });
    return {
      companies: companies.map((c) => ({
        company_name: c.companyName,
        manager_name: c.managerName,
        manager_phone: c.managerPhone,
        manager_email: c.managerEmail,
      })),
    };
  }

  private buildOrderBy(sortBy: string, sortOrder: 'asc' | 'desc') {
    const fieldMap: Record<string, string> = {
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      company_name: 'companyName',
      status: 'status',
      priority: 'priority',
      received_at: 'receivedAt',
    };
    const field = fieldMap[sortBy] || 'createdAt';
    return [{ [field]: sortOrder }];
  }

  private mapOrderToDto = (order: {
    id: string;
    contactId: bigint | null;
    inquiryNumber: string | null;
    companyName: string;
    customerName: string | null;
    customerPhone: string | null;
    title: string;
    description: string | null;
    orderType: string;
    status: string;
    priority: string;
    drawingFileCount: number;
    webhardFolderId: string | null;
    dxfClassifiedCount: number;
    dxfTotalPrice: number;
    nestingSheetCount: number | null;
    nestingUtilization: number | null;
    receivedAt: Date;
    confirmedAt: Date | null;
    cuttingStartedAt: Date | null;
    cuttingCompletedAt: Date | null;
    postProcessingStartedAt: Date | null;
    postProcessingCompletedAt: Date | null;
    deliveredAt: Date | null;
    scheduledAutoCompleteAt: Date | null;
    deliveryMethod: string | null;
    deliveryAddress: string | null;
    deliveryNote: string | null;
    memo: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count?: { events: number; tasks: number; deliveries: number };
  }) => ({
    id: order.id,
    contact_id: order.contactId ? Number(order.contactId) : null,
    inquiry_number: order.inquiryNumber,
    company_name: order.companyName,
    customer_name: order.customerName,
    customer_phone: order.customerPhone,
    title: order.title,
    description: order.description,
    order_type: order.orderType,
    status: order.status,
    priority: order.priority,
    drawing_file_count: order.drawingFileCount,
    webhard_folder_id: order.webhardFolderId,
    dxf_classified_count: order.dxfClassifiedCount,
    dxf_total_price: order.dxfTotalPrice,
    nesting_sheet_count: order.nestingSheetCount,
    nesting_utilization: order.nestingUtilization,
    received_at: order.receivedAt.toISOString(),
    confirmed_at: order.confirmedAt?.toISOString() ?? null,
    cutting_started_at: order.cuttingStartedAt?.toISOString() ?? null,
    cutting_completed_at: order.cuttingCompletedAt?.toISOString() ?? null,
    post_processing_started_at: order.postProcessingStartedAt?.toISOString() ?? null,
    post_processing_completed_at: order.postProcessingCompletedAt?.toISOString() ?? null,
    delivered_at: order.deliveredAt?.toISOString() ?? null,
    scheduled_auto_complete_at: order.scheduledAutoCompleteAt?.toISOString() ?? null,
    delivery_method: order.deliveryMethod,
    delivery_address: order.deliveryAddress,
    delivery_note: order.deliveryNote,
    memo: order.memo,
    created_at: order.createdAt.toISOString(),
    updated_at: order.updatedAt.toISOString(),
    event_count: order._count?.events ?? 0,
    task_count: order._count?.tasks ?? 0,
    delivery_count: order._count?.deliveries ?? 0,
  });

  private mapOrderDetailToDto = (
    order: Parameters<typeof this.mapOrderToDto>[0] & {
      events: Array<{
        id: string;
        orderId: string;
        eventType: string;
        fromStatus: string | null;
        toStatus: string | null;
        source: string;
        actorName: string | null;
        data: unknown;
        message: string | null;
        createdAt: Date;
      }>;
      tasks: Array<{
        id: string;
        title: string;
        status: string;
        priority: string;
        assignedTo: string | null;
        taskType: string | null;
        startedAt: Date | null;
        completedAt: Date | null;
        machine?: { name: string } | null;
        createdAt: Date;
      }>;
      deliveries: Array<{
        id: string;
        deliveryType: string;
        status: string;
        recipientName: string | null;
        scheduledDate: Date | null;
        deliveredAt: Date | null;
        trackingNumber: string | null;
        createdAt: Date;
      }>;
    }
  ) => ({
    ...this.mapOrderToDto(order),
    events: order.events.map((e) => ({
      id: e.id,
      event_type: e.eventType,
      from_status: e.fromStatus,
      to_status: e.toStatus,
      source: e.source,
      actor_name: e.actorName,
      data: e.data,
      message: e.message,
      created_at: e.createdAt.toISOString(),
    })),
    tasks: order.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      assigned_to: t.assignedTo,
      task_type: t.taskType,
      machine_name: t.machine?.name ?? null,
      started_at: t.startedAt?.toISOString() ?? null,
      completed_at: t.completedAt?.toISOString() ?? null,
      created_at: t.createdAt.toISOString(),
    })),
    deliveries: order.deliveries.map((d) => ({
      id: d.id,
      delivery_type: d.deliveryType,
      status: d.status,
      recipient_name: d.recipientName,
      scheduled_date: d.scheduledDate?.toISOString() ?? null,
      delivered_at: d.deliveredAt?.toISOString() ?? null,
      tracking_number: d.trackingNumber,
      created_at: d.createdAt.toISOString(),
    })),
  });

  // ── Process Stage ──

  /**
   * Order에 연결된 Contact를 찾아 ID를 반환합니다.
   * 연결 우선순위: inquiryNumber → workNumber (inquiryNumber가 null인 현장직행 건)
   */
  private async findLinkedContactId(orderId: string): Promise<string> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { inquiryNumber: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    // inquiryNumber로 Contact 조회
    if (order.inquiryNumber) {
      const contact = await this.prisma.contact.findFirst({
        where: { inquiryNumber: order.inquiryNumber },
        select: { id: true },
      });
      if (contact) return contact.id;

      // inquiryNumber가 workNumber인 경우 (현장직행)
      const byWork = await this.prisma.contact.findFirst({
        where: { workNumber: order.inquiryNumber },
        select: { id: true },
      });
      if (byWork) return byWork.id;
    }

    throw new NotFoundException('Linked contact not found for this order');
  }

  /**
   * Order에 연결된 Contact의 현재 공정 단계를 조회합니다.
   */
  async getProcessStage(orderId: string) {
    const contactId = await this.findLinkedContactId(orderId);

    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        processStage: true,
        status: true,
        workNumber: true,
        inquiryNumber: true,
        inquiryType: true,
        companyName: true,
      },
    });

    if (!contact) throw new NotFoundException('Contact not found');

    return {
      order_id: orderId,
      contact_id: contact.id,
      process_stage: contact.processStage,
      status: contact.status,
      work_number: contact.workNumber,
      inquiry_number: contact.inquiryNumber,
      inquiry_type: contact.inquiryType,
      company_name: contact.companyName,
    };
  }

  /**
   * Order에 연결된 Contact의 공정 단계를 변경합니다.
   * ContactsService.updateProcessStage()에 위임하여 모든 부가 동작
   * (status 자동 전환, workNumber 부여, timeline, socket 이벤트)을 처리합니다.
   */
  async updateProcessStage(orderId: string, dto: UpdateProcessStageDto) {
    const stage = dto.processStage ?? null;

    // 유효성 검사
    if (stage !== null && !(VALID_PROCESS_STAGES as readonly string[]).includes(stage)) {
      throw new BadRequestException(
        `Invalid process stage '${stage}'. Valid: ${VALID_PROCESS_STAGES.join(', ')}`
      );
    }

    const contactId = await this.findLinkedContactId(orderId);

    const result = await this.contactsService.updateProcessStage(contactId, stage, {
      actorType: 'system',
      actorName: dto.actorName,
    });

    return {
      order_id: orderId,
      ...result,
    };
  }
}
