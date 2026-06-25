/**
 * 통합 관리 시스템 타입 정의
 */

// 주문 상태
export type OrderStatusGroup = '접수' | '작업중' | '완료' | '납품';
export type OrderPriority = 'low' | 'normal' | 'urgent';

export interface IntegrationOrder {
  id: string;
  orderNumber: string;
  companyName: string;
  companyId?: number;
  title: string;
  description?: string;
  status: string;
  statusGroup: OrderStatusGroup;
  priority: OrderPriority;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  assignedTo?: string;
  totalAmount?: number;
  notes?: string;
}

export interface OrderStats {
  접수: number;
  작업중: number;
  완료: number;
  납품: number;
  total: number;
}

// 주문 이벤트
export interface OrderEvent {
  id: string;
  orderId: string;
  type: string;
  description: string;
  source: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export type OrderTimelineSourceModel = 'order_event' | 'job_event';

export interface OrderTimelineEvent {
  timeline_id: string;
  source_model: OrderTimelineSourceModel;
  event_id: string;
  order_id: string;
  contact_id: string | null;
  inquiry_number: string | null;
  work_number: string | null;
  event_type: string;
  source: string;
  source_worker: string | null;
  occurred_at: string;
  received_at: string | null;
  created_at: string;
  result: string | null;
  state_apply_status: string | null;
  failure_id: string | null;
  order_event_id: string | null;
  job_id: string | null;
  from_status: string | null;
  to_status: string | null;
  actor_name: string | null;
  message: string | null;
  processed_count: number | null;
  duration_ms: number | null;
}

export interface OrderTimelineResponse {
  order_id: string;
  contact_id: string | null;
  legacy_order_contact_id: number | null;
  inquiry_number: string | null;
  work_number: string | null;
  company_name: string;
  production_status: string | null;
  confirmation_status: string | null;
  classification_status: string | null;
  nesting_status: string | null;
  billing_status: string | null;
  events: OrderTimelineEvent[];
  failures: unknown[];
}

// 주문 필터
export interface OrderFilters {
  status?: string;
  statusGroup?: OrderStatusGroup;
  companyName?: string;
  priority?: OrderPriority;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

// 재고 아이템
export type InventoryCategory = 'material' | 'consumable' | 'equipment' | 'other';

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  currentStock: number;
  minimumStock: number;
  unit: string;
  location?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryAlert {
  id: string;
  itemId: string;
  itemName: string;
  category: InventoryCategory;
  currentStock: number;
  minimumStock: number;
  unit: string;
  severity: 'critical' | 'warning';
}

// 재고 거래 내역
export interface InventoryTransaction {
  id: string;
  itemId: string;
  type: 'in' | 'out';
  quantity: number;
  reason?: string;
  createdAt: string;
  createdBy?: string;
}

// 납품
export type DeliveryStatus = 'pending' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';

export interface Delivery {
  id: string;
  orderId: string;
  orderNumber?: string;
  companyName?: string;
  status: DeliveryStatus;
  scheduledDate?: string;
  deliveredAt?: string;
  trackingNumber?: string;
  carrier?: string;
  address?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// 프로그램 상태
export type ProgramStatus = 'online' | 'offline' | 'error';

export interface ProgramInfo {
  id: string;
  name: string;
  displayName: string;
  instanceName?: string;
  status: ProgramStatus;
  version?: string;
  hostname?: string;
  lastSeen?: string;
  uptime?: number;
  metadata?: Record<string, unknown>;
}

// 통합 이벤트 (타임라인)
export interface IntegrationEvent {
  id: string;
  type: string;
  source: string;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// 페이지네이션 응답
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// 주문 생성 요청
export interface CreateOrderRequest {
  companyName: string;
  title: string;
  description?: string;
  priority: OrderPriority;
  dueDate?: string;
  notes?: string;
}

// 납품 생성 요청
export interface CreateDeliveryRequest {
  orderId: string;
  scheduledDate?: string;
  address?: string;
  carrier?: string;
  notes?: string;
}

// 재고 입출고 요청
export interface StockAdjustmentRequest {
  itemId: string;
  type: 'in' | 'out';
  quantity: number;
  reason?: string;
}

// === Workshop Types ===

export interface WorkshopOrder {
  id: string;
  inquiryNumber: string | null;
  companyName: string;
  title: string;
  status: string;
  priority: 'urgent' | 'normal' | 'low';
  memo: string | null;
  dxfTotalPrice: number;
  cuttingStartedAt: string | null;
  cuttingCompletedAt: string | null;
  postProcessingStartedAt: string | null;
  postProcessingCompletedAt: string | null;
  scheduledAutoCompleteAt: string | null;
  createdAt: string;
}

export interface WorkshopOrdersResponse {
  orders: WorkshopOrder[];
  grouped: {
    cutting: WorkshopOrder[];
    post_processing: WorkshopOrder[];
    delivery: WorkshopOrder[];
  };
  counts: {
    cutting: number;
    post_processing: number;
    delivery: number;
    total: number;
  };
}

export type WorkshopStage = 'cutting' | 'post_processing' | 'delivery';
export type WorkshopPeriod = 'today' | 'week' | 'all';

export interface WorkshopFilters {
  stage?: WorkshopStage;
  period?: WorkshopPeriod;
  search?: string;
}

// === SyncLog Types ===

export type SyncLogStatus = 'synced' | 'company_not_found' | 'api_error' | 'duplicate' | 'skipped';

export interface SyncLog {
  id: number;
  filename: string;
  companyName: string | null;
  status: SyncLogStatus;
  contactId: string | null;
  orderId: string | null;
  errorMessage: string | null;
  md5Hash: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface SyncLogStats {
  date: string;
  synced: number;
  company_not_found: number;
  api_error: number;
  duplicate: number;
  skipped: number;
  total: number;
}

export interface PipelineBacklogItem {
  id: number;
  filename: string;
  companyName: string | null;
  stage: string;
  status: string;
  reasonCode: string;
  fileId?: string;
  folderId?: string;
  context: Record<string, unknown>;
  createdAt: string;
}

export interface OperationFailureLastEvent {
  event_id: string;
  event_type: string;
  source_worker: string;
  occurred_at: string;
  result: string;
  state_apply_status: string;
}

export interface OperationFailure {
  failure_id: string;
  job_id: string | null;
  order_id: string | null;
  contact_id: string | null;
  inquiry_number: string | null;
  work_number: string | null;
  source_worker: string;
  event_type: string | null;
  error_code: string;
  message: string | null;
  retryable: boolean;
  retry_count: number;
  resolved_at: string | null;
  last_event_id: string | null;
  created_at: string;
  updated_at: string;
  last_event: OperationFailureLastEvent | null;
}

export interface OperationFailuresResponse {
  items: OperationFailure[];
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
}

export type OperationHeartbeatStatus = 'online' | 'late' | 'offline';

export interface OperationHeartbeat {
  heartbeat_id: string;
  program_type: string;
  instance_name: string;
  status: OperationHeartbeatStatus;
  stored_status: string;
  version: string | null;
  hostname: string | null;
  last_seen_at: string;
  lag_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface OperationHeartbeatSummary {
  total: number;
  online: number;
  late: number;
  offline: number;
}

export interface OperationHeartbeatsResponse {
  items: OperationHeartbeat[];
  summary: OperationHeartbeatSummary;
  threshold_seconds: {
    late: number;
    offline: number;
  };
}
