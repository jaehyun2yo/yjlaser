/**
 * 웹하드 파일 관련 유틸리티 함수들
 */

import type { WebhardFile } from '@/types/webhard';
import type { SortBy } from '@/store/webhard';

export type SortOrder = 'asc' | 'desc';

/**
 * 파일이 새 파일인지 판단 (72시간 이내 업로드 + 미다운로드)
 * 주말 포함 3일간 New 뱃지 유지
 */
export function isFileNew(file: WebhardFile): boolean {
  // 이미 다운로드된 파일은 new 아님
  if (file.is_downloaded) return false;

  const fileDate = new Date(file.created_at);
  const nowDate = new Date();
  const hoursDiff = (nowDate.getTime() - fileDate.getTime()) / (1000 * 60 * 60);
  return hoursDiff < 72;
}

function getVisibleUploaderName(file: WebhardFile): string {
  return (
    file.uploader_display_name || file.companies?.manager_name || file.companies?.company_name || ''
  );
}

/**
 * 파일 목록 정렬
 */
export function sortFiles(
  fileList: WebhardFile[],
  sortBy: SortBy,
  sortOrder: SortOrder
): WebhardFile[] {
  return [...fileList].sort((a, b) => {
    let comparison = 0;

    if (sortBy === 'name') {
      comparison = a.original_name.localeCompare(b.original_name, 'ko');
    } else if (sortBy === 'date') {
      comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    } else if (sortBy === 'size') {
      comparison = a.size - b.size;
    } else if (sortBy === 'uploader') {
      const uploaderA = getVisibleUploaderName(a);
      const uploaderB = getVisibleUploaderName(b);
      comparison = uploaderA.localeCompare(uploaderB, 'ko');
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });
}
