import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

// Session parsing fix: handle JSON containing colons (2026-01-19)

const CLOCK_SKEW_SECONDS = 300;

interface TimedSessionPayload {
  kind?: unknown;
  iat?: unknown;
  exp?: unknown;
}

export interface SessionUser {
  userType: 'admin' | 'company' | 'worker' | 'integration';
  userId: string | number;
  companyId: number | null;
  workerName?: string;
  workerType?: string | null;
  programType?: string;
  permissions?: string[];
}

@Injectable()
export class AuthService {
  private readonly sessionSecret: string;

  constructor(private configService: ConfigService) {
    this.sessionSecret = this.configService.get<string>('SESSION_SECRET', '');
    if (!this.sessionSecret) {
      throw new Error('SESSION_SECRET is not configured');
    }
  }

  /**
   * Verify and parse session cookie
   */
  verifySession(cookieValue: string | undefined): SessionUser | null {
    if (!cookieValue) {
      return null;
    }

    try {
      // Cookie format: token:sessionData.signature
      // sessionData is JSON: { userType, userId }
      const parts = cookieValue.split('.');
      if (parts.length !== 2) {
        return null;
      }

      const [tokenAndData, signature] = parts;

      // 첫 번째 ':' 위치를 찾아서 token과 sessionData를 분리
      // (sessionData가 JSON이므로 내부에 ':'가 포함될 수 있음)
      const firstColonIndex = tokenAndData.indexOf(':');
      if (firstColonIndex === -1) {
        return null;
      }

      const token = tokenAndData.substring(0, firstColonIndex);
      const sessionDataStr = tokenAndData.substring(firstColonIndex + 1);

      if (!token || !sessionDataStr || !signature) {
        return null;
      }

      // Verify signature
      const expectedSignature = this.signData(`${token}:${sessionDataStr}`);
      if (!this.timingSafeEqual(signature, expectedSignature)) {
        return null;
      }

      // Parse session data
      const sessionData = JSON.parse(sessionDataStr) as TimedSessionPayload & {
        userType?: unknown;
        userId?: unknown;
      };
      if (!this.hasValidTimestamp(sessionData)) {
        return null;
      }
      if (sessionData.kind !== undefined && sessionData.kind !== 'browser') {
        return null;
      }
      const { userType, userId } = sessionData;

      // userType은 필수이며 관리자/거래처 세션만 이 경로에서 허용한다.
      if (userType !== 'admin' && userType !== 'company') {
        return null;
      }

      // company 사용자는 userId 필수
      if (userType === 'company' && userId === undefined) {
        return null;
      }
      if (userId !== undefined && typeof userId !== 'string' && typeof userId !== 'number') {
        return null;
      }

      // Determine companyId
      let companyId: number | null = null;
      if (userType === 'company' && typeof userId === 'number') {
        companyId = userId;
      } else if (userType === 'admin') {
        // Admin has companyId 0 (special admin company)
        companyId = 0;
      }

      return {
        userType,
        userId: userId ?? 'admin', // admin 사용자는 기본값 'admin'
        companyId,
      };
    } catch {
      return null;
    }
  }

  /**
   * Verify and parse a Worker ERP session cookie.
   *
   * Cookie format matches the Next.js `erp-session` cookie:
   * token:{"workerId":"...","workerName":"..."}.signature
   */
  verifyWorkerSession(cookieValue: string | undefined): SessionUser | null {
    if (!cookieValue) {
      return null;
    }

    try {
      const parts = cookieValue.split('.');
      if (parts.length !== 2) {
        return null;
      }

      const [tokenAndData, signature] = parts;
      const firstColonIndex = tokenAndData.indexOf(':');
      if (firstColonIndex === -1) {
        return null;
      }

      const token = tokenAndData.substring(0, firstColonIndex);
      const sessionDataStr = tokenAndData.substring(firstColonIndex + 1);
      if (!token || !sessionDataStr || !signature) {
        return null;
      }

      const expectedSignature = this.signData(`${token}:${sessionDataStr}`);
      if (!this.timingSafeEqual(signature, expectedSignature)) {
        return null;
      }

      const sessionData = JSON.parse(sessionDataStr) as {
        kind?: unknown;
        workerId?: unknown;
        workerName?: unknown;
        workerType?: unknown;
        iat?: unknown;
        exp?: unknown;
      };
      if (!this.hasValidTimestamp(sessionData)) {
        return null;
      }
      if (sessionData.kind !== undefined && sessionData.kind !== 'worker') {
        return null;
      }
      if (
        typeof sessionData.workerId !== 'string' ||
        !sessionData.workerId ||
        typeof sessionData.workerName !== 'string' ||
        !sessionData.workerName
      ) {
        return null;
      }

      return {
        userType: 'worker',
        userId: sessionData.workerId,
        companyId: null,
        workerName: sessionData.workerName,
        workerType:
          typeof sessionData.workerType === 'string' || sessionData.workerType === null
            ? sessionData.workerType
            : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Sign data using HMAC-SHA256
   */
  private signData(data: string): string {
    return crypto.createHmac('sha256', this.sessionSecret).update(data).digest('hex');
  }

  private isLegacyCookieAllowed(): boolean {
    const compatUntil = process.env.SESSION_LEGACY_COOKIE_COMPAT_UNTIL;
    if (!compatUntil) return false;

    const timestamp = Date.parse(compatUntil);
    return Number.isFinite(timestamp) && Date.now() < timestamp;
  }

  private hasValidTimestamp(payload: TimedSessionPayload): boolean {
    const hasIat = typeof payload.iat === 'number' && Number.isFinite(payload.iat);
    const hasExp = typeof payload.exp === 'number' && Number.isFinite(payload.exp);

    if (!hasIat || !hasExp) return this.isLegacyCookieAllowed();

    const iat = payload.iat;
    const exp = payload.exp;
    if (typeof iat !== 'number' || typeof exp !== 'number') return false;

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (exp <= nowSeconds) return false;
    if (iat > nowSeconds + CLOCK_SKEW_SECONDS) return false;
    if (iat > exp) return false;

    return true;
  }

  /**
   * Timing-safe string comparison to prevent timing attacks
   * Pads shorter string to equal length before comparison to avoid leaking length info
   */
  private timingSafeEqual(a: string, b: string): boolean {
    // Use a fixed-length comparison to avoid leaking length information
    const maxLen = Math.max(a.length, b.length);
    const bufA = Buffer.alloc(maxLen);
    const bufB = Buffer.alloc(maxLen);
    Buffer.from(a).copy(bufA);
    Buffer.from(b).copy(bufB);
    const equal = crypto.timingSafeEqual(bufA, bufB);
    // Length mismatch always fails regardless of content
    return equal && a.length === b.length;
  }
}
