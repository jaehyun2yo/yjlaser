// 보안 관련 유틸리티 함수들

import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

/**
 * 비밀번호를 해시화합니다
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

/**
 * 비밀번호를 검증합니다
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * 안전한 세션 토큰을 생성합니다
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * 환경 변수에서 관리자 정보를 가져옵니다
 */
export function getAdminCredentials() {
  const username = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;

  if (!username || !passwordHash) {
    throw new Error('Admin credentials not configured');
  }

  return { username, passwordHash };
}
