'use client';

import { useQuery, useMutation, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { Contact } from '@/lib/types/contact';
import { getProcessBoardContacts } from '@/app/actions/process-board';
import type { ProcessStage } from '@/lib/utils/processStages';
import { useErpMobileStore } from '@/app/worker/_lib/store';

// Re-export shared hook for backward compatibility
export { useContactTimeline } from '@/lib/hooks/useContactTimeline';

export const WORKER_STAGES: NonNullable<ProcessStage>[] = [
  'drawing_confirmed',
  'laser',
  'cutting',
  'creasing',
  'delivery',
];

export const OFFICE_STAGES: ProcessStage[] = [null, 'drawing', 'sample'];
export const WORKER_CONTACT_QUERY_LIMIT = 50;

// PIN Login
export function usePinLogin() {
  return useMutation({
    mutationFn: async ({ name, pin }: { name?: string; pin: string }) => {
      const response = await fetch('/api/erp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, pin }),
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      return response.json();
    },
  });
}

// 현장 작업자용 문의 조회 (현장 단계: drawing_confirmed, laser, cutting, inspection, delivery)
export function useStaffProcessContacts(options?: { pollingEnabled?: boolean; enabled?: boolean }) {
  const pollingEnabled = options?.pollingEnabled ?? true;
  const { workerSession, _hydrated } = useErpMobileStore();
  const enabled = _hydrated && !!workerSession && (options?.enabled ?? true);
  return useQuery<Contact[]>({
    queryKey: queryKeys.processBoard.board({ workCategory: 'field' }),
    queryFn: async () => {
      const result = await getProcessBoardContacts({
        workCategory: 'field',
        limit: WORKER_CONTACT_QUERY_LIMIT,
      });
      if (!result.success) throw new Error(result.error || '조회 실패');
      return result.data as Contact[];
    },
    staleTime: 30000,
    placeholderData: keepPreviousData,
    enabled,
    refetchInterval: pollingEnabled ? 60000 : false,
  });
}

// 사무실 작업자용 문의 조회 (사무실 단계: null, drawing, sample)
export function useOfficeWorkerContacts(options?: { pollingEnabled?: boolean; enabled?: boolean }) {
  const pollingEnabled = options?.pollingEnabled ?? true;
  const { workerSession, _hydrated } = useErpMobileStore();
  const enabled = _hydrated && !!workerSession && (options?.enabled ?? true);
  return useQuery<Contact[]>({
    queryKey: queryKeys.processBoard.board({ workCategory: 'office' }),
    queryFn: async () => {
      const result = await getProcessBoardContacts({
        workCategory: 'office',
        limit: WORKER_CONTACT_QUERY_LIMIT,
      });
      if (!result.success) throw new Error(result.error || '조회 실패');
      return result.data as Contact[];
    },
    staleTime: 30000,
    placeholderData: keepPreviousData,
    enabled,
    refetchInterval: pollingEnabled ? 60000 : false,
  });
}

// 미분류 문의 조회 (inquiryType=null, 사무실 탭에 통합 표시)
export function useUnclassifiedContacts(options?: { pollingEnabled?: boolean; enabled?: boolean }) {
  const pollingEnabled = options?.pollingEnabled ?? true;
  const { workerSession, _hydrated } = useErpMobileStore();
  const enabled = _hydrated && !!workerSession && (options?.enabled ?? true);
  return useQuery<Contact[]>({
    queryKey: queryKeys.processBoard.board({ workCategory: 'unclassified' }),
    queryFn: async () => {
      const result = await getProcessBoardContacts({
        workCategory: 'unclassified',
        limit: WORKER_CONTACT_QUERY_LIMIT,
      });
      if (!result.success) throw new Error(result.error || '조회 실패');
      return result.data as Contact[];
    },
    staleTime: 30000,
    placeholderData: keepPreviousData,
    enabled,
    refetchInterval: pollingEnabled ? 60000 : false,
  });
}
