'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Loader2, Menu, RefreshCw } from 'lucide-react';
import { Dropdown, DropdownContent, DropdownTrigger } from '@/components/ui/dropdown';
import { queryKeys } from '@/lib/react-query/queryKeys';

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

interface WorkerBookingsResponse {
  bookings: WorkerBookingSummary[];
  startDate: string;
  endDate: string;
}

async function fetchWorkerBookings(): Promise<WorkerBookingsResponse> {
  const response = await fetch('/api/worker/bookings', {
    method: 'GET',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error('Failed to load worker bookings');
  }

  return (await response.json()) as WorkerBookingsResponse;
}

function formatVisitDate(value: string): string {
  const date = new Date(`${value}T00:00:00+09:00`);
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Seoul',
  }).format(date);
}

function getStatusLabel(status: string): string {
  if (status === 'confirmed') return '확정';
  if (status === 'pending') return '대기';
  return status;
}

function getStatusClassName(status: string): string {
  if (status === 'confirmed') return 'bg-success-light text-success-foreground';
  if (status === 'pending') return 'bg-warning-light text-warning-foreground';
  return 'bg-muted text-muted-foreground';
}

export function WorkerScheduleMenu() {
  const [open, setOpen] = useState(false);
  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: queryKeys.bookings.workerUpcoming(),
    queryFn: fetchWorkerBookings,
    enabled: open,
    staleTime: 30_000,
  });

  const bookings = data?.bookings ?? [];
  const groupedBookings = useMemo(() => {
    return bookings.reduce<Record<string, WorkerBookingSummary[]>>((groups, booking) => {
      const current = groups[booking.visitDate] ?? [];
      return { ...groups, [booking.visitDate]: [...current, booking] };
    }, {});
  }, [bookings]);

  return (
    <Dropdown open={open} onOpenChange={setOpen}>
      <DropdownTrigger asChild>
        <button
          type="button"
          className="relative flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          aria-label="작업 메뉴"
        >
          <Menu className="h-4 w-4" />
          <span className="hidden sm:inline">메뉴</span>
        </button>
      </DropdownTrigger>
      <DropdownContent align="end" className="w-[360px] p-0">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <CalendarDays className="h-4 w-4 text-brand" />
              예약일정
            </div>
            <p className="mt-1 text-xs text-muted-foreground">오늘부터 14일간 방문 예약</p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="예약일정 새로고침"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto px-3 py-3">
          {isFetching && !data ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              예약 일정을 불러오는 중
            </div>
          ) : isError ? (
            <div className="rounded-lg bg-error-light px-3 py-3 text-sm text-destructive">
              예약 일정을 불러오지 못했습니다.
            </div>
          ) : bookings.length === 0 ? (
            <div className="rounded-lg bg-muted px-3 py-6 text-center text-sm text-muted-foreground">
              예정된 예약이 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedBookings).map(([visitDate, dailyBookings]) => (
                <section key={visitDate} className="space-y-2">
                  <h3 className="px-1 text-xs font-bold text-muted-foreground">
                    {formatVisitDate(visitDate)}
                  </h3>
                  <div className="space-y-2">
                    {dailyBookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="rounded-lg border border-border bg-card px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {booking.visitTimeSlot}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${getStatusClassName(booking.status)}`}
                          >
                            {getStatusLabel(booking.status)}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm font-medium text-foreground">
                          {booking.companyName}
                        </p>
                        {booking.contact?.inquiryTitle ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {booking.contact.inquiryTitle}
                          </p>
                        ) : null}
                        {booking.contact?.inquiryNumber ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {booking.contact.inquiryNumber}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </DropdownContent>
    </Dropdown>
  );
}
