import { NextRequest, NextResponse } from 'next/server';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import { serverGetBookings } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';

const apiLogger = logger.createLogger('WORKER_BOOKINGS_API');
const DEFAULT_RANGE_DAYS = 14;

interface WorkerBookingContactSummary {
  id: string;
  inquiryNumber: string | null;
  inquiryTitle: string | null;
}

interface WorkerBookingSummary {
  id: number;
  visitDate: string;
  visitTimeSlot: string;
  companyName: string;
  status: string;
  notes: string | null;
  contact: WorkerBookingContactSummary | null;
}

function getSeoulDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Failed to format booking date');
  }

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mapBooking(value: Record<string, unknown>): WorkerBookingSummary | null {
  const id = asNumber(value.id);
  const visitDate = asString(value.visit_date);
  const visitTimeSlot = asString(value.visit_time_slot);
  const companyName = asString(value.company_name);
  const status = asString(value.status) ?? 'pending';

  if (id == null || !visitDate || !visitTimeSlot || !companyName) {
    return null;
  }

  const contactValue =
    value.contacts && typeof value.contacts === 'object'
      ? (value.contacts as Record<string, unknown>)
      : null;
  const contactId = contactValue ? asString(contactValue.id) : null;

  return {
    id,
    visitDate,
    visitTimeSlot,
    companyName,
    status,
    notes: asString(value.notes),
    contact:
      contactValue && contactId
        ? {
            id: contactId,
            inquiryNumber: asString(contactValue.inquiry_number),
            inquiryTitle: asString(contactValue.inquiry_title),
          }
        : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const workerSession = await getErpWorkerSession();
    if (!workerSession) {
      return NextResponse.json({ error: 'Verified worker session required' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const now = new Date();
    const startDate = searchParams.get('startDate') || getSeoulDateString(now);
    const endDate =
      searchParams.get('endDate') || getSeoulDateString(addDays(now, DEFAULT_RANGE_DAYS));

    const bookings = (
      await serverGetBookings({
        startDate,
        endDate,
        limit: 80,
      })
    )
      .map(mapBooking)
      .filter((booking): booking is WorkerBookingSummary => booking !== null)
      .filter((booking) => booking.status !== 'cancelled')
      .sort((left, right) => {
        const leftKey = `${left.visitDate} ${left.visitTimeSlot}`;
        const rightKey = `${right.visitDate} ${right.visitTimeSlot}`;
        return leftKey.localeCompare(rightKey);
      });

    return NextResponse.json({ bookings, startDate, endDate });
  } catch (error) {
    apiLogger.error('Failed to load worker bookings', error);
    return NextResponse.json({ error: '예약 일정을 불러오지 못했습니다.' }, { status: 500 });
  }
}
