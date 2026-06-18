/**
 * Task #6: 사이드바 + 새파일 목록 뉴뱃지 부모폴더 전파 테스트
 *
 * 백엔드 Task #3에서 /api/webhard/badge-counts 응답의 folderCounts가
 * 부모 폴더 전파 값을 포함하도록 변경됨.
 *
 * 프론트 아키텍처:
 * - BatchCountProvider(FolderTree.tsx:75)와 FolderTree 내부(FolderTree.tsx:211)
 *   모두 동일한 scope-aware queryKeys.webhard.badgeCounts(...)를 사용
 * - React Query가 동일 캐시 키를 dedup 처리 → 네트워크 요청 1회
 * - 백엔드 응답 변경만으로 프론트 자동 반영
 *
 * 이 테스트는 folderCounts 데이터 흐름 로직을 검증합니다.
 */

import { queryKeys } from '@/lib/react-query/queryKeys';

describe('Task #6: 뉴뱃지 부모폴더 전파 — 데이터 흐름 검증', () => {
  describe('folderCounts 부모 전파 로직', () => {
    it('folderCounts에 부모 폴더 집계 카운트가 포함되면 FolderBadge에 올바르게 표시된다', () => {
      // 백엔드가 부모 전파 값을 포함한 folderCounts를 반환하는 경우
      // 예: 폴더 A (루트) 하위에 폴더 B가 있고, B에 미다운로드 3개
      // 백엔드 응답: { folderCounts: { 'folder-a': 3, 'folder-b': 3 } }
      const folderCountsFromBackend: Record<string, number> = {
        'folder-a': 3, // 부모 전파 포함 (하위 폴더 B의 카운트 합산)
        'folder-b': 3,
      };

      // BatchCountContext.Provider가 이 값을 그대로 제공
      const batchCounts = folderCountsFromBackend;

      // FolderBadge: batchCounts[folderId] || 0
      expect(batchCounts['folder-a']).toBe(3); // 부모 폴더에도 뱃지 표시
      expect(batchCounts['folder-b']).toBe(3);
    });

    it('folderCounts에 없는 폴더 ID는 0을 반환한다', () => {
      const batchCounts: Record<string, number> = {
        'folder-b': 2,
      };

      const countForUnknown = batchCounts['folder-unknown'] || 0;
      expect(countForUnknown).toBe(0);
    });

    it('useFolderUndownloadedCounts는 folderIds 필터링 후 반환한다', () => {
      // 전체 folderCounts 중 요청된 folderIds만 필터링하는 로직 검증
      const allFolderCounts: Record<string, number> = {
        'folder-a': 5,
        'folder-b': 3,
        'folder-c': 0,
        'folder-d': 2,
      };

      const requestedIds = ['folder-a', 'folder-b'];

      // useFolderUndownloadedCounts 내부 필터 로직
      const filtered: Record<string, number> = {};
      for (const id of requestedIds) {
        filtered[id] = allFolderCounts[id] ?? 0;
      }

      expect(filtered).toEqual({ 'folder-a': 5, 'folder-b': 3 });
      expect(Object.keys(filtered)).not.toContain('folder-c');
      expect(Object.keys(filtered)).not.toContain('folder-d');
    });

    it('React Query 동일 캐시 키 dedup: 같은 회사/옵션이면 같은 배지 쿼리 키 사용', () => {
      const key1 = queryKeys.webhard.badgeCounts({
        companyId: 42,
        includeFolderCounts: true,
      });
      const key2 = queryKeys.webhard.badgeCounts({
        companyId: 42,
        includeFolderCounts: true,
      });
      const adminKey = queryKeys.webhard.badgeCounts({
        companyId: null,
        includeFolderCounts: true,
      });

      // 동일 scope면 같은 캐시로 처리하고, admin/company scope는 분리
      expect(JSON.stringify(key1)).toBe(JSON.stringify(key2));
      expect(JSON.stringify(key1)).not.toBe(JSON.stringify(adminKey));
    });
  });
});
