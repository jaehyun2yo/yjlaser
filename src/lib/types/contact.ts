/**
 * Contact 관련 타입 정의
 * 문의하기 관리에서 사용되는 모든 Contact 관련 타입을 통합 관리
 */
import type { ProcessStage } from '@/lib/utils/processStages';
import type { RevisionRequestHistory } from '@/types/database.types';

/**
 * 문의 상태 타입
 */
export type ContactStatus =
  | 'received'
  | 'drawing'
  | 'confirmed'
  | 'production'
  | 'cutting'
  | 'finishing'
  | 'delivering'
  | 'delivered'
  | 'completed'
  | 'on_hold';

/**
 * 문의 타입 (개인/업체)
 */
export type ContactType = 'individual' | 'company';

/**
 * 문의 출처
 */
export type ContactSource = 'website' | 'webhard' | 'phone';

/**
 * 웹하드 문의 유형
 */
export type InquiryType = 'cutting_request' | 'mold_request' | 'laser_cutting';

/**
 * 도면 타입
 */
export type DrawingType = 'create' | 'have';

/**
 * 수령 방법
 */
export type ReceiptMethod = 'visit' | 'delivery';

/**
 * 배송 타입
 */
export type DeliveryType = 'parcel' | 'quick';

/**
 * 문의 데이터 인터페이스
 */
export interface Contact {
  // 기본 식별 정보
  id: string;
  inquiry_number: string | null;
  work_number: string | null;
  inquiry_title?: string | null;

  // 업체 및 담당자 정보
  company_name: string;
  name: string;
  position: string;
  phone: string;
  email: string;

  // 문의 유형
  contact_type: string | null;
  service_mold_request: boolean | null;
  service_delivery_brokerage: boolean | null;

  // 도면 및 샘플 정보
  drawing_type: string | null;
  has_physical_sample: boolean | null;
  has_reference_photos: boolean | null;
  drawing_modification: string | null;
  box_shape: string | null;
  length: string | null;
  width: string | null;
  height: string | null;
  material: string | null;
  drawing_notes: string | null;
  sample_notes: string | null;

  // 수령 및 배송 정보
  receipt_method: string | null;
  delivery_proof_image: string | null;
  delivery_complete_image: string | null;
  visit_date: string | null;
  visit_time_slot: string | null;
  delivery_type: string | null;
  delivery_address: string | null;
  delivery_name: string | null;
  delivery_phone: string | null;
  delivery_method: string | null;

  // 납품업체 정보
  delivery_company_name: string | null;
  delivery_company_phone: string | null;
  delivery_company_address: string | null;

  // 첨부 파일
  attachment_filename: string | null;
  attachment_url: string | null;
  drawing_file_url: string | null;
  drawing_file_name: string | null;
  reference_photos_urls: string | null;

  // 상태 및 공정
  status: string;
  process_stage: ProcessStage;

  // 타임스탬프
  created_at: string;
  updated_at: string;
  booking_changed_at?: string | null;
  delivery_method_changed_at?: string | null;
  deleted_at?: string | null;

  // 공정 타임스탬프
  confirmed_at?: string | null;
  production_started_at?: string | null;
  cutting_started_at?: string | null;
  cutting_completed_at?: string | null;
  finishing_started_at?: string | null;
  finishing_completed_at?: string | null;

  // 수정요청 관련
  revision_request_title?: string | null;
  revision_request_content?: string | null;
  revision_requested_at?: string | null;
  revision_request_file_url?: string | null;
  revision_request_file_name?: string | null;
  revision_request_history?: RevisionRequestHistory | null;

  // 포트폴리오 참고 정보
  portfolio_reference_url?: string | null;
  portfolio_reference_info?: PortfolioReferenceInfo | null;

  // 웹하드 연결
  webhard_folder_id?: string | null;
  webhard_folder_path?: string | null;
  /** 최신 DrawingRevision 의 webhardFileIds[0]. 컨텍스트 메뉴 "웹하드에서 열기" fileId 파라미터 (task 22). */
  webhard_file_id?: string | null;

  // 출처 및 문의 유형 (웹하드 자동 생성 관련)
  source?: ContactSource | null;
  inquiry_type?: InquiryType | null;

  // 작업자 메모 (deprecated — worker_notes로 이전)
  worker_memo?: string | null;
  worker_issue?: boolean | null;
  worker_memo_at?: string | null;
  worker_memo_by?: string | null;

