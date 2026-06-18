/**
 * 파일 검증 유틸리티
 * Magic Number 기반 파일 타입 검증으로 확장자 위조 방지
 */

import { logger } from './logger';

const fileValidationLogger = logger.createLogger('FileValidation');

// Magic Number 시그니처 매핑
const MAGIC_SIGNATURES: Record<string, { signatures: number[][]; mimeTypes: string[] }> = {
  // 이미지 파일
  jpg: {
    signatures: [[0xff, 0xd8, 0xff]],
    mimeTypes: ['image/jpeg'],
  },
  jpeg: {
    signatures: [[0xff, 0xd8, 0xff]],
    mimeTypes: ['image/jpeg'],
  },
  png: {
    signatures: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    mimeTypes: ['image/png'],
  },
  gif: {
    signatures: [
      [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
      [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
    ],
    mimeTypes: ['image/gif'],
  },

  // PDF
  pdf: {
    signatures: [[0x25, 0x50, 0x44, 0x46]], // %PDF
    mimeTypes: ['application/pdf'],
  },

  // Microsoft Office (ZIP 기반)
  docx: {
    signatures: [[0x50, 0x4b, 0x03, 0x04]], // ZIP
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  },
  xlsx: {
    signatures: [[0x50, 0x4b, 0x03, 0x04]], // ZIP
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  },
  pptx: {
    signatures: [[0x50, 0x4b, 0x03, 0x04]], // ZIP
    mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  },

  // Microsoft Office (레거시)
  doc: {
    signatures: [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]], // Compound File
    mimeTypes: ['application/msword'],
  },
  xls: {
    signatures: [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]], // Compound File
    mimeTypes: ['application/vnd.ms-excel'],
  },
  ppt: {
    signatures: [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]], // Compound File
    mimeTypes: ['application/vnd.ms-powerpoint'],
  },

  // 압축 파일
  zip: {
    signatures: [
      [0x50, 0x4b, 0x03, 0x04],
      [0x50, 0x4b, 0x05, 0x06],
      [0x50, 0x4b, 0x07, 0x08],
    ],
    mimeTypes: ['application/zip', 'application/x-zip-compressed'],
  },
  rar: {
    signatures: [
      [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00], // RAR 1.5+
      [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00], // RAR 5.0+
    ],
    mimeTypes: ['application/x-rar-compressed', 'application/vnd.rar'],
  },

  // AutoCAD/Adobe
  dxf: {
    // DXF는 텍스트 파일이므로 "0\n" 또는 "  0\r\n"로 시작
    signatures: [],
    mimeTypes: ['application/dxf', 'image/vnd.dxf', 'application/octet-stream'],
  },
  dwg: {
    signatures: [[0x41, 0x43, 0x31, 0x30]], // AC10 (AutoCAD)
    mimeTypes: ['application/dwg', 'application/acad', 'image/vnd.dwg'],
  },
  ai: {
    // AI 파일은 PDF 기반이거나 PostScript 기반
    signatures: [
      [0x25, 0x50, 0x44, 0x46],
      [0x25, 0x21],
    ], // %PDF 또는 %!
    mimeTypes: ['application/illustrator', 'application/postscript', 'application/pdf'],
  },
  eps: {
    signatures: [[0x25, 0x21, 0x50, 0x53]], // %!PS
    mimeTypes: ['application/postscript', 'application/eps'],
  },
  psd: {
    signatures: [[0x38, 0x42, 0x50, 0x53]], // 8BPS
    mimeTypes: ['image/vnd.adobe.photoshop', 'application/psd'],
  },

  // 텍스트 파일 (시그니처 없음)
  txt: {
    signatures: [],
    mimeTypes: ['text/plain'],
  },

  // CorelDRAW
  cdr: {
    signatures: [[0x52, 0x49, 0x46, 0x46]], // RIFF
    mimeTypes: ['application/cdr', 'application/coreldraw', 'application/x-cdr'],
  },
};

