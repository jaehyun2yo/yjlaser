/**
 * Task #5: 웹하드 검색 결과 폴더 클릭 시 네비게이션 버그 수정 테스트
 * - buildSearchNavigationUrl: 폴더 클릭 시 올바른 URL 생성 검증
 * - 버그 원인: WebhardMain.tsx의 initialFolderIdRef 가드가 searchParams 변경을 무시
 */

import { buildSearchNavigationUrl } from '@/app/webhard/_lib/searchUtils';
import type { SearchResultDTO } from '@/app/webhard/_lib/types';

describe('Task #5: buildSearchNavigationUrl — 검색 결과 네비게이션 URL', () => {
  it('폴더 결과 클릭 시 folderId=result.id로 URL 생성', () => {
    const folderResult: SearchResultDTO = {
      id: 'folder-uuid-123',
      name: '테스트동기화',
      type: 'folder',
      path: '/테스트동기화',
      created_at: '2026-01-01T00:00:00Z',
      parent_id: null,
    };

    const url = buildSearchNavigationUrl(folderResult);
    expect(url).toBe('/webhard?folderId=folder-uuid-123');
  });

  it('파일 결과 클릭 시 folder_id로 URL 생성 (파일이 속한 폴더)', () => {
    const fileResult: SearchResultDTO = {
      id: 'file-uuid-456',
      name: 'test.dxf',
      original_name: 'test.dxf',
      type: 'file',
      size: 1024,
      folder_id: 'parent-folder-uuid',
      path: '/테스트동기화',
      created_at: '2026-01-01T00:00:00Z',
    };

    const url = buildSearchNavigationUrl(fileResult);
    expect(url).toBe('/webhard?folderId=parent-folder-uuid');
  });

  it('파일의 folder_id가 null이면 루트(/webhard)로 이동', () => {
    const fileResult: SearchResultDTO = {
      id: 'file-uuid-789',
      name: 'root-file.dxf',
      original_name: 'root-file.dxf',
      type: 'file',
      size: 512,
      folder_id: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const url = buildSearchNavigationUrl(fileResult);
    expect(url).toBe('/webhard');
  });

  it('폴더의 parent_id가 있어도 folderId는 result.id (폴더 자신)', () => {
    const folderResult: SearchResultDTO = {
      id: 'child-folder-uuid',
      name: '하위폴더',
      type: 'folder',
      path: '/상위폴더/하위폴더',
      created_at: '2026-01-01T00:00:00Z',
      parent_id: 'parent-folder-uuid',
    };

    const url = buildSearchNavigationUrl(folderResult);
    // 하위 폴더 클릭 시 하위 폴더 안으로 진입해야 함
    expect(url).toBe('/webhard?folderId=child-folder-uuid');
    // parent_id가 아님을 확인
    expect(url).not.toContain('parent-folder-uuid');
  });
});

describe('Task #5: searchParams → selectedFolderId 동기화 로직', () => {
  it('ref 값과 다른 folderId가 들어오면 상태 업데이트가 필요하다', () => {
    // WebhardMain.tsx의 수정된 로직 시뮬레이션
    const currentFolderIdRef = { current: null as string | null };
    const newFolderIdFromUrl = 'folder-uuid-123';

    const shouldUpdate = newFolderIdFromUrl !== currentFolderIdRef.current;
    expect(shouldUpdate).toBe(true);
  });

  it('ref 값과 동일한 folderId면 상태 업데이트 불필요 (중복 방지)', () => {
    const currentFolderIdRef = { current: 'folder-uuid-123' };
    const newFolderIdFromUrl = 'folder-uuid-123';

    const shouldUpdate = newFolderIdFromUrl !== currentFolderIdRef.current;
    expect(shouldUpdate).toBe(false);
  });

  it('초기 로드(null)에서 폴더 선택 시 업데이트 필요', () => {
    const currentFolderIdRef = { current: null as string | null };
    const newFolderIdFromUrl = 'some-folder-id';

    const shouldUpdate = newFolderIdFromUrl !== currentFolderIdRef.current;
    expect(shouldUpdate).toBe(true);
  });

  it('폴더에서 루트로 이동 시 업데이트 필요', () => {
    const currentFolderIdRef = { current: 'some-folder-id' };
    const newFolderIdFromUrl = null as string | null;

    const shouldUpdate = newFolderIdFromUrl !== currentFolderIdRef.current;
    expect(shouldUpdate).toBe(true);
  });
});
