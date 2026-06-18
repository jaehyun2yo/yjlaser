'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { WorkerDeliveredFilterBar } from '@/app/worker/delivered/_components/WorkerDeliveredFilterBar';
import { DeliveredItemCard } from '@/components/DeliveredItemCard';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDeliveredList,
  useDeliveredSocket,
} from '@/app/(admin)/admin/work-management/delivered/_lib/hooks';
import { getDeliveredContactById } from '@/app/actions/process-board';
import type { DateMode } from '@/app/(admin)/admin/work-management/delivered/_lib/constants';
import type { Contact } from '@/lib/types/contact';
import { queryKeys } from '@/lib/react-query/queryKeys';

interface WorkerDeliveredListProps {
  highlightContactId?: string | null;
  initialSearch?: string;
  searchAllDates?: boolean;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getThisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function getMonthDateRange(month: string): { dateFrom: string; dateTo: string } {
  const [year, mon] = month.split('-').map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  return {
    dateFrom: `${month}-01`,
    dateTo: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function getDeliveredContactSearchText(contact: Contact): string {
  const latestDrawingFileNames =
    contact.latestDrawing?.files.map((file) => file.name).join(' ') ?? '';

  return [
    contact.company_name,
    contact.inquiry_number,
    contact.work_number,
    contact.inquiry_title,
    contact.drawing_file_name,
    contact.attachment_filename,
    contact.revision_request_file_name,
    contact.webhard_folder_path,
    latestDrawingFileNames,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function WorkerDeliveredList({
  highlightContactId = null,
  initialSearch = '',
  searchAllDates = false,
}: WorkerDeliveredListProps) {
  useDeliveredSocket();

  const [dateMode, setDateMode] = useState<DateMode>('daily');
  const [selectedDate, setSelectedDate] = useState(getToday);
  const [selectedMonth, setSelectedMonth] = useState(getThisMonth);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);

  useEffect(() => {
    setSearchInput(initialSearch);
    setSearchQuery(initialSearch);
  }, [initialSearch]);

  // Debounce search
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === searchQuery) return;
    const timer = setTimeout(() => setSearchQuery(trimmed), 500);
    return () => clearTimeout(timer);
  }, [searchInput, searchQuery]);

  const dateRange = useMemo(() => {
    if (dateMode === 'daily') {
      return { dateFrom: selectedDate, dateTo: selectedDate };
    }
    return getMonthDateRange(selectedMonth);
  }, [dateMode, selectedDate, selectedMonth]);

  const shouldSearchAllDates = searchAllDates && searchQuery.length > 0;
  const { data, isLoading, error } = useDeliveredList({
    dateFrom: shouldSearchAllDates ? undefined : dateRange.dateFrom,
    dateTo: shouldSearchAllDates ? undefined : dateRange.dateTo,
    companyNames: selectedCompanies.length > 0 ? selectedCompanies : undefined,
  });
  const { data: highlightedContact } = useQuery({
    queryKey: queryKeys.contacts.detail(highlightContactId ?? 'none'),
    queryFn: async () => {
      if (!highlightContactId) return null;
      const result = await getDeliveredContactById(highlightContactId);
      if (!result.success) throw new Error(result.error || '납품 완료 문의 조회 실패');
      return result.data ?? null;
    },
    enabled: !!highlightContactId,
    staleTime: 30000,
  });

  const deliveredContacts = data?.contacts || [];
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const contacts = useMemo(() => {
    const filteredContacts = normalizedSearchQuery
      ? deliveredContacts.filter((contact) =>
          getDeliveredContactSearchText(contact).includes(normalizedSearchQuery)
        )
      : deliveredContacts;

    if (!highlightedContact) return filteredContacts;
    if (filteredContacts.some((contact) => contact.id === highlightedContact.id)) {
      return filteredContacts;
    }

    return [highlightedContact, ...filteredContacts];
  }, [deliveredContacts, highlightedContact, normalizedSearchQuery]);
  const resultCount = normalizedSearchQuery ? contacts.length : data?.total || 0;
  const highlightedContactRendered = useMemo(
    () => !!highlightContactId && contacts.some((contact) => contact.id === highlightContactId),
    [contacts, highlightContactId]
  );

  useEffect(() => {
    if (!highlightContactId || !highlightedContactRendered) return undefined;

    let timeoutId: number | undefined;
    let attempts = 0;
    const scrollToHighlightedContact = () => {
      const target = document.getElementById(`delivered-contact-${highlightContactId}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (attempts >= 10) return;
      attempts += 1;
      timeoutId = window.setTimeout(scrollToHighlightedContact, 50);
    };

    timeoutId = window.setTimeout(scrollToHighlightedContact, 80);
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [highlightContactId, highlightedContactRendered]);

  const handleResetToToday = useCallback(() => {
    if (dateMode === 'daily') {
      setSelectedDate(getToday());
    } else {
      setSelectedMonth(getThisMonth());
    }
  }, [dateMode]);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <WorkerDeliveredFilterBar
        dateMode={dateMode}
        selectedDate={selectedDate}
        selectedMonth={selectedMonth}
        selectedCompanies={selectedCompanies}
        onDateModeChange={setDateMode}
        onDateChange={setSelectedDate}
        onMonthChange={setSelectedMonth}
        onCompaniesChange={setSelectedCompanies}
        onResetToToday={handleResetToToday}
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="업체명, 문의번호, 패키지명 검색..."
          className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent focus:bg-white transition"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-gray-500 font-medium">총 {resultCount}건</p>

      {/* List */}
      {isLoading ? (
        <DeliveredListSkeleton />
      ) : error ? (
        <div className="text-center py-8 text-red-500 text-sm">
          데이터를 불러오는 중 오류가 발생했습니다.
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm">
            {normalizedSearchQuery
              ? '검색 결과가 없습니다.'
              : dateMode === 'daily'
                ? `${selectedDate} 납품 완료 건이 없습니다.`
                : `${selectedMonth} 납품 완료 건이 없습니다.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <DeliveredItemCard
              key={contact.id}
              contact={contact}
              isHighlighted={highlightContactId === contact.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DeliveredListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="납품 완료 목록 로딩 중">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="mb-3 flex items-center gap-2">
            <Skeleton className="h-3.5 w-3.5 rounded-full" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="ml-5 flex items-center justify-between gap-4">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
