'use client';

import { useState, useEffect } from 'react';
import { FILTER_BUTTON_STYLES } from '@/lib/styles';
import { Input } from '@/components/ui/input';
import type { ProcessBoardFilters } from '@/app/(admin)/admin/process-board/_lib/types';

interface BoardFiltersProps {
  filters: ProcessBoardFilters;
  onFiltersChange: (filters: ProcessBoardFilters) => void;
}

export default function BoardFilters({ filters, onFiltersChange }: BoardFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.companyName || '');

  // 디바운스 처리 (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      onFiltersChange({ ...filters, companyName: searchInput || undefined });
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleDateFilter = (dateFilter: 'today' | 'week' | 'month' | 'all') => {
    onFiltersChange({ ...filters, dateFilter });
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      {/* 업체명 검색 */}
      <div className="flex-1">
        <Input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="업체명 검색..."
          inputSize="sm"
          className="w-40 sm:w-48"
        />
      </div>

      {/* 날짜 필터 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={() => handleDateFilter('today')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filters.dateFilter === 'today'
              ? FILTER_BUTTON_STYLES.active
              : FILTER_BUTTON_STYLES.inactive
          }`}
        >
          오늘
        </button>
        <button
          onClick={() => handleDateFilter('week')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filters.dateFilter === 'week'
              ? FILTER_BUTTON_STYLES.active
              : FILTER_BUTTON_STYLES.inactive
          }`}
        >
          이번주
        </button>
        <button
          onClick={() => handleDateFilter('month')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filters.dateFilter === 'month'
              ? FILTER_BUTTON_STYLES.active
              : FILTER_BUTTON_STYLES.inactive
          }`}
        >
          이번달
        </button>
        <button
          onClick={() => handleDateFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filters.dateFilter === 'all'
              ? FILTER_BUTTON_STYLES.active
              : FILTER_BUTTON_STYLES.inactive
          }`}
        >
          전체
        </button>
      </div>
    </div>
  );
}
