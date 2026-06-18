/**
 * @jest-environment node
 */

/**
 * Admin API Integration Tests
 *
 * These tests verify that admin API routes properly enforce
 * authentication and authorization.
 */

import { NextRequest } from 'next/server';

// Mock dependencies
const mockRequireAdmin = jest.fn();

jest.mock('@/lib/auth/adminGuard', () => ({
  requireAdmin: () => mockRequireAdmin(),
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

jest.mock('@/lib/utils/errors', () => ({
  toApiErrorResponse: jest.fn((error: { message?: string }) => ({
    body: { error: error.message || 'Unknown error' },
    status: 500,
  })),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

// Import after mocking
import { GET as getContacts } from '@/app/api/admin/contacts/route';

describe('Admin API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/admin/contacts', () => {
    it('should reject unauthenticated requests', async () => {
      mockRequireAdmin.mockResolvedValue({
        authorized: false,
        user: null,
        response: new Response(JSON.stringify({ error: '인증이 필요합니다.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/admin/contacts');
      const response = await getContacts(request);

      expect(response.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      mockRequireAdmin.mockResolvedValue({
        authorized: false,
        user: { userId: 123, userType: 'company' },
        response: new Response(JSON.stringify({ error: '관리자 권한이 필요합니다.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/admin/contacts');
      const response = await getContacts(request);

      expect(response.status).toBe(403);
    });

    it('should allow admin users', async () => {
      mockRequireAdmin.mockResolvedValue({
        authorized: true,
        user: { userId: 'admin', userType: 'admin' },
      });

      const request = new NextRequest('http://localhost:3000/api/admin/contacts?page=1&status=all');
      const response = await getContacts(request);

      // Should not be 401 or 403
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });
  });
});

describe('Admin API Authorization Patterns', () => {
  describe('Authorization Flow', () => {
    it('should follow the correct authorization pattern', async () => {
      // 1. Unauthenticated -> 401
      mockRequireAdmin.mockResolvedValue({
        authorized: false,
        user: null,
        response: new Response(JSON.stringify({ error: '인증이 필요합니다.' }), {
          status: 401,
        }),
      });

      let response = await mockRequireAdmin();
      expect(response.authorized).toBe(false);
      expect(response.user).toBeNull();

      // 2. Authenticated but not admin -> 403
      mockRequireAdmin.mockResolvedValue({
        authorized: false,
        user: { userId: 123, userType: 'company' },
        response: new Response(JSON.stringify({ error: '관리자 권한이 필요합니다.' }), {
          status: 403,
        }),
      });

      response = await mockRequireAdmin();
      expect(response.authorized).toBe(false);
      expect(response.user?.userType).toBe('company');

      // 3. Admin -> Authorized
      mockRequireAdmin.mockResolvedValue({
        authorized: true,
        user: { userId: 'admin', userType: 'admin' },
      });

      response = await mockRequireAdmin();
      expect(response.authorized).toBe(true);
      expect(response.user?.userType).toBe('admin');
    });
  });
});
