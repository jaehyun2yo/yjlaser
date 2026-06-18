'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { DeliveredFilterBar } from './DeliveredFilterBar';
import { DeliveredItemCard } from '@/components/DeliveredItemCard';
import {
  useDeliveredList,
  useDeliveredSocket,
} from '@/app/(admin)/admin/work-management/delivered/_lib/hooks';
import type { DateMode } from '@/app/(admin)/admin/work-management/delivered/_lib/constants';

function getToday(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function getThisMonth(): string {
  const now = new Date();
  return now.toISOString().slice(0, 7);
}

function getMonthDateRange(month: string): { dateFrom: string; dateTo: string } {
  const [year, mon] = month.split('-').map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  return {
    dateFrom: `${month}-01`,
    dateTo: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function DeliveredListView() {
  // Shared socket subscription for all delivered hooks
  useDeliveredSocket();

  const [dateMode, setDateMode] = useState<DateMode>('daily');
  const [selectedDate, setSelectedDate] = useState(getToday);
  const [selectedMonth, setSelectedMonth] = useState(getThisMonth);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);

  // Debounce search
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === searchQuery) return;

    const timer = setTimeout(() => {
      setSearchQuery(trimmed);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchInput, searchQuery]);

  // Compute date range based on mode
  const dateRange = useMemo(() => {
    if (dateMode === 'daily') {
      return { dateFrom: selectedDate, dateTo: selectedDate };
    }
    return getMonthDateRange(selectedMonth);
  }, [dateMode, selectedDate, selectedMonth]);

  const { data, isLoading, error } = useDeliveredList({
    dateFrom: dateRange.dateFrom,
    dateTo: dateRange.dateTo,
    search: searchQuery || undefined,
    companyNames: selectedCompanies.length > 0 ? selectedCompanies : undefined,
  });

  const contacts = data?.contacts || [];

  const handleResetToToday = useCallback(() => {
    if (dateMode === 'daily') {
      setSelectedDate(getToday());
    } else {
      setSelectedMonth(getThisMonth());
    }
  }, [dateMode]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <DeliveredFilterBar
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
          className={`w-full pl-9 pr-9 py-2 text-sm border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.card} ${TEXT_COLOR.primary} placeholder-gray-400`}
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
      <div className={`text-xs ${TEXT_COLOR.secondary}`}>총 {data?.total || 0}건</div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`h-12 ${BG_COLOR.muted} rounded-lg animate-pulse`} />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-500">
          데이터를 불러오는 중 오류가 발생했습니다.
        </div>
      ) : contacts.length === 0 ? (
        <div className={`text-center py-12 ${TEXT_COLOR.disabled}`}>
          {dateMode === 'daily'
            ? `${selectedDate} 납품 완료 건이 없습니다.`
            : `${selectedMonth} 납품 완료 건이 없습니다.`}
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <DeliveredItemCard key={contact.id} contact={contact} />
          ))}
        </div>
      )}
    </div>
  );
}
