'use client';

/**
 * 거래처 주문 포털 React Query 훅
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { fetchCompanyOrders, fetchOrderDetail } from './api';
import type { OrderListItem, OrderDetail } from './types';

// ============================================
// 주문 목록 훅
// ============================================

/**
 * 거래처 주문 목록 조회 훅
 * @param contactId - 거래처 회사 ID
 */
export function useCompanyOrders(contactId: number | undefined) {
  return useQuery<OrderListItem[], Error>({
    queryKey: queryKeys.integration.orders.list({ contactId }),
    queryFn: () => {
      if (!contactId) return Promise.resolve([]);
      return fetchCompanyOrders(contactId);
    },
    enabled: !!contactId,
    staleTime: 30 * 1000, // 30초
    refetchOnWindowFocus: true,
  });
}

// ============================================
// 주문 상세 훅
// ============================================

/**
 * 주문 상세 조회 훅
 * @param orderId - 주문 ID
 */
export function useOrderDetail(orderId: string | undefined) {
  return useQuery<OrderDetail, Error>({
    queryKey: queryKeys.integration.orders.detail(orderId ?? ''),
    queryFn: () => {
      if (!orderId) throw new Error('주문 ID가 없습니다');
      return fetchOrderDetail(orderId);
    },
    enabled: !!orderId,
    staleTime: 30 * 1000, // 30초
    refetchOnWindowFocus: true,
  });
}
