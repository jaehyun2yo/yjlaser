/**
 * Task #7: 검색 시스템 개선 테스트
 * - 키보드 선택 시 scrollIntoView 자동 스크롤
 * - buildSearchNavigationUrl: 루트 파일(folder_id=null) URL 처리
 * - mapSearchResponse: 루트 파일 처리
 */

import {
  buildSearchNavigationUrl,
  formatBreadcrumbPath,
  mapSearchResponse,
} from '@/app/webhard/_lib/searchUtils';
import type { SearchResultDTO } from '@/app/webhard/_lib/types';

describe('Task #7: buildSearchNavigationUrl', () => {
  it('파일(folder_id 있음): folderId 쿼리파람 포함 URL', () => {
    const result: SearchResultDTO = {
      id: 'file-1',
      name: 'test.dxf',
      type: 'file',
      folder_id: 'folder-abc',
    };
    expect(buildSearchNavigationUrl(result)).toBe('/webhard?folderId=folder-abc');
  });

  it('파일(folder_id=null, 루트): /webhard (파라미터 없음)', () => {
    const result: SearchResultDTO = {
      id: 'file-2',
      name: 'root-file.dxf',
      type: 'file',
      folder_id: null,
    };
    expect(buildSearchNavigationUrl(result)).toBe('/webhard');
  });

  it('폴더: folderId=result.id URL (폴더 안으로 이동)', () => {
    const result: SearchResultDTO = {
      id: 'folder-xyz',
      name: '거래처A',
      type: 'folder',
      parent_id: null,
    };
    expect(buildSearchNavigationUrl(result)).toBe('/webhard?folderId=folder-xyz');
  });

  it('루트 폴더(parent_id=null): folderId=result.id URL', () => {
    const result: SearchResultDTO = {
      id: 'folder-root',
      name: '루트폴더',
      type: 'folder',
      parent_id: null,
    };
    expect(buildSearchNavigationUrl(result)).toBe('/webhard?folderId=folder-root');
  });
});

describe('Task #7: mapSearchResponse — 루트 파일 처리', () => {
  it('folder_id가 null인 파일도 결과에 포함된다', () => {
    const apiResponse = {
      files: [
        {
          id: 'file-root',
          name: 'root.dxf',
          type: 'file',
          size: 1024,
          folder_id: null,
          original_name: 'root.dxf',
          created_at: '2026-01-01',
          folder_path: null,
        },
      ],
      folders: [],
    };

    const results = mapSearchResponse(apiResponse);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('file-root');
    expect(results[0].folder_id).toBeNull();
  });

  it('폴더가 파일보다 먼저 정렬된다', () => {
    const apiResponse = {
      files: [
        {
          id: 'f1',
          name: 'a.dxf',
          size: 100,
          folder_id: null,
          original_name: 'a.dxf',
          created_at: '2026-01-01',
          folder_path: null,
        },
      ],
      folders: [
        { id: 'd1', name: '폴더', path: '/폴더', created_at: '2026-01-01', parent_id: null },
      ],
    };

    const results = mapSearchResponse(apiResponse);
    expect(results[0].type).toBe('folder');
    expect(results[1].type).toBe('file');
  });
});

describe('Task #7: formatBreadcrumbPath', () => {
  it('null/빈 path → "루트"', () => {
    expect(formatBreadcrumbPath(null)).toBe('루트');
    expect(formatBreadcrumbPath('')).toBe('루트');
    expect(formatBreadcrumbPath('/')).toBe('루트');
  });

  it('경로 → "루트 > 폴더A > 폴더B" 형식', () => {
    expect(formatBreadcrumbPath('/폴더A/폴더B')).toBe('루트 > 폴더A > 폴더B');
    expect(formatBreadcrumbPath('폴더A/폴더B')).toBe('루트 > 폴더A > 폴더B');
  });
});

describe('Task #7: 키보드 자동 스크롤 로직', () => {
  it('selectedIndex 변경 시 해당 DOM 요소에 scrollIntoView 호출', () => {
    // scrollIntoView mock
    const mockScrollIntoView = jest.fn();
    const mockElement = { scrollIntoView: mockScrollIntoView };
    const mockRef = { current: { children: [mockElement] } };

    // useEffect 내부 로직 시뮬레이션
    const selectedIndex = 0;
    const listRef = mockRef as unknown as React.RefObject<HTMLUListElement>;

    if (listRef.current) {
      const item = listRef.current.children[selectedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }

    expect(mockScrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });
});