  // 긴급
  is_urgent?: boolean | null;
  urgent_at?: string | null;

  // 작업자 노트 (다건)
  worker_notes?: WorkerNote[];

  // 분할 관련
  parent_contact_id?: string | null;
  split_index?: number | null;
  split_count?: number | null;
  stage_completed?: boolean | null;
  children?: Contact[];

  // 타임라인 히스토리 (includeTimeline=true 시 포함)
  status_history?: TimelineItem[];

  // 최신 도면 (findOne 응답에 포함)
  latestDrawing?: DrawingRevision | null;
}

/**
 * 작업자 노트 (메모/이슈)
 */
export interface WorkerNote {
  id: number;
  contact_id: string;
  type: 'memo' | 'issue' | 'request';
  content: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/**
 * 포트폴리오 참고 제품 정보
 */
export interface PortfolioReferenceInfo {
  id: string | number; // UUID 또는 숫자 ID 모두 지원
  title: string;
  field?: string;
  type?: string;
  format?: string;
  size?: string;
  paper?: string;
  printing?: string;
  finishing?: string;
  imageUrl?: string;
}

/**
 * 상태별 카운트
 */
export interface StatusCounts {
  all: number;
  received: number;
  drawing: number;
  confirmed: number;
  production: number;
  cutting: number;
  finishing: number;
  delivered: number;
  completed: number;
  on_hold: number;
}

/**
 * ContactsList 컴포넌트 Props
 */
export interface ContactsListProps {
  contacts: Contact[];
  statusFilter: string;
  totalCount: number;
  itemsPerPage: number;
  searchQuery?: string;
  showFiltersOnly?: boolean;
  statusCounts?: StatusCounts;
}

/**
 * ContactCard 컴포넌트 Props
 */
export interface ContactCardProps {
  contact: Contact;
  isExpanded: boolean;
  onToggle: () => void;
  onStartWork: (e: React.MouseEvent) => Promise<void>;
  onChangeStatus: (status: string, e: React.MouseEvent) => Promise<void>;
  onRestore: (e: React.MouseEvent) => Promise<void>;
  onPermanentDelete: (e: React.MouseEvent) => Promise<void>;
  isRestoring?: boolean;
  isPermanentlyDeleting?: boolean;
}

/**
 * 알림 뱃지 타입
 */
export type NotificationBadgeType = 'revision' | 'delivery' | 'visit';

/**
 * NotificationBadge 컴포넌트 Props
 */
export interface NotificationBadgeProps {
  type: NotificationBadgeType;
  contact: Contact;
  isDismissed: boolean;
  onDismiss: () => void;
  isExpanded: boolean;
  onExpand: () => void;
}

/**
 * 도면 수정 파일 정보
 */
export interface DrawingRevisionFile {
  url: string;
  name: string;
  size?: number;
  mimeType?: string;
}

/**
 * 도면 수정 이력
 */
export interface DrawingRevision {
  id: string;
  contact_id: string;
  version: number;
  process_stage: string | null;
  reason: string;
  reason_detail: string | null;
  files: DrawingRevisionFile[];
  actor_type: string;
  actor_name: string | null;
  source: string;
  is_public: boolean;
  note: string | null;
  created_at: string;
}

/**
 * 통합 타임라인 — ContactStatusHistory와 DrawingRevision을 하나의 시간순 배열로
 * 서버에서 인터리브하여 반환한다. 응답 필드는 camelCase + `createdAt`은 ISO 8601.
 *
 * 백엔드 DTO: webhard-api/src/contacts/dto/timeline-item.dto.ts
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
  /** fallback 경로에서 파생된 최소 이벤트 표식 */
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
  /** fallback 경로에서 파생된 초기 도면 표식 */
  fallback?: boolean;
}

export interface TimelineItem {
  id: string;
  kind: TimelineItemKind;
  createdAt: string;
  actorType: TimelineActorType;
  actorName: string | null;
  color?: string;
  payload: StatusChangePayload | DrawingRevisionPayload;
}

/**
 * 공정별 소요시간 분석 응답
 */
export interface StageDurationAnalytics {
  stages: Array<{
    from: string;
    to: string;
    avg_hours: number;
    median_hours: number;
    count: number;
  }>;
  total_avg_hours: number;
  period: { from: string | null; to: string | null };
}
