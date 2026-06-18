import { cookies } from 'next/headers';
import crypto from 'crypto';
import { getSessionSecret } from '@/lib/utils/env';

const ERP_SESSION_COOKIE_NAME = 'erp-session';
const CLOCK_SKEW_SECONDS = 300;

export interface ErpWorkerSession {
  workerId: string;
  workerName: string;
  role?: string;
  workerType?: string | null;
}

interface WorkerSessionPayload extends Partial<ErpWorkerSession> {
  kind?: unknown;
  iat?: unknown;
  exp?: unknown;
}

let cachedSessionSecret: string | null = null;
function getCachedSessionSecret(): string {
  if (!cachedSessionSecret) {
    cachedSessionSecret = getSessionSecret();
  }
  return cachedSessionSecret;
}

function signData(token: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

function getVerificationSecrets(): string[] {
  const secrets = [getCachedSessionSecret()];
  const previous = process.env.SESSION_SECRET_PREVIOUS;
  const previousExpiresAt = process.env.SESSION_SECRET_PREVIOUS_EXPIRES_AT;

  if (previous && previousExpiresAt) {
    const expiresAt = Date.parse(previousExpiresAt);
    if (Number.isFinite(expiresAt) && Date.now() < expiresAt) {
      secrets.push(previous);
    }
  }

  return secrets;
}

function isLegacyCookieAllowed(): boolean {
  const compatUntil = process.env.SESSION_LEGACY_COOKIE_COMPAT_UNTIL;
  if (!compatUntil) return false;

  const timestamp = Date.parse(compatUntil);
  return Number.isFinite(timestamp) && Date.now() < timestamp;
}

function hasValidTimestamp(payload: WorkerSessionPayload): boolean {
  const iat = payload.iat;
  const exp = payload.exp;
  const hasIat = typeof iat === 'number' && Number.isFinite(iat);
  const hasExp = typeof exp === 'number' && Number.isFinite(exp);

  if (!hasIat || !hasExp) return isLegacyCookieAllowed();

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (exp <= nowSeconds) return false;
  if (iat > nowSeconds + CLOCK_SKEW_SECONDS) return false;
  if (iat > exp) return false;

  return true;
}

function verifySignedToken(signedToken: string): string | null {
  const lastDotIdx = signedToken.lastIndexOf('.');
  if (lastDotIdx === -1) return null;

  const token = signedToken.substring(0, lastDotIdx);
  const signature = signedToken.substring(lastDotIdx + 1);

  if (!token || !signature) return null;

  for (const sessionSecret of getVerificationSecrets()) {
    const expectedSignature = signData(token, sessionSecret);
    if (signature.length !== expectedSignature.length) continue;
    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return token;
    }
  }

  return null;
}

/**
 * Get the current ERP worker session from cookies.
 * Returns { workerId, workerName } or null if not authenticated.
 */
export async function getErpWorkerSession(): Promise<{
  workerId: string;
  workerName: string;
  role?: string;
  workerType?: string | null;
} | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(ERP_SESSION_COOKIE_NAME);

    if (!sessionCookie?.value) return null;

    const token = verifySignedToken(sessionCookie.value);
    if (!token) return null;

    // Extract session data: format is "randomToken:jsonData.signature"
    const colonIdx = token.indexOf(':');
    if (colonIdx === -1) return null;

    const sessionJson = token.substring(colonIdx + 1);
    const sessionData = JSON.parse(sessionJson) as WorkerSessionPayload;
    if (!hasValidTimestamp(sessionData)) return null;
    if (sessionData.kind !== undefined && sessionData.kind !== 'worker') return null;
    if (
      typeof sessionData.workerId !== 'string' ||
      !sessionData.workerId ||
      typeof sessionData.workerName !== 'string' ||
      !sessionData.workerName
    ) {
      return null;
    }

    return {
      workerId: sessionData.workerId,
      workerName: sessionData.workerName,
      role: typeof sessionData.role === 'string' ? sessionData.role : undefined,
      workerType:
        typeof sessionData.workerType === 'string' || sessionData.workerType === null
          ? sessionData.workerType
          : undefined,
    };
  } catch {
    return null;
  }
}
