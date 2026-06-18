/**
 * normalizeCompanyName 단위 테스트 (task 21 phase 1).
 *
 * 스펙: tasks/21-webhard-inquiry-folder-gap-fix/phase1.md §1~2
 *       docs/specs/features/drawing-workflow.md §W.1 업체 루트 매칭 fallback 2단계
 *
 * 검증:
 *   P1-util-1: 공백 제거 + 소문자화
 *   P1-util-2: 괄호·대시 제거
 *   P1-util-3: 다수 공백 흡수
 *   P1-util-4: 빈 문자열
 *   P1-util-5: NFKC 정규화 — 호환 자모 시퀀스가 완성형과 동일하게 정규화
 */

import { normalizeCompanyName } from './company-name-match.util';

describe('normalizeCompanyName', () => {
  it('P1-util-1: 공백 제거 + 영문 소문자화', () => {
    expect(normalizeCompanyName('ABC 회사')).toBe('abc회사');
  });

  it('P1-util-2: 괄호·대시 제거', () => {
    expect(normalizeCompanyName('ABC-회사(본점)')).toBe('abc회사본점');
  });

  it('P1-util-3: 다수 공백 흡수', () => {
    expect(normalizeCompanyName('abc  회사')).toBe('abc회사');
  });

  it('P1-util-4: 빈 문자열 → 빈 문자열', () => {
    expect(normalizeCompanyName('')).toBe('');
  });

  it('P1-util-5: NFKC 정규화 — 한글 호환 자모 ↔ 완성형이 동일하게 정규화', () => {
    // 호환 자모: ㄱ(U+3131) + ㅏ(U+314F) + ㄴ(U+3134) + ㅏ(U+314F) + 회사
    // NFKC 적용 시 compat jamo → conjoining jamo → Hangul syllable 순으로 변환되어
    // 완성형 '가나회사' 와 동일한 시퀀스가 된다.
    const compatibilityForm = 'ㄱㅏㄴㅏ회사';
    const composedForm = '가나회사';

    expect(normalizeCompanyName(compatibilityForm)).toBe(normalizeCompanyName(composedForm));
    expect(normalizeCompanyName(composedForm)).toBe('가나회사');
  });

  it('특수문자(따옴표·슬래시·점) 제거', () => {
    expect(normalizeCompanyName(`"ABC/회사.Co"`)).toBe('abc회사co');
  });
});
