/**
 * @jest-environment node
 */

import { requireAdmin, requireAuth, requireCompany } from '@/lib/auth/adminGuard';

// Mock dependencies
jest.mock('@/lib/auth/session', () => ({
  verifySession: jest.fn(),
  getSessionUser: jest.fn(),
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

import { verifySession, getSessionUser } from '@/lib/auth/session';

const mockVerifySession = verifySession as jest.MockedFunction<typeof verifySession>;
const mockGetSessionUser = getSessionUser as jest.MockedFunction<typeof getSessionUser>;

describe('adminGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requireAdmin', () => {
    it('should return unauthorized when session is invalid', async () => {
      mockVerifySession.mockResolvedValue(false);

      const result = await requireAdmin();

      expect(result.authorized).toBe(false);
      expect(result.user).toBeNull();
      expect(result.response).toBeDefined();
    });

    it('should return unauthorized when user is not found in session', async () => {
      mockVerifySession.mockResolvedValue(true);
      mockGetSessionUser.mockResolvedValue(null);

      const result = await requireAdmin();

      expect(result.authorized).toBe(false);
      expect(result.user).toBeNull();
    });

    it('should return forbidden when user is not admin', async () => {
      mockVerifySession.mockResolvedValue(true);
      mockGetSessionUser.mockResolvedValue({
        userId: 123,
        userType: 'company',
      });

      const result = await requireAdmin();

      expect(result.authorized).toBe(false);
      expect(result.user).not.toBeNull();
      expect(result.response).toBeDefined();
    });

    it('should return authorized when user is admin', async () => {
      mockVerifySession.mockResolvedValue(true);
      mockGetSessionUser.mockResolvedValue({
        userId: 'admin',
        userType: 'admin',
      });

      const result = await requireAdmin();

      expect(result.authorized).toBe(true);
      expect(result.user?.userType).toBe('admin');
      expect(result.response).toBeUndefined();
    });
  });

  describe('requireAuth', () => {
    it('should return unauthorized when session is invalid', async () => {
      mockVerifySession.mockResolvedValue(false);

      const result = await requireAuth();

      expect(result.authorized).toBe(false);
      expect(result.user).toBeNull();
    });

    it('should return authorized for company user', async () => {
      mockVerifySession.mockResolvedValue(true);
      mockGetSessionUser.mockResolvedValue({
        userId: 123,
        userType: 'company',
      });

      const result = await requireAuth();

      expect(result.authorized).toBe(true);
      expect(result.user?.userType).toBe('company');
    });

    it('should return authorized for admin user', async () => {
      mockVerifySession.mockResolvedValue(true);
      mockGetSessionUser.mockResolvedValue({
        userId: 'admin',
        userType: 'admin',
      });

      const result = await requireAuth();

      expect(result.authorized).toBe(true);
      expect(result.user?.userType).toBe('admin');
    });
  });

  describe('requireCompany', () => {
    it('should return unauthorized when session is invalid', async () => {
      mockVerifySession.mockResolvedValue(false);

      const result = await requireCompany();

      expect(result.authorized).toBe(false);
      expect(result.user).toBeNull();
    });

    it('should return forbidden when user is admin', async () => {
      mockVerifySession.mockResolvedValue(true);
      mockGetSessionUser.mockResolvedValue({
        userId: 'admin',
        userType: 'admin',
      });

      const result = await requireCompany();

      expect(result.authorized).toBe(false);
      expect(result.user).not.toBeNull();
    });

    it('should return authorized when user is company', async () => {
      mockVerifySession.mockResolvedValue(true);
      mockGetSessionUser.mockResolvedValue({
        userId: 123,
        userType: 'company',
      });

      const result = await requireCompany();

      expect(result.authorized).toBe(true);
      expect(result.user?.userType).toBe('company');
    });
  });
});
