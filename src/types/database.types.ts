// src/types/database.types.ts (새 파일)
export type Post = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  view_count: number;
};

/**
 * 수정요청 히스토리 항목 타입
 */
export interface RevisionRequestHistoryItem {
  title: string;
  content: string;
  requested_at: string;
  file_url: string | null;
  file_name: string | null;
}

/**
 * 수정요청 히스토리 타입 (JSONB 배열)
 */
export type RevisionRequestHistory = RevisionRequestHistoryItem[];
