'use client';

import { TEXT_COLOR } from '@/lib/styles';
import { Suspense, useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ContactsList } from '@/app/(admin)/admin/contacts/ContactsList';
import { TestNewContactButton } from '@/app/(admin)/admin/contacts/TestNewContactButton';
import { ContactCardSkeletonList } from '@/app/(admin)/admin/contacts/_components';
import { useContactFilter } from '@/app/(admin)/admin/contacts/_lib/hooks';
import { WorkManagementNav } from './_components';

const BASE_PATH = '/admin/work-management';

function WorkManagementSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className={`text-xl sm:text-2xl lg:text-3xl font-bold ${TEXT_COLOR.primary}`}>
          작업관리
        </h1>
        <p className={`text-sm sm:text-base ${TEXT_COLOR.secondary} mt-1 sm:mt-2`}>
          문의사항을 확인하고 작업 현황을 관리하세요
        </p>
      </div>
      <ContactCardSkeletonList count={5} />
    </div>
  );
}

function WorkManagementContent() {
  const searchParams = useSearchParams();

  const initialStatusFilter = searchParams.get('status') || 'all';
  const initialSearchQuery = searchParams.get('search') || '';
  const initialDateFilter = searchParams.get('dateFilter') || 'all';
  const highlightContactId = searchParams.get('contactId') ?? undefined;

  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [dateFilter, setDateFilter] = useState(initialDateFilter);
  const [searchInput, setSearchInput] = useState(initialSearchQuery);

  const {
    handleFilterChange: updateUrl,
    handleDateFilterChange: updateDateUrl,
    prefetchFilter,
  } = useContactFilter(BASE_PATH);

  const handleFilterChange = useCallback(
    (newStatus: string) => {
      updateUrl(newStatus, true);
      setStatusFilter(newStatus);
    },
    [updateUrl]
  );

  const handleDateFilterChange = useCallback(
    (newDateFilter: string) => {
      updateDateUrl(newDateFilter);
      setDateFilter(newDateFilter);
    },
    [updateDateUrl]
  );

  const handleFilterHover = useCallback(
    (status: string) => {
      if (status !== statusFilter) {
        prefetchFilter(status);
      }
    },
    [statusFilter, prefetchFilter]
  );

  // 검색어 디바운스
  useEffect(() => {
    const trimmedInput = searchInput.trim();
    if (trimmedInput === searchQuery) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (trimmedInput) {
        params.set('search', trimmedInput);
      } else {
        params.delete('search');
      }
      params.delete('page');
      window.history.replaceState({}, '', `${BASE_PATH}?${params.toString()}`);
      setSearchQuery(trimmedInput);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchInput, searchQuery]);

  const handleSearchClear = useCallback(() => {
    setSearchInput('');
  }, []);

  // 초기 로드 시 주요 필터 prefetch
  useEffect(() => {
    const commonStatuses = ['all', 'received', 'drawing', 'confirmed', 'production'];
    commonStatuses.forEach((status) => {
      if (status !== statusFilter) {
        prefetchFilter(status);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className={`text-xl sm:text-2xl lg:text-3xl font-bold ${TEXT_COLOR.primary}`}>
          작업관리
        </h1>
        <p className={`text-sm sm:text-base ${TEXT_COLOR.secondary} mt-1 sm:mt-2`}>
          문의사항을 확인하고 작업 현황을 관리하세요
        </p>
      </div>

      <TestNewContactButton />

      <WorkManagementNav />

      <ContactsList
        statusFilter={statusFilter}
        searchQuery={searchQuery}
        dateFilter={dateFilter}
        searchInput={searchInput}
        highlightContactId={highlightContactId}
        onStatusFilterChange={handleFilterChange}
        onDateFilterChange={handleDateFilterChange}
        onFilterHover={handleFilterHover}
        onSearchInputChange={setSearchInput}
        onSearchClear={handleSearchClear}
      />
    </div>
  );
}

export default function WorkManagementPage() {
  return (
    <Suspense fallback={<WorkManagementSkeleton />}>
      <WorkManagementContent />
    </Suspense>
  );
}
