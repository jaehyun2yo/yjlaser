'use client';

import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useSocketNamespace } from '@/lib/socket/useSocketNamespace';
import {
  surgicalUpdateContacts,
  type ContactSocketPayload,
} from '@/lib/socket/contact-socket-utils';
import { getDeliveredContacts, getDeliveredCompanyNames } from '@/app/actions/process-board';
import { logger } from '@/lib/utils/logger';
import type { Contact } from '@/lib/types/contact';

const log = logger.createLogger('DeliveredHooks');

interface DeliveredListFilters {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  companyNames?: string[];
}

/**
 * 납품 완료 소켓 구독 훅 (공유)
 * 두 훅이 같은 namespace에 중복 구독하지 않도록 하나로 통합
 */
export function useDeliveredSocket() {
  const queryClient = useQueryClient();

  const events = useMemo(
    () => ({
      'contact:updated': (data: Record<string, unknown>) => {
        log.info('Updated contact via Socket.IO (delivered)', { id: data.id });
        // Surgical update on delivered list cache
        queryClient.setQueriesData<{ contacts: Contact[]; total: number }>(
          { queryKey: queryKeys.processBoard.all },
          (oldData: { contacts: Contact[]; total: number } | undefined) => {
            if (!oldData?.contacts) return oldData;
            const updated = surgicalUpdateContacts(
              oldData.contacts,
              data as unknown as ContactSocketPayload
            );
            return updated !== oldData.contacts ? { ...oldData, contacts: updated } : oldData;
          }
        );
        queryClient.invalidateQueries({
          queryKey: queryKeys.processBoard.all,
          refetchType: 'none',
        });
      },
      'contact:status_changed': (data: Record<string, unknown>) => {
        log.info('Contact status changed via Socket.IO (delivered)', { id: data.id });
        // Surgical update on delivered list cache
        queryClient.setQueriesData<{ contacts: Contact[]; total: number }>(
          { queryKey: queryKeys.processBoard.all },
          (oldData: { contacts: Contact[]; total: number } | undefined) => {
            if (!oldData?.contacts) return oldData;
            const updated = surgicalUpdateContacts(
              oldData.contacts,
              data as unknown as ContactSocketPayload
            );
            return updated !== oldData.contacts ? { ...oldData, contacts: updated } : oldData;
          }
        );
        queryClient.invalidateQueries({
          queryKey: queryKeys.processBoard.all,
          refetchType: 'none',
        });
        // Company names may change when status changes (contact enters/leaves delivered)
        queryClient.invalidateQueries({
          queryKey: queryKeys.processBoard.deliveredCompanies(),
          refetchType: 'none',
        });
      },
      'contact:process_stage_changed': (data: Record<string, unknown>) => {
        log.info('Contact process stage changed via Socket.IO (delivered)', { id: data.id });
        queryClient.setQueriesData<{ contacts: Contact[]; total: number }>(
          { queryKey: queryKeys.processBoard.all },
          (oldData: { contacts: Contact[]; total: number } | undefined) => {
            if (!oldData?.contacts) return oldData;
            const updated = surgicalUpdateContacts(
              oldData.contacts,
              data as unknown as ContactSocketPayload
            );
            return updated !== oldData.contacts ? { ...oldData, contacts: updated } : oldData;
          }
        );
        queryClient.invalidateQueries({
          queryKey: queryKeys.processBoard.all,
          refetchType: 'none',
        });
      },
      'contact:created': (data: Record<string, unknown>) => {
        log.info('New contact via Socket.IO (delivered)', { id: data.id });
        // Full refetch — can't surgically add
        queryClient.refetchQueries({ queryKey: queryKeys.processBoard.all });
        queryClient.invalidateQueries({
          queryKey: queryKeys.processBoard.deliveredCompanies(),
          refetchType: 'none',
        });
      },
      'contact:deleted': (data: Record<string, unknown>) => {
        log.info('Deleted contact via Socket.IO (delivered)', { id: data.id });
        // Full refetch — can't surgically remove
        queryClient.refetchQueries({ queryKey: queryKeys.processBoard.all });
        queryClient.invalidateQueries({
          queryKey: queryKeys.processBoard.deliveredCompanies(),
          refetchType: 'none',
        });
      },
    }),
    [queryClient]
  );

  useSocketNamespace({ namespace: 'contacts', events });
}

/**
 * 납품 완료 목록 데이터 훅
 */
export function useDeliveredList(filters: DeliveredListFilters) {
  const query = useQuery({
    queryKey: queryKeys.processBoard.delivered(filters),
    queryFn: async () => {
      const result = await getDeliveredContacts(filters);
      if (!result.success) {
        throw new Error(result.error || '데이터 조회 실패');
      }
      return {
        contacts: result.data as Contact[],
        total: result.total || 0,
      };
    },
    staleTime: 30000,
    placeholderData: keepPreviousData,
  });

  return query;
}

/**
 * 납품 완료 문의의 고유 업체명 목록 훅
 */
export function useDeliveredCompanyNames() {
  const query = useQuery({
    queryKey: queryKeys.processBoard.deliveredCompanies(),
    queryFn: async () => {
      const result = await getDeliveredCompanyNames();
      if (!result.success) {
        throw new Error(result.error || '업체명 목록 조회 실패');
      }
      return result.data || [];
    },
    staleTime: 60000,
    placeholderData: keepPreviousData,
  });

  return query;
}
