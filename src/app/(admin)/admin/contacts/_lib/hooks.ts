/**
 * 문의하기 관리 커스텀 훅
 */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useSocketNamespace } from '@/lib/socket/useSocketNamespace';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { Contact, StatusCounts } from '@/lib/types';
import { STORAGE_KEYS, SEARCH_DEBOUNCE_MS, CACHE_STALE_TIME, CACHE_GC_TIME } from './constants';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('ContactsHooks');

/**
 * localStorage 헬퍼 함수
 */
function loadFromStorage(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (error) {
    log.error(`Error reading ${key} from localStorage`, error);
  }
  return new Set();
}

function saveToStorage(key: string, set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch (error) {
    log.error(`Error saving ${key} to localStorage`, error);
  }
}

/**
 * 클라이언트 마운트 상태 훅 (hydration 깜빡임 방지)
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}

/**
 * 카드 확장/축소 상태 관리 훅
 */
export function useContactExpansion() {
  const [expandedContacts, setExpandedContacts] = useState<Set<string>>(new Set());

  const isExpanded = useCallback(
    (contactId: string) => expandedContacts.has(contactId),
    [expandedContacts]
  );

  const toggleExpanded = useCallback((contactId: string) => {
    setExpandedContacts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(contactId)) {
        newSet.delete(contactId);
      } else {
        newSet.add(contactId);
      }
      return newSet;
    });
  }, []);

  const expand = useCallback((contactId: string) => {
    setExpandedContacts((prev) => {
      const newSet = new Set(prev);
      newSet.add(contactId);
      return newSet;
    });
  }, []);

  const collapse = useCallback((contactId: string) => {
    setExpandedContacts((prev) => {
      const newSet = new Set(prev);
      newSet.delete(contactId);
      return newSet;
    });
  }, []);

  return {
    expandedContacts,
    isExpanded,
    toggleExpanded,
    expand,
    collapse,
  };
}

/**
 * 알림 뱃지 해제 관리 훅 (개별 contact용)
 * contact 객체를 받아서 해당 contact에 대한 뱃지 상태와 해제 함수를 반환
 */
export function useNotificationDismissal(contactId: string) {
  const queryClient = useQueryClient();

  // 수정요청 뱃지
  const [dismissedRevisionRequests, setDismissedRevisionRequests] = useState<Set<string>>(() =>
    loadFromStorage(STORAGE_KEYS.DISMISSED_REVISION_REQUESTS)
  );

  // 배송방법 뱃지
  const [dismissedDeliveryMethods, setDismissedDeliveryMethods] = useState<Set<string>>(() =>
    loadFromStorage(STORAGE_KEYS.DISMISSED_DELIVERY_METHODS)
  );

  // 예약변경 뱃지
  const [dismissedVisitSchedules, setDismissedVisitSchedules] = useState<Set<string>>(() =>
    loadFromStorage(STORAGE_KEYS.DISMISSED_VISIT_SCHEDULES)
  );

  // 수정요청 뱃지 해제 여부 체크 함수
  const checkRevisionRequestDismissed = useCallback(
    (revisionRequestedAt: string | null | undefined) => {
      if (!revisionRequestedAt) return true;
      const key = `${contactId}-${revisionRequestedAt}`;
      return dismissedRevisionRequests.has(key);
    },
    [contactId, dismissedRevisionRequests]
  );

  // 수정요청 뱃지 해제
  const dismissRevisionRequest = useCallback(
    (revisionRequestedAt: string | null | undefined) => {
      if (!revisionRequestedAt) return;
      const key = `${contactId}-${revisionRequestedAt}`;
      const newSet = new Set(dismissedRevisionRequests);
      newSet.add(key);
      setDismissedRevisionRequests(newSet);
      saveToStorage(STORAGE_KEYS.DISMISSED_REVISION_REQUESTS, newSet);
    },
    [contactId, dismissedRevisionRequests]
  );

  // 배송방법 뱃지 해제 여부
  const isDeliveryMethodDismissed = dismissedDeliveryMethods.has(`${contactId}-delivery-method`);

  // 배송방법 뱃지 해제 (서버 동기화 포함)
  const dismissDeliveryMethod = useCallback(async () => {
    const key = `${contactId}-delivery-method`;
    const newSet = new Set(dismissedDeliveryMethods);
    newSet.add(key);
    setDismissedDeliveryMethods(newSet);
    saveToStorage(STORAGE_KEYS.DISMISSED_DELIVERY_METHODS, newSet);

    try {
      const response = await fetch(`/api/contacts/${contactId}/delivery-method-acknowledged`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
      }
    } catch (error) {
      log.error('Error acknowledging delivery method change', error);
    }
  }, [contactId, dismissedDeliveryMethods, queryClient]);

  // 예약변경 뱃지 해제 여부 체크 함수
  const checkVisitScheduleDismissed = useCallback(
    (bookingChangedAt: string | null | undefined) => {
      if (!bookingChangedAt) return true;
      const key = `${contactId}-${bookingChangedAt}`;
      return dismissedVisitSchedules.has(key);
    },
    [contactId, dismissedVisitSchedules]
  );

  // 예약변경 뱃지 해제 (서버 동기화 포함)
  const dismissVisitSchedule = useCallback(
    async (bookingChangedAt: string | null | undefined) => {
      if (!bookingChangedAt) return;
      const key = `${contactId}-${bookingChangedAt}`;
      const newSet = new Set(dismissedVisitSchedules);
      newSet.add(key);
      setDismissedVisitSchedules(newSet);
      saveToStorage(STORAGE_KEYS.DISMISSED_VISIT_SCHEDULES, newSet);

      try {
        const response = await fetch(`/api/contacts/${contactId}/booking-change-acknowledged`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
          queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        }
      } catch (error) {
        log.error('Error acknowledging booking change', error);
      }
    },
    [contactId, dismissedVisitSchedules, queryClient]
  );

  return {
    // 상태 체크 함수
    checkRevisionRequestDismissed,
    checkVisitScheduleDismissed,
    isDeliveryMethodDismissed,
    // 해제 함수
    dismissRevisionRequest,
    dismissVisitSchedule,
    dismissDeliveryMethod,
  };
}

