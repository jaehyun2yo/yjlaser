'use client';

import { Suspense, useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ContactsList } from './ContactsList';
import { TestNewContactButton } from './TestNewContactButton';
import { ContactCardSkeletonList } from './_components';
import { useContactFilter } from './_lib/hooks';
import { TEXT_COLOR, BG_COLOR } from '@/lib/styles';

/**
 * 초기 로딩 스켈레톤 컴포넌트
 */
function ContactsPageSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className={`text-xl sm:text-2xl lg:text-3xl font-bold ${TEXT_COLOR.primary}`}>
          문의하기 관리
        </h1>
        <p className={`text-sm sm:text-base ${TEXT_COLOR.secondary} mt-1 sm:mt-2`}>
          등록된 문의사항을 확인하고 관리하세요
        </p>

        {/* 필터 스켈레톤 */}
        <div className="mt-3">
          <div className="flex flex-col gap-2 mb-6">
            {/* 상태 필터 스켈레톤 */}
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className={`h-7 w-16 ${BG_COLOR.muted} rounded-md animate-pulse`} />
              ))}
            </div>
            {/* 날짜 필터 + 검색 스켈레톤 */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className={`h-4 w-4 ${BG_COLOR.muted} rounded animate-pulse`} />
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-7 w-14 ${BG_COLOR.muted} rounded-md animate-pulse`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className={`h-9 ${BG_COLOR.muted} rounded-lg animate-pulse`} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 카드 스켈레톤 */}
      <ContactCardSkeletonList count={5} />
    </div>
  );
}

/**
 * 문의관리 페이지 콘텐츠 (클라이언트 컴포넌트)
 * 상태 관리를 페이지 레벨에서 수행하여 필터와 목록 동기화
 */
function ContactsPageContent() {
  const searchParams = useSearchParams();

  // URL에서 초기값 읽기
  const initialStatusFilter = searchParams.get('status') || 'all';
  const initialSearchQuery = searchParams.get('search') || '';
  const initialDateFilter = searchParams.get('dateFilter') || 'all';
  const initialInquiryTypeFilter = searchParams.get('inquiry_type') || 'all';

  // 페이지 레벨 필터 상태 (단일 source of truth)
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [dateFilter, setDateFilter] = useState(initialDateFilter);
  const [searchInput, setSearchInput] = useState(initialSearchQuery);
  const [inquiryTypeFilter, setInquiryTypeFilter] = useState(initialInquiryTypeFilter);

  // 필터 훅 (shallow routing + prefetch)
  const {
    handleFilterChange: updateUrl,
    handleDateFilterChange: updateDateUrl,
    prefetchFilter,
  } = useContactFilter();

  // 상태 필터 변경 (검색어 유지 - 검색 결과 내에서 필터링)
  const handleFilterChange = useCallback(
    (newStatus: string) => {
      updateUrl(newStatus, true);
      setStatusFilter(newStatus);
      // 검색어 유지 - B안: 검색 결과 내에서 카테고리 필터링
    },
    [updateUrl]
  );

  // 날짜 필터 변경 (검색어 유지 - 검색 결과 내에서 필터링)
  const handleDateFilterChange = useCallback(
    (newDateFilter: string) => {
      updateDateUrl(newDateFilter);
      setDateFilter(newDateFilter);
      // 검색어 유지 - B안: 검색 결과 내에서 날짜 필터링
    },
    [updateDateUrl]
  );

  // 문의유형 필터 변경
  const handleInquiryTypeFilterChange = useCallback((newFilter: string) => {
    const params = new URLSearchParams(window.location.search);
    if (newFilter === 'all') {
      params.delete('inquiry_type');
    } else {
      params.set('inquiry_type', newFilter);
    }
    params.delete('page');
    window.history.replaceState({}, '', `/admin/contacts?${params.toString()}`);
    setInquiryTypeFilter(newFilter);
  }, []);

  // 필터 hover 시 prefetch (날짜 필터는 클라이언트 사이드이므로 제외)
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
      // URL 업데이트 (shallow routing)
      const params = new URLSearchParams(window.location.search);
      if (trimmedInput) {
        params.set('search', trimmedInput);
      } else {
        params.delete('search');
      }
      params.delete('page');
      window.history.replaceState({}, '', `/admin/contacts?${params.toString()}`);

      // 상태 업데이트 → React Query 트리거
      setSearchQuery(trimmedInput);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchInput, searchQuery]);

  // 검색 클리어
  const handleSearchClear = useCallback(() => {
    setSearchInput('');
  }, []);

  // 초기 로드 시 주요 필터 prefetch (날짜 필터는 클라이언트 사이드이므로 제외)
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
    <div className="space-y-4 sm:space-y-6">
      <TestNewContactButton />
      <div>
        <h1 className={`text-xl sm:text-2xl lg:text-3xl font-bold ${TEXT_COLOR.primary}`}>
          문의하기 관리
        </h1>
        <p className={`text-sm sm:text-base ${TEXT_COLOR.secondary} mt-1 sm:mt-2`}>
          등록된 문의사항을 확인하고 관리하세요
        </p>
      </div>

      {/* 단일 ContactsList - 필터와 목록 모두 렌더링 */}
      <ContactsList
        statusFilter={statusFilter}
        searchQuery={searchQuery}
        dateFilter={dateFilter}
        searchInput={searchInput}
        inquiryTypeFilter={inquiryTypeFilter}
        onStatusFilterChange={handleFilterChange}
        onDateFilterChange={handleDateFilterChange}
        onInquiryTypeFilterChange={handleInquiryTypeFilterChange}
        onFilterHover={handleFilterHover}
        onSearchInputChange={setSearchInput}
        onSearchClear={handleSearchClear}
      />
    </div>
  );
}

/**
 * 문의관리 페이지 (클라이언트 컴포넌트)
 * - SEO 불필요 (관리자 페이지)
 * - 필터 전환 속도 향상 (shallow routing + prefetch)
 * - 실시간 업데이트 자연스러움
 */
export default function ContactsPage() {
  return (
    <Suspense fallback={<ContactsPageSkeleton />}>
      <ContactsPageContent />
    </Suspense>
  );
}
