/**
 * 웹하드 페이지 진입 URL 빌더 (task 22 — contact-webhard-navigate).
 *
 * `/webhard?folderId=...&fileId=...` 규약 — `docs/specs/api/endpoints/webhard.md` 의
 * "웹하드 페이지 URL 규약" 섹션과 정확히 일치해야 한다.
 *
 * folderId 가 falsy 면 null 반환 — 호출처에서 disabled 상태 판단에 사용.
 */
export function buildWebhardUrl(
  folderId: string | null | undefined,
  fileId?: string | null | undefined
): string | null {
  if (!folderId) return null;
  const params = new URLSearchParams({ folderId });
  if (fileId) params.set('fileId', fileId);
  return `/webhard?${params.toString()}`;
}