/**
 * 문의 액션 훅 (CRUD)
 */
export function useContactActions() {
  const queryClient = useQueryClient();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [permanentlyDeletingId, setPermanentlyDeletingId] = useState<string | null>(null);
  const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);

  // 작업 시작 (new → read)
  const handleStartWork = useCallback(
    async (contactId: string, e: React.MouseEvent) => {
      e.stopPropagation();

      try {
        const response = await fetch(`/api/contacts/${contactId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'drawing' }),
        });

        if (response.ok) {
          queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        } else {
          alert('작업 시작에 실패했습니다.');
        }
      } catch (error) {
        log.error('Error starting work', error);
        alert('작업 시작 중 오류가 발생했습니다.');
      }
    },
    [queryClient]
  );

  // 상태 변경
  const handleChangeStatus = useCallback(
    async (contactId: string, status: string, e: React.MouseEvent) => {
      e.stopPropagation();

      try {
        const response = await fetch(`/api/contacts/${contactId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });

        if (response.ok) {
          queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        } else {
          alert('상태 변경에 실패했습니다.');
        }
      } catch (error) {
        log.error('Error changing status', error);
        alert('상태 변경 중 오류가 발생했습니다.');
      }
    },
    [queryClient]
  );

  // 복구
  const handleRestore = useCallback(
    async (contactId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setRestoringId(contactId);

      try {
        const response = await fetch(`/api/contacts/${contactId}/restore`, {
          method: 'POST',
        });

        if (response.ok) {
          queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        } else {
          const error = await response.json();
          alert(`복구 실패: ${error.error || '알 수 없는 오류가 발생했습니다.'}`);
        }
      } catch (error) {
        log.error('Error restoring contact', error);
        alert('복구 중 오류가 발생했습니다.');
      } finally {
        setRestoringId(null);
      }
    },
    [queryClient]
  );

  // 영구 삭제
  const handlePermanentDelete = useCallback(
    async (contactId: string, contactName: string, e: React.MouseEvent) => {
      e.stopPropagation();

      if (
        !confirm(
          `정말로 "${contactName}" 문의를 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`
        )
      ) {
        return;
      }

      setPermanentlyDeletingId(contactId);

      try {
        const response = await fetch(`/api/contacts/${contactId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permanent: true }),
        });

        if (response.ok) {
          alert('문의가 영구 삭제되었습니다.');
          queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        } else {
          const error = await response.json();
          alert(`영구 삭제 실패: ${error.error || '알 수 없는 오류가 발생했습니다.'}`);
        }
      } catch (error) {
        log.error('Error permanently deleting contact', error);
        alert('영구 삭제 중 오류가 발생했습니다.');
      } finally {
        setPermanentlyDeletingId(null);
      }
    },
    [queryClient]
  );

  // 휴지통 비우기
  const handleEmptyTrash = useCallback(
    async (deletingContacts: Contact[]) => {
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
        const deletePromises = deletingContacts.map((contact) =>
          fetch(`/api/contacts/${contact.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permanent: true }),
          })
            .then((response) => ({ success: response.ok, id: contact.id }))
            .catch((error) => {
              log.error(`Error permanently deleting contact ${contact.id}`, error);
              return { success: false, id: contact.id };
            })
        );

        const results = await Promise.all(deletePromises);
        const successCount = results.filter((r) => r.success).length;
        const failCount = results.filter((r) => !r.success).length;

        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });

        if (failCount === 0) {
          alert(`모든 문의(${successCount}개)가 영구 삭제되었습니다.`);
        } else {
          alert(`영구 삭제 완료: ${successCount}개 성공, ${failCount}개 실패`);
        }
      } catch (error) {
        log.error('Error emptying trash', error);
        alert('휴지통 비우기 중 오류가 발생했습니다.');
      } finally {
        setIsEmptyingTrash(false);
      }
    },
    [queryClient]
  );

  return {
    handleStartWork,
    handleChangeStatus,
    handleRestore,
    handlePermanentDelete,
    handleEmptyTrash,
    restoringId,
    permanentlyDeletingId,
    isEmptyingTrash,
  };
}

