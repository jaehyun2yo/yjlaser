/**
 * 거래처 주문 포털 타입 정의
 * 내부 정보(가격, 네스팅 효율 등)를 제외한 고객용 정보만 포함
 */

// ============================================
// 내부 주문 상태 (NestJS 백엔드)
// ============================================

export type InternalOrderStatus =
  | 'inquiry_received'
  | 'drawing_received'
  | 'drawing_review'
  | 'drawing_confirmed'
  | 'file_classified'
  | 'nesting_queued'
  | 'nesting_complete'
  | 'cutting_ready'
  | 'cutting_in_progress'
  | 'cutting_complete'
  | 'post_processing'
  | 'post_processing_complete'
  | 'inspection'
  | 'delivery_ready'
  | 'delivering'
  | 'delivered'
  | 'closed';

// ============================================
// 고객용 상태 (간소화된 상태)
// ============================================

export type CustomerOrderStatus =
  | '접수됨'
  | '작업 준비중'
  | '작업중'
  | '작업 완료'
  | '납품 진행중'
  | '납품 완료'
  | '완료';

// ============================================
// 타임라인 스텝
// ============================================

export type TimelineStep = '접수' | '준비' | '작업' | '완료' | '납품';

export interface TimelineStepInfo {
  step: TimelineStep;
  label: string;
  completedAt?: string | null;
  isCompleted: boolean;
  isCurrent: boolean;
}

// ============================================
// API 응답 타입 (NestJS 백엔드)
// ============================================

export interface OrderListItem {
  id: string;
  contactId: string;
  title: string;
  status: InternalOrderStatus;
  companyName: string;
  createdAt: string;
  updatedAt: string;
  dueDate?: string | null;
  deliveredAt?: string | null;
}

export interface OrderEvent {
  id: string;
  orderId: string;
  type: string;
  description: string;
  status?: InternalOrderStatus | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface OrderDetail {
  id: string;
  contactId: string;
  title: string;
  status: InternalOrderStatus;
  companyName: string;
  createdAt: string;
  updatedAt: string;
  dueDate?: string | null;
  deliveredAt?: string | null;
  deliveryProofImage?: string | null;
  contactUuid?: string | null;
  events?: OrderEvent[];
}

export interface OrderListResponse {
  orders: OrderListItem[];
  total: number;
  page: number;
  limit: number;
}

// ============================================
// 상태 필터
// ============================================

export interface OrderFilters {
  status?: CustomerOrderStatus | '전체';
  contactId?: number;
}
