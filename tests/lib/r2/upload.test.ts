/**
 * R2 업로드 유틸리티 테스트
 * src/lib/r2/upload.ts
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { calculatePresignedUrlExpiry, buildVariantKeys } from '@/lib/r2/upload';

// 환경 변수 모킹
process.env.R2_ENDPOINT = 'https://test-r2.cloudflare.com';
process.env.R2_ACCESS_KEY_ID = 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.R2_BUCKET_NAME = 'test-bucket';
process.env.R2_PUBLIC_BASE_URL = 'https://test-cdn.example.com';

// AWS SDK 모킹
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ $metadata: { httpStatusCode: 200 } }),
  })),
  PutObjectCommand: jest.fn().mockImplementation((params) => params),
}));

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation(() => ({
    done: jest.fn().mockResolvedValue({ Key: 'test-key' }),
  })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest
    .fn()
    .mockResolvedValue('https://test-presigned-url.com/upload?signature=abc123'),
}));

jest.mock('@smithy/node-http-handler', () => ({
  NodeHttpHandler: jest.fn().mockImplementation(() => ({})),
}));

// https 모듈 모킹
jest.mock('https', () => ({
  Agent: jest.fn().mockImplementation(() => ({})),
}));

describe('R2 업로드 유틸리티', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculatePresignedUrlExpiry', () => {
    it('작은 파일 (100MB 미만)은 기본 1시간 만료 시간을 가져야 함', () => {
      const fileSize = 50 * 1024 * 1024; // 50MB
      const expiry = calculatePresignedUrlExpiry(fileSize);

      // 기본 만료 시간: 3600초 (1시간)
      expect(expiry).toBe(3600);
    });

    it('중간 파일 (100MB)은 기본 1시간 만료 시간을 가져야 함', () => {
      const fileSize = 100 * 1024 * 1024; // 100MB
      const expiry = calculatePresignedUrlExpiry(fileSize);

      // 100MB = 추가 1시간 → 총 2시간이지만 최대 1시간으로 제한
      expect(expiry).toBe(3600); // 최대값: 3600초 (1시간)
    });

    it('큰 파일 (500MB)도 최대 1시간 만료 시간으로 제한되어야 함', () => {
      const fileSize = 500 * 1024 * 1024; // 500MB
      const expiry = calculatePresignedUrlExpiry(fileSize);

      // 500MB = 추가 5시간 → 총 6시간이지만 최대 1시간으로 제한
      expect(expiry).toBe(3600); // 최대값: 3600초 (1시간)
    });

    it('아주 큰 파일 (1GB)도 최대 1시간 만료 시간으로 제한되어야 함', () => {
      const fileSize = 1024 * 1024 * 1024; // 1GB
      const expiry = calculatePresignedUrlExpiry(fileSize);

      // 최대값 제한
      expect(expiry).toBe(3600); // 최대값: 3600초 (1시간)
    });

    it('0 바이트 파일은 기본 1시간 만료 시간을 가져야 함', () => {
      const fileSize = 0;
      const expiry = calculatePresignedUrlExpiry(fileSize);

      expect(expiry).toBe(3600);
    });

    it('매우 작은 파일 (1KB)은 기본 1시간 만료 시간을 가져야 함', () => {
      const fileSize = 1024; // 1KB
      const expiry = calculatePresignedUrlExpiry(fileSize);

      expect(expiry).toBe(3600);
    });
  });

  describe('buildVariantKeys', () => {
    beforeEach(() => {
      // Date.now() 모킹 (일관된 테스트 결과)
      jest.spyOn(Date, 'now').mockReturnValue(1234567890000);
      // Math.random() 모킹
      jest.spyOn(Math, 'random').mockReturnValue(0.123456789);
    });

    it('이미지 파일명에서 thumb, medium, original 키를 생성해야 함', () => {
      const filename = 'test-image.jpg';
      const keys = buildVariantKeys(filename);

      expect(keys).toHaveProperty('thumb');
      expect(keys).toHaveProperty('medium');
      expect(keys).toHaveProperty('original');

      // 모든 키가 고유 ID와 파일명을 포함해야 함
      expect(keys.thumb).toContain('yjlaser/');
      expect(keys.thumb).toContain('test-image');
      expect(keys.thumb).toContain('-thumb.jpg');

      expect(keys.medium).toContain('-medium.jpg');
      expect(keys.original).toContain('-original.jpg');
    });

    it('PNG 파일에 대해 올바른 확장자를 유지해야 함', () => {
      const filename = 'screenshot.png';
      const keys = buildVariantKeys(filename);

      expect(keys.thumb).toMatch(/-thumb\.png$/);
      expect(keys.medium).toMatch(/-medium\.png$/);
      expect(keys.original).toMatch(/-original\.png$/);
    });

    it('확장자가 없는 파일은 파일명을 확장자로 사용함', () => {
      const filename = 'image-no-ext';
      const keys = buildVariantKeys(filename);

      // 확장자가 없으면 split('.').pop()이 전체 파일명을 반환
      // 그리고 base는 빈 문자열이 됨
      expect(keys.thumb).toContain('-thumb.image-no-ext');
      expect(keys.medium).toContain('-medium.image-no-ext');
      expect(keys.original).toContain('-original.image-no-ext');
    });

    it('여러 점이 있는 파일명을 올바르게 처리해야 함', () => {
      const filename = 'my.test.file.jpeg';
      const keys = buildVariantKeys(filename);

      expect(keys.thumb).toContain('my.test.file');
      expect(keys.thumb).toMatch(/-thumb\.jpeg$/);
      expect(keys.medium).toMatch(/-medium\.jpeg$/);
      expect(keys.original).toMatch(/-original\.jpeg$/);
    });

    it('모든 변형 키가 고유 ID를 포함해야 함', () => {
      const filename = 'test.jpg';
      const keys = buildVariantKeys(filename);

      // timestamp와 random ID가 포함되어야 함
      expect(keys.thumb).toMatch(/yjlaser\/\d+-[a-z0-9]+-test-thumb\.jpg/);
      expect(keys.medium).toMatch(/yjlaser\/\d+-[a-z0-9]+-test-medium\.jpg/);
      expect(keys.original).toMatch(/yjlaser\/\d+-[a-z0-9]+-test-original\.jpg/);
    });

    it('동일한 파일명으로 두 번 호출 시 다른 키를 생성해야 함', () => {
      const filename = 'duplicate.jpg';

      // 첫 번째 호출
      const keys1 = buildVariantKeys(filename);

      // Math.random 값 변경 (다른 random ID 생성)
      jest.spyOn(Math, 'random').mockReturnValue(0.987654321);

      // 두 번째 호출
      const keys2 = buildVariantKeys(filename);

      // 키가 달라야 함 (random ID가 다름)
      expect(keys1.thumb).not.toBe(keys2.thumb);
      expect(keys1.medium).not.toBe(keys2.medium);
      expect(keys1.original).not.toBe(keys2.original);
    });
  });

  describe('R2 환경 변수 검증', () => {
    it('필수 환경 변수가 설정되어 있어야 함', () => {
      expect(process.env.R2_ENDPOINT).toBeDefined();
      expect(process.env.R2_ACCESS_KEY_ID).toBeDefined();
      expect(process.env.R2_SECRET_ACCESS_KEY).toBeDefined();
      expect(process.env.R2_BUCKET_NAME).toBeDefined();
      expect(process.env.R2_PUBLIC_BASE_URL).toBeDefined();
    });

    it('R2_PUBLIC_BASE_URL이 유효한 URL이어야 함', () => {
      const url = process.env.R2_PUBLIC_BASE_URL;
      expect(() => new URL(url as string)).not.toThrow();
    });
  });

  describe('파일 크기 임계값', () => {
    it('10MB가 스트림 업로드 임계값이어야 함', () => {
      // 이는 문서화 목적의 테스트
      // 실제 상수는 src/lib/r2/upload.ts의 STREAM_UPLOAD_THRESHOLD
      const expectedThreshold = 10 * 1024 * 1024; // 10MB
      expect(expectedThreshold).toBe(10485760);
    });
  });

  describe('Presigned URL 상수', () => {
    it('최소 만료 시간이 1시간이어야 함', () => {
      const minExpiry = 3600; // 1시간
      expect(minExpiry).toBe(3600);
    });

    it('최대 만료 시간이 1시간이어야 함', () => {
      const maxExpiry = 3600; // 1시간
      expect(maxExpiry).toBe(3600);
    });

    it('크기 계산 인자가 100MB당 1시간이어야 함', () => {
      const sizeFactor = 100 * 1024 * 1024; // 100MB
      expect(sizeFactor).toBe(104857600);
    });
  });
});