// 위험한 파일 확장자 (실행 파일)
const DANGEROUS_EXTENSIONS = [
  'exe',
  'bat',
  'cmd',
  'com',
  'msi',
  'scr',
  'pif',
  'vbs',
  'js',
  'jse',
  'wsf',
  'wsh',
  'ps1',
  'psm1',
  'psd1',
  'sh',
  'bash',
  'php',
  'py',
  'pl',
  'rb',
  'jar',
  'dll',
  'sys',
  'drv',
  'reg',
  'inf',
  'hta',
  'cpl',
  'msc',
  'msp',
];

// 위험한 Magic Number (실행 파일)
const DANGEROUS_SIGNATURES = [
  [0x4d, 0x5a], // Windows PE (EXE, DLL)
  [0x7f, 0x45, 0x4c, 0x46], // Linux ELF
  [0xca, 0xfe, 0xba, 0xbe], // macOS Universal Binary
  [0xfe, 0xed, 0xfa, 0xce], // macOS Mach-O 32-bit
  [0xfe, 0xed, 0xfa, 0xcf], // macOS Mach-O 64-bit
  [0xcf, 0xfa, 0xed, 0xfe], // macOS Mach-O 64-bit (little endian)
];

/**
 * 파일의 Magic Number를 검증합니다
 */
export async function validateFileMagicNumber(
  file: File,
  expectedExtension: string
): Promise<{ isValid: boolean; detectedType: string | null; reason?: string }> {
  const extension = expectedExtension.toLowerCase();

  // 1. 위험한 확장자 체크
  if (DANGEROUS_EXTENSIONS.includes(extension)) {
    return {
      isValid: false,
      detectedType: null,
      reason: `Dangerous file extension: ${extension}`,
    };
  }

  // 2. 파일 헤더 읽기 (처음 16바이트)
  const headerSize = 16;
  const buffer = await file.slice(0, headerSize).arrayBuffer();
  const header = new Uint8Array(buffer);

  // 3. 위험한 실행 파일 시그니처 체크
  for (const dangerousSig of DANGEROUS_SIGNATURES) {
    if (matchesSignature(header, dangerousSig)) {
      fileValidationLogger.warn(`Dangerous executable signature detected in file: ${file.name}`, {
        extension,
        signature: Array.from(header.slice(0, 4))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' '),
      });
      return {
        isValid: false,
        detectedType: 'executable',
        reason: 'Executable file signature detected',
      };
    }
  }

  // 4. 알려진 확장자의 시그니처 검증
  const expectedSig = MAGIC_SIGNATURES[extension];

  // 시그니처 정보가 없는 확장자는 기본 허용 (텍스트 파일 등)
  if (!expectedSig || expectedSig.signatures.length === 0) {
    // DXF 파일 특수 처리 (텍스트 기반)
    if (extension === 'dxf') {
      // DXF는 "0\n" 또는 공백으로 시작하는 섹션 헤더로 시작
      const textContent = await file.slice(0, 100).text();
      if (textContent.trim().startsWith('0') || textContent.includes('SECTION')) {
        return { isValid: true, detectedType: 'dxf' };
      }
      // PDF 기반 DXF도 허용
      if (matchesSignature(header, [0x25, 0x50, 0x44, 0x46])) {
        return { isValid: true, detectedType: 'dxf/pdf' };
      }
    }

    // 텍스트 파일 (txt)
    if (extension === 'txt') {
      return { isValid: true, detectedType: 'text' };
    }

    return { isValid: true, detectedType: extension };
  }

  // 5. 시그니처 매칭
  const isValidSignature = expectedSig.signatures.some((sig) => matchesSignature(header, sig));

  if (isValidSignature) {
    return { isValid: true, detectedType: extension };
  }

  // 6. ZIP 기반 파일 특수 처리 (docx, xlsx, pptx)
  const zipExtensions = ['docx', 'xlsx', 'pptx', 'zip'];
  if (zipExtensions.includes(extension)) {
    // ZIP 시그니처 체크
    if (matchesSignature(header, [0x50, 0x4b, 0x03, 0x04])) {
      return { isValid: true, detectedType: `zip-based/${extension}` };
    }
  }

  // 7. 시그니처가 일치하지 않음
  fileValidationLogger.warn(`File signature mismatch for ${file.name}`, {
    expectedExtension: extension,
    actualHeader: Array.from(header.slice(0, 8))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' '),
  });

  return {
    isValid: false,
    detectedType: null,
    reason: `File content does not match expected type: ${extension}`,
  };
}

