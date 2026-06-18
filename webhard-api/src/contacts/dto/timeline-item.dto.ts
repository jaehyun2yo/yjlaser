/**
 * 통합 타임라인 응답 DTO — docs/specs/api/nestjs-endpoints.md §contacts timeline
 *
 * ContactStatusHistory와 DrawingRevision을 서버에서 인터리브하여 하나의 시간순
 * 배열로 반환한다. 필드는 모두 camelCase로 직렬화한다.
 */

export type TimelineItemKind = 'status_change' | 'drawing_revision';

export type TimelineActorType = 'admin' | 'worker' | 'system' | 'external' | 'company';

export interface TimelineFile {
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface StatusChangePayload {
  changeType: string;
  fromValue?: string | null;
  toValue?: string | null;
  metadata?: Record<string, unknown>;
  /**
   * 실 데이터가 없는 문의에서 contacts 테이블 기반으로 파생된 최소 이벤트 표식.
   * `getTimeline` fallback 경로에서만 true가 설정된다.
   */
  fallback?: boolean;
}

export interface DrawingRevisionPayload {
  revisionId: string;
  version: number;
  processStage: string | null;
  reason: string;
  reasonDetail: string | null;
  files: TimelineFile[];
  isPublic: boolean;
  note: string | null;
  /**
   * `contacts.drawing_file_url` 기반으로 파생된 초기 도면 표식.
   * `getTimeline` fallback 경로에서만 true가 설정된다.
   */
  fallback?: boolean;
}

export interface TimelineItemDto {
  id: string;
  kind: TimelineItemKind;
  createdAt: string;
  actorType: TimelineActorType;
  actorName: string | null;
  color?: string;
  payload: StatusChangePayload | DrawingRevisionPayload;
}

/**
 * 거래처 세션에서 노출 가능한 ContactStatusHistory changeType 화이트리스트.
 * 내부 관리 이벤트(assignee, admin_note, split, created, stage_completed_toggle 등)는 제외.
 *
 * 주의: 'drawing_revision'은 어차피 status_change 변환 시 중복 방지로 제거된다.
 * 여기에 포함된 것은 이론적 허용 목록이며 실제 status_change 경로에서는 제거된다.
 */
export const COMPANY_ALLOWED_CHANGE_TYPES = new Set<string>([
  'status',
  'process_stage',
  'drawing_revision',
  'type',
]);
