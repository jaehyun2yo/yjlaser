/**
 * Webhard DTO Types
 * API 응답 및 클라이언트 표시용 데이터 전송 객체
 *
 * 네이밍 규칙:
 * - DTO 접미사 사용 (WebhardFileDTO, WebhardFolderDTO)
 * - snake_case 필드명 (DB/API 호환)
 */

/**
 * 파일 DTO - API 응답 및 클라이언트 표시용
 */
export interface WebhardFileDTO {
  id: string;
  name: string;
  original_name: string;
  size: number;
  mime_type: string;
  path: string;
  folder_id: string | null;
  company_id: number | null;
  uploaded_by: number;
  inquiry_number: string | null;
  is_downloaded: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: number | null;

  // 관계 데이터 (조인 시 포함)
  companies?: {
    company_name: string;
    manager_name?: string | null;
  } | null;

  // 새파일 모드 전용 필드 (GET /files/new 응답)
  folder_path?: string | null;
  uploader_display_name?: string;
}

/**
 * 폴더 DTO - API 응답 및 클라이언트 표시용
 */
export interface WebhardFolderDTO {
  id: string;
  name: string;
  parent_id: string | null;
  company_id: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;

  // 관계 데이터 (조인 시 포함)
  companies?: {
    company_name: string;
  } | null;

  // 계산 필드
  file_count?: number;
  undownloaded_count?: number;
  latest_file_created_at?: string | null;
  latest_file_uploader_display_name?: string | null;
}

/**
 * 검색 결과 DTO
 */
export interface SearchResultDTO {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  folder_id?: string | null;
  original_name?: string;
  created_at?: string;
  path?: string;
  parent_id?: string | null;
}

/**
 * 파일 목록 응답 DTO
 */
export interface FileListResponseDTO {
  files: WebhardFileDTO[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * 폴더 목록 응답 DTO
 */
export interface FolderListResponseDTO {
  folders: WebhardFolderDTO[];
  total: number;
}

/**
 * 폴더 트리 노드 DTO
 */
export interface FolderTreeNodeDTO {
  id: string;
  name: string;
  parent_id: string | null;
  children: FolderTreeNodeDTO[];
  file_count?: number;
  undownloaded_count?: number;
}

/**
 * 휴지통 파일 DTO
 */
export interface TrashFileDTO extends WebhardFileDTO {
  days_until_delete: number;
  folder_path?: string;
}

/**
 * 배치 작업 결과 DTO
 */
export interface BatchOperationResultDTO {
  success: boolean;
  processed: number;
  failed: number;
  errors?: string[];
  duration_ms: number;
}

/**
 * 업로드 진행 상태 DTO
 */
export interface UploadProgressDTO {
  file_id: string;
  file_name: string;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  error?: string;
}

/**
 * 저장소 사용량 DTO
 */
export interface StorageUsageDTO {
  total_files: number;
  total_size: number;
  total_size_formatted: string;
  by_company?: {
    company_id: number;
    company_name: string;
    file_count: number;
    size: number;
    size_formatted: string;
  }[];
}

// ============ 업로드 관련 타입 ============

/**
 * 업로드 중인 임시 파일 DTO (Optimistic Update용)
 * 캐시에 추가되어 UI에 즉시 표시되지만, 실제 업로드가 완료되기 전까지는 임시 상태
 */
export interface PendingFileDTO {
  id: string; // 임시 UUID (crypto.randomUUID())
  name: string;
  original_name: string;
  size: number;
  mime_type: string;
  path: string;
  folder_id: string | null;
  company_id: number | null;
  uploaded_by: number;
  inquiry_number: string | null;
  is_downloaded: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: null;
  deleted_by: null;
  companies: null;

  // 업로드 상태 전용 필드
  isPending: true; // 업로드 중인 파일임을 표시
  uploadProgress: number; // 0-100 진행률
  uploadStatus: 'pending' | 'uploading' | 'completed' | 'failed';
  uploadError?: string; // 실패 시 에러 메시지
  tempId: string; // 업로드 완료 후 실제 파일과 매칭용
}

/**
 * 파일 목록 아이템 (일반 파일 또는 업로드 중인 파일)
 */
export type FileListItem = WebhardFileDTO | PendingFileDTO;

/**
 * 업로드 중인 파일인지 확인하는 타입 가드
 */
export function isPendingFile(file: FileListItem): file is PendingFileDTO {
  return 'isPending' in file && file.isPending === true;
}

// ============ 레거시 타입 호환 ============

/**
 * @deprecated WebhardFileDTO 사용 권장
 */
export type WebhardFile = WebhardFileDTO;

/**
 * @deprecated WebhardFolderDTO 사용 권장
 */
export type WebhardFolder = WebhardFolderDTO;

/**
 * @deprecated PendingFileDTO 사용 권장
 */
export type PendingFile = PendingFileDTO;

// ============ 공유 링크 관련 타입 ============

/**
 * 공유 링크 DTO
 */
export interface ShareLinkDTO {
  id: string;
  token: string;
  file_path: string;
  file_name: string;
  company_id: number | null;
  created_by: number;
  expires_at: string;
  max_downloads: number | null;
  download_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * 공유 링크 생성 요청 DTO
 */
export interface CreateShareLinkDTO {
  file_path: string;
  file_name: string;
  company_id: number | null;
  expires_in_hours: number; // 만료 시간 (시간 단위)
  max_downloads?: number | null; // 최대 다운로드 횟수 (null이면 무제한)
}

/**
 * 공유 링크 검증 응답 DTO
 */
export interface ValidateShareLinkDTO {
  is_valid: boolean;
  file_path?: string;
  file_name?: string;
  error_message?: string;
}