/**
 * 검색 디바운스 훅 (URL 동기화 - shallow routing)
 * window.history.replaceState를 사용하여 불필요한 서버 요청 방지
 */
export function useSearchDebounce(
  searchInput: string,
  searchQuery: string,
  onSearchChange?: (search: string) => void,
  basePath: string = '/admin/contacts'
) {
  const searchParams = useSearchParams();

  // 실시간 검색 디바운스
  useEffect(() => {
    const trimmedInput = searchInput.trim();
    const trimmedQuery = searchQuery.trim();

    if (trimmedInput === trimmedQuery) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());

      if (trimmedInput) {
        params.set('search', trimmedInput);
      } else {
        params.delete('search');
      }
      params.delete('page');

      // shallow routing: 서버 요청 없이 URL만 변경
      window.history.replaceState({}, '', `${basePath}?${params.toString()}`);

      // 상태 콜백 호출 (React Query 트리거용)
      onSearchChange?.(trimmedInput);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, searchParams, onSearchChange, basePath]);
}

/**
 * 필터 관리 훅 (shallow routing)
 * window.history.replaceState를 사용하여 불필요한 서버 요청 방지
 */
export function useContactFilter(basePath: string = '/admin/contacts') {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // 필터 변경 핸들러 - shallow routing
  const handleFilterChange = useCallback(
    (newStatus: string, resetSearch: boolean = true) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('status', newStatus);
      params.delete('page');

      if (resetSearch) {
        params.delete('search');
      }

      // shallow routing: 서버 요청 없이 URL만 변경
      window.history.replaceState({}, '', `${basePath}?${params.toString()}`);

      return newStatus;
    },
    [searchParams, basePath]
  );

  // 날짜 필터 변경 핸들러 - shallow routing
  const handleDateFilterChange = useCallback(
    (newDateFilter: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (newDateFilter === 'all') {
        params.delete('dateFilter');
      } else {
        params.set('dateFilter', newDateFilter);
      }
      params.delete('page');

      // shallow routing: 서버 요청 없이 URL만 변경
      window.history.replaceState({}, '', `${basePath}?${params.toString()}`);

      return newDateFilter;
    },
    [searchParams, basePath]
  );

  // Hover prefetch: 필터 버튼에 마우스 올리면 미리 데이터 로드
  // 날짜 필터는 클라이언트 사이드이므로 prefetch에서 제외
  const prefetchFilter = useCallback(
    (status: string) => {
      queryClient.prefetchInfiniteQuery({
        queryKey: queryKeys.contacts.list({ status, search: '' }),
        queryFn: async ({ pageParam = 1 }) => {
          const params = new URLSearchParams();
          params.set('status', status);
          params.set('page', String(pageParam));

          const response = await fetch(`/api/admin/contacts?${params.toString()}`);
          if (!response.ok) {
            throw new Error('Failed to fetch contacts');
          }
          const result = await response.json();
          return {
            contacts: result.contacts || [],
            totalCount: result.totalCount || 0,
            hasMore: result.hasMore || false,
            statusCounts: result.statusCounts || null,
            page: pageParam,
          };
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage: { hasMore: boolean; page: number }) => {
          return lastPage.hasMore ? lastPage.page + 1 : undefined;
        },
        pages: 1, // 첫 페이지만 prefetch
        staleTime: CACHE_STALE_TIME,
      });
    },
    [queryClient]
  );

  return { handleFilterChange, handleDateFilterChange, prefetchFilter };
}

