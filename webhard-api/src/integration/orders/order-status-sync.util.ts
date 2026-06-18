// Order 상태(17단계) → Contact process_stage(7단계) 자동 동기화 유틸리티

type ProcessStage =
  | 'drawing'
  | 'sample'
  | 'drawing_confirmed'
  | 'laser'
  | 'cutting'
  | 'creasing'
  | 'delivery'
  | null;

const ORDER_STATUS_TO_PROCESS_STAGE: Record<string, ProcessStage> = {
  inquiry_received: null,
  drawing_received: 'drawing',
  drawing_review: 'drawing',
  drawing_confirmed: 'sample',
  file_classified: 'drawing_confirmed',
  nesting_queued: 'laser',
  nesting_complete: 'laser',
  cutting_ready: 'laser',
  cutting_in_progress: 'laser',
  cutting_complete: 'laser',
  post_processing: 'cutting',
  post_processing_complete: 'creasing',
  inspection: 'delivery',
  delivery_ready: 'delivery',
  delivering: 'delivery',
  delivered: 'delivery',
  closed: 'delivery',
};

export function orderStatusToProcessStage(orderStatus: string): ProcessStage {
  return ORDER_STATUS_TO_PROCESS_STAGE[orderStatus] ?? null;
}

/**
 * ProcessStage에 따른 contact status 결정
 * contacts.ts의 updateProcessStage 로직과 동일하게 유지
 *
 * ERP 8단계 가드: webhard에서 자동 생성된 문의는 상태를 보존
 * (drawing, confirmed 상태는 AutoContactService가 관리 — 레거시 값으로 덮어쓰기 금지)
 */
export function processStageToContactStatus(
  processStage: ProcessStage,
  currentContactStatus: string
): string {
  // ERP status guard: webhard-originated contacts maintain their ERP status
  if (currentContactStatus === 'drawing' || currentContactStatus === 'confirmed') {
    return currentContactStatus;
  }

  if (processStage === 'delivery') return 'completed';
  if (processStage !== null) {
    if (currentContactStatus === 'completed') return 'in_progress';
    if (['read', 'on_hold', 'revision_in_progress'].includes(currentContactStatus))
      return 'in_progress';
    if (currentContactStatus !== 'completed') return 'in_progress';
  }
  return currentContactStatus;
}
