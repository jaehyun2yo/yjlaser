/**
 * @jest-environment node
 */

import { deleteFromR2, batchDeleteFromR2, parallelBatchDeleteFromR2 } from '@/lib/r2/delete';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  DeleteObjectCommand: jest.fn(),
  DeleteObjectsCommand: jest.fn(),
}));

jest.mock('@smithy/node-http-handler', () => ({
  NodeHttpHandler: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('https', () => ({
  Agent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    })),
  },
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
});

afterEach(() => {
  for (const key of Object.keys(R2_ENV)) {
    delete process.env[key];
  }
});

// ============================================================
// deleteFromR2
// ============================================================

describe('deleteFromR2', () => {
  it('성공 시 true 반환', async () => {
    mockSend.mockResolvedValue({});

    const result = await deleteFromR2('webhard/test.pdf');

    expect(result).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('S3 에러 발생 시 false 반환 (예외 전파 안 함)', async () => {
    mockSend.mockRejectedValue(new Error('AccessDenied'));

    const result = await deleteFromR2('webhard/test.pdf');

    expect(result).toBe(false);
  });

  it('R2_BUCKET_NAME 누락 시 에러 throw', async () => {
    delete process.env.R2_BUCKET_NAME;

    await expect(deleteFromR2('webhard/test.pdf')).rejects.toThrow('R2 is not configured');
  });
});

// ============================================================
// batchDeleteFromR2
// ============================================================

describe('batchDeleteFromR2', () => {
  it('빈 배열 입력 시 빈 결과 반환, send 미호출', async () => {
    const result = await batchDeleteFromR2([]);

    expect(result.deleted).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('1000개 이하 배치는 DeleteObjectsCommand 1회 호출', async () => {
    mockSend.mockResolvedValue({
      Deleted: [{ Key: 'webhard/a.pdf' }, { Key: 'webhard/b.pdf' }],
      Errors: [],
    });

    const result = await batchDeleteFromR2(['webhard/a.pdf', 'webhard/b.pdf']);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(result.deleted).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
  });

  it('2500개 키는 3회 배치 호출 (ceil(2500/1000))', async () => {
    mockSend.mockResolvedValue({
      Deleted: Array.from({ length: 1000 }, (_, i) => ({ Key: `file-${i}.pdf` })),
      Errors: [],
    });

    const keys = Array.from({ length: 2500 }, (_, i) => `file-${i}.pdf`);
    await batchDeleteFromR2(keys);

    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it('부분 실패: failed 배열에 에러 정보 포함', async () => {
    mockSend.mockResolvedValue({
      Deleted: [{ Key: 'webhard/a.pdf' }],
      Errors: [{ Key: 'webhard/b.pdf', Message: 'NoSuchKey' }],
    });

    const result = await batchDeleteFromR2(['webhard/a.pdf', 'webhard/b.pdf']);

    expect(result.deleted).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].key).toBe('webhard/b.pdf');
    expect(result.failed[0].error).toBe('NoSuchKey');
  });

  it('배치 전체 실패 시 해당 배치의 모든 키를 failed에 포함', async () => {
    mockSend.mockRejectedValue(new Error('Network error'));

    const result = await batchDeleteFromR2(['webhard/a.pdf', 'webhard/b.pdf']);

    expect(result.failed).toHaveLength(2);
    expect(result.failed[0].error).toContain('Network error');
  });
});

// ============================================================
// parallelBatchDeleteFromR2
// ============================================================

describe('parallelBatchDeleteFromR2', () => {
  it('빈 배열 입력 시 빈 결과 반환', async () => {
    const result = await parallelBatchDeleteFromR2([]);

    expect(result.deleted).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('3000개 키를 concurrency=3으로 처리 (3회 배치)', async () => {
    mockSend.mockResolvedValue({
      Deleted: Array.from({ length: 1000 }, (_, i) => ({ Key: `file-${i}.pdf` })),
      Errors: [],
    });

    const keys = Array.from({ length: 3000 }, (_, i) => `file-${i}.pdf`);
    const result = await parallelBatchDeleteFromR2(keys, 3);

    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(result.deleted).toHaveLength(3000);
    expect(result.failed).toHaveLength(0);
  });

  it('deleted + failed 결과를 전체 집계', async () => {
    mockSend
      .mockResolvedValueOnce({
        Deleted: [{ Key: 'a.pdf' }],
        Errors: [{ Key: 'b.pdf', Message: 'NoSuchKey' }],
      })
      .mockResolvedValueOnce({
        Deleted: [{ Key: 'c.pdf' }],
        Errors: [],
      });

    // 2 배치
    const keys = Array.from({ length: 1500 }, (_, i) => `file-${i}.pdf`);
    const result = await parallelBatchDeleteFromR2(keys, 3);

    // 2 batch: deleted = 2, failed = 1
    expect(result.deleted.length + result.failed.length).toBe(3);
  });

  it('기본 concurrency는 3', async () => {
    mockSend.mockResolvedValue({
      Deleted: Array.from({ length: 1000 }, (_, i) => ({ Key: `f-${i}` })),
      Errors: [],
    });

    const keys = Array.from({ length: 1000 }, (_, i) => `f-${i}`);
    const result = await parallelBatchDeleteFromR2(keys);

    expect(result.deleted).toHaveLength(1000);
  });
});
