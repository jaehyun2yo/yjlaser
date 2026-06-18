/**
 * @jest-environment node
 */

jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    const error = new Error('NEXT_REDIRECT') as Error & { digest?: string };
    error.digest = `NEXT_REDIRECT;replace;${url}`;
    throw error;
  }),
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

jest.mock('@/lib/auth/session', () => ({
  createSession: jest.fn(),
  destroySession: jest.fn(),
  getSessionUser: jest.fn(),
  PERSISTENT_SESSION_MAX_AGE: 60 * 60 * 24 * 30,
}));

jest.mock('@/lib/auth/security', () => ({
  verifyPassword: jest.fn(),
}));

jest.mock('@/lib/activity-logger', () => ({
  logActivity: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/auth/rateLimit', () => ({
  recordLoginAttemptFromHeaders: jest.fn(() =>
    Promise.resolve({
      allowed: true,
      ip: '127.0.0.1',
      remainingAttempts: 4,
    })
  ),
  recordFailedUsername: jest.fn(),
  resetLoginAttemptsByIP: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/api/nestjs-server-client', () => ({
  serverGetCompanyForAuth: jest.fn(),
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

import { redirect } from 'next/navigation';
import { loginAction } from '@/app/actions/auth';
import { serverGetCompanyForAuth } from '@/lib/api/nestjs-server-client';
import { logActivity } from '@/lib/activity-logger';
import { createSession } from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/security';

const pendingCompany = {
  id: 7,
  company_name: '승인대기업체',
  manager_name: '홍길동',
  created_at: null,
  updated_at: null,
  username: 'pending-company',
  password_hash: '$2a$10$hash',
  business_registration_number: '123-45-67890',
  representative_name: '대표',
  business_type: null,
  business_category: null,
  business_address: '서울',
  business_registration_file_url: null,
  business_registration_file_name: null,
  manager_position: '팀장',
  manager_phone: '010-0000-0000',
  manager_email: 'pending@example.com',
  accountant_name: null,
  accountant_phone: null,
  accountant_email: null,
  accountant_fax: null,
  quote_method_email: true,
  quote_method_fax: false,
  quote_method_sms: false,
  status: 'pending',
  webhard_access: true,
  laser_only: false,
  is_approved: false,
  approved_at: null,
  approved_by: null,
};

const activeCompany = {
  ...pendingCompany,
  id: 8,
  company_name: '승인업체',
  username: 'active-company',
  status: 'active',
  is_approved: true,
};

describe('loginAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.TEST_ADMIN_USERNAME;
    delete process.env.TEST_ADMIN_PASSWORD_HASH_B64;
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD_HASH;
  });

  it('관리자 승인 대기 업체는 아이디/비밀번호 오류가 아니라 승인 안내로 리다이렉트한다', async () => {
    (serverGetCompanyForAuth as jest.Mock).mockResolvedValue(pendingCompany);

    const formData = new FormData();
    formData.set('username', 'pending-company');
    formData.set('password', 'CorrectPassword123!');

    await expect(loginAction(formData)).rejects.toThrow('NEXT_REDIRECT');

    expect(redirect).toHaveBeenCalledWith('/login?error=pending_approval');
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LOGIN_FAILED',
        details: expect.objectContaining({
          reason: 'account_not_approved',
          status: 'pending',
        }),
      })
    );
  });

  it('자동로그인 선택 시 승인 업체 세션 만료 시간을 30일로 설정한다', async () => {
    (serverGetCompanyForAuth as jest.Mock).mockResolvedValue(activeCompany);
    (verifyPassword as jest.Mock).mockResolvedValue(true);

    const formData = new FormData();
    formData.set('username', 'active-company');
    formData.set('password', 'CorrectPassword123!');
    formData.set('autoLogin', 'on');

    await expect(loginAction(formData)).rejects.toThrow('NEXT_REDIRECT');

    expect(createSession).toHaveBeenCalledWith('company', activeCompany.id, {
      maxAge: 60 * 60 * 24 * 30,
    });
    expect(redirect).toHaveBeenCalledWith('/company/dashboard');
  });
});
