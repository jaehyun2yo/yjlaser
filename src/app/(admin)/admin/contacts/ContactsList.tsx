'use client';

import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FaSpinner, FaExclamationCircle, FaTrash } from 'react-icons/fa';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('ContactsList');
import { BG_COLOR, TEXT_COLOR, TRANSITION_STYLES } from '@/lib/styles';
import { PerformanceMonitor, useRenderPerformance } from '@/components/PerformanceMonitor';
import type { Contact, StatusCounts } from '@/lib/types';

// 로컬 컴포넌트
import {
  ContactCard,
  StatusFilterBar,
  EmptyState,
  ContactCardSkeletonList,
  SplitGroupCard,
} from './_components';

// 로컬 훅
import {
  useContactsInfiniteQuery,
  useRealtimeSubscription,
  useToggleWithStatusChange,
} from './_lib/hooks';

// 로컬 유틸
import { matchesDateFilter } from './_lib/utils';

interface ContactsListProps {
  // 필터 상태 (상위에서 관리)
  statusFilter: string;
  searchQuery: string;
  dateFilter: string;
  searchInput: string;
  processStages?: string[];
  inquiryTypeFilter?: string;
  /** 강조 표시할 문의 ID (알림 클릭 시) */
  highlightContactId?: string;
  // 필터 변경 핸들러
  onStatusFilterChange: (status: string) => void;
  onDateFilterChange: (dateFilter: string) => void;
  onInquiryTypeFilterChange?: (filter: string) => void;
  onFilterHover: (status: string) => void;
  onSearchInputChange: (value: string) => void;
  onSearchClear: () => void;
}

