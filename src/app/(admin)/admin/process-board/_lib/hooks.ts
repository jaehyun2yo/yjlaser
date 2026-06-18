'use client';

import { TEXT_COLOR, BG_COLOR } from '@/lib/styles';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useSocketNamespace } from '@/lib/socket/useSocketNamespace';
import {
  surgicalUpdateContacts,
  type ContactSocketPayload,
} from '@/lib/socket/contact-socket-utils';
import {
  getProcessBoardContacts,
  createTestContact,
  createProxyContact,
} from '@/app/actions/process-board';
import { updateProcessStage } from '@/app/actions/contacts';
import { PROCESS_STAGES_ARRAY } from '@/lib/utils/processStages';
import { logger } from '@/lib/utils/logger';
import { mapStageTransitionError } from '@/lib/utils/stage-transition-errors';
import type { ProcessBoardFilters, ProcessColumnData, ProxyContactInput } from './types';
import type { Contact } from '@/lib/types/contact';
import type { ProcessStage } from '@/lib/utils/processStages';

const log = logger.createLogger('ProcessBoardHooks');

/**
 * 문의 목록을 공정 단계별로 그룹핑
 */
function groupContactsByStage(contacts: Contact[]): ProcessColumnData[] {
  const columns: ProcessColumnData[] = [
    {
      stage: null,
      label: '공정 시작 전',
      contacts: [],
      color: TEXT_COLOR.secondary,
      bgColor: BG_COLOR.muted,
    },
    ...PROCESS_STAGES_ARRAY.map((stage) => ({
      stage: stage.id as ProcessStage,
      label: stage.label,
      contacts: [] as Contact[],
      color: stage.color,
      bgColor: stage.bgColor,
    })),
  ];

  for (const contact of contacts) {
    const column = columns.find((col) => col.stage === contact.process_stage);
    if (column) {
      column.contacts.push(contact);
    } else {
      // process_stage가 null이거나 매칭되지 않으면 "공정 시작 전"에 추가
      columns[0].contacts.push(contact);
    }
  }

  return columns;
}

/**
 * 공정 보드 데이터 훅
 */
export function useProcessBoard(filters?: ProcessBoardFilters) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.processBoard.board(filters),
    queryFn: async () => {
      const result = await getProcessBoardContacts(filters);
      if (!result.success) {
        throw new Error(result.error || '데이터 조회 실패');
      }
      return groupContactsByStage(result.data as Contact[]);
    },
    staleTime: 30000,
    refetchInterval: 30000,
  });

  /**
   * ProcessColumnData[] 내부의 contacts를 surgical update
   */
  const surgicalUpdateColumns = useCallback(
    (data: ContactSocketPayload) => {
      queryClient.setQueriesData<ProcessColumnData[]>(
        { queryKey: queryKeys.processBoard.all },
        (oldData: ProcessColumnData[] | undefined) => {
          if (!oldData) return oldData;

          let changed = false;
          const newColumns = oldData.map((column) => {
            const updated = surgicalUpdateContacts(column.contacts, data);
            if (updated !== column.contacts) {
              changed = true;
              return { ...column, contacts: updated };
            }
            return column;
          });

          return changed ? newColumns : oldData;
        }
      );
    },
    [queryClient]
  );

  // Socket.IO 실시간 구독
  const events = useMemo(
    () => ({
      'contact:created': (data: Record<string, unknown>) => {
        log.info('New contact via Socket.IO', { id: data.id });
        // created → full refetch (can't surgically add to grouped columns)
        queryClient.refetchQueries({ queryKey: queryKeys.processBoard.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all, refetchType: 'none' });
      },
      'contact:updated': (data: Record<string, unknown>) => {
        log.info('Updated contact via Socket.IO', { id: data.id });
        surgicalUpdateColumns(data as unknown as ContactSocketPayload);
        queryClient.invalidateQueries({
          queryKey: queryKeys.processBoard.all,
          refetchType: 'none',
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all, refetchType: 'none' });
      },
      'contact:status_changed': (data: Record<string, unknown>) => {
        log.info('Contact status changed via Socket.IO', { id: data.id });
        surgicalUpdateColumns(data as unknown as ContactSocketPayload);
        queryClient.invalidateQueries({
          queryKey: queryKeys.processBoard.all,
          refetchType: 'none',
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all, refetchType: 'none' });
      },
      'contact:process_stage_changed': (data: Record<string, unknown>) => {
        log.info('Contact process stage changed via Socket.IO', { id: data.id });
        // process_stage_changed may move contact between columns → surgical update + refetch for regrouping
        surgicalUpdateColumns(data as unknown as ContactSocketPayload);
        queryClient.invalidateQueries({
          queryKey: queryKeys.processBoard.all,
          refetchType: 'none',
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all, refetchType: 'none' });
      },
      'contact:deleted': (data: Record<string, unknown>) => {
        log.info('Deleted contact via Socket.IO', { id: data.id });
        // deleted → full refetch (can't surgically remove from grouped columns cleanly)
        queryClient.refetchQueries({ queryKey: queryKeys.processBoard.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all, refetchType: 'none' });
      },
      'contacts:batch_updated': () => {
        log.info('Batch update via Socket.IO — full refetch');
        queryClient.refetchQueries({ queryKey: queryKeys.processBoard.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all, refetchType: 'none' });
      },
    }),
    [queryClient, surgicalUpdateColumns]
  );

  useSocketNamespace({ namespace: 'contacts', events });

  return query;
}

/**
 * 공정 단계 이동 훅
 */
export function useAdvanceProcessStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contactId,
      processStage,
    }: {
      contactId: string;
      processStage: ProcessStage;
    }) => {
      const result = await updateProcessStage(contactId, processStage);
      if (!result.success) {
        const { title, message } = mapStageTransitionError(result.error);
        throw new Error(`${title}: ${message}`);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
    },
  });
}

/**
 * 테스트 문의 생성 훅
 */
export function useCreateTestContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (count: 1 | 5) => {
      const result = await createTestContact(count);
      if (!result.success) {
        throw new Error(result.error || '테스트 문의 생성 실패');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
    },
  });
}

/**
 * 대리 문의 등록 훅
 */
export function useCreateProxyContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ProxyContactInput) => {
      const result = await createProxyContact(data);
      if (!result.success) {
        throw new Error(result.error || '대리 문의 등록 실패');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
    },
  });
}
