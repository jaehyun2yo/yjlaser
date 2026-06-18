/**
 * useWebhardFileSort
 * 파일 정렬 로직 (클라이언트 사이드 정렬)
 */

import { useCallback } from 'react';
import { useWebhardNavigationStore, type SortBy, type SortOrder } from '@/store/webhard';
import type { WebhardFile } from '@/types/webhard';

interface UseWebhardFileSortResult {
  sortBy: SortBy;
  sortOrder: SortOrder;
  setSort: (sortBy: SortBy, sortOrder: SortOrder) => void;
  sortFiles: <T extends WebhardFile>(files: T[]) => T[];
}

export function useWebhardFileSort(): UseWebhardFileSortResult {
  const { sortBy, sortOrder, setSort } = useWebhardNavigationStore();

  /**
   * 파일 정렬 함수
   */
  const sortFiles = useCallback(
    <T extends WebhardFile>(fileList: T[]): T[] => {
      return [...fileList].sort((a, b) => {
        let comparison = 0;

        switch (sortBy) {
          case 'name':
            comparison = a.original_name.localeCompare(b.original_name, 'ko');
            break;

          case 'date':
            comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            break;

          case 'size':
            comparison = a.size - b.size;
            break;

          case 'uploader':
            // 업로더(회사명) 기준 정렬 - 한글 ㄱㄴㄷ 순
            const uploaderA = a.companies?.company_name || '';
            const uploaderB = b.companies?.company_name || '';
            comparison = uploaderA.localeCompare(uploaderB, 'ko');
            break;

          default:
            comparison = 0;
        }

        return sortOrder === 'asc' ? comparison : -comparison;
      });
    },
    [sortBy, sortOrder]
  );

  return {
    sortBy,
    sortOrder,
    setSort,
    sortFiles,
  };
}

/**
 * 새 파일 판단 함수 (24시간 이내 + 다운로드 안 됨)
 */
export function isFileNew(file: WebhardFile): boolean {
  // 이미 다운로드된 파일은 new 아님
  if (file.is_downloaded) return false;

  const fileDate = new Date(file.created_at);
  const nowDate = new Date();
  const hoursDiff = (nowDate.getTime() - fileDate.getTime()) / (1000 * 60 * 60);
  return hoursDiff < 24;
}
