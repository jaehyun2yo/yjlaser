/**
 * Centralized contact status labels (Korean)
 * Used across admin, company, webhard, and feedback pages
 */
export const STATUS_LABELS: Record<string, string> = {
  new: '신규',
  received: '접수',
  drawing: '도면작업',
  confirmed: '컨펌',
  production: '목형제작',
  cutting: '레이저가공',
  finishing: '칼/오시',
  delivered: '납품',
  on_hold: '보류',
  completed: '작업완료',
  deleting: '삭제중',
  revision_in_progress: '수정중',
};

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

/**
 * Process stage labels (Korean)
 */
export const STAGE_LABELS: Record<string, string> = {
  drawing: '도면작업',
  sample: '샘플제작',
  drawing_confirmed: '도면 확정 및 목형의뢰',
  laser: '레이저 가공',
  cutting: '칼 작업',
  creasing: '오시작업',
  delivery: '납품',
};

export function getStageLabel(stage: string): string {
  return STAGE_LABELS[stage] || stage;
}

/**
 * Timeline change type labels
 */
export const CHANGE_TYPE_LABELS: Record<string, string> = {
  created: '문의 접수',
  status_change: '상태 변경',
  process_stage_change: '공정 단계 변경',
  inquiry_type_change: '문의 유형 변경',
  deleted: '삭제',
  restored: '복원',
};

export function getChangeTypeLabel(changeType: string): string {
  return CHANGE_TYPE_LABELS[changeType] || changeType;
}

/**
 * Actor type labels
 */
export const ACTOR_TYPE_LABELS: Record<string, string> = {
  admin: '관리자',
  company: '거래처',
  system: '시스템',
  worker: '작업자',
};

export function getActorTypeLabel(actorType: string): string {
  return ACTOR_TYPE_LABELS[actorType] || actorType;
}

/**
 * Source labels
 */
export const SOURCE_LABELS: Record<string, string> = {
  manual: '수동',
  webhard_auto: '웹하드 자동',
  order_auto: 'DXF 자동',
  system: '시스템',
  backfill: '기존 데이터',
};
