/**
 * @jest-environment node
 */

import { getR2SignedUrl, getBatchR2SignedUrls } from '@/lib/r2/download';
import { __resetR2ClientForTest } from '@/lib/r2/client';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  GetObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://r2.example.com/download?sig=xyz'),
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
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(process.env, R2_ENV);
  __resetR2ClientForTest();
});

afterEach(() => {
  for (const key of Object.keys(R2_ENV)) {
    delete process.env[key];
  }
});

// ============================================================
// getR2SignedUrl
// ============================================================

describe('getR2SignedUrl', () => {
  it('presigned 다운로드 URL 반환', async () => {
    const url = await getR2SignedUrl('webhard/test.pdf');

    expect(url).toBe('https://r2.example.com/download?sig=xyz');
  });

  it('기본 만료 시간 3600초로 getSignedUrl 호출', async () => {
    const { getSignedUrl } = jest.requireMock('@aws-sdk/s3-request-presigner') as {
      getSignedUrl: jest.Mock;
    };

    await getR2SignedUrl('webhard/test.pdf');

    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ expiresIn: 3600 })
    );
  });

  it('expiresIn 커스텀 값 전달', async () => {
    const { getSignedUrl } = jest.requireMock('@aws-sdk/s3-request-presigner') as {
      getSignedUrl: jest.Mock;
    };

    await getR2SignedUrl('webhard/test.pdf', 7200);

    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ expiresIn: 7200 })
    );
  });

  it('R2_BUCKET_NAME 누락 시 에러 throw', async () => {
    delete process.env.R2_BUCKET_NAME;

    await expect(getR2SignedUrl('webhard/test.pdf')).rejects.toThrow(
      'R2 is not configured: missing bucket'
    );
  });

  it('R2_ACCESS_KEY_ID 누락 시 에러 throw', async () => {
    delete process.env.R2_ACCESS_KEY_ID;

    await expect(getR2SignedUrl('webhard/test.pdf')).rejects.toThrow('R2 is not configured');
  });
});

// ============================================================
// getBatchR2SignedUrls
// ============================================================

describe('getBatchR2SignedUrls', () => {
  it('여러 objectKey에 대한 presigned URL 배열 반환', async () => {
    const keys = ['webhard/a.pdf', 'webhard/b.png', 'webhard/c.dxf'];

    const results = await getBatchR2SignedUrls(keys);

    expect(results).toHaveLength(3);
    results.forEach((r, i) => {
      expect(r.objectKey).toBe(keys[i]);
      expect(r.presignedUrl).toBe('https://r2.example.com/download?sig=xyz');
    });
  });

  it('빈 배열 입력 시 빈 배열 반환', async () => {
    const results = await getBatchR2SignedUrls([]);

    expect(results).toEqual([]);
  });

  it('단일 키 입력 시 1개 결과 반환', async () => {
    const results = await getBatchR2SignedUrls(['webhard/single.pdf']);

    expect(results).toHaveLength(1);
    expect(results[0].objectKey).toBe('webhard/single.pdf');
  });
});
