/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/api/nestjs-server-client', () => ({
  nestjsFetch: jest.fn(),
}));

jest.mock('@/lib/auth/rateLimit', () => ({
  checkAccountRecoveryRateLimit: jest.fn(),
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

import { nestjsFetch } from '@/lib/api/nestjs-server-client';
import { checkAccountRecoveryRateLimit } from '@/lib/auth/rateLimit';
import { POST as requestFindId } from '@/app/api/auth/find-id/route';
import { POST as requestPasswordReset } from '@/app/api/auth/find-password/route';
import { POST as confirmPasswordReset } from '@/app/api/auth/reset-password/route';

const mockedNestjsFetch = nestjsFetch as jest.MockedFunction<typeof nestjsFetch>;
const mockedCheckAccountRecoveryRateLimit = checkAccountRecoveryRateLimit as jest.MockedFunction<
  typeof checkAccountRecoveryRateLimit
>;

function jsonRequest(path: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('password reset Next.js routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCheckAccountRecoveryRateLimit.mockResolvedValue({
      allowed: true,
      remainingAttempts: Number.MAX_SAFE_INTEGER,
      ip: '1.2.3.4',
      fingerprint: 'fingerprint-hash',
    });
  });

  it('find-id는 NestJS recovery endpoint로 위임하고 아이디나 토큰을 응답하지 않는다', async () => {
    mockedNestjsFetch.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        success: true,
        message: '입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 아이디 안내를 보냈습니다.',
      },
    });

    const response = await requestFindId(
      jsonRequest('/api/auth/find-id', {
        companyName: ' 대성목형 ',
        email: 'MANAGER@example.com ',
        phone: '010-1234-5678',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockedCheckAccountRecoveryRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), {
      flow: 'find-id',
      fields: ['대성목형', 'manager@example.com', '01012345678'],
    });
    expect(mockedNestjsFetch).toHaveBeenCalledWith('/auth/find-id/request', {
      method: 'POST',
      body: {
        companyName: '대성목형',
        email: 'manager@example.com',
        phone: '01012345678',
      },
      useRecoveryApiKey: true,
      headers: {
        'X-Account-Recovery-Client-IP': '1.2.3.4',
        'X-Account-Recovery-Fingerprint': 'fingerprint-hash',
      },
    });
    expect(body).toEqual({
      success: true,
      message: '입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 아이디 안내를 보냈습니다.',
    });
    expect(body).not.toHaveProperty('username');
    expect(body).not.toHaveProperty('maskedUsername');
    expect(body).not.toHaveProperty('token');
    expect(body).not.toHaveProperty('resetLink');
  });

  it('find-id rate limit 초과는 NestJS를 호출하지 않고 429를 반환한다', async () => {
    mockedCheckAccountRecoveryRateLimit.mockResolvedValue({
      allowed: false,
      remainingAttempts: 0,
      ip: '1.2.3.4',
      fingerprint: 'fingerprint-hash',
      status: 429,
      message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    });

    const response = await requestFindId(
      jsonRequest('/api/auth/find-id', {
        companyName: '대성목형',
        email: 'manager@example.com',
        phone: '010-1234-5678',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({
      success: false,
      message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    });
    expect(mockedNestjsFetch).not.toHaveBeenCalled();
  });

  it('find-password는 NestJS reset-link request로 위임하고 비밀번호나 토큰을 응답하지 않는다', async () => {
    mockedNestjsFetch.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        success: true,
        message: '입력하신 정보가 일치하면 이메일로 비밀번호 재설정 링크가 전송됩니다.',
      },
    });

    const response = await requestPasswordReset(
      jsonRequest('/api/auth/find-password', {
        username: 'acme',
        email: 'manager@example.com',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockedCheckAccountRecoveryRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), {
      flow: 'find-password',
      fields: ['acme', 'manager@example.com'],
    });
    expect(mockedNestjsFetch).toHaveBeenCalledWith('/auth/password-reset/request', {
      method: 'POST',
      body: { username: 'acme', email: 'manager@example.com' },
      useRecoveryApiKey: true,
      headers: {
        'X-Account-Recovery-Client-IP': '1.2.3.4',
        'X-Account-Recovery-Fingerprint': 'fingerprint-hash',
        'X-Account-Recovery-Origin': 'http://localhost:3000',
      },
    });
    expect(body).toEqual({
      success: true,
      message: '입력하신 정보가 일치하면 이메일로 비밀번호 재설정 링크가 전송됩니다.',
    });
    expect(body).not.toHaveProperty('tempPassword');
    expect(body).not.toHaveProperty('resetLink');
    expect(body).not.toHaveProperty('token');
  });

  it('find-password 필수 필드가 없으면 NestJS를 호출하지 않고 400을 반환한다', async () => {
    const response = await requestPasswordReset(
      jsonRequest('/api/auth/find-password', {
        username: '',
        email: 'manager@example.com',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ success: false, message: '모든 필드를 입력해주세요.' });
    expect(mockedNestjsFetch).not.toHaveBeenCalled();
  });

  it('reset-password는 passwordConfirm 일치 확인 후 NestJS confirm으로 위임한다', async () => {
    mockedNestjsFetch.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        success: true,
        message: '비밀번호가 재설정되었습니다.',
      },
    });

    const response = await confirmPasswordReset(
      jsonRequest('/api/auth/reset-password', {
        token: 'reset-token',
        password: 'NewStrong1!',
        passwordConfirm: 'NewStrong1!',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockedNestjsFetch).toHaveBeenCalledWith('/auth/password-reset/confirm', {
      method: 'POST',
      body: { token: 'reset-token', password: 'NewStrong1!' },
      useRecoveryApiKey: true,
    });
    expect(body).toEqual({
      success: true,
      message: '비밀번호가 재설정되었습니다.',
    });
  });

  it('reset-password에서 비밀번호 확인이 다르면 NestJS를 호출하지 않고 400을 반환한다', async () => {
    const response = await confirmPasswordReset(
      jsonRequest('/api/auth/reset-password', {
        token: 'reset-token',
        password: 'NewStrong1!',
        passwordConfirm: 'Different1!',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ success: false, message: '비밀번호가 일치하지 않습니다.' });
    expect(mockedNestjsFetch).not.toHaveBeenCalled();
  });
});
