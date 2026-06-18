import * as crypto from 'crypto';
import { Socket } from 'socket.io';
import { AuthService, SessionUser } from './auth.service';

type BrowserUserType = 'admin' | 'company';
type SocketTokenUserType = BrowserUserType | 'worker';

export type GatewaySocket = Socket & { userData?: SessionUser };

const SESSION_COOKIE_BY_TYPE: Record<BrowserUserType, string> = {
  admin: 'admin-session',
  company: 'company-session',
};

export function getCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const cookieName = trimmed.slice(0, separatorIndex);
    if (cookieName === name) {
      try {
        return decodeURIComponent(trimmed.slice(separatorIndex + 1));
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

export function verifyBrowserGatewaySession(
  authService: AuthService,
  cookieHeader: string | undefined,
  allowedTypes: readonly BrowserUserType[]
): SessionUser | null {
  for (const userType of allowedTypes) {
    const cookieValue = getCookieValue(cookieHeader, SESSION_COOKIE_BY_TYPE[userType]);
    if (!cookieValue) {
      continue;
    }

    const user = authService.verifySession(cookieValue);
    if (user?.userType === userType) {
      return user;
    }
  }

  return null;
}

export function verifyWorkerGatewaySession(
  authService: AuthService,
  cookieHeader: string | undefined
): SessionUser | null {
  const cookieValue =
    getCookieValue(cookieHeader, 'erp-session') ?? getCookieValue(cookieHeader, 'worker-session');

  if (!cookieValue || typeof authService.verifyWorkerSession !== 'function') {
    return null;
  }

  const user = authService.verifyWorkerSession(cookieValue);
  return user?.userType === 'worker' ? user : null;
}

export function verifySignedSocketToken(
  token: unknown,
  allowedTypes: readonly SocketTokenUserType[]
): SessionUser | null {
  if (typeof token !== 'string' || token.length === 0) {
    return null;
  }

  try {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
      return null;
    }

    const dotIdx = token.lastIndexOf('.');
    if (dotIdx === -1) {
      return null;
    }

    const payloadB64 = token.substring(0, dotIdx);
    const signature = token.substring(dotIdx + 1);
    const payloadStr = Buffer.from(payloadB64, 'base64url').toString();
    const expectedSig = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');

    if (signature.length !== expectedSig.length) {
      return null;
    }

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const payload = JSON.parse(payloadStr) as {
      userType?: unknown;
      userId?: unknown;
      exp?: unknown;
    };

    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) {
      return null;
    }

    if (!isAllowedSocketUserType(payload.userType, allowedTypes)) {
      return null;
    }

    if (payload.userType === 'admin' && isStringOrNumber(payload.userId)) {
      return { userType: 'admin', userId: payload.userId, companyId: null };
    }

    if (payload.userType === 'company' && isStringOrNumber(payload.userId)) {
      const companyId = Number(payload.userId);
      if (!Number.isSafeInteger(companyId)) {
        return null;
      }
      return { userType: 'company', userId: payload.userId, companyId };
    }

    if (payload.userType === 'worker' && typeof payload.userId === 'string') {
      return {
        userType: 'worker',
        userId: payload.userId,
        companyId: null,
        workerName: payload.userId,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function isAllowedSocketUserType(
  value: unknown,
  allowedTypes: readonly SocketTokenUserType[]
): value is SocketTokenUserType {
  return (
    (value === 'admin' || value === 'company' || value === 'worker') && allowedTypes.includes(value)
  );
}

function isStringOrNumber(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}
