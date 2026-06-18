import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';

const SESSION_SECRET = 's'.repeat(32);
const NOW_MS = Date.UTC(2026, 4, 25, 9, 0, 0);

function signToken(tokenAndData: string): string {
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(tokenAndData).digest('hex');
  return `${tokenAndData}.${signature}`;
}

function signedSession(payload: Record<string, unknown>): string {
  return signToken(`token:${JSON.stringify(payload)}`);
}

describe('AuthService session payload verification', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW_MS);
    const config = {
      get: jest.fn().mockReturnValue(SESSION_SECRET),
    } as unknown as ConfigService;
    service = new AuthService(config);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects expired browser sessions', () => {
    const cookie = signedSession({
      kind: 'browser',
      userType: 'admin',
      userId: 'admin',
      iat: Math.floor(NOW_MS / 1000) - 7200,
      exp: Math.floor(NOW_MS / 1000) - 60,
    });

    expect(service.verifySession(cookie)).toBeNull();
  });

  it('rejects worker payloads on browser session verification', () => {
    const cookie = signedSession({
      kind: 'worker',
      workerId: 'worker-1',
      workerName: '김작업',
      iat: Math.floor(NOW_MS / 1000),
      exp: Math.floor(NOW_MS / 1000) + 3600,
    });

    expect(service.verifySession(cookie)).toBeNull();
  });

  it('rejects browser payloads on worker session verification', () => {
    const cookie = signedSession({
      kind: 'browser',
      userType: 'admin',
      userId: 'admin',
      iat: Math.floor(NOW_MS / 1000),
      exp: Math.floor(NOW_MS / 1000) + 3600,
    });

    expect(service.verifyWorkerSession(cookie)).toBeNull();
  });

  it('accepts valid worker sessions with timestamps', () => {
    const cookie = signedSession({
      kind: 'worker',
      workerId: 'worker-1',
      workerName: '김작업',
      workerType: 'field',
      iat: Math.floor(NOW_MS / 1000),
      exp: Math.floor(NOW_MS / 1000) + 3600,
    });

    expect(service.verifyWorkerSession(cookie)).toEqual({
      userType: 'worker',
      userId: 'worker-1',
      companyId: null,
      workerName: '김작업',
      workerType: 'field',
    });
  });
});
