/**
 * @jest-environment node
 */

import {
  sanitizePath,
  sanitizeFileName,
  getSafeMimeType,
  validateFileSize,
} from '@/lib/utils/fileValidation';

describe('fileValidation', () => {
  describe('sanitizePath', () => {
    it('should remove null bytes', () => {
      expect(sanitizePath('test\0path')).toBe('testpath');
    });

    it('should remove path traversal sequences', () => {
      expect(sanitizePath('../../../etc/passwd')).toBe('etc/passwd');
      expect(sanitizePath('folder/../secret')).toBe('folder/secret');
      expect(sanitizePath('./folder/./file')).toBe('folder/file');
    });

    it('should normalize slashes', () => {
      expect(sanitizePath('path//to///file')).toBe('path/to/file');
      expect(sanitizePath('path\\to\\file')).toBe('path/to/file');
    });

    it('should remove leading slashes', () => {
      expect(sanitizePath('/path/to/file')).toBe('path/to/file');
      expect(sanitizePath('///path/to/file')).toBe('path/to/file');
    });

    it('should handle complex malicious paths', () => {
      const maliciousPath = '../../../\0./..\\..//etc/passwd';
      const sanitized = sanitizePath(maliciousPath);
      expect(sanitized).not.toContain('..');
      expect(sanitized).not.toContain('\0');
    });
  });

  describe('sanitizeFileName', () => {
    it('should remove special characters', () => {
      expect(sanitizeFileName('file<name>.txt')).toBe('file_name_.txt');
      expect(sanitizeFileName('file:name.txt')).toBe('file_name.txt');
      expect(sanitizeFileName('file*name?.txt')).toBe('file_name_.txt');
    });

    it('should preserve Korean characters', () => {
      expect(sanitizeFileName('문서파일.pdf')).toBe('문서파일.pdf');
      expect(sanitizeFileName('테스트_파일-2024.xlsx')).toBe('테스트_파일-2024.xlsx');
    });

    it('should handle empty or invalid input', () => {
      expect(sanitizeFileName('')).toBe('unnamed_file');
      expect(sanitizeFileName('.')).toBe('unnamed_file');
      expect(sanitizeFileName('..')).toBe('unnamed_file');
    });

    it('should replace path separators', () => {
      expect(sanitizeFileName('path/to/file.txt')).toBe('path_to_file.txt');
      expect(sanitizeFileName('path\\to\\file.txt')).toBe('path_to_file.txt');
    });

    it('should clean up consecutive underscores', () => {
      expect(sanitizeFileName('file___name.txt')).toBe('file_name.txt');
    });
  });

  describe('getSafeMimeType', () => {
    it('should return correct MIME type for known extensions', () => {
      expect(getSafeMimeType('pdf')).toBe('application/pdf');
      expect(getSafeMimeType('jpg')).toBe('image/jpeg');
      expect(getSafeMimeType('jpeg')).toBe('image/jpeg');
      expect(getSafeMimeType('png')).toBe('image/png');
    });

    it('should return correct MIME type for Office documents', () => {
      expect(getSafeMimeType('doc')).toBe('application/msword');
      expect(getSafeMimeType('docx')).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      expect(getSafeMimeType('xls')).toBe('application/vnd.ms-excel');
      expect(getSafeMimeType('xlsx')).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    });

    it('should return correct MIME type for CAD files', () => {
      expect(getSafeMimeType('dxf')).toBe('application/dxf');
      expect(getSafeMimeType('dwg')).toBe('application/dwg');
    });

    it('should return octet-stream for unknown extensions', () => {
      expect(getSafeMimeType('unknown')).toBe('application/octet-stream');
      expect(getSafeMimeType('xyz')).toBe('application/octet-stream');
    });

    it('should handle case insensitively', () => {
      expect(getSafeMimeType('PDF')).toBe('application/pdf');
      expect(getSafeMimeType('JPG')).toBe('image/jpeg');
    });

    it('psd 확장자에 image/vnd.adobe.photoshop을 반환한다', () => {
      expect(getSafeMimeType('psd')).toBe('image/vnd.adobe.photoshop');
    });

    it('gif 확장자에 image/gif를 반환한다', () => {
      expect(getSafeMimeType('gif')).toBe('image/gif');
    });
  });

  describe('validateFileSize', () => {
    it('파일 크기가 최대값 이하이면 true를 반환한다', async () => {
      const file = new File(['hello world'], 'test.txt', { type: 'text/plain' });
      const maxSize = 1 * 1024 * 1024; // 1MB
      const result = await validateFileSize(file, maxSize);
      expect(result).toBe(true);
    });

    it('파일 크기가 최대값을 초과하면 false를 반환한다', async () => {
      const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB
      const file = new File([largeContent], 'large.txt', { type: 'text/plain' });
      const maxSize = 10 * 1024 * 1024; // 10MB
      const result = await validateFileSize(file, maxSize);
      expect(result).toBe(false);
    });

    it('파일 크기가 정확히 최대값과 같으면 true를 반환한다', async () => {
      const content = 'x'.repeat(100);
      const file = new File([content], 'exact.txt', { type: 'text/plain' });
      const result = await validateFileSize(file, 100);
      expect(result).toBe(true);
    });
  });
});