/**
 * 무한 스크롤 쿼리 훅 옵션 인터페이스 (클라이언트 전용)
 */
interface UseContactsInfiniteQueryOptions {
  statusFilter: string;
  searchQuery: string;
  dateFilter?: string;
  processStages?: string[];
  inquiryTypeFilter?: string;
}

/**
 * 무한 스크롤 쿼리 훅 (클라이언트 컴포넌트 전용)
 * 서버 컴포넌트에서 초기 데이터를 받지 않고, 클라이언트에서 직접 fetch
 * 날짜 필터는 클라이언트 사이드에서 처리 (서버 요청 시 제외)
 */
export function useContactsInfiniteQuery({
  statusFilter,
  searchQuery,
  processStages,
  inquiryTypeFilter,
}: UseContactsInfiniteQueryOptions) {
  return useInfiniteQuery({
    // 날짜 필터는 클라이언트 사이드이므로 queryKey에서 제외
    // processStages가 있으면 ERP 전용 캐시 키 사용
    queryKey: processStages
      ? queryKeys.erp.contacts.list({ status: statusFilter, search: searchQuery, processStages })
      : queryKeys.contacts.list({ status: statusFilter, search: searchQuery, inquiryTypeFilter }),
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams();
      params.set('status', statusFilter);
      params.set('page', String(pageParam));
      if (searchQuery) {
        params.set('search', searchQuery);
      }
      if (processStages?.length) {
        params.set('processStages', processStages.join(','));
      }
      if (inquiryTypeFilter && inquiryTypeFilter !== 'all') {
        params.set('inquiry_type', inquiryTypeFilter);
      }
      // 날짜 필터는 클라이언트 사이드에서 처리하므로 서버에 전송하지 않음

      const response = await fetch(`/api/admin/contacts?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch contacts');
      }
      const result = await response.json();
      return {
        contacts: result.contacts || [],
        totalCount: result.totalCount || 0,
        hasMore: result.hasMore || false,
        statusCounts: result.statusCounts || null,
        page: pageParam,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (
      lastPage: {
        contacts: Contact[];
        totalCount: number;
        hasMore: boolean;
        statusCounts: StatusCounts | null;
        page: number;
      },
      allPages: Array<{
        contacts: Contact[];
        totalCount: number;
        hasMore: boolean;
        statusCounts: StatusCounts | null;
        page: number;
      }>
    ) => {
      return lastPage.hasMore ? allPages.length + 1 : undefined;
    },
    staleTime: CACHE_STALE_TIME,
    gcTime: CACHE_GC_TIME,
    // 필터 전환 시 이전 데이터 유지하며 로딩 (깜빡임 방지)
    placeholderData: (previousData: InfiniteContactsData | undefined) => previousData,
    // 윈도우 포커스 시 백그라운드 리페치 활성화
    refetchOnWindowFocus: true,
  });
}

/**
 * 무한 쿼리 데이터 타입
 */
interface InfiniteContactsData {
  pages: Array<{
    contacts: Contact[];
    totalCount: number;
    hasMore: boolean;
    statusCounts: StatusCounts | null;
    page: number;
  }>;
  pageParams: number[];
}

/**
 * 실시간 업데이트 구독 훅 (Socket.IO 기반)
 * - contact:created: 새 문의를 캐시 맨 앞에 추가 (신규 알림)
 * - contact:updated / contact:status_changed / contact:process_stage_changed: 캐시 업데이트
 * - contact:deleted: 캐시에서 제거
 */
export function useRealtimeSubscription() {
  const queryClient = useQueryClient();

  /**
   * 캐시의 모든 contacts 쿼리에서 특정 contact를 업데이트
   */
  const updateContactInCache = useCallback(
    (updatedContact: Contact) => {
      queryClient.setQueriesData<InfiniteContactsData>(
        { queryKey: queryKeys.contacts.all },
        (oldData: InfiniteContactsData | undefined) => {
          if (!oldData) return oldData;

          return {
            ...oldData,
            pages: oldData.pages.map(
              (page: {
                contacts: Contact[];
                totalCount: number;
                hasMore: boolean;
                statusCounts: StatusCounts | null;
                page: number;
              }) => ({
                ...page,
                contacts: page.contacts.map((contact: Contact) =>
                  contact.id === updatedContact.id ? updatedContact : contact
                ),
              })
            ),
          };
        }
      );

      // 상세 페이지 캐시도 업데이트
      queryClient.setQueryData(queryKeys.contacts.detail(updatedContact.id), updatedContact);
    },
    [queryClient]
  );

  /**
   * 캐시의 모든 contacts 쿼리에서 특정 contact를 제거
   */
  const removeContactFromCache = useCallback(
    (contactId: string) => {
      queryClient.setQueriesData<InfiniteContactsData>(
        { queryKey: queryKeys.contacts.all },
        (oldData: InfiniteContactsData | undefined) => {
          if (!oldData) return oldData;

          return {
            ...oldData,
            pages: oldData.pages.map(
              (page: {
                contacts: Contact[];
                totalCount: number;
                hasMore: boolean;
                statusCounts: StatusCounts | null;
                page: number;
              }) => ({
                ...page,
                contacts: page.contacts.filter((contact: Contact) => contact.id !== contactId),
                totalCount: Math.max(0, page.totalCount - 1),
              })
            ),
          };
        }
      );

      // 상세 페이지 캐시도 제거
      queryClient.removeQueries({ queryKey: queryKeys.contacts.detail(contactId) });
    },
    [queryClient]
  );

  /**
   * 새 문의를 캐시 맨 앞에 추가 (신규 문의 알림)
   */
  const addContactToCache = useCallback(
    (newContact: Contact) => {
      queryClient.setQueriesData<InfiniteContactsData>(
        { queryKey: queryKeys.contacts.all },
        (oldData: InfiniteContactsData | undefined) => {
          if (!oldData) return oldData;

          // 첫 번째 페이지에만 추가 (최신순 정렬이므로)
          return {
            ...oldData,
            pages: oldData.pages.map(
              (
                page: {
                  contacts: Contact[];
                  totalCount: number;
                  hasMore: boolean;
                  statusCounts: StatusCounts | null;
                  page: number;
                },
                index: number
              ) => {
                if (index === 0) {
                  // 이미 존재하는지 확인 (중복 방지)
                  const exists = page.contacts.some((c: Contact) => c.id === newContact.id);
                  if (exists) return page;

                  return {
                    ...page,
                    contacts: [newContact, ...page.contacts],
                    totalCount: page.totalCount + 1,
                  };
                }
                return page;
              }
            ),
          };
        }
      );
    },
    [queryClient]
  );

  const events = useMemo(
    () => ({
      'contact:created': (data: Record<string, unknown>) => {
        log.info('New contact via Socket.IO', { id: data.id });
        addContactToCache(data as unknown as Contact);
        // Full refetch for created — cache addition is optimistic, need server truth
        queryClient.refetchQueries({
          queryKey: queryKeys.contacts.all,
          exact: false,
        });
      },
      'contact:updated': (data: Record<string, unknown>) => {
        log.info('Updated contact via Socket.IO', { id: data.id });
        updateContactInCache(data as unknown as Contact);
        // Mark stale but don't immediately refetch — polling handles consistency
        queryClient.invalidateQueries({
          queryKey: queryKeys.contacts.all,
          exact: false,
          refetchType: 'none',
        });
        const contactId = data.id as string | number | undefined;
        if (contactId != null) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.contacts.timeline(contactId),
          });
        }
      },
      'contact:status_changed': (data: Record<string, unknown>) => {
        log.info('Contact status changed via Socket.IO', { id: data.id });
        updateContactInCache(data as unknown as Contact);
        queryClient.invalidateQueries({
          queryKey: queryKeys.contacts.all,
          exact: false,
          refetchType: 'none',
        });
        const contactId = data.id as string | number | undefined;
        if (contactId != null) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.contacts.timeline(contactId),
          });
        }
      },
      'contact:process_stage_changed': (data: Record<string, unknown>) => {
        log.info('Contact process stage changed via Socket.IO', { id: data.id });
        updateContactInCache(data as unknown as Contact);
        queryClient.invalidateQueries({
          queryKey: queryKeys.contacts.all,
          exact: false,
          refetchType: 'none',
        });
        const contactId = data.id as string | number | undefined;
        if (contactId != null) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.contacts.timeline(contactId),
          });
        }
      },
      'contact:deleted': (data: Record<string, unknown>) => {
        const contactId = data.id as string;
        log.info('Deleted contact via Socket.IO', { id: contactId });
        removeContactFromCache(contactId);
        // Full refetch for deleted — total counts need recalculation
        queryClient.refetchQueries({
          queryKey: queryKeys.contacts.all,
          exact: false,
        });
      },
      'contact:drawing_revision_added': (data: Record<string, unknown>) => {
        const contactId = data.contactId as string;
        log.info('Drawing revision added via Socket.IO', { contactId });
        // 통합 타임라인 무효화 (drawing_revision 항목 인터리브 포함)
        queryClient.invalidateQueries({
          queryKey: queryKeys.contacts.timeline(contactId),
        });
      },
      'contact:group-stage-advanced': (data: Record<string, unknown>) => {
        const parentId = data.parentId as string;
        log.info('Group stage advanced via Socket.IO', { parentId });
        // 그룹 단계 이동은 부모+자식 구조 변경 — full refetch
        queryClient.refetchQueries({
          queryKey: queryKeys.contacts.all,
          exact: false,
        });
        // 타임라인도 무효화
        if (parentId) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.contacts.timeline(parentId),
          });
        }
      },
      'contact:split': (data: Record<string, unknown>) => {
        const parentId = data.parentId as string;
        log.info('Contact split via Socket.IO', { parentId });
        // 분할은 새 자식 생성 — full refetch
        queryClient.refetchQueries({
          queryKey: queryKeys.contacts.all,
          exact: false,
        });
      },
    }),
    [queryClient, addContactToCache, updateContactInCache, removeContactFromCache]
  );

  useSocketNamespace({
    namespace: 'contacts',
    events,
  });
}

/**
 * 카드 토글 시 상태 변경 훅 (신규 → 읽음)
 */
export function useToggleWithStatusChange(contacts: Contact[]) {
  const queryClient = useQueryClient();
  const { expandedContacts, isExpanded, toggleExpanded, expand, collapse } = useContactExpansion();

  const toggleContact = useCallback(
    (contactId: string, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
      }

      const wasExpanded = isExpanded(contactId);

      if (wasExpanded) {
        // 창을 닫을 때 신규 상태인 경우 읽음으로 변경
        const contact = contacts.find((c) => c.id === contactId);
        if (contact && contact.status === 'received') {
          fetch(`/api/contacts/${contactId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'received' }),
          })
            .then(() => {
              queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
              queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
            })
            .catch((error) => {
              log.error('Error updating status to read', error);
            });
        }
        collapse(contactId);
      } else {
        expand(contactId);
      }
    },
    [contacts, isExpanded, expand, collapse, queryClient]
  );

  return {
    expandedContacts,
    isExpanded,
    toggleContact,
  };
}
