/**
 * @jest-environment node
 */

import {
  uploadFileToR2,
  uploadBufferToR2,
  buildVariantKeys,
  calculatePresignedUrlExpiry,
  generatePresignedUploadUrl,
  generateBatchPresignedUrls,
} from '@/lib/r2/upload';
import { __resetR2ClientForTest } from '@/lib/r2/client';

// jest.mock 팩토리에서 사용할 변수는 'mock' 접두사 필수 (Jest 호이스팅 규칙)
const mockSend = jest.fn();
const mockUploadDone = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation(() => ({
    done: mockUploadDone,
  })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://r2.example.com/presigned?sig=abc'),
}));

jest.mock('@smithy/node-http-handler', () => ({
  NodeHttpHandler: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('https', () => ({
  Agent: jest.fn().mockImplementation(() => ({})),
}));

const R2_ENV = {
  R2_ENDPOINT: 'https://r2.example.com',
  R2_ACCESS_KEY_ID: 'test-key',
  R2_SECRET_ACCESS_KEY: 'test-secret',
  R2_BUCKET_NAME: 'test-bucket',
  R2_PUBLIC_BASE_URL: 'https://pub.example.com',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUploadDone.mockResolvedValue(undefined);
  Object.assign(process.env, R2_ENV);
  __resetR2ClientForTest();
});

afterEach(() => {
  for (const key of Object.keys(R2_ENV)) {
    delete process.env[key];
  }
});

/**
 * File 객체 대신 필요한 속성만 갖춘 목 객체 생성
 */
function makeMockFile(size: number, type = 'application/octet-stream', name = 'test.pdf'): File {
  return {
    size,
    name,
    type,
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(Math.min(size, 64))),
    slice: jest.fn().mockReturnValue({
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(Math.min(size, 64))),
    }),
  } as unknown as File;
}

// ============================================================
// uploadFileToR2
// ============================================================

