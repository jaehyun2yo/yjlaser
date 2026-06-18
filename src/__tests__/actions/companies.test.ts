/**
 * @jest-environment node
 */

/**
 * Companies Actions Unit Tests
 *
 * These tests verify the authorization logic in company actions.
 * The actual database operations are mocked to focus on authorization.
 */

// Mock all external dependencies before importing
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(() =>
    Promise.resolve({
      get: jest.fn((key: string) => {
        if (key === 'x-forwarded-for') return '127.0.0.1';
        if (key === 'user-agent') return 'Jest Test Agent';
        return null;
      }),
    })
  ),
}));

jest.mock('@/lib/activity-logger', () => ({
  logActivity: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/auth/session', () => ({
  getSessionUser: jest.fn(),
  verifySession: jest.fn(),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    createLogger: () => ({
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import {
  updateCompanyStatus,
  toggleWebhardAccess,
  approveCompany,
  rejectCompany,
} from '@/app/actions/companies';
import { getSessionUser, verifySession } from '@/lib/auth/session';

describe('companies actions - Authorization Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateCompanyStatus', () => {
    it('should reject non-admin users', async () => {
      (verifySession as jest.Mock).mockResolvedValue(true);
      (getSessionUser as jest.Mock).mockResolvedValue({
        userId: 123,
        userType: 'company',
      });

      const result = await updateCompanyStatus(1, 'active');

      expect(result.success).toBe(false);
      expect(result.error).toContain('관리자 권한');
    });

    it('should reject unauthenticated users', async () => {
      (verifySession as jest.Mock).mockResolvedValue(false);
      (getSessionUser as jest.Mock).mockResolvedValue(null);

      const result = await updateCompanyStatus(1, 'active');

      expect(result.success).toBe(false);
      expect(result.error).toContain('관리자 권한');
    });
  });

  describe('approveCompany', () => {
    it('should reject non-admin users', async () => {
      (verifySession as jest.Mock).mockResolvedValue(true);
      (getSessionUser as jest.Mock).mockResolvedValue({
        userId: 123,
        userType: 'company',
      });

      const result = await approveCompany(1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('관리자 권한');
    });

    it('should reject unauthenticated users', async () => {
      (verifySession as jest.Mock).mockResolvedValue(false);
      (getSessionUser as jest.Mock).mockResolvedValue(null);

      const result = await approveCompany(1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('관리자 권한');
    });
  });

  describe('rejectCompany', () => {
    it('should reject non-admin users', async () => {
      (verifySession as jest.Mock).mockResolvedValue(true);
      (getSessionUser as jest.Mock).mockResolvedValue({
        userId: 123,
        userType: 'company',
      });

      const result = await rejectCompany(1, 'Invalid documents');

      expect(result.success).toBe(false);
      expect(result.error).toContain('관리자 권한');
    });
  });

  describe('toggleWebhardAccess', () => {
    it('should reject non-admin users', async () => {
      (verifySession as jest.Mock).mockResolvedValue(true);
      (getSessionUser as jest.Mock).mockResolvedValue({
        userId: 123,
        userType: 'company',
      });

      const result = await toggleWebhardAccess(1, true);

      expect(result.success).toBe(false);
      expect(result.error).toContain('관리자 권한');
    });

    it('should reject unauthenticated users', async () => {
      (verifySession as jest.Mock).mockResolvedValue(false);
      (getSessionUser as jest.Mock).mockResolvedValue(null);

      const result = await toggleWebhardAccess(1, true);

      expect(result.success).toBe(false);
      expect(result.error).toContain('관리자 권한');
    });
  });
});
