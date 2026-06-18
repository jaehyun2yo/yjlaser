import type { ReactNode } from 'react';
import type { SearchResultDTO } from '@/app/webhard/_lib/types';
import { formatInquiryFolderDisplayName } from '@/app/webhard/_lib/formatInquiryFolderDisplayName';
import { TEXT_COLOR } from '@/lib/styles';

/** 검색어 강조 함수 (띄어쓰기 무시) */
export function highlightText(text: string, query: string): ReactNode {
  if (!query.trim()) return text;

  // 정규화: 띄어쓰기 제거
  const normalizedQuery = query.replace(/\s+/g, '').toLowerCase();
  const normalizedText = text.replace(/\s+/g, '').toLowerCase();

  // 검색어가 정규화된 텍스트에 포함되지 않으면 원본 반환
  if (!normalizedText.includes(normalizedQuery)) {
    return text;
  }

  // 정규화된 텍스트에서 검색어의 위치 찾기
  const matchIndex = normalizedText.indexOf(normalizedQuery);
  if (matchIndex === -1) return text;

  // 원본 텍스트를 글자별로 순회하면서 강조할 범위 찾기
  let normalizedPos = 0;
  let highlightStart = -1;
  let highlightEnd = -1;

  for (let i = 0; i < text.length; i++) {
    if (normalizedPos === matchIndex) {
      highlightStart = i;
    }
    if (normalizedPos === matchIndex + normalizedQuery.length) {
      highlightEnd = i;
      break;
    }

    // 띄워쓰기 아닌 문자만 카운트
    if (!/\s/.test(text[i])) {
      normalizedPos++;
    }
  }

  // highlightEnd를 찾지 못한 경우 (끝까지 강조)
  if (highlightEnd === -1) {
    highlightEnd = text.length;
  }

  if (highlightStart === -1) return text;

  // 강조할 부분과 아닌 부분 분리
  const before = text.substring(0, highlightStart);
  const highlighted = text.substring(highlightStart, highlightEnd);
  const after = text.substring(highlightEnd);

  return (
    <>
      {before}
      <span className={`${TEXT_COLOR.brand} font-semibold`}>{highlighted}</span>
      {after}
    </>
  );
}

/** NestJS API 응답을 SearchResultDTO[]로 변환 (폴더 우선 정렬) */
export function mapSearchResponse(data: {
  files?: unknown[];
  folders?: unknown[];
}): SearchResultDTO[] {
  const results: SearchResultDTO[] = [];

  // 폴더 먼저
  if (data.folders && Array.isArray(data.folders)) {
    (data.folders as Record<string, unknown>[]).forEach((folder) => {
      results.push({
        id: folder.id as string,
        name: formatInquiryFolderDisplayName(folder.name as string),
        type: 'folder',
        path: folder.path as string,
        created_at: folder.created_at as string,
        parent_id: folder.parent_id as string | null,
      });
    });
  }

  // 파일 나중
  if (data.files && Array.isArray(data.files)) {
    (data.files as Record<string, unknown>[]).forEach((file) => {
      results.push({
        id: file.id as string,
        name: file.name as string,
        type: 'file',
        size: file.size as number,
        folder_id: file.folder_id as string | null,
        original_name: file.original_name as string,
        created_at: file.created_at as string,
        path: file.folder_path as string,
      });
    });
  }

  return results;
}

/** 검색 결과 클릭 시 이동할 URL 생성 */
export function buildSearchNavigationUrl(result: SearchResultDTO): string {
  const params = new URLSearchParams();
  if (result.type === 'file') {
    if (result.folder_id) params.set('folderId', result.folder_id);
  } else {
    // 폴더: 해당 폴더 안으로 이동 (기존: parent_id → 변경: result.id)
    params.set('folderId', result.id);
  }
  const qs = params.toString();
  return qs ? `/webhard?${qs}` : '/webhard';
}

/** API 경로를 breadcrumb 형식으로 변환 */
export function formatBreadcrumbPath(path?: string | null): string {
  if (!path || path === '/' || path === '') return '루트';
  const parts = path.split('/').filter(Boolean);
  return ['루트', ...parts.map(formatInquiryFolderDisplayName)].join(' > ');
}