describe('uploadFileToR2', () => {
  it('10MB 미만 파일은 PutObjectCommand 단일 업로드', async () => {
    mockSend.mockResolvedValue({});
    const file = makeMockFile(1024 * 1024); // 1MB

    const result = await uploadFileToR2(file, 'yjlaser');

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(result.key).toMatch(/^yjlaser\//);
    expect(result.url).toContain('https://pub.example.com');
  });

  it('10MB 이상 파일은 Upload(스트림 멀티파트) 사용', async () => {
    const { Upload } = jest.requireMock('@aws-sdk/lib-storage') as {
      Upload: jest.Mock;
    };
    const file = makeMockFile(15 * 1024 * 1024); // 15MB

    const result = await uploadFileToR2(file, 'yjlaser');

    expect(Upload).toHaveBeenCalledTimes(1);
    expect(mockUploadDone).toHaveBeenCalledTimes(1);
    expect(result.key).toMatch(/^yjlaser\//);
    expect(result.url).toContain('https://pub.example.com');
  });

  it('R2_BUCKET_NAME 누락 시 에러 throw', async () => {
    delete process.env.R2_BUCKET_NAME;
    const file = makeMockFile(100);

    await expect(uploadFileToR2(file)).rejects.toThrow('R2 is not configured');
  });

  it('R2_ENDPOINT 누락 시 에러 throw', async () => {
    delete process.env.R2_ENDPOINT;
    const file = makeMockFile(100);

    await expect(uploadFileToR2(file)).rejects.toThrow('R2 is not configured');
  });
});

// ============================================================
// uploadBufferToR2
// ============================================================

describe('uploadBufferToR2', () => {
  it('Buffer를 R2에 업로드하고 key/url 반환', async () => {
    mockSend.mockResolvedValue({});
    const buffer = Buffer.from('test content');

    const result = await uploadBufferToR2(buffer, 'text/plain', 'test/key.txt');

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(result.key).toBe('test/key.txt');
    expect(result.url).toBe('https://pub.example.com/test/key.txt');
  });

  it('R2_PUBLIC_BASE_URL 끝 슬래시 자동 제거', async () => {
    process.env.R2_PUBLIC_BASE_URL = 'https://pub.example.com/';
    mockSend.mockResolvedValue({});

    const result = await uploadBufferToR2(Buffer.from('x'), 'text/plain', 'path/file.txt');

    expect(result.url).toBe('https://pub.example.com/path/file.txt');
  });
});

// ============================================================
// buildVariantKeys
// ============================================================

describe('buildVariantKeys', () => {
  it('thumb, medium, original 키를 반환', () => {
    const keys = buildVariantKeys('photo.jpg');

    expect(keys).toHaveProperty('thumb');
    expect(keys).toHaveProperty('medium');
    expect(keys).toHaveProperty('original');
  });

  it('각 키에 해당 suffix 포함', () => {
    const keys = buildVariantKeys('photo.jpg');

    expect(keys.thumb).toContain('-thumb.jpg');
    expect(keys.medium).toContain('-medium.jpg');
    expect(keys.original).toContain('-original.jpg');
  });

  it('파일명 기반으로 생성되며 서로 다른 값', () => {
    const keys = buildVariantKeys('image.png');

    expect(keys.thumb).not.toBe(keys.medium);
    expect(keys.medium).not.toBe(keys.original);
  });
});

// ============================================================
// calculatePresignedUrlExpiry
// ============================================================

describe('calculatePresignedUrlExpiry', () => {
  it('파일 크기 0은 3600초 반환', () => {
    expect(calculatePresignedUrlExpiry(0)).toBe(3600);
  });

  it('100MB 미만 파일은 3600초 반환', () => {
    expect(calculatePresignedUrlExpiry(50 * 1024 * 1024)).toBe(3600);
  });

  it('최대값 3600초를 초과하지 않음 (200MB)', () => {
    const result = calculatePresignedUrlExpiry(200 * 1024 * 1024);
    expect(result).toBeLessThanOrEqual(3600);
  });
});

// ============================================================
// generatePresignedUploadUrl
// ============================================================

describe('generatePresignedUploadUrl', () => {
  it('presignedUrl, objectKey, publicUrl, expiresIn 포함한 객체 반환', async () => {
    const { getSignedUrl } = jest.requireMock('@aws-sdk/s3-request-presigner') as {
      getSignedUrl: jest.Mock;
    };
    getSignedUrl.mockResolvedValue('https://r2.example.com/presigned?sig=xyz');

    const result = await generatePresignedUploadUrl('doc.pdf', 'application/pdf', 'webhard');

    expect(result.presignedUrl).toBe('https://r2.example.com/presigned?sig=xyz');
    expect(result.objectKey).toMatch(/^webhard\//);
    expect(result.publicUrl).toContain('https://pub.example.com/webhard/');
    expect(result.expiresIn).toBe(3600);
  });

  it('expiresIn 명시 시 해당 값 사용', async () => {
    const { getSignedUrl } = jest.requireMock('@aws-sdk/s3-request-presigner') as {
      getSignedUrl: jest.Mock;
    };
    getSignedUrl.mockResolvedValue('https://r2.example.com/presigned?sig=xyz');

    const result = await generatePresignedUploadUrl('video.mp4', 'video/mp4', 'webhard', 7200, 0);

    expect(result.expiresIn).toBe(7200);
  });
});

// ============================================================
// generateBatchPresignedUrls
// ============================================================

describe('generateBatchPresignedUrls', () => {
  it('파일 배열에 대한 presigned URL 배열 반환', async () => {
    const { getSignedUrl } = jest.requireMock('@aws-sdk/s3-request-presigner') as {
      getSignedUrl: jest.Mock;
    };
    getSignedUrl.mockResolvedValue('https://r2.example.com/presigned?sig=abc');

    const files = [
      { fileName: 'a.pdf', contentType: 'application/pdf', size: 1024 },
      { fileName: 'b.png', contentType: 'image/png', size: 2048 },
    ];

    const results = await generateBatchPresignedUrls(files, 'webhard');

    expect(results).toHaveLength(2);
    expect(results[0].fileName).toBe('a.pdf');
    expect(results[1].fileName).toBe('b.png');
    expect(results[0]).toHaveProperty('presignedUrl');
    expect(results[0]).toHaveProperty('objectKey');
    expect(results[0]).toHaveProperty('expiresIn');
  });
});
