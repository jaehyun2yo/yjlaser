/**
 * Auth Mock
 * 테스트에서 사용할 인증 관련 Mock을 제공합니다.
 */

export interface MockUser {
  userType: 'admin' | 'company';
  userId: string | number;
}

export interface MockAuthResult {
  isValid: boolean;
  user: MockUser | null;
}

/**
 * 관리자 사용자 Mock
 */
export const mockAdminUser: MockAuthResult = {
  isValid: true,
  user: {
    userType: 'admin',
    userId: 'admin-1',
  },
};

/**
 * 회사 사용자 Mock
 */
export function createMockCompanyUser(companyId: number | string = 123): MockAuthResult {
  return {
    isValid: true,
    user: {
      userType: 'company',
      userId: typeof companyId === 'string' ? companyId : companyId,
    },
  };
}

/**
 * 인증되지 않은 사용자 Mock
 */
export const mockUnauthenticatedUser: MockAuthResult = {
  isValid: false,
  user: null,
};

/**
 * verifyAndGetUser Mock 설정
 */
export function setupAuthMock(
  verifyAndGetUser: jest.Mock,
  authResult: MockAuthResult = mockAdminUser
): void {
  verifyAndGetUser.mockResolvedValue(authResult);
}

/**
 * 관리자로 인증 설정
 */
export function setupAdminAuth(verifyAndGetUser: jest.Mock): void {
  setupAuthMock(verifyAndGetUser, mockAdminUser);
}

/**
 * 회사 사용자로 인증 설정
 */
export function setupCompanyAuth(
  verifyAndGetUser: jest.Mock,
  companyId: number | string = 123
): void {
  setupAuthMock(verifyAndGetUser, createMockCompanyUser(companyId));
}

/**
 * 인증 실패 설정
 */
export function setupUnauthenticated(verifyAndGetUser: jest.Mock): void {
  setupAuthMock(verifyAndGetUser, mockUnauthenticatedUser);
}

/**
 * 세션 정보 Mock
 */
export interface MockSession {
  userType: 'admin' | 'company';
  userId: string | number;
  expiresAt: Date;
}

export function createMockSession(
  userType: 'admin' | 'company' = 'admin',
  userId: string | number = 'admin-1'
): MockSession {
  return {
    userType,
    userId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24시간 후
  };
}
