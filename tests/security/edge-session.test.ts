/**
 * @jest-environment node
 */

import crypto from 'crypto';
import {
  verifyBrowserSessionCookie,
  verifyWorkerSessionCookie,
} from '../../src/lib/auth/edge-session';

const PRIMARY_SECRET = 'p'.repeat(32);
const PREVIOUS_SECRET = 'q'.repeat(32);
const NOW_MS = Date.UTC(2026, 4, 25, 9, 0, 0);

function signToken(tokenAndData: string, secret: string): string {
  const signature = crypto.createHmac('sha256', secret).update(tokenAndData).digest('hex');
  return `${tokenAndData}.${signature}`;
}

function signedSession(payload: Record<string, unknown>, secret = PRIMARY_SECRET): string {
  return signToken(`token:${JSON.stringify(payload)}`, secret);
}

describe('edge session verification', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW_MS);
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      SESSION_SECRET: PRIMARY_SECRET,
      SESSION_SECRET_PREVIOUS: undefined,
      SESSION_SECRET_PREVIOUS_EXPIRES_AT: undefined,
      SESSION_LEGACY_COOKIE_COMPAT_UNTIL: undefined,
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('rejects expired browser session payloads', async () => {
    const cookie = signedSession({
      kind: 'browser',
      userType: 'admin',
      userId: 'admin',
      iat: Math.floor(NOW_MS / 1000) - 7200,
      exp: Math.floor(NOW_MS / 1000) - 60,
    });

    await expect(verifyBrowserSessionCookie(cookie, 'admin')).resolves.toBeNull();
  });

  it('rejects browser session payloads issued too far in the future', async () => {
    const cookie = signedSession({
      kind: 'browser',
      userType: 'admin',
      userId: 'admin',
      iat: Math.floor(NOW_MS / 1000) + 600,
      exp: Math.floor(NOW_MS / 1000) + 3600,
    });

    await expect(verifyBrowserSessionCookie(cookie, 'admin')).resolves.toBeNull();
  });

  it('rejects the wrong browser actor kind', async () => {
    const cookie = signedSession({
      kind: 'browser',
      userType: 'company',
      userId: 7,
      iat: Math.floor(NOW_MS / 1000),
      exp: Math.floor(NOW_MS / 1000) + 3600,
    });

    await expect(verifyBrowserSessionCookie(cookie, 'admin')).resolves.toBeNull();
  });

  it('rejects worker payloads in browser session verification', async () => {
    const cookie = signedSession({
      kind: 'worker',
      workerId: 'worker-1',
      workerName: '김작업',
      iat: Math.floor(NOW_MS / 1000),
      exp: Math.floor(NOW_MS / 1000) + 3600,
    });

    await expect(verifyBrowserSessionCookie(cookie, 'admin')).resolves.toBeNull();
  });

  it('accepts legacy signed cookies only inside the configured compatibility window', async () => {
    process.env.SESSION_LEGACY_COOKIE_COMPAT_UNTIL = new Date(NOW_MS + 60_000).toISOString();
    const cookie = signedSession({ userType: 'admin', userId: 'admin' });

    await expect(verifyBrowserSessionCookie(cookie, 'admin')).resolves.toEqual({
      userType: 'admin',
      userId: 'admin',
    });

    process.env.SESSION_LEGACY_COOKIE_COMPAT_UNTIL = new Date(NOW_MS - 60_000).toISOString();

    await expect(verifyBrowserSessionCookie(cookie, 'admin')).resolves.toBeNull();
  });

  it('accepts previous secret signatures only before the configured rotation expiry', async () => {
    const cookie = signedSession(
      {
        kind: 'browser',
        userType: 'admin',
        userId: 'admin',
        iat: Math.floor(NOW_MS / 1000),
        exp: Math.floor(NOW_MS / 1000) + 3600,
      },
      PREVIOUS_SECRET
    );

    process.env.SESSION_SECRET_PREVIOUS = PREVIOUS_SECRET;
    process.env.SESSION_SECRET_PREVIOUS_EXPIRES_AT = new Date(NOW_MS + 60_000).toISOString();

    await expect(verifyBrowserSessionCookie(cookie, 'admin')).resolves.toEqual({
      userType: 'admin',
      userId: 'admin',
    });

    process.env.SESSION_SECRET_PREVIOUS_EXPIRES_AT = new Date(NOW_MS - 60_000).toISOString();

    await expect(verifyBrowserSessionCookie(cookie, 'admin')).resolves.toBeNull();
  });

  it('accepts valid worker payloads for worker session verification', async () => {
    const cookie = signedSession({
      kind: 'worker',
      workerId: 'worker-1',
      workerName: '김작업',
      workerType: 'field',
      iat: Math.floor(NOW_MS / 1000),
      exp: Math.floor(NOW_MS / 1000) + 3600,
    });

    await expect(verifyWorkerSessionCookie(cookie)).resolves.toEqual({
      workerId: 'worker-1',
      workerName: '김작업',
      workerType: 'field',
    });
  });
});
