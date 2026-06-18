/**
 * 도면 업로드 허용 확장자. 프론트엔드 accept 속성과 클라이언트 사이드 검증에 사용.
 * 서버측 DANGEROUS_EXTENSIONS 차단은 src/lib/utils/fileValidation.ts 에서 별도 관리.
 */
export const DRAWING_UPLOAD_ALLOWED_EXTENSIONS: readonly string[] = [
  '.pdf',
  '.dxf',
  '.ai',
  '.dwg',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.zip',
  '.rar',
] as const;

/**
 * input[type=file] accept 속성에 직접 사용할 수 있는 콤마 구분 문자열.
 */
export const DRAWING_UPLOAD_ACCEPT_ATTR: string = DRAWING_UPLOAD_ALLOWED_EXTENSIONS.join(',');

/**
 * 참고자료(이미지/문서) 업로드 허용 확장자. 도면과 구분해서 관리.
 */
export const REFERENCE_UPLOAD_ALLOWED_EXTENSIONS: readonly string[] = [
  '.pdf',
  '.doc',
  '.docx',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
] as const;

export const REFERENCE_UPLOAD_ACCEPT_ATTR: string =
  REFERENCE_UPLOAD_ALLOWED_EXTENSIONS.join(',') + ',image/*';

/**
 * 공개 문의 폼(/contact) 전용 업로드 정책.
 * 화이트리스트 대신 블랙리스트(EXE 만 차단). 거래처가 다양한 형식
 * (HWP, ZIP, AI, DXF 등) 을 자유롭게 첨부할 수 있도록 허용.
 *
 * 보안 보강:
 * - 서버측 magic number 차단(src/lib/utils/fileValidation.ts DANGEROUS_SIGNATURES)
 *   이 .exe 외 .dll, .bat, .scr 등 실행 파일 시그니처도 함께 차단.
 */
export const INQUIRY_BLOCKED_EXTENSIONS: readonly string[] = ['.exe'] as const;

/**
 * 공개 문의 폼 input[type=file] accept 속성.
 * 빈 문자열 = 모든 형식 허용. 클라이언트 차단은 INQUIRY_BLOCKED_EXTENSIONS 가 담당.
 */
export const INQUIRY_UPLOAD_ACCEPT_ATTR: string = '';
