/**
 * R2 URL 또는 key 문자열에서 실제 object key 를 추출한다.
 *
 * 절대 URL 이면 pathname 을 decode 해서 반환. 이미 key 문자열이면 그대로.
 * percent-encoded 한글 파일명이 실제 R2 key 와 불일치해서 NoSuchKey 가
 * 발생하는 문제를 방지한다.
 *
 * 스펙: tasks/18-drawing-consistency/phase6.md
 */
export function extractR2Key(urlOrKey: string): string {
  if (!urlOrKey) return '';
  if (urlOrKey.startsWith('http://') || urlOrKey.startsWith('https://')) {
    try {
      const url = new URL(urlOrKey);
      const raw = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    } catch {
      return urlOrKey;
    }
  }
  return urlOrKey;
}