export function ContactsList({
  statusFilter,
  searchQuery,
  dateFilter,
  searchInput,
  processStages,
  inquiryTypeFilter = 'all',
  highlightContactId,
  onStatusFilterChange,
  onDateFilterChange,
  onInquiryTypeFilterChange,
  onFilterHover,
  onSearchInputChange,
  onSearchClear,
}: ContactsListProps) {
  // 성능 모니터링
  useRenderPerformance('ContactsList', process.env.NODE_ENV === 'development');

  const queryClient = useQueryClient();

  // 휴지통 비우기 상태
  const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);

  // React Query 무한 스크롤 (클라이언트 전용)
  // 날짜 필터는 클라이언트 사이드에서 처리하므로 서버에 전달하지 않음
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isFetching,
    isPlaceholderData,
    isError,
    error,
  } = useContactsInfiniteQuery({
    statusFilter,
    searchQuery,
    processStages,
    inquiryTypeFilter,
  });

  // 모든 페이지의 contacts를 하나의 배열로 합치기
  const allContacts = useMemo(
    () =>
      data?.pages.flatMap(
        (page: {
          contacts: Contact[];
          totalCount: number;
          hasMore: boolean;
          statusCounts: StatusCounts | null;
          page: number;
        }) => page.contacts
      ) ?? [],
    [data?.pages]
  );

  // 클라이언트 사이드 날짜 필터링 적용
  const contacts = useMemo(() => {
    if (dateFilter === 'all') return allContacts;
    return allContacts.filter((contact: Contact) =>
      matchesDateFilter(contact.created_at, dateFilter)
    );
  }, [allContacts, dateFilter]);

  // 첫 페이지에서 statusCounts와 totalCount 가져오기
  // 검색 시에도 항상 statusCounts 표시 (서버에서 검색어 기준으로 계산됨)
  const statusCounts = useMemo(() => data?.pages[0]?.statusCounts ?? null, [data?.pages]);
  const totalCount = useMemo(() => data?.pages[0]?.totalCount ?? 0, [data?.pages]);

  // 카드 토글 상태 관리 (신규 → 읽음 자동 변경 포함)
  const { expandedContacts, toggleContact } = useToggleWithStatusChange(contacts);

  // 강조 표시 상태
  const [highlightedId, setHighlightedId] = useState<string | undefined>(highlightContactId);
  const highlightRef = useRef<HTMLDivElement>(null);
  const hasScrolledToHighlight = useRef(false);

  // highlightContactId가 있으면 해당 카드 자동 펼침 + 스크롤
  useEffect(() => {
    if (!highlightContactId || hasScrolledToHighlight.current) return;

    const contactExists = contacts.some((c) => c.id === highlightContactId);
    if (!contactExists) return;

    // 카드 펼침
    if (!expandedContacts.has(highlightContactId)) {
      toggleContact(highlightContactId);
    }

    // 스크롤 (DOM 업데이트 후)
    requestAnimationFrame(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    hasScrolledToHighlight.current = true;

    // 3초 후 강조 해제
    const timer = setTimeout(() => setHighlightedId(undefined), 3000);
    return () => clearTimeout(timer);
  }, [highlightContactId, contacts, expandedContacts, toggleContact]);

  // 무한 스크롤을 위한 ref
  const observerTarget = useRef<HTMLDivElement>(null);

  // Socket.IO 실시간 구독
  useRealtimeSubscription();

  // Intersection Observer로 무한 스크롤 구현
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // 휴지통 비우기 핸들러
  const handleEmptyTrash = useCallback(async () => {
    const deletingContacts = contacts.filter((c: Contact) => c.status === 'deleting');

    if (deletingContacts.length === 0) {
      alert('삭제중인 문의가 없습니다.');
      return;
    }

    if (
      !confirm(
        `정말로 삭제중인 모든 문의(${deletingContacts.length}개)를 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`
      )
    ) {
      return;
    }

    setIsEmptyingTrash(true);
    try {
      const deletePromises = deletingContacts.map((contact: Contact) =>
        fetch(`/api/contacts/${contact.id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permanent: true }),
        })
          .then((response) => ({ success: response.ok, id: contact.id }))
          .catch(() => ({ success: false, id: contact.id }))
      );

      const results = await Promise.all(deletePromises);
      const successCount = results.filter(
        (r: { success: boolean; id: string }) => r.success
      ).length;
      const failCount = results.filter((r: { success: boolean; id: string }) => !r.success).length;

      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });

      if (failCount === 0) {
        alert(`모든 문의(${successCount}개)가 영구 삭제되었습니다.`);
      } else {
        alert(`영구 삭제 완료: ${successCount}개 성공, ${failCount}개 실패`);
      }
    } catch (error) {
      log.error('Error emptying trash:', error);
      alert('휴지통 비우기 중 오류가 발생했습니다.');
    } finally {
      setIsEmptyingTrash(false);
    }
  }, [contacts, queryClient]);

  // 삭제중 상태 필터 시 휴지통 비우기 버튼
  const trashButton = useMemo(() => {
    if (statusFilter !== 'deleting') return null;

    return (
      <button
        onClick={handleEmptyTrash}
        disabled={
          isEmptyingTrash || contacts.filter((c: Contact) => c.status === 'deleting').length === 0
        }
        className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg font-medium border-0 cursor-pointer ${TRANSITION_STYLES.colors} ${BG_COLOR.error} ${TEXT_COLOR.error} ${BG_COLOR.hoverErrorDark} disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5`}
      >
        {isEmptyingTrash ? (
          <>
            <FaSpinner className="animate-spin" />
            삭제 중...
          </>
        ) : (
          <>
            <FaTrash />
            휴지통 비우기
          </>
        )}
      </button>
    );
  }, [statusFilter, isEmptyingTrash, contacts, handleEmptyTrash]);

  // 검색 중 상태 (검색어가 입력 중이고 데이터 fetching 중)
  const isSearching = searchInput !== searchQuery && isFetching;

  // 에러 상태
  if (isError) {
    return (
      <>
        <StatusFilterBar
          statusFilter={statusFilter}
          statusCounts={statusCounts ?? undefined}
          totalCount={totalCount}
          searchInput={searchInput}
          onSearchChange={onSearchInputChange}
          onSearchClear={onSearchClear}
          onFilterChange={onStatusFilterChange}
          onFilterHover={onFilterHover}
          trashButton={trashButton}
          isSearching={isSearching || isLoading}
          dateFilter={dateFilter}
          onDateFilterChange={onDateFilterChange}
          inquiryTypeFilter={inquiryTypeFilter}
          onInquiryTypeFilterChange={onInquiryTypeFilterChange}
        />
        <div className="flex items-center justify-center py-12">
          <FaExclamationCircle className={`text-2xl ${TEXT_COLOR.error}`} />
          <span className={`ml-2 ${TEXT_COLOR.error}`}>
            에러 발생: {error instanceof Error ? error.message : '알 수 없는 오류'}
          </span>
        </div>
      </>
    );
  }

  // 초기 로딩 중일 때 스켈레톤 표시
  if (isLoading) {
    return (
      <>
        <StatusFilterBar
          statusFilter={statusFilter}
          statusCounts={statusCounts ?? undefined}
          totalCount={totalCount}
          searchInput={searchInput}
          onSearchChange={onSearchInputChange}
          onSearchClear={onSearchClear}
          onFilterChange={onStatusFilterChange}
          onFilterHover={onFilterHover}
          trashButton={trashButton}
          isSearching={true}
          dateFilter={dateFilter}
          onDateFilterChange={onDateFilterChange}
          inquiryTypeFilter={inquiryTypeFilter}
          onInquiryTypeFilterChange={onInquiryTypeFilterChange}
        />
        <ContactCardSkeletonList count={5} />
      </>
    );
  }

  return (
    <>
      <PerformanceMonitor componentName="ContactsList" />

      {/* 필터 바 */}
      <StatusFilterBar
        statusFilter={statusFilter}
        statusCounts={statusCounts ?? undefined}
        totalCount={totalCount}
        searchInput={searchInput}
        onSearchChange={onSearchInputChange}
        onSearchClear={onSearchClear}
        onFilterChange={onStatusFilterChange}
        onFilterHover={onFilterHover}
        trashButton={trashButton}
        isSearching={isSearching}
        dateFilter={dateFilter}
        onDateFilterChange={onDateFilterChange}
        inquiryTypeFilter={inquiryTypeFilter}
        onInquiryTypeFilterChange={onInquiryTypeFilterChange}
      />

      {/* 문의 목록 - 카드 뷰 */}
      <div className="space-y-4">
        {contacts.length > 0 ? (
          contacts.map((contact: Contact) => {
            // 분할된 문의 그룹은 SplitGroupCard로 렌더링
            if (contact.split_count && contact.split_count > 0 && contact.children) {
              return (
                <div
                  key={contact.id}
                  ref={contact.id === highlightContactId ? highlightRef : undefined}
                >
                  <SplitGroupCard
                    parent={contact as Contact & { children: Contact[] }}
                    onContactClick={(child) => {
                      toggleContact(child.id);
                    }}
                  />
                </div>
              );
            }

            const isHighlighted = contact.id === highlightedId;
            return (
              <div
                key={contact.id}
                ref={contact.id === highlightContactId ? highlightRef : undefined}
              >
                <ContactCard
                  contact={contact}
                  isExpanded={expandedContacts.has(contact.id)}
                  onToggle={toggleContact}
                  isHighlighted={isHighlighted}
                />
              </div>
            );
          })
        ) : (
          <EmptyState statusFilter={statusFilter} searchQuery={searchQuery} />
        )}
      </div>

      {/* 무한 스크롤 로딩 인디케이터 */}
      <div ref={observerTarget} className="h-10 flex items-center justify-center mt-4">
        {isFetchingNextPage && (
          <div className="flex items-center gap-2">
            <FaSpinner className={`animate-spin ${TEXT_COLOR.muted}`} />
            <span className={`text-sm ${TEXT_COLOR.secondary}`}>더 불러오는 중...</span>
          </div>
        )}
      </div>

      {/* 더 이상 데이터가 없을 때 표시 */}
      {!hasNextPage && contacts.length > 0 && (
        <div className={`text-center py-4 ${TEXT_COLOR.muted} text-sm`}>
          모든 문의를 불러왔습니다 ({contacts.length}개)
        </div>
      )}
    </>
  );
}
