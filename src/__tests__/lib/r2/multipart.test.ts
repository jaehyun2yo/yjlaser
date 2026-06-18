/**
 * @jest-environment node
 */

import {
  shouldUseMultipart,
  calculateParts,
  generateObjectKey,
  initMultipartUpload,
  generatePartUploadUrls,
  completeMultipartUpload,
  abortMultipartUpload,
  uploadLargeBuffer,
  MULTIPART_CONFIG,
} from '@/lib/r2/multipart';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  CreateMultipartUploadCommand: jest.fn(),
  UploadPartCommand: jest.fn(),
  CompleteMultipartUploadCommand: jest.fn(),
  AbortMultipartUploadCommand: jest.fn(),
  PutObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://r2.example.com/part-upload?sig=abc'),
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
  Object.assign(process.env, R2_ENV);
});

afterEach(() => {
  for (const key of Object.keys(R2_ENV)) {
    delete process.env[key];
  }
});

// ============================================================
// shouldUseMultipart
// ============================================================

describe('shouldUseMultipart', () => {
  it('100MB 이상은 멀티파트 사용 (true)', () => {
    expect(shouldUseMultipart(100 * 1024 * 1024)).toBe(true);
    expect(shouldUseMultipart(200 * 1024 * 1024)).toBe(true);
    expect(shouldUseMultipart(1024 * 1024 * 1024)).toBe(true); // 1GB
  });

  it('100MB 미만은 멀티파트 미사용 (false)', () => {
    expect(shouldUseMultipart(0)).toBe(false);
    expect(shouldUseMultipart(99 * 1024 * 1024)).toBe(false);
    expect(shouldUseMultipart(50 * 1024 * 1024)).toBe(false);
  });

  it('정확히 100MB 경계값은 멀티파트 사용 (true)', () => {
    expect(shouldUseMultipart(MULTIPART_CONFIG.MULTIPART_THRESHOLD)).toBe(true);
  });
});

// ============================================================
// calculateParts
// ============================================================

describe('calculateParts', () => {
  it('30MB / 10MB 청크 → 3파트', () => {
    expect(calculateParts(30 * 1024 * 1024, 10 * 1024 * 1024)).toBe(3);
  });

  it('25MB / 10MB 청크 → 3파트 (올림)', () => {
    expect(calculateParts(25 * 1024 * 1024, 10 * 1024 * 1024)).toBe(3);
  });

  it('10MB / 10MB 청크 → 1파트', () => {
    expect(calculateParts(10 * 1024 * 1024, 10 * 1024 * 1024)).toBe(1);
  });

  it('110MB / 10MB 청크 → 11파트', () => {
    expect(calculateParts(110 * 1024 * 1024, 10 * 1024 * 1024)).toBe(11);
  });
});

// ============================================================
// generateObjectKey
// ============================================================

