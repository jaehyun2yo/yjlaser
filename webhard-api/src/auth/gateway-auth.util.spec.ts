import {
  getCookieValue,
  verifyBrowserGatewaySession,
  verifyWorkerGatewaySession,
} from './gateway-auth.util';
import { AuthService } from './auth.service';

describe('gateway-auth util cookie handling', () => {
  it('decodes URL-encoded cookie values before verification', () => {
    expect(getCookieValue('erp-session=token%3Apayload.signature', 'erp-session')).toBe(
      'token:payload.signature'
    );
  });

  it('verifies URL-encoded admin and company browser session cookies', () => {
    const verifySession = jest.fn((cookieValue: string) => {
      if (cookieValue === 'admin:payload.signature') {
        return { userType: 'admin', userId: 1, companyId: null };
      }
      if (cookieValue === 'company:payload.signature') {
        return { userType: 'company', userId: 7, companyId: 7 };
      }
      return null;
    });
    const authService = { verifySession } as unknown as AuthService;

    expect(
      verifyBrowserGatewaySession(authService, 'admin-session=admin%3Apayload.signature', ['admin'])
    ).toEqual({ userType: 'admin', userId: 1, companyId: null });
    expect(
      verifyBrowserGatewaySession(authService, 'company-session=company%3Apayload.signature', [
        'company',
      ])
    ).toEqual({ userType: 'company', userId: 7, companyId: 7 });
  });

  it('verifies URL-encoded worker session cookies', () => {
    const verifyWorkerSession = jest.fn((cookieValue: string) => {
      if (cookieValue !== 'worker:payload.signature') {
        return null;
      }

      return {
        userType: 'worker',
        userId: 'worker-1',
        companyId: null,
        workerName: '작업자',
      };
    });
    const authService = { verifyWorkerSession } as unknown as AuthService;

    expect(
      verifyWorkerGatewaySession(authService, 'erp-session=worker%3Apayload.signature')
    ).toEqual({
      userType: 'worker',
      userId: 'worker-1',
      companyId: null,
      workerName: '작업자',
    });
  });
});
