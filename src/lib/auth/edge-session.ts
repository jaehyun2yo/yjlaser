const CLOCK_SKEW_SECONDS = 300;
const DEV_SESSION_SECRET = 'change-this-in-production-dev-only';

export type BrowserSessionKind = 'admin' | 'company';

export interface VerifiedBrowserSession {
  userType: BrowserSessionKind;
  userId: string | number;
}

export interface VerifiedWorkerSession {
  workerId: string;
  workerName: string;
  role?: string;
  workerType?: string | null;
}

interface SecretCandidate {
  value: string;
}

interface SignedPayload {
  kind?: unknown;
  userType?: unknown;
  userId?: unknown;
  workerId?: unknown;
  workerName?: unknown;
  role?: unknown;
  workerType?: unknown;
  iat?: unknown;
  exp?: unknown;
}

function getPrimarySecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'development') return DEV_SESSION_SECRET;
  return null;
}

function getSecretCandidates(): SecretCandidate[] {
  const primary = getPrimarySecret();
  const candidates: SecretCandidate[] = primary ? [{ value: primary }] : [];

  const previous = process.env.SESSION_SECRET_PREVIOUS;
  const previousExpiresAt = process.env.SESSION_SECRET_PREVIOUS_EXPIRES_AT;
  if (previous && previousExpiresAt) {
    const expiresAt = Date.parse(previousExpiresAt);
    if (Number.isFinite(expiresAt) && Date.now() < expiresAt) {
      candidates.push({ value: previous });
    }
  }

  return candidates;
}

function isLegacyCookieAllowed(): boolean {
  const compatUntil = process.env.SESSION_LEGACY_COOKIE_COMPAT_UNTIL;
  if (!compatUntil) return false;

  const timestamp = Date.parse(compatUntil);
  return Number.isFinite(timestamp) && Date.now() < timestamp;
}

function splitSignedToken(signedToken: string): { tokenAndData: string; signature: string } | null {
  const lastDotIdx = signedToken.lastIndexOf('.');
  if (lastDotIdx === -1) return null;

  const tokenAndData = signedToken.substring(0, lastDotIdx);
  const signature = signedToken.substring(lastDotIdx + 1);
  if (!tokenAndData || !signature) return null;

  return { tokenAndData, signature };
}

function extractPayload(tokenAndData: string): SignedPayload | null {
  const firstColonIndex = tokenAndData.indexOf(':');
  if (firstColonIndex === -1) return null;

  const token = tokenAndData.substring(0, firstColonIndex);
  const sessionData = tokenAndData.substring(firstColonIndex + 1);
  if (!token || !sessionData) return null;

  try {
    const parsed = JSON.parse(sessionData) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as SignedPayload;
  } catch {
    return null;
  }
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function fixedTimeEqualHex(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let i = 0; i < maxLength; i++) {
    const leftCode = i < left.length ? left.charCodeAt(i) : 0;
    const rightCode = i < right.length ? right.charCodeAt(i) : 0;
    diff |= leftCode ^ rightCode;
  }

  return diff === 0;
}

async function signData(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return toHex(signature);
}

async function verifySignature(tokenAndData: string, signature: string): Promise<boolean> {
  const candidates = getSecretCandidates();
  for (const candidate of candidates) {
    const expected = await signData(tokenAndData, candidate.value);
    if (fixedTimeEqualHex(signature, expected)) return true;
  }
  return false;
}

function hasValidTimestamp(payload: SignedPayload): boolean {
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

async function parseVerifiedPayload(
  signedToken: string | undefined
): Promise<SignedPayload | null> {
  if (!signedToken) return null;

  const parts = splitSignedToken(signedToken);
  if (!parts) return null;

  const verified = await verifySignature(parts.tokenAndData, parts.signature);
  if (!verified) return null;

  const payload = extractPayload(parts.tokenAndData);
  if (!payload || !hasValidTimestamp(payload)) return null;

  return payload;
}

export async function verifyBrowserSessionCookie(
  signedToken: string | undefined,
  expectedType: BrowserSessionKind
): Promise<VerifiedBrowserSession | null> {
  const payload = await parseVerifiedPayload(signedToken);
  if (!payload) return null;

  const isLegacyPayload = payload.kind === undefined;
  if (!isLegacyPayload && payload.kind !== 'browser') return null;
  if (payload.userType !== expectedType) return null;

  if (expectedType === 'company' && typeof payload.userId !== 'number') return null;

  return {
    userType: expectedType,
    userId:
      typeof payload.userId === 'string' || typeof payload.userId === 'number'
        ? payload.userId
        : 'admin',
  };
}

export async function verifyWorkerSessionCookie(
  signedToken: string | undefined
): Promise<VerifiedWorkerSession | null> {
  const payload = await parseVerifiedPayload(signedToken);
  if (!payload) return null;

  const isLegacyPayload = payload.kind === undefined;
  if (!isLegacyPayload && payload.kind !== 'worker') return null;
  if (typeof payload.workerId !== 'string' || !payload.workerId) return null;
  if (typeof payload.workerName !== 'string' || !payload.workerName) return null;

  return {
    workerId: payload.workerId,
    workerName: payload.workerName,
    role: typeof payload.role === 'string' ? payload.role : undefined,
    workerType:
      typeof payload.workerType === 'string' || payload.workerType === null
        ? payload.workerType
        : undefined,
  };
}
