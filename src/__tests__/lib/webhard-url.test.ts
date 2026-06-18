/**
 * buildWebhardUrl 유틸 테스트 (task 22 Phase 4 — context-menu-webhard-link).
 *
 * `/webhard?folderId=...&fileId=...` 규약 단언 —
 * docs/specs/api/endpoints/webhard.md "웹하드 페이지 URL 규약" 섹션과 일치해야 한다.
 */

import { buildWebhardUrl } from '@/lib/utils/webhard-url';

describe('buildWebhardUrl', () => {
  it('folderId 가 falsy (null/undefined/"") 이면 null 반환', () => {
    expect(buildWebhardUrl(null)).toBeNull();
    expect(buildWebhardUrl(undefined)).toBeNull();
    expect(buildWebhardUrl('')).toBeNull();
  });

  it('folderId 만 있고 fileId 가 생략되면 /webhard?folderId=X 반환', () => {
    expect(buildWebhardUrl('abc-folder')).toBe('/webhard?folderId=abc-folder');
  });

  it('folderId + fileId 모두 주어지면 /webhard?folderId=X&fileId=Y 반환 (삽입 순서)', () => {
    expect(buildWebhardUrl('abc-folder', 'xyz-file')).toBe(
      '/webhard?folderId=abc-folder&fileId=xyz-file'
    );
  });

  it('빈 문자열 fileId 는 생략된 것으로 취급 (fileId 쿼리 미포함)', () => {
    expect(buildWebhardUrl('abc-folder', '')).toBe('/webhard?folderId=abc-folder');
    expect(buildWebhardUrl('abc-folder', null)).toBe('/webhard?folderId=abc-folder');
  });
});
