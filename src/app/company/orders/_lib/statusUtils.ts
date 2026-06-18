/**
 * 주문 상태 변환 유틸리티
 * 내부 상태를 고객용 간소화 상태로 변환
 */

import type {
  InternalOrderStatus,
  CustomerOrderStatus,
  TimelineStep,
  TimelineStepInfo,
} from './types';

// ============================================
// 내부 상태 -> 고객용 상태 매핑
// ============================================

const STATUS_MAP: Record<InternalOrderStatus, CustomerOrderStatus> = {
  inquiry_received: '접수됨',
  drawing_received: '접수됨',
  drawing_review: '접수됨',
  drawing_confirmed: '작업 준비중',
  file_classified: '작업 준비중',
  nesting_queued: '작업중',
  nesting_complete: '작업중',
  cutting_ready: '작업중',
  cutting_in_progress: '작업중',
  cutting_complete: '작업 완료',
  post_processing: '작업 완료',
  post_processing_complete: '작업 완료',
  inspection: '작업 완료',
  delivery_ready: '납품 진행중',
  delivering: '납품 진행중',
  delivered: '납품 완료',
  closed: '완료',
};

/**
 * 내부 상태를 고객용 상태로 변환
 */
export function toCustomerStatus(internalStatus: InternalOrderStatus): CustomerOrderStatus {
  return STATUS_MAP[internalStatus] ?? '접수됨';
}

// ============================================
// 타임라인 스텝 매핑
// ============================================

const TIMELINE_STEPS: TimelineStep[] = ['접수', '준비', '작업', '완료', '납품'];

const STATUS_TO_STEP_INDEX: Record<CustomerOrderStatus, number> = {
  접수됨: 0,
  '작업 준비중': 1,
  작업중: 2,
  '작업 완료': 3,
  '납품 진행중': 4,
  '납품 완료': 4,
  완료: 4,
};

/**
 * 현재 고객 상태에서 타임라인 스텝 정보를 생성
 */
export function buildTimelineSteps(
  customerStatus: CustomerOrderStatus,
  events?: Array<{ status?: InternalOrderStatus | null; createdAt: string }>
): TimelineStepInfo[] {
  const currentStepIndex = STATUS_TO_STEP_INDEX[customerStatus] ?? 0;

  // 이벤트에서 각 스텝의 완료 시각을 추출
  const stepDates: Partial<Record<TimelineStep, string>> = {};

  if (events && events.length > 0) {
    for (const event of events) {
      if (!event.status) continue;
      const cs = STATUS_MAP[event.status];
      if (!cs) continue;

      const stepIndex = STATUS_TO_STEP_INDEX[cs];
      const step = TIMELINE_STEPS[stepIndex];
      if (step && !stepDates[step]) {
        stepDates[step] = event.createdAt;
      }
    }
  }

  return TIMELINE_STEPS.map((step, index) => {
    const isCompleted = index < currentStepIndex;
    const isCurrent = index === currentStepIndex;

    return {
      step,
      label: step,
      completedAt: stepDates[step] ?? null,
      isCompleted,
      isCurrent,
    };
  });
}

// ============================================
// 상태 뱃지 색상
// ============================================

export type BadgeVariant = 'gray' | 'info' | 'warning' | 'success' | 'primary';

export function getStatusBadgeVariant(customerStatus: CustomerOrderStatus): BadgeVariant {
  switch (customerStatus) {
    case '접수됨':
      return 'gray';
    case '작업 준비중':
      return 'info';
    case '작업중':
      return 'warning';
    case '작업 완료':
      return 'primary';
    case '납품 진행중':
      return 'primary';
    case '납품 완료':
      return 'success';
    case '완료':
      return 'success';
    default:
      return 'gray';
  }
}

// ============================================
// 날짜 포맷 유틸리티
// ============================================

/**
 * ISO 날짜 문자열을 한국어 형식으로 포맷
 * 예: "2024-01-15T09:30:00.000Z" -> "2024년 1월 15일"
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * ISO 날짜 문자열을 짧은 한국어 형식으로 포맷
 * 예: "2024-01-15T09:30:00.000Z" -> "24.01.15"
 */
export function formatDateShort(dateString: string | null | undefined): string {
  if (!dateString) return '-';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';

  const year = String(date.getFullYear()).slice(2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}.${month}.${day}`;
}
