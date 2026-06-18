import { ConfigService } from '@nestjs/config';
import { AuthService } from '../src/auth/auth.service';
import { getAdminSessionCookie, getCompanySessionCookie } from './helpers/test-utils';

const SESSION_SECRET = 'test-secret-key-for-e2e-testing-32';

describe('E2E session cookie helpers', () => {
  let originalSessionSecret: string | undefined;
  let authService: AuthService;

  beforeEach(() => {
    originalSessionSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = SESSION_SECRET;
    authService = new AuthService({
      get: jest.fn().mockReturnValue(SESSION_SECRET),
    } as unknown as ConfigService);
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
  });

  it('creates an admin browser session accepted by AuthService', () => {
    expect(authService.verifySession(getAdminSessionCookie())).toEqual({
      userType: 'admin',
      userId: 'admin',
      companyId: 0,
    });
  });

  it('creates a company browser session accepted by AuthService', () => {
    expect(authService.verifySession(getCompanySessionCookie(7))).toEqual({
      userType: 'company',
      userId: 7,
      companyId: 7,
    });
  });
});
