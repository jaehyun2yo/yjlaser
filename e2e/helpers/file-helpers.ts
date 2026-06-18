import { Buffer } from 'buffer';

/**
 * Buffer 기반 테스트 파일 생성 (실제 매직 넘버 포함)
 * @param name 파일명
 * @param sizeInBytes 파일 크기 (바이트)
 * @param mimeType MIME 타입
 * @returns File 객체
 */
export function createTestFile(
  name: string,
  sizeInBytes: number,
  mimeType: string = 'application/pdf'
): File {
  const buffer = Buffer.alloc(sizeInBytes);

  // 파일 타입별 실제 매직 넘버 추가
  const extension = name.split('.').pop()?.toLowerCase() || '';

  if (mimeType === 'application/pdf' || extension === 'pdf') {
    // PDF 매직 넘버: %PDF-1.4
    const pdfHeader = '%PDF-1.4\n';
    buffer.write(pdfHeader, 0, 'ascii');
    // PDF 끝 마커: %%EOF
    const pdfFooter = '\n%%EOF';
    buffer.write(pdfFooter, sizeInBytes - pdfFooter.length, 'ascii');
  } else if (mimeType === 'image/jpeg' || extension === 'jpg' || extension === 'jpeg') {
    // JPEG 매직 넘버: FF D8 FF E0 (JFIF)
    buffer[0] = 0xff;
    buffer[1] = 0xd8;
    buffer[2] = 0xff;
    buffer[3] = 0xe0;
    // JPEG 끝 마커: FF D9
    buffer[sizeInBytes - 2] = 0xff;
    buffer[sizeInBytes - 1] = 0xd9;
  } else if (mimeType === 'application/dxf' || extension === 'dxf') {
    // DXF 매직 넘버: ASCII "  0\r\nSECTION\r\n"
    const dxfHeader = '  0\r\nSECTION\r\n  2\r\nHEADER\r\n';
    buffer.write(dxfHeader, 0, 'ascii');
  } else if (mimeType === 'image/png' || extension === 'png') {
    // PNG 매직 넘버: 89 50 4E 47 0D 0A 1A 0A
    buffer[0] = 0x89;
    buffer[1] = 0x50;
    buffer[2] = 0x4e;
    buffer[3] = 0x47;
    buffer[4] = 0x0d;
    buffer[5] = 0x0a;
    buffer[6] = 0x1a;
    buffer[7] = 0x0a;
  }

  // 나머지는 랜덤 데이터로 채우기 (헤더/푸터 제외)
  const headerSize = mimeType === 'application/pdf' ? 9 : mimeType.startsWith('image/') ? 8 : 0;
  const footerSize = mimeType === 'application/pdf' ? 6 : mimeType === 'image/jpeg' ? 2 : 0;

  for (let i = headerSize; i < sizeInBytes - footerSize; i++) {
    if (buffer[i] === 0) {
      // 아직 채워지지 않은 바이트만 랜덤으로 채우기
      buffer[i] = Math.floor(Math.random() * 256);
    }
  }

  const blob = new Blob([buffer], { type: mimeType });
  return new File([blob], name, { type: mimeType });
}

/**
 * 미리 정의된 테스트 파일 생성 함수
 */
export const TEST_FILES = {
  /** 100KB 소형 파일 */
  small: (name: string = 'test-small.pdf') =>
    createTestFile(name, 100 * 1024, 'application/pdf'),

  /** 5MB 중형 파일 */
  medium: (name: string = 'test-medium.pdf') =>
    createTestFile(name, 5 * 1024 * 1024, 'application/pdf'),

  /** 15MB 대형 파일 */
  large: (name: string = 'test-large.pdf') =>
    createTestFile(name, 15 * 1024 * 1024, 'application/pdf'),

  /** 100MB 초대형 파일 */
  veryLarge: (name: string = 'test-xl.pdf') =>
    createTestFile(name, 100 * 1024 * 1024, 'application/pdf'),

  /** DXF 파일 */
  dxf: (name: string = 'test.dxf', size: number = 500 * 1024) =>
    createTestFile(name, size, 'application/dxf'),

  /** 이미지 파일 (JPG) */
  jpg: (name: string = 'test.jpg', size: number = 200 * 1024) =>
    createTestFile(name, size, 'image/jpeg'),

  /** 비허용 파일 타입 (EXE) */
  exe: (name: string = 'test.exe', size: number = 100 * 1024) =>
    createTestFile(name, size, 'application/x-msdownload'),
};

/**
 * 배치 테스트 파일 생성
 * @param count 생성할 파일 수
 * @param prefix 파일명 접두사
 * @param sizeInBytes 각 파일 크기
 * @returns File 배열
 */
export function createBatchTestFiles(
  count: number,
  prefix: string = 'batch',
  sizeInBytes: number = 100 * 1024
): File[] {
  return Array.from({ length: count }, (_, i) =>
    createTestFile(`${prefix}-${i + 1}.pdf`, sizeInBytes, 'application/pdf')
  );
}

/**
 * 특정 확장자의 테스트 파일 생성
 * @param extension 확장자 (pdf, dxf, jpg 등)
 * @param name 파일명
 * @param sizeInBytes 파일 크기
 */
export function createTestFileByExtension(
  extension: string,
  name?: string,
  sizeInBytes: number = 100 * 1024
): File {
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    dxf: 'application/dxf',
    dwg: 'application/acad',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    ai: 'application/postscript',
    eps: 'application/postscript',
    zip: 'application/zip',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  const fileName = name || `test.${extension}`;
  const mimeType = mimeTypes[extension.toLowerCase()] || 'application/octet-stream';

  return createTestFile(fileName, sizeInBytes, mimeType);
}
