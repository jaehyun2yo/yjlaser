/**
 * 거래처 주문 포털 API 함수
 * NestJS 백엔드 /api/v1/integration/orders 엔드포인트 연동
 */

import type { OrderListItem, OrderDetail } from './types';
import { NESTJS_CLIENT_API_BASE } from '@/lib/api/api-base';

/**
 * 거래처 주문 목록 조회
 * GET /api/v1/integration/orders?contactId={contactId}
 */
export async function fetchCompanyOrders(contactId: number): Promise<OrderListItem[]> {
  const url = `${NESTJS_CLIENT_API_BASE}/integration/orders?contactId=${contactId}`;

  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`주문 목록 조회 실패: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // 응답 구조에 따라 처리 (배열 또는 { orders: [] } 형태)
  if (Array.isArray(data)) {
    return data as OrderListItem[];
  }

  if (data && Array.isArray(data.orders)) {
    return data.orders as OrderListItem[];
  }

  return [];
}

/**
 * 주문 상세 조회
 * GET /api/v1/integration/orders/{id}
 */
export async function fetchOrderDetail(id: string): Promise<OrderDetail> {
  const url = `${NESTJS_CLIENT_API_BASE}/integration/orders/${id}`;

  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`주문 상세 조회 실패: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<OrderDetail>;
}
