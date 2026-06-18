'use client';

import { useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useSocketNamespace } from '@/lib/socket/useSocketNamespace';
import { getProcessBoardContacts } from '@/app/actions/process-board';
import { batchStartDelivery } from '@/app/actions/contacts';
import type { Contact } from '@/lib/types/contact';
import type { DeliveryAddress } from '@/app/worker/delivery/_lib/types';
import type { DeliveryProofFileMetadata } from '@/lib/api/nestjs-server-client';
import { useErpMobileStore } from '@/app/worker/_lib/store';

/**
 * 납품 단계 문의 조회 훅
 * 서버에서 processStages='delivery'로 필터링하여 필요한 데이터만 조회
 * batchStartDelivery가 processStage=null을 즉시 설정하므로 납품 후 목록에서 즉시 제거됨
 */
export function useDeliveryContacts() {
  const { workerSession, _hydrated } = useErpMobileStore();
  const enabled = _hydrated && !!workerSession;
  const query = useQuery<Contact[]>({
    queryKey: queryKeys.processBoard.board({
      workCategory: 'field',
      stageFilter: 'delivery',
    }),
    queryFn: async () => {
      const result = await getProcessBoardContacts({
        workCategory: 'field',
        stageFilter: 'delivery',
      });
      if (!result.success) throw new Error(result.error || '조회 실패');
      return result.data as Contact[];
    },
    staleTime: 30000,
    placeholderData: keepPreviousData,
    enabled,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });

  const deliveryContacts = useMemo(() => {
    return query.data ?? [];
  }, [query.data]);

  return {
    ...query,
    deliveryContacts,
  };
}

/**
 * 일괄 납품 완료 뮤테이션 훅 (1단계: 바로 delivered)
 */
export function useBatchStartDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contactIds,
      deliveryProofImage,
      deliveryProofFile,
    }: {
      contactIds: string[];
      deliveryProofImage?: string;
      deliveryProofFile?: DeliveryProofFileMetadata;
    }) => {
      const result = await batchStartDelivery(contactIds, deliveryProofImage, deliveryProofFile);
      if (!result.success) {
        throw new Error(result.error || '납품 완료에 실패했습니다.');
      }
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
    },
  });
}

/**
 * 납품 대기 문의 조회 훅 (delivering 상태 포함 — 1단계 전환 시 잔존 데이터 처리)
 */
export function usePendingDeliveryContacts() {
  const { deliveryContacts, ...rest } = useDeliveryContacts();

  const pendingContacts = useMemo(() => {
    return deliveryContacts.filter((c) => c.status !== 'delivered');
  }, [deliveryContacts]);

  return {
    ...rest,
    pendingContacts,
  };
}

/**
 * 납품 관련 Socket.IO 실시간 업데이트 훅
 * 디바운스로 짧은 시간 내 중복 이벤트를 하나로 묶어 불필요한 refetch 방지
 */
export function useDeliverySocket() {
  const queryClient = useQueryClient();

  const debouncedInvalidate = useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fn = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        timer = null;
      }, 300);
    };
    fn.cancel = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    return fn;
  }, [queryClient]);

  useEffect(() => {
    return () => debouncedInvalidate.cancel();
  }, [debouncedInvalidate]);

  const events = useMemo(
    () => ({
      'contact:created': debouncedInvalidate,
      'contact:updated': debouncedInvalidate,
      'contact:status_changed': debouncedInvalidate,
      'contact:process_stage_changed': debouncedInvalidate,
      'contact:deleted': debouncedInvalidate,
      'contacts:batch_updated': debouncedInvalidate,
    }),
    [debouncedInvalidate]
  );

  return useSocketNamespace({
    namespace: 'contacts',
    events,
  });
}

/**
 * 납품 대기 contacts에서 주소 정보를 추출하는 훅
 * Contact의 delivery_company_address가 있는 건만 수집
 */
export function useDeliveryAddresses(contacts: Contact[]): DeliveryAddress[] {
  return useMemo(() => {
    const addressMap = new Map<string, DeliveryAddress>();

    for (const contact of contacts) {
      const address = contact.delivery_company_address;
      if (!address || address.trim() === '') continue;

      const key = address.trim();
      if (addressMap.has(key)) continue;

      addressMap.set(key, {
        companyName: contact.delivery_company_name || contact.company_name || '알 수 없음',
        address: key,
        phone: contact.delivery_company_phone || contact.phone || undefined,
      });
    }

    return Array.from(addressMap.values());
  }, [contacts]);
}
