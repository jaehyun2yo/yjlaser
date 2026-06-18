/**
 * Portfolio API Route 테스트
 * Phase 4: Supabase .from() → Prisma 전환 검증
 *
 * 테스트 대상:
 * - POST /api/portfolio/upload — 포트폴리오 이미지 업로드
 *
 * Phase 4 이후 동일한 API 계약이 유지되는지 확인하는 목적
 *
 * @jest-environment node
 */

// Mock 설정 (import 전에 선언)
jest.mock('@/lib/auth/session', () => ({
  verifySession: jest.fn(),
  getSessionUser: jest.fn(),
}));

jest.mock('@/lib/images/process', () => ({
  createAndUploadVariants: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { verifySession, getSessionUser } from '@/lib/auth/session';
import { createAndUploadVariants } from '@/lib/images/process';

const mockedVerifySession = verifySession as jest.MockedFunction<typeof verifySession>;
const mockedGetSessionUser = getSessionUser as jest.MockedFunction<typeof getSessionUser>;
const mockedCreateAndUploadVariants = createAndUploadVariants as jest.MockedFunction<
  typeof createAndUploadVariants
>;

// ============================================================
// Mock helpers
// ============================================================

function createFormDataRequest(file: File | null): NextRequest {
  const formData = new FormData();
  if (file) {
    formData.append('file', file);
  }

  return new NextRequest(new URL('http://localhost:3000/api/portfolio/upload'), {
    method: 'POST',
    body: formData,
  });
}

function createTestFile(
  name = 'test-image.jpg',
  size = 1024 * 1024, // 1MB
  type = 'image/jpeg'
): File {
  const buffer = new ArrayBuffer(size);
  const blob = new Blob([buffer], { type });
  return new File([blob], name, { type });
}

// ============================================================
// Tests
// ============================================================

describe('Portfolio API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetSessionUser.mockResolvedValue({ userType: 'admin', userId: 'admin' });
  });

  describe('POST /api/portfolio/upload', () => {
    let POST: (req: NextRequest) => Promise<Response>;

    beforeEach(async () => {
      const mod = await import('@/app/api/portfolio/upload/route');
      POST = mod.POST;
    });

    it('인증된 사용자가 이미지를 업로드할 수 있어야 함', async () => {
      mockedVerifySession.mockResolvedValue(true);

      const uploadResult = {
        original: 'https://r2/portfolio/original/test.jpg',
        thumbnail: 'https://r2/portfolio/thumb/test.jpg',
        medium: 'https://r2/portfolio/medium/test.jpg',
      };
      mockedCreateAndUploadVariants.mockResolvedValue(uploadResult);

      const file = createTestFile();
      const request = createFormDataRequest(file);
      const response = await POST(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(uploadResult);
    });

    it('인증되지 않은 사용자에게 401을 반환해야 함', async () => {
      mockedVerifySession.mockResolvedValue(false);

      const file = createTestFile();
      const request = createFormDataRequest(file);
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('파일이 없으면 400을 반환해야 함', async () => {
      mockedVerifySession.mockResolvedValue(true);

      const request = createFormDataRequest(null);
      const response = await POST(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('No file');
    });

    it('10MB 초과 파일에 400을 반환해야 함', async () => {
      mockedVerifySession.mockResolvedValue(true);

      const largeFile = createTestFile('large.jpg', 11 * 1024 * 1024); // 11MB
      const request = createFormDataRequest(largeFile);
      const response = await POST(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('10MB');
    });

    it('업로드 처리 중 에러 발생 시 500을 반환해야 함', async () => {
      mockedVerifySession.mockResolvedValue(true);
      mockedCreateAndUploadVariants.mockRejectedValue(new Error('R2 upload failed'));

      const file = createTestFile();
      const request = createFormDataRequest(file);
      const response = await POST(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toContain('Failed to upload');
    });

    it('10MB 이하 파일은 허용되어야 함', async () => {
      mockedVerifySession.mockResolvedValue(true);

      const uploadResult = {
        original: 'https://r2/portfolio/original/exact10mb.jpg',
      };
      mockedCreateAndUploadVariants.mockResolvedValue(uploadResult);

      const file = createTestFile('exact.jpg', 10 * 1024 * 1024); // 정확히 10MB
      const request = createFormDataRequest(file);
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('company session cannot upload public portfolio assets', async () => {
      mockedVerifySession.mockResolvedValue(true);
      mockedGetSessionUser.mockResolvedValue({ userType: 'company', userId: 7 });
      mockedCreateAndUploadVariants.mockResolvedValue({
        original: 'https://r2/portfolio/original/company.jpg',
      });

      const file = createTestFile('company.jpg');
      const request = createFormDataRequest(file);
      const response = await POST(request);

      expect(response.status).toBe(403);
      expect(mockedCreateAndUploadVariants).not.toHaveBeenCalled();
    });
  });
});