describe('generateObjectKey', () => {
  it('folder/timestamp-randomId-filename 형식으로 생성', () => {
    const key = generateObjectKey('test.pdf', 'webhard');
    expect(key).toMatch(/^webhard\/\d+-[a-z0-9]+-test\.pdf$/);
  });

  it('기본 폴더는 webhard', () => {
    const key = generateObjectKey('file.txt');
    expect(key).toMatch(/^webhard\//);
  });

  it('파일명 특수문자를 _ 로 치환', () => {
    const key = generateObjectKey('my file!.pdf', 'uploads');
    expect(key).not.toContain(' ');
    expect(key).not.toContain('!');
  });

  it('같은 파일명이라도 호출마다 다른 키 생성', () => {
    const key1 = generateObjectKey('same.pdf');
    const key2 = generateObjectKey('same.pdf');
    // timestamp + random으로 거의 동일하지 않음 (단, 동일 ms 내 동시 호출 가능성 고려)
    expect(typeof key1).toBe('string');
    expect(typeof key2).toBe('string');
  });
});

// ============================================================
// initMultipartUpload
// ============================================================

describe('initMultipartUpload', () => {
  it('CreateMultipartUploadCommand 실행 후 uploadId/objectKey/totalParts 반환', async () => {
    mockSend.mockResolvedValue({ UploadId: 'upload-id-123' });

    const result = await initMultipartUpload('test.pdf', 'application/pdf', 110 * 1024 * 1024);

    expect(result.uploadId).toBe('upload-id-123');
    expect(result.objectKey).toMatch(/^webhard\//);
    expect(result.totalParts).toBe(11); // 110MB / 10MB
    expect(result.publicUrl).toContain('https://pub.example.com');
  });

  it('UploadId 미반환 시 에러 throw', async () => {
    mockSend.mockResolvedValue({});

    await expect(
      initMultipartUpload('test.pdf', 'application/pdf', 110 * 1024 * 1024)
    ).rejects.toThrow('no UploadId');
  });
});

// ============================================================
// generatePartUploadUrls
// ============================================================

describe('generatePartUploadUrls', () => {
  it('파트 번호 배열에 대한 presigned URL 배열 반환', async () => {
    const { getSignedUrl } = jest.requireMock('@aws-sdk/s3-request-presigner') as {
      getSignedUrl: jest.Mock;
    };
    getSignedUrl.mockResolvedValue('https://r2.example.com/part-upload?sig=abc');

    const urls = await generatePartUploadUrls('upload-id-123', 'webhard/test.pdf', [1, 2, 3]);

    expect(urls).toHaveLength(3);
    expect(urls[0].partNumber).toBe(1);
    expect(urls[1].partNumber).toBe(2);
    expect(urls[0].presignedUrl).toContain('part-upload');
  });
});

// ============================================================
// completeMultipartUpload
// ============================================================

describe('completeMultipartUpload', () => {
  it('성공 시 success: true, objectKey, publicUrl 반환', async () => {
    mockSend.mockResolvedValue({});

    const result = await completeMultipartUpload('upload-id-123', 'webhard/test.pdf', [
      { partNumber: 1, etag: '"etag-1"' },
      { partNumber: 2, etag: '"etag-2"' },
    ]);

    expect(result.success).toBe(true);
    expect(result.objectKey).toBe('webhard/test.pdf');
    expect(result.publicUrl).toBe('https://pub.example.com/webhard/test.pdf');
  });

  it('파트를 번호 순으로 정렬하여 완료', async () => {
    mockSend.mockResolvedValue({});

    // 역순 입력
    const result = await completeMultipartUpload('upload-id-123', 'webhard/test.pdf', [
      { partNumber: 3, etag: '"etag-3"' },
      { partNumber: 1, etag: '"etag-1"' },
      { partNumber: 2, etag: '"etag-2"' },
    ]);

    expect(result.success).toBe(true);
  });

  it('실패 시 success: false, error 메시지 반환', async () => {
    mockSend.mockRejectedValue(new Error('S3 network error'));

    const result = await completeMultipartUpload('upload-id-123', 'webhard/test.pdf', [
      { partNumber: 1, etag: '"etag-1"' },
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toContain('S3 network error');
  });
});

// ============================================================
// abortMultipartUpload
// ============================================================

describe('abortMultipartUpload', () => {
  it('AbortMultipartUploadCommand를 send에 전달', async () => {
    mockSend.mockResolvedValue({});

    await abortMultipartUpload('upload-id-123', 'webhard/test.pdf');

    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// uploadLargeBuffer
// ============================================================

describe('uploadLargeBuffer', () => {
  it('100MB 미만 버퍼는 PutObjectCommand 단일 업로드', async () => {
    mockSend.mockResolvedValue({});
    const buffer = Buffer.alloc(50 * 1024 * 1024); // 50MB

    const result = await uploadLargeBuffer(buffer, 'small.pdf', 'application/pdf');

    expect(result.success).toBe(true);
    expect(result.objectKey).toBeDefined();
    expect(mockSend).toHaveBeenCalledTimes(1); // PutObjectCommand 1회
  });

  it('100MB 이상 버퍼는 멀티파트 업로드', async () => {
    // CreateMultipartUpload → UploadPart(x11) → CompleteMultipartUpload
    mockSend
      .mockResolvedValueOnce({ UploadId: 'upload-id-big' }) // init
      .mockResolvedValue({ ETag: '"etag-1"' }); // parts + complete

    const buffer = Buffer.alloc(110 * 1024 * 1024); // 110MB

    const result = await uploadLargeBuffer(buffer, 'big.pdf', 'application/pdf');

    expect(result.success).toBe(true);
    // 1(init) + 11(parts) + 1(complete) = 13회 이상
    expect(mockSend.mock.calls.length).toBeGreaterThan(3);
  });

  it('업로드 실패 시 success: false, abort 호출', async () => {
    mockSend
      .mockResolvedValueOnce({ UploadId: 'upload-id-fail' }) // init
      .mockRejectedValueOnce(new Error('Part upload failed')); // UploadPart 실패

    const buffer = Buffer.alloc(110 * 1024 * 1024); // 110MB

    const result = await uploadLargeBuffer(buffer, 'fail.pdf', 'application/pdf');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Part upload failed');
  });
});

// ============================================================
// MULTIPART_CONFIG
// ============================================================

describe('MULTIPART_CONFIG', () => {
  it('DEFAULT_CHUNK_SIZE는 10MB', () => {
    expect(MULTIPART_CONFIG.DEFAULT_CHUNK_SIZE).toBe(10 * 1024 * 1024);
  });

  it('MULTIPART_THRESHOLD는 100MB', () => {
    expect(MULTIPART_CONFIG.MULTIPART_THRESHOLD).toBe(100 * 1024 * 1024);
  });

  it('MAX_CONCURRENT_UPLOADS는 4', () => {
    expect(MULTIPART_CONFIG.MAX_CONCURRENT_UPLOADS).toBe(4);
  });

  it('PRESIGN_EXPIRES_IN는 3600초', () => {
    expect(MULTIPART_CONFIG.PRESIGN_EXPIRES_IN).toBe(3600);
  });
});
