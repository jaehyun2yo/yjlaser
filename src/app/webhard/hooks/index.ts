/**
 * Webhard Custom Hooks
 * WebhardMain.tsx에서 추출된 로직들
 */

// ============ UI Interaction Hooks ============

// 드래그 선택 (마우스로 사각형 영역 선택)
export { useWebhardDragSelection } from './useWebhardDragSelection';

// 컬럼 리사이즈 (파일명, 날짜 컬럼 너비 조절)
export { useWebhardColumnResize } from './useWebhardColumnResize';

// 사이드바 리사이즈 (폴더 트리 영역 너비 조절)
export { useWebhardSidebarResize } from './useWebhardSidebarResize';

// 키보드 단축키 (ESC 선택 해제, Delete 삭제 등)
export { useWebhardKeyboardShortcuts } from './useWebhardKeyboardShortcuts';

// 컨텍스트 메뉴 (우클릭 메뉴)
export { useWebhardContextMenu } from './useWebhardContextMenu';

// 파일 정렬 (클라이언트 사이드 정렬)
export { useWebhardFileSort, isFileNew } from './useWebhardFileSort';

// ============ Business Logic Hooks ============

// 파일 선택 (단일/다중/범위 선택)
export { useFileSelection } from './useFileSelection';

// 파일 작업 (업로드, 다운로드, 삭제, 이동, 이름 변경)
export { useFileOperations } from './useFileOperations';
export type { ProgressItem, DownloadItem } from './useFileOperations';

// 파일 업로드 (크기/개수 검증, 배치/단일 업로드)
export { useFileUpload } from './useFileUpload';

// 파일 일괄 다운로드 (Signed URL, 동시성 제어)
export { useFileBatchDownload } from './useFileBatchDownload';
export type { DownloadItem as BatchDownloadItem } from './useFileBatchDownload';

// 파일 이름 수정 (Optimistic Update, 에러 롤백)
export { useFileRename } from './useFileRename';

// 파일 ID URL 쿼리 → 하이라이트 (task 22 contact-webhard-navigate)
export { useWebhardFileIdHighlight } from './useWebhardFileIdHighlight';
