'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState, useCallback, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { WorkCategoryTabs } from './WorkCategoryTabs';
import { StageFilterBar } from './StageFilterBar';
import { ContactCard } from '@/app/(admin)/admin/contacts/_components';
import {
  useTaskList,
  useWorkCategoryCounts,
} from '@/app/(admin)/admin/work-management/board/_lib/hooks';
import { DATE_FILTERS } from '@/app/(admin)/admin/contacts/_lib/constants';
import type { WorkCategory } from '@/app/(admin)/admin/work-management/board/_lib/constants';

export function TaskListView() {
  const [workCategory, setWorkCategory] = useState<WorkCategory>('office');
  const [stageFilter, setStageFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Reset stage filter when category changes
  const handleCategoryChange = useCallback((category: WorkCategory) => {
    setWorkCategory(category);
    setStageFilter('all');
  }, []);

  // Debounce search
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === searchQuery) return;

    const timer = setTimeout(() => {
      setSearchQuery(trimmed);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchInput, searchQuery]);

  const { data: categoryCounts } = useWorkCategoryCounts();

  const { data, isLoading, error, socketStatus } = useTaskList({
    workCategory,
    stageFilter: stageFilter !== 'all' ? stageFilter : undefined,
    companyName: searchQuery || undefined,
    dateFilter,
  });

  const contacts = data?.contacts || [];

  return (
    <div className="space-y-4">
      {/* Category sub-tabs */}
      <WorkCategoryTabs
        activeCategory={workCategory}
        onCategoryChange={handleCategoryChange}
        counts={categoryCounts}
      />

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Stage filter */}
        <div className="flex-1">
          <StageFilterBar
            workCategory={workCategory}
            activeFilter={stageFilter}
            onFilterChange={setStageFilter}
          />
        </div>

        {/* Date filter */}
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}
          className={`px-3 py-1.5 text-xs rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.secondary}`}
        >
          {DATE_FILTERS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

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

      {/* Results count + socket status */}
      <div className={`flex items-center gap-2 text-xs ${TEXT_COLOR.secondary}`}>
        <span>총 {data?.total || 0}건</span>
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            socketStatus === 'connected'
              ? 'bg-green-500'
              : socketStatus === 'connecting'
                ? 'bg-yellow-500'
                : 'bg-red-500'
          }`}
          title={`실시간 연결: ${socketStatus}`}
        />
      </div>

      {/* List — ContactCard (accordion) instead of TaskCard */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`h-20 ${BG_COLOR.muted} rounded-lg animate-pulse`} />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-500">
          데이터를 불러오는 중 오류가 발생했습니다.
        </div>
      ) : contacts.length === 0 ? (
        <div className={`text-center py-12 ${TEXT_COLOR.disabled}`}>
          해당 조건의 작업이 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <ContactCard key={contact.id} contact={contact} />
          ))}
        </div>
      )}
    </div>
  );
}
