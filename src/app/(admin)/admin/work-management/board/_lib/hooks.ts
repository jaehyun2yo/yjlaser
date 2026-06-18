'use client';

import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useSocketNamespace } from '@/lib/socket/useSocketNamespace';
import {
  surgicalUpdateContacts,
  type ContactSocketPayload,
} from '@/lib/socket/contact-socket-utils';
import { getProcessBoardContacts, getWorkCategoryCounts } from '@/app/actions/process-board';
import { logger } from '@/lib/utils/logger';
import type { Contact } from '@/lib/types/contact';
import type { WorkCategory } from './constants';

const log = logger.createLogger('WorkBoard');

interface TaskListFilters {
  workCategory: WorkCategory;
  stageFilter?: string;
  companyName?: string;
  dateFilter?: 'today' | 'week' | 'month' | 'all';
}

// --- Phase 3: 통합 소켓 훅 (중복 구독 제거) ---

/**
 * 보드 전체에서 공유하는 소켓 구독.
 * useTaskList과 useWorkCategoryCounts가 각각 구독하는 대신
 * 하나의 구독으로 통합하여 이벤트당 네트워크 요청을 최소화합니다.
 */
function useBoardSocket() {
  const queryClient = useQueryClient();

  /**
   * Phase 2: Surgical cache update
   * 소켓 페이로드로 캐시 내 특정 contact를 직접 교체합니다.
   * 새 객체 참조가 생성되어 React.memo가 re-render를 감지합니다.
   */
  const handleContactChanged = useCallback(
    (data: Record<string, unknown>) => {
      const payload = data as unknown as ContactSocketPayload;

      if (payload.id == null) {
        log.warn('Socket event received without id, skipping surgical update');
        return;
      }

      log.info('Socket event — surgical cache update', { id: payload.id });

      // 1. processBoard 캐시 surgical update
      queryClient.setQueriesData<{ contacts: Contact[]; total: number }>(
        { queryKey: queryKeys.processBoard.all },
        (oldData) => {
          if (!oldData?.contacts) return oldData;
          const updated = surgicalUpdateContacts(oldData.contacts, payload);
          if (updated === oldData.contacts) return oldData;
          return { ...oldData, contacts: updated };
        }
      );

      // 2. contacts 캐시도 surgical update (다른 페이지 캐시 일관성)
      queryClient.setQueriesData<{ pages?: Array<{ contacts: Contact[] }> }>(
        { queryKey: queryKeys.contacts.all },
        (oldData) => {
          if (!oldData?.pages) return oldData;
          let changed = false;
          const newPages = oldData.pages.map((page) => {
            if (!page.contacts) return page;
            const updated = surgicalUpdateContacts(page.contacts, payload);
            if (updated !== page.contacts) changed = true;
            return updated === page.contacts ? page : { ...page, contacts: updated };
          });
          return changed ? { ...oldData, pages: newPages } : oldData;
        }
      );

      // 3. Background invalidation (eventual consistency)
      // refetchType: 'none' → 이미 캐시를 업데이트했으므로 즉시 refetch하지 않음
      // 다음 폴링 주기에 서버 데이터와 동기화됨
      queryClient.invalidateQueries({
        queryKey: queryKeys.processBoard.all,
        refetchType: 'none',
      });
    },
    [queryClient]
  );

  /** created/deleted → 전체 refetch (surgical update 불가) */
  const handleRefresh = useCallback(
    (data: Record<string, unknown>) => {
      log.info('Socket event (create/delete) — full refetch', {
        id: data?.id,
      });
      queryClient.refetchQueries({ queryKey: queryKeys.processBoard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
    },
    [queryClient]
  );

  const events = useMemo(
    () => ({
      'contact:created': handleRefresh,
      'contact:updated': handleContactChanged,
      'contact:status_changed': handleContactChanged,
      'contact:process_stage_changed': handleContactChanged,
      'contact:deleted': handleRefresh,
      'contacts:batch_updated': handleRefresh,
    }),
    [handleRefresh, handleContactChanged]
  );

  return useSocketNamespace({ namespace: 'contacts', events });
}

/**
 * 작업 목록 데이터 훅
 */
export function useTaskList(filters: TaskListFilters) {
  const { status: socketStatus } = useBoardSocket();

  // Polling: 소켓 연결 시 10초, 미연결 시 3초
  const refetchInterval = socketStatus === 'connected' ? 10000 : 3000;

  const query = useQuery({
    queryKey: queryKeys.processBoard.board({
      ...filters,
      workCategory: filters.workCategory,
    }),
    queryFn: async () => {
      const result = await getProcessBoardContacts({
        workCategory: filters.workCategory,
        stageFilter: filters.stageFilter,
        companyName: filters.companyName,
        dateFilter: filters.dateFilter,
      });
      if (!result.success) {
        throw new Error(result.error || '데이터 조회 실패');
      }
      return {
        contacts: result.data as Contact[],
        total: result.total || 0,
      };
    },
    staleTime: 5000,
    placeholderData: keepPreviousData,
    refetchInterval,
  });

  return { ...query, socketStatus };
}

/**
 * 작업 카테고리별 카운트 훅
 * useBoardSocket이 이미 processBoard.all을 invalidate하므로
 * 여기서는 별도 소켓 구독 없이 폴링만 사용합니다.
 */
export function useWorkCategoryCounts() {
  const query = useQuery({
    queryKey: queryKeys.processBoard.categoryCounts(),
    queryFn: async () => {
      const result = await getWorkCategoryCounts();
      if (!result.success) {
        throw new Error(result.error || '카운트 조회 실패');
      }
      return result.data!;
    },
    staleTime: 5000,
    placeholderData: keepPreviousData,
    refetchInterval: 10000,
  });

  return query;
}
