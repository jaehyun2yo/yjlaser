/**
 * 통합 관리 API 함수
 * NestJS 백엔드 http://localhost:4000/api/v1/integration/ 와 통신
 */

import type {
  IntegrationOrder,
  OrderStats,
  OrderEvent,
  OrderFilters,
  InventoryItem,
  InventoryAlert,
  InventoryTransaction,
  Delivery,
  ProgramInfo,
  IntegrationEvent,
  PaginatedResponse,
  CreateOrderRequest,
  CreateDeliveryRequest,
  StockAdjustmentRequest,
  WorkshopFilters,
  WorkshopOrdersResponse,
  SyncLog,
  SyncLogStats,
  PipelineBacklogItem,
  OperationFailuresResponse,
  OperationHeartbeatsResponse,
  OrderTimelineResponse,
} from './types';

import { NESTJS_CLIENT_API_BASE } from '@/lib/api/api-base';

const INTEGRATION_BASE = `${NESTJS_CLIENT_API_BASE}/integration`;

// 공통 fetch 헬퍼
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${INTEGRATION_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(`API Error ${res.status}: ${errorText}`);
  }

  return res.json() as Promise<T>;
}

// ============================================================
// 주문 API
// ============================================================

export const integrationOrderApi = {
  // 주문 통계 조회
  getStats: (): Promise<OrderStats> => apiFetch('/orders/stats'),

  // 주문 목록 조회
  getOrders: async (filters?: OrderFilters): Promise<PaginatedResponse<IntegrationOrder>> => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.statusGroup) params.set('statusGroup', filters.statusGroup);
    if (filters?.companyName) params.set('companyName', filters.companyName);
    if (filters?.priority) params.set('priority', filters.priority);
    if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.set('dateTo', filters.dateTo);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    const res = await apiFetch<{
      orders: IntegrationOrder[];
      total: number;
      page: number;
      limit: number;
      hasMore: boolean;
    }>(`/orders${qs ? `?${qs}` : ''}`);
    return {
      data: res.orders,
      total: res.total,
      page: res.page,
      limit: res.limit,
      totalPages: Math.ceil(res.total / res.limit),
    };
  },

  // 주문 상세 조회
  getOrder: (id: string): Promise<IntegrationOrder> => apiFetch(`/orders/${id}`),

  // 주문 이벤트 내역
  getOrderEvents: (id: string): Promise<OrderEvent[]> => apiFetch(`/orders/${id}/events`),

  // 주문 운영 타임라인
  getOrderTimeline: (id: string): Promise<OrderTimelineResponse> =>
    apiFetch(`/orders/${id}/timeline`),

  // 주문 생성
  createOrder: (data: CreateOrderRequest): Promise<IntegrationOrder> =>
    apiFetch('/orders', { method: 'POST', body: JSON.stringify(data) }),

  // 주문 상태 변경
  updateOrderStatus: (id: string, status: string): Promise<IntegrationOrder> =>
    apiFetch(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // 주문 우선순위 변경
  updateOrderPriority: (
    id: string,
    priority: 'urgent' | 'normal' | 'low'
  ): Promise<IntegrationOrder> =>
    apiFetch(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ priority }) }),
};

// ============================================================
// 재고 API
// ============================================================

export const integrationInventoryApi = {
  // 재고 부족 알림 조회
  getAlerts: (): Promise<InventoryAlert[]> => apiFetch('/inventory/alerts'),

  // 재고 목록 조회
  getItems: (category?: string): Promise<InventoryItem[]> => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    const qs = params.toString();
    return apiFetch(`/inventory${qs ? `?${qs}` : ''}`);
  },

  // 재고 거래 내역
  getTransactions: (itemId: string): Promise<InventoryTransaction[]> =>
    apiFetch(`/inventory/${itemId}/transactions`),

  // 입고/출고 처리
  adjustStock: (data: StockAdjustmentRequest): Promise<InventoryItem> =>
    apiFetch('/inventory/adjust', { method: 'POST', body: JSON.stringify(data) }),
};

// ============================================================
// 납품 API
// ============================================================

