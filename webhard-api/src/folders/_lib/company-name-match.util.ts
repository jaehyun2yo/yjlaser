/**
 * 외부웹하드 가상 업체 루트 폴더 매칭용 이름 정규화.
 *
 * 기호·공백 차이를 흡수하여 동일 업체로 인식하기 위함 (task 21).
 *
 * 변환 순서:
 *   1. NFKC 유니코드 정규화 — 한글 호환 자모(U+3131..U+318F) 및 전각/반각 차이 흡수.
 *   2. 영문 소문자화 — 대소문자 차이 흡수.
 *   3. 한글(가-힣)·영문(a-z)·숫자(0-9) 이외 문자 전부 제거 — 공백·괄호·대시·점·슬래시·따옴표·특수기호 등.
 *
 * 순수 함수: DB·IO·외부 호출 없음. 빈 문자열 입력 시 빈 문자열 반환.
 */
export function normalizeCompanyName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, '');
}
