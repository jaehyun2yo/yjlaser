'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { FaFileAlt } from 'react-icons/fa';
import type {
  CompanyDashboardClientProps,
  FilterType,
  StatusFilterType,
  DateFilter,
  Booking,
  Contact,
} from './types';
import { useFilteredContacts } from './hooks';
import { GreetingHeader } from './_components/GreetingHeader';
import { BookingSection } from './components/shared/BookingSection';
import { FilterButtons } from './components/shared/FilterButtons';
import { StatusFilterButtons } from './components/shared/StatusFilterButtons';
import { ContactList } from './components/shared/ContactList';
import { useSocketNamespace } from '@/lib/socket/useSocketNamespace';
import { logger } from '@/lib/utils/logger';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

const dashboardLogger = logger.createLogger('CompanyDashboardClient');

export function CompanyDashboardClient({
  initialCompany,
  initialContacts,
  initialBookings,
}: CompanyDashboardClientProps) {
  const [filterType] = useState<FilterType>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  });
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>(initialBookings ?? []);
  const isRefreshingRef = useRef(false);
  const searchParams = useSearchParams();

  // 초기 데이터 설정
  useEffect(() => {
    setContacts(initialContacts);
  }, [initialContacts]);

  // 문의하기에서 리다이렉트된 경우 최상단으로 스크롤
  useEffect(() => {
    if (searchParams.get('from') === 'contact') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const url = new URL(window.location.href);
      url.searchParams.delete('from');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  // API Route를 통해 대시보드 데이터 새로고침
  const refreshAll = useCallback(async () => {
    if (!initialCompany.company_name || isRefreshingRef.current) return;

    isRefreshingRef.current = true;
    setIsRefreshing(true);
    try {
      const response = await fetch('/api/company/dashboard?type=all');
      if (!response.ok) {
        dashboardLogger.error('Failed to refresh dashboard data', { status: response.status });
        return;
      }

      const data = await response.json();

      if (data.contacts) {
        setContacts(data.contacts as Contact[]);
      }

      if (data.bookings) {
        // 현재 날짜/시간 기반 필터링 (서버에서 받은 원본 데이터)
        const now = new Date();
        const filteredBookings = (
          data.bookings as Array<{
            visit_date: string;
            visit_time_slot: string;
            contacts: unknown;
            [key: string]: unknown;
          }>
        ).filter((booking) => {
          const visitDate = new Date(booking.visit_date);
          visitDate.setHours(0, 0, 0, 0);

          const timeSlot = booking.visit_time_slot || '';
          const endTimeMatch = timeSlot.match(/~(\d{1,2}):(\d{2})/);

          if (!endTimeMatch) {
            return false;
          }

          const endHour = parseInt(endTimeMatch[1], 10);
          const endMinute = parseInt(endTimeMatch[2], 10);

          const bookingEndTime = new Date(visitDate);
          bookingEndTime.setHours(endHour, endMinute, 0, 0);

          return now < bookingEndTime;
        });

        const transformedBookings = filteredBookings.map((booking) => ({
          ...booking,
          contacts: Array.isArray(booking.contacts)
            ? booking.contacts[0] || null
            : booking.contacts || null,
        }));
        setBookings(transformedBookings as Booking[]);
      }
    } catch (error) {
      dashboardLogger.error('Error refreshing dashboard data', error);
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [initialCompany.company_name]);

  // 주기적 폴링으로 데이터 갱신 (Socket.IO fallback)
  useEffect(() => {
    if (!initialCompany.company_name) return;

    const pollInterval = setInterval(() => {
      refreshAll();
    }, 30000); // 30초마다 갱신

    return () => {
      clearInterval(pollInterval);
    };
  }, [initialCompany.company_name, refreshAll]);

  // Socket.IO 실시간 업데이트 — 작업 상태 변경 즉시 반영
  const debouncedRefresh = useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        refreshAll();
        timer = null;
      }, 500);
    };
  }, [refreshAll]);

  const socketEvents = useMemo(
    () => ({
      'contact:updated': debouncedRefresh,
      'contact:status_changed': debouncedRefresh,
      'contact:process_stage_changed': debouncedRefresh,
      'contacts:batch_updated': debouncedRefresh,
    }),
    [debouncedRefresh]
  );

  useSocketNamespace({ namespace: 'contacts', events: socketEvents });

  const filteredContacts = useFilteredContacts(contacts, filterType, statusFilter, dateFilter);

  return (
    <div className="space-y-6">
      {/* 인사말 헤더 */}
      <GreetingHeader companyName={initialCompany.company_name} isRefreshing={isRefreshing} />

      {/* 예약 일정 섹션 */}
      <BookingSection
        bookings={bookings}
        variant="desktop"
        company={initialCompany}
        onBookingChange={refreshAll}
      />

      {/* 문의 진행상황 섹션 */}
      <div
        className={`${BG_COLOR.gradientCard} rounded-2xl sm:rounded-3xl overflow-hidden border ${BORDER_COLOR.default}/50 shadow-2xl p-4 sm:p-6 relative animate-fadeInUp animate-delay-200`}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-[#ED6C00] rounded-lg flex items-center justify-center">
              <FaFileAlt className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </div>
            <div>
              <p className={`${TEXT_COLOR.primary} font-semibold text-xs sm:text-sm`}>
                문의 진행상황
              </p>
              <p className="text-gray-500 text-[10px] sm:text-xs">
                {filteredContacts.length}건의 문의
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full animate-pulse" />
            <span className={`${TEXT_COLOR.success} text-[10px] sm:text-xs`}>Live</span>
          </div>
        </div>

        {/* 필터 섹션 */}
        <div className="flex flex-col gap-3 mb-5">
          <StatusFilterButtons
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            variant="desktop"
          />
          <FilterButtons
            dateFilter={dateFilter}
            onDateFilterChange={setDateFilter}
            filteredCount={filteredContacts.length}
            variant="desktop"
          />
        </div>

        <ContactList
          contacts={filteredContacts}
          filterType={filterType}
          variant="desktop"
          bookings={bookings}
          onBookingChange={refreshAll}
          company={initialCompany}
        />

        {/* 스캔라인 효과 */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl sm:rounded-3xl">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent animate-scan" />
        </div>
      </div>
    </div>
  );
}
