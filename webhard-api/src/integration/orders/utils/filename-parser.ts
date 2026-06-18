/**
 * DXF 파일명 파서
 *
 * 파일명 규칙: {MMDD}-{순번} {업체명} {제품설명} {규격}.DXF
 * 예시:
 *   - "0219-1 원컴퍼니 [어뮤즈][ONE-26-54] 퀘이크업미니가차_목형의뢰 [우주팩 107] 2절.DXF"
 *   - "0219-4 대성목형(29927).DXF"
 *   - "00-1 테스트파일.DXF" (테스트/샘플)
 */

export interface ParsedDxfFilename {
  dateCode: string; // "0219" (MMDD)
  sequence: number; // 1, 4, etc.
  companyName: string; // "원컴퍼니", "대성목형"
  productInfo: string; // 나머지 제품 설명 (없으면 빈 문자열)
  isTest: boolean; // "00-"으로 시작하면 true
  raw: string; // 원본 파일명
}

/**
 * DXF 파일명에서 업체명, 제품 정보 등을 파싱합니다.
 * 파싱 실패 시 null을 반환합니다.
 */
export function parseDxfFilename(filename: string): ParsedDxfFilename | null {
  // .DXF 확장자 제거
  const name = filename.replace(/\.dxf$/i, '').trim();

  // 패턴: MMDD-N 나머지
  const match = name.match(/^(\d{2,4})-(\d+)\s+(.+)$/);
  if (!match) return null;

  const dateCode = match[1];
  const sequence = parseInt(match[2], 10);
  const remainder = match[3].trim();
  const isTest = dateCode.startsWith('00');

  // 업체명 추출: 첫 번째 공백/대괄호/소괄호 전까지
  // "원컴퍼니 [어뮤즈]..." → "원컴퍼니"
  // "대성목형(29927)" → "대성목형"
  const companyMatch = remainder.match(/^([^\s[(]+)/);
  if (!companyMatch) {
    return {
      dateCode,
      sequence,
      companyName: remainder,
      productInfo: '',
      isTest,
      raw: filename,
    };
  }

  const companyName = companyMatch[1];
  const afterCompany = remainder.slice(companyName.length).trim();

  // 업체명 뒤 괄호 안 숫자 제거: "대성목형(29927)" → productInfo에서 "(29927)" 제거
  const productInfo = afterCompany.replace(/^\(\d+\)/, '').trim();

  return {
    dateCode,
    sequence,
    companyName,
    productInfo,
    isTest,
    raw: filename,
  };
}