export const integrationDeliveryApi = {
  // 납품 목록 조회
  getDeliveries: (status?: string): Promise<Delivery[]> => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    const qs = params.toString();
    return apiFetch(`/deliveries${qs ? `?${qs}` : ''}`);
  },

  // 납품 상세 조회
  getDelivery: (id: string): Promise<Delivery> => apiFetch(`/deliveries/${id}`),

  // 납품 생성
  createDelivery: (data: CreateDeliveryRequest): Promise<Delivery> =>
    apiFetch('/deliveries', { method: 'POST', body: JSON.stringify(data) }),

  // 납품 상태 변경
  updateDeliveryStatus: (id: string, status: string): Promise<Delivery> =>
    apiFetch(`/deliveries/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};

// ============================================================
// 프로그램 API
// ============================================================

// 프로그램 타입별 한글 표시명 매핑
// 실제 heartbeat에서 사용하는 program_type 값 기준
const PROGRAM_DISPLAY_NAMES: Record<string, string> = {
  invoice_manager: '유진레이저 업무 관리 프로그램',
  nesting_program: '레이저 네스팅 프로그램',
};

// 테스트/내부 인스턴스 필터링 (실제 프로그램만 표시)
const EXCLUDED_INSTANCES = new Set(['test_heartbeat', 'health_check']);

// 백엔드 응답을 프론트엔드 ProgramInfo 타입으로 변환
interface BackendProgram {
  id: string;
  program_type: string;
  instance_name: string;
  status: string;
  version?: string | null;
  hostname?: string | null;
  last_seen_at: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

function transformProgram(raw: BackendProgram): ProgramInfo {
  // uptime 계산: created_at ~ 현재 (online일 때만)
  let uptime: number | undefined;
  if (raw.status === 'online' && raw.created_at) {
    uptime = Math.floor((Date.now() - new Date(raw.created_at).getTime()) / 1000);
  }

  return {
    id: raw.id,
    name: raw.program_type,
    displayName: PROGRAM_DISPLAY_NAMES[raw.program_type] || raw.instance_name || raw.program_type,
    instanceName: raw.instance_name || undefined,
    status: raw.status as ProgramInfo['status'],
    version: raw.version ?? undefined,
    hostname: raw.hostname ?? undefined,
    lastSeen: raw.last_seen_at,
    uptime,
    metadata: raw.metadata ?? undefined,
  };
}

export const integrationProgramApi = {
  // 프로그램 목록 및 상태 조회 (백엔드 응답을 프론트엔드 타입으로 변환)
  getPrograms: async (): Promise<ProgramInfo[]> => {
    const rawPrograms = await apiFetch<BackendProgram[]>('/programs');
    return rawPrograms
      .filter((p) => !EXCLUDED_INSTANCES.has(p.instance_name))
      .map(transformProgram);
  },
};

// ============================================================
// API 상태 확인 (Health Check)
// ============================================================

export interface ApiHealthResult {
  name: string;
  url: string;
  status: 'connected' | 'disconnected' | 'error';
  responseTime: number;
  statusCode?: number;
  errorMessage?: string;
  checkedAt: string;
}

export interface ApiHealthCheckResponse {
  results: ApiHealthResult[];
  checkedAt: string;
}

async function checkEndpoint(name: string, url: string): Promise<ApiHealthResult> {
  const start = performance.now();
  const checkedAt = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const responseTime = Math.round(performance.now() - start);

    return {
      name,
      url,
      status: res.ok ? 'connected' : 'error',
      responseTime,
      statusCode: res.status,
      errorMessage: res.ok ? undefined : `HTTP ${res.status}`,
      checkedAt,
    };
  } catch (err) {
    const responseTime = Math.round(performance.now() - start);
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';

    return {
      name,
      url,
      status: 'disconnected',
      responseTime,
      errorMessage: isTimeout ? '응답 시간 초과 (5초)' : '연결할 수 없음',
      checkedAt,
    };
  }
}

export const integrationHealthApi = {
  checkAll: async (): Promise<ApiHealthCheckResponse> => {
    const checks = await Promise.all([
      checkEndpoint('NestJS API 서버', `${NESTJS_CLIENT_API_BASE}/integration/programs`),
      checkEndpoint('웹하드 API (프록시)', '/api/webhard/settings'),
      checkEndpoint('Next.js 서버', '/api/health'),
    ]);

    return {
      results: checks,
      checkedAt: new Date().toISOString(),
    };
  },
};

// ============================================================
// 이벤트 타임라인 API
// ============================================================

export const integrationEventApi = {
  // 최근 이벤트 조회
  getEvents: async (limit?: number): Promise<IntegrationEvent[]> => {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    const res = await apiFetch<{ events: IntegrationEvent[] }>(`/events${qs ? `?${qs}` : ''}`);
    return res.events;
  },
};

// ============================================================
// Workshop API
// ============================================================

export const integrationWorkshopApi = {
  async getOrders(filters?: WorkshopFilters): Promise<WorkshopOrdersResponse> {
    const params = new URLSearchParams();
    if (filters?.stage) params.set('stage', filters.stage);
    if (filters?.period) params.set('period', filters.period);
    if (filters?.search) params.set('search', filters.search);
    const qs = params.toString();
    return apiFetch<WorkshopOrdersResponse>(`/orders/workshop${qs ? `?${qs}` : ''}`);
  },
};

// ============================================================
// SyncLog API
// ============================================================

export const integrationSyncLogApi = {
  async getLogs(filters?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ logs: SyncLog[]; total: number; page: number; hasMore: boolean }> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return apiFetch(`/sync-logs${qs ? `?${qs}` : ''}`);
  },

  async getStats(date?: string): Promise<SyncLogStats> {
    const qs = date ? `?date=${date}` : '';
    return apiFetch<SyncLogStats>(`/sync-logs/stats${qs}`);
  },

  async getPipelineBacklog(limit = 10): Promise<PipelineBacklogItem[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    return apiFetch<PipelineBacklogItem[]>(`/sync-logs/pipeline-backlog?${params.toString()}`);
  },
};

// ============================================================
// Operations API
// ============================================================

export const integrationOperationsApi = {
  async getFailures(filters?: {
    cursor?: string;
    limit?: number;
  }): Promise<OperationFailuresResponse> {
    const params = new URLSearchParams();
    if (filters?.cursor) params.set('cursor', filters.cursor);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return apiFetch<OperationFailuresResponse>(`/operations/failures${qs ? `?${qs}` : ''}`);
  },

  async getHeartbeats(): Promise<OperationHeartbeatsResponse> {
    return apiFetch<OperationHeartbeatsResponse>('/operations/heartbeats');
  },
};
