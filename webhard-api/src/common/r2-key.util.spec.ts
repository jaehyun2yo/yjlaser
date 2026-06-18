/**
 * r2-key.util 단위 테스트
 *
 * 스펙: tasks/18-drawing-consistency/phase6.md
 *
 * 검증 범위:
 *   - extractR2Key: http(s) URL → pathname decode (percent-encoded 한글 포함)
 *   - 이미 key 형식 문자열 → 그대로 반환
 *   - 빈 문자열 → ''
 *   - 잘못된 percent-encoding → throw 없이 원본 경로 반환
 */

import { extractR2Key } from './r2-key.util';

describe('extractR2Key', () => {
  it('절대 URL → pathname 반환 (leading slash 제거)', () => {
    expect(extractR2Key('https://bucket.r2/abc/sample.dxf')).toBe('abc/sample.dxf');
  });

  it('절대 URL + 한글 원문 → 그대로 반환', () => {
    expect(extractR2Key('https://bucket.r2/abc/파일.dxf')).toBe('abc/파일.dxf');
  });

  it('절대 URL + percent-encoded 한글 → decode 후 원문 key', () => {
    expect(extractR2Key('https://bucket.r2/abc/%ED%8C%8C%EC%9D%BC.dxf')).toBe('abc/파일.dxf');
  });

  it('이미 key 형식 문자열 → 그대로 반환', () => {
    expect(extractR2Key('abc/파일.dxf')).toBe('abc/파일.dxf');
  });

  it('빈 문자열 → 빈 문자열', () => {
    expect(extractR2Key('')).toBe('');
  });

  it('잘못된 percent-encoding → throw 없이 원본 경로 반환', () => {
    // %ZZ 는 유효한 percent-encoding 이 아니므로 decodeURIComponent 가 throw.
    // catch 후 decode 전의 pathname 을 반환해야 한다.
    expect(extractR2Key('https://bucket.r2/abc/%ZZbad.dxf')).toBe('abc/%ZZbad.dxf');
  });

  it('http:// URL 도 동일하게 처리', () => {
    expect(extractR2Key('http://bucket.r2/x/y.dxf')).toBe('x/y.dxf');
  });

  it('URL 생성자가 throw 하는 비정상 문자열 → 원본 반환', () => {
    // "https://" 프리픽스만 달고 host 가 비어있어도 new URL 이 파싱할 수 있는 경우가 있어
    // 최소한의 안전성만 검증. 비표준 문자열이 넘어올 때 throw 하지 않는 것이 핵심.
    const input = 'https://';
    expect(() => extractR2Key(input)).not.toThrow();
  });
});
