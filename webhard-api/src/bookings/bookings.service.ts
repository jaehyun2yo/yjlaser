import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { BookingsGateway } from './bookings.gateway';
import { VisitBookingConstants } from './constants';

interface BookingRow {
  id: bigint;
  visitDate: Date;
  visitTimeSlot: string;
  companyName: string;
  contactId: string | null;
  status: string | null;
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  createdBy: string | null;
  deliveryMethod: string | null;
  deliveryName: string | null;
  deliveryPhone: string | null;
  deliveryAddress: string | null;
}

interface BookingContactSummaryRow {
  id: string;
  companyName: string | null;
  processStage: string | null;
  name: string;
  status: string | null;
  inquiryTitle: string | null;
}

export interface BookingContactSummary {
  process_stage: string | null;
  name: string;
  status: string | null;
  inquiry_title: string | null;
}

export interface BookingResponse extends Record<string, unknown> {
  id: number;
  visit_date: string;
  visit_time_slot: string;
  company_name: string;
  contact_id: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  delivery_method: string | null;
  delivery_name: string | null;
  delivery_phone: string | null;
  delivery_address: string | null;
  contacts: BookingContactSummary | null;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsGateway: BookingsGateway
  ) {}

  private async createAdminBookingNotification(
    type: 'booking_created' | 'booking_updated' | 'booking_cancelled',
    booking: BookingRow
  ): Promise<void> {
    const titles = {
      booking_created: '방문 예약 생성',
      booking_updated: '방문 예약 변경',
      booking_cancelled: '방문 예약 취소',
    };

    try {
      await this.prisma.notification.create({
        data: {
          userType: 'admin',
          userId: null,
          type,
          title: titles[type],
          message: `${booking.companyName} ${booking.visitDate.toISOString().slice(0, 10)} ${booking.visitTimeSlot}`,
          metadata: {
            bookingId: booking.id.toString(),
            contactId: booking.contactId,
            companyName: booking.companyName,
            visitDate: booking.visitDate.toISOString().slice(0, 10),
            visitTimeSlot: booking.visitTimeSlot,
            link: '/admin/integration/bookings',
          },
        },
      });
    } catch (err) {
      this.logger.warn(
        `booking notification failed: type=${type}, bookingId=${booking.id.toString()}, error=${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * 예약 목록 조회
   */
  async findAll(options: {
    date?: string;
    companyName?: string;
    startDate?: string;
    endDate?: string;
    contactId?: string;
    status?: string;
    limit?: number;
  }) {
    const where: Prisma.VisitBookingWhereInput = {};

    if (options.date) {
      where.visitDate = new Date(options.date);
    }
    if (options.companyName) {
      where.companyName = options.companyName;
    }
    if (options.startDate || options.endDate) {
      where.visitDate = {};
      if (options.startDate) {
        (where.visitDate as Prisma.DateTimeFilter).gte = new Date(options.startDate);
      }
      if (options.endDate) {
        (where.visitDate as Prisma.DateTimeFilter).lte = new Date(options.endDate);
      }
    }
    if (options.contactId) {
      where.contactId = options.contactId;
    }
    if (options.status) {
      where.status = options.status;
    }

    const bookings = await this.prisma.executeWithRetry(
      () =>
        this.prisma.visitBooking.findMany({
          where,
          orderBy: [{ visitDate: 'asc' }, { visitTimeSlot: 'asc' }],
          take: options.limit || 1000,
        }),
      { operationName: 'bookings.findAll' }
    );

    return this.attachContactSummaries(bookings);
  }

  /**
   * 예약 단건 조회
   */
  async findById(id: bigint) {
    const booking = await this.prisma.executeWithRetry(
      () => this.prisma.visitBooking.findUnique({ where: { id } }),
      { operationName: 'bookings.findById' }
    );
    if (!booking) return null;
    const [bookingWithContact] = await this.attachContactSummaries([booking]);
    return bookingWithContact;
  }

  /**
   * 예약 생성
   */
  async create(data: {
    visitDate: string;
    visitTimeSlot: string;
    companyName: string;
    contactId?: string;
    notes?: string;
    createdBy?: string;
    deliveryMethod?: string;
    deliveryName?: string;
    deliveryPhone?: string;
    deliveryAddress?: string;
  }) {
    // 타임당 최대 2건 체크
    const count = await this.prisma.executeWithRetry(
      () =>
        this.prisma.visitBooking.count({
          where: {
            visitDate: new Date(data.visitDate),
            visitTimeSlot: data.visitTimeSlot,
            status: 'confirmed',
          },
        }),
      { operationName: 'bookings.create.countSlot' }
    );

    if (count >= VisitBookingConstants.MAX_CAPACITY) {
      throw new BadRequestException(
        `해당 시간대는 이미 예약이 가득 찼습니다. (최대 ${VisitBookingConstants.MAX_CAPACITY}건)`
      );
    }

    const booking = await this.prisma.executeWithRetry(
      () =>
        this.prisma.visitBooking.create({
          data: {
            visitDate: new Date(data.visitDate),
            visitTimeSlot: data.visitTimeSlot,
            companyName: data.companyName,
            contactId: data.contactId || null,
            status: 'confirmed',
            notes: data.notes || null,
            createdBy: data.createdBy || 'company',
            deliveryMethod: data.deliveryMethod || null,
            deliveryName: data.deliveryName || null,
            deliveryPhone: data.deliveryPhone || null,
            deliveryAddress: data.deliveryAddress || null,
          },
        }),
      { operationName: 'bookings.create' }
    );

    const result = this.toSnakeCase(booking);
    await this.createAdminBookingNotification('booking_created', booking);
    this.bookingsGateway.emitBookingCreated(result);
    return result;
  }

  /**
   * 예약 수정
   */
  async update(
    id: bigint,
    data: Partial<{
      visitDate: string;
      visitTimeSlot: string;
      companyName: string;
      contactId: string | null;
      status: string;
      notes: string | null;
      adminNote: string;
      deliveryMethod: string | null;
      deliveryName: string | null;
      deliveryPhone: string | null;
      deliveryAddress: string | null;
    }>
  ) {
    const updateData: Prisma.VisitBookingUpdateInput = {};

    if (data.visitDate !== undefined) updateData.visitDate = new Date(data.visitDate);
    if (data.visitTimeSlot !== undefined) updateData.visitTimeSlot = data.visitTimeSlot;
    if (data.companyName !== undefined) updateData.companyName = data.companyName;
    if (data.contactId !== undefined) updateData.contactId = data.contactId;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.adminNote !== undefined) updateData.notes = data.adminNote;
    else if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.deliveryMethod !== undefined) updateData.deliveryMethod = data.deliveryMethod;
    if (data.deliveryName !== undefined) updateData.deliveryName = data.deliveryName;
    if (data.deliveryPhone !== undefined) updateData.deliveryPhone = data.deliveryPhone;
    if (data.deliveryAddress !== undefined) updateData.deliveryAddress = data.deliveryAddress;

    updateData.updatedAt = new Date();

    const booking = await this.prisma.executeWithRetry(
      () => this.prisma.visitBooking.update({ where: { id }, data: updateData }),
      { operationName: 'bookings.update' }
    );

    const updateResult = this.toSnakeCase(booking);
    await this.createAdminBookingNotification(
      booking.status === 'cancelled' ? 'booking_cancelled' : 'booking_updated',
      booking
    );
    this.bookingsGateway.emitBookingUpdated(updateResult);
    return updateResult;
  }

  /**
   * 예약 삭제
   */
  async delete(id: bigint) {
    const booking = await this.prisma.executeWithRetry(
      () => this.prisma.visitBooking.delete({ where: { id } }),
      {
        operationName: 'bookings.delete',
      }
    );
    await this.createAdminBookingNotification('booking_cancelled', booking);
    this.bookingsGateway.emitBookingDeleted(id.toString());
    return { success: true };
  }

  /**
   * 예약 가능 시간대 조회
   */
  async getAvailableSlots(date: string) {
    const bookings = await this.prisma.executeWithRetry(
      () =>
        this.prisma.visitBooking.findMany({
          where: {
            visitDate: new Date(date),
            status: 'confirmed',
          },
          select: { visitTimeSlot: true },
        }),
      { operationName: 'bookings.getAvailableSlots' }
    );

    const slotCounts: Record<string, number> = {};
    for (const b of bookings) {
      slotCounts[b.visitTimeSlot] = (slotCounts[b.visitTimeSlot] || 0) + 1;
    }

    return { date, slotCounts, maxCapacity: VisitBookingConstants.MAX_CAPACITY };
  }

  /**
   * contactId로 예약 조회
   */
  async findByContactId(contactId: string) {
    const bookings = await this.prisma.executeWithRetry(
      () =>
        this.prisma.visitBooking.findMany({
          where: { contactId },
          orderBy: { visitDate: 'desc' },
        }),
      { operationName: 'bookings.findByContactId' }
    );
    return this.attachContactSummaries(bookings);
  }

  private async attachContactSummaries(bookings: BookingRow[]): Promise<BookingResponse[]> {
    const contactIds = Array.from(
      new Set(bookings.map((booking) => booking.contactId).filter((id): id is string => !!id))
    );

    if (contactIds.length === 0) {
      return bookings.map((booking) => this.toSnakeCase(booking, null));
    }

    const contacts = await this.prisma.executeWithRetry(
      () =>
        this.prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: {
            id: true,
            companyName: true,
            processStage: true,
            name: true,
            status: true,
            inquiryTitle: true,
          },
        }),
      { operationName: 'bookings.findContactSummaries' }
    );
    const contactsById = new Map<string, BookingContactSummaryRow>(
      contacts.map((contact: BookingContactSummaryRow) => [contact.id, contact])
    );

    return bookings.map((booking) => {
      const contact = booking.contactId ? contactsById.get(booking.contactId) : null;
      const contactSummary =
        contact && contact.companyName === booking.companyName
          ? this.toContactSummary(contact)
          : null;

      return this.toSnakeCase(booking, contactSummary);
    });
  }

  private toContactSummary(contact: BookingContactSummaryRow): BookingContactSummary {
    return {
      process_stage: contact.processStage,
      name: contact.name,
      status: contact.status,
      inquiry_title: contact.inquiryTitle,
    };
  }

  private toSnakeCase(
    booking: BookingRow,
    contactSummary: BookingContactSummary | null = null
  ): BookingResponse {
    return {
      id: Number(booking.id),
      visit_date: booking.visitDate.toISOString().split('T')[0],
      visit_time_slot: booking.visitTimeSlot,
      company_name: booking.companyName,
      contact_id: booking.contactId,
      status: booking.status,
      notes: booking.notes,
      created_at: booking.createdAt?.toISOString() || null,
      updated_at: booking.updatedAt?.toISOString() || null,
      created_by: booking.createdBy,
      delivery_method: booking.deliveryMethod,
      delivery_name: booking.deliveryName,
      delivery_phone: booking.deliveryPhone,
      delivery_address: booking.deliveryAddress,
      contacts: contactSummary,
    };
  }
}
