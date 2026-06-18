'use client';

import { Suspense, useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ContactsList } from '@/app/(admin)/admin/contacts/ContactsList';
import { ContactCardSkeletonList } from '@/app/(admin)/admin/contacts/_components';
import { useContactFilter } from '@/app/(admin)/admin/contacts/_lib/hooks';
import { ErpNav } from '@/app/(admin)/admin/erp/_components';

const BASE_PATH = '/admin/erp/inquiries';
const ERP_PROCESS_STAGES = ['drawing_confirmed', 'laser', 'cutting', 'creasing', 'delivery'];

function ErpInquiriesSkeleton() {
  return (
    <>
      <ErpNav />
      <ContactCardSkeletonList count={5} />
    </>
  );
}

function ErpInquiriesContent() {
  const searchParams = useSearchParams();

  const initialStatusFilter = searchParams.get('status') || 'all';
  const initialSearchQuery = searchParams.get('search') || '';
  const initialDateFilter = searchParams.get('dateFilter') || 'all';

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
    const commonStatuses = ['all', 'received', 'drawing', 'delivered'];
    commonStatuses.forEach((status) => {
      if (status !== statusFilter) {
        prefetchFilter(status);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <ErpNav />

      <ContactsList
        statusFilter={statusFilter}
        searchQuery={searchQuery}
        dateFilter={dateFilter}
        searchInput={searchInput}
        processStages={ERP_PROCESS_STAGES}
        onStatusFilterChange={handleFilterChange}
        onDateFilterChange={handleDateFilterChange}
        onFilterHover={handleFilterHover}
        onSearchInputChange={setSearchInput}
        onSearchClear={handleSearchClear}
      />
    </>
  );
}

export default function ErpInquiriesPage() {
  return (
    <Suspense fallback={<ErpInquiriesSkeleton />}>
      <ErpInquiriesContent />
    </Suspense>
  );
}