/**
 * 바이트 배열이 시그니처와 일치하는지 확인
 */
function matchesSignature(header: Uint8Array, signature: number[]): boolean {
  if (header.length < signature.length) return false;

  for (let i = 0; i < signature.length; i++) {
    if (header[i] !== signature[i]) return false;
  }

  return true;
}

/**
 * 파일명에서 위험한 문자를 제거합니다
 */
export function sanitizeFileName(fileName: string): string {
  // 경로 구분자 제거
  let sanitized = fileName.replace(/[/\\]/g, '_');

  // 특수 문자 제거 (알파벳, 숫자, 한글, 일부 특수문자만 허용)
  sanitized = sanitized.replace(/[^\w가-힣\s.\-_()[\]]/g, '_');

  // 연속된 언더스코어 정리
  sanitized = sanitized.replace(/_+/g, '_');

  // 시작/끝 공백 및 언더스코어 제거
  sanitized = sanitized.trim().replace(/^_+|_+$/g, '');

  // 빈 문자열 방지
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    sanitized = 'unnamed_file';
  }

  return sanitized;
}

/**
 * 파일 경로에서 Path Traversal 공격을 방지합니다
 */
export function sanitizePath(path: string): string {
  // null 바이트 제거
  let sanitized = path.replace(/\0/g, '');

  // 경로 조작 시도 제거
  sanitized = sanitized.replace(/\.\./g, '').replace(/\.\//g, '').replace(/\/\./g, '');

  // Windows 경로 구분자 정규화
  sanitized = sanitized.replace(/\\/g, '/');

  // 연속된 슬래시 제거
  sanitized = sanitized.replace(/\/+/g, '/');

  // 시작 슬래시 제거 (상대 경로로 변환)
  sanitized = sanitized.replace(/^\/+/, '');

  return sanitized;
}

/**
 * 파일 크기가 실제로 맞는지 확인합니다
 */
export async function validateFileSize(file: File, maxSize: number): Promise<boolean> {
  // File 객체의 size 속성 확인
  if (file.size > maxSize) {
    return false;
  }

  // 실제 바이트 수 확인 (선택적, 대용량 파일에서는 생략 가능)
  if (file.size < 10 * 1024 * 1024) {
    // 10MB 이하만 실제 검증
    try {
      const buffer = await file.arrayBuffer();
      if (buffer.byteLength !== file.size) {
        fileValidationLogger.warn(
          `File size mismatch: reported ${file.size}, actual ${buffer.byteLength}`
        );
        return false;
      }
    } catch {
      // ArrayBuffer 생성 실패 시 reported size 신뢰
    }
  }

  return true;
}

/**
 * 확장자를 기반으로 안전한 MIME type을 반환합니다
 * 클라이언트가 제공한 MIME type 대신 서버에서 결정한 값을 사용합니다
 */
export function getSafeMimeType(extension: string): string {
  const ext = extension.toLowerCase();
  const signature = MAGIC_SIGNATURES[ext];

  if (signature && signature.mimeTypes.length > 0) {
    return signature.mimeTypes[0];
  }

  // 알려지지 않은 확장자는 안전한 기본값 사용
  return 'application/octet-stream';
}
