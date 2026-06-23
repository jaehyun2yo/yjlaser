type RedactableRecord = Record<string, unknown>;

const FILTERED_VALUE = '[Filtered]';
const REDACTED_PATH = '[REDACTED_PATH]';
const REDACTED_URL = '[REDACTED_URL]';

const SENSITIVE_QUERY_KEYS = new Set([
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'expires',
  'password',
  'resettoken',
  'reset_token',
  'secret',
  'signature',
  'token',
  'x-amz-credential',
  'x-amz-signature',
  'x-goog-signature',
]);

const SENSITIVE_KEY_PARTS = [
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'credential',
  'email',
  'mobile',
  'passwd',
  'password',
  'phone',
  'private_key',
  'refresh_token',
  'secret',
  'session',
  'token',
] as const;

const SENSITIVE_ASSIGNMENT_RE =
  /\b(password|passwd|secret|token|auth|credential|jwt|api_key|apikey|service_role|anon_key|access_key|refresh_token|private_key|session|cookie|authorization|phone|email)\b\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi;
const AUTHORIZATION_RE = /\bAuthorization:\s*[^\r\n]*/gi;
const COOKIE_RE = /\bCookie:\s*[^\r\n]*/gi;
const LOCAL_PATH_RE = /[A-Z]:\\Users\\[^\\\s]+\\[^\s,;]+/gi;
const UNC_PATH_RE = /\\\\[^\s\\]+\\[^\s]+/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?82[-\s]?)?0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/g;
const PRESIGNED_URL_RE =
  /https?:\/\/[^\s"'<>]+(?:X-Amz-Signature|X-Amz-Credential|X-Goog-Signature|Expires=|Signature=)[^\s"'<>]*/gi;

export function redactRequestUrl(url: string): string {
  try {
    const isRelativeUrl = url.startsWith('/');
    const parsed = isRelativeUrl ? new URL(url, 'https://redaction.local') : new URL(url);

    redactSearchParams(parsed.searchParams);
    redactHashParams(parsed);

    return isRelativeUrl ? `${parsed.pathname}${parsed.search}${parsed.hash}` : parsed.toString();
  } catch {
    return redactErrorMessage(url);
  }
}

export function redactErrorMessage(message: unknown): string {
  return redactText(String(message));
}

export function redactLogValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactLogValue(entry));
  }

  if (!isRecord(value)) {
    return value;
  }

  const redacted: RedactableRecord = {};
  for (const [key, entryValue] of Object.entries(value)) {
    redacted[key] = isSensitiveKey(key) ? FILTERED_VALUE : redactLogValue(entryValue);
  }

  return redacted;
}

export function safePrincipalLabel(user: unknown): string {
  if (!isRecord(user)) {
    return 'anonymous';
  }

  const userType = typeof user.userType === 'string' ? user.userType : 'unknown';
  const hasUserId = typeof user.userId === 'string' || typeof user.userId === 'number';

  return `${sanitizeLabel(userType)}:${hasUserId ? 'present' : 'anonymous'}`;
}

function redactText(value: string): string {
  return value
    .replace(PRESIGNED_URL_RE, REDACTED_URL)
    .replace(AUTHORIZATION_RE, 'Authorization: [Filtered]')
    .replace(COOKIE_RE, 'Cookie: [Filtered]')
    .replace(SENSITIVE_ASSIGNMENT_RE, '$1=[Filtered]')
    .replace(LOCAL_PATH_RE, REDACTED_PATH)
    .replace(UNC_PATH_RE, REDACTED_PATH)
    .replace(EMAIL_RE, FILTERED_VALUE)
    .replace(PHONE_RE, FILTERED_VALUE);
}

function redactSearchParams(params: URLSearchParams): void {
  for (const key of [...params.keys()]) {
    if (isSensitiveQueryKey(key)) {
      params.set(key, FILTERED_VALUE);
      continue;
    }

    if (params.getAll(key).some((value) => containsSensitiveText(value))) {
      params.set(key, FILTERED_VALUE);
    }
  }
}

function redactHashParams(parsed: URL): void {
  const hash = parsed.hash.replace(/^#/, '');
  if (!hash) return;

  const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash;
  const hashPrefix = hash.includes('?') ? `${hash.slice(0, hash.indexOf('?') + 1)}` : '';
  const params = new URLSearchParams(hashQuery);
  let redacted = false;

  for (const key of [...params.keys()]) {
    if (isSensitiveQueryKey(key)) {
      params.set(key, FILTERED_VALUE);
      redacted = true;
      continue;
    }

    if (params.getAll(key).some((value) => containsSensitiveText(value))) {
      params.set(key, FILTERED_VALUE);
      redacted = true;
    }
  }

  if (redacted) {
    parsed.hash = `${hashPrefix}${params.toString()}`;
  }
}

function isSensitiveQueryKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_QUERY_KEYS.has(normalized) || isSensitiveKey(normalized);
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

function containsSensitiveText(value: string): boolean {
  return redactText(value) !== value;
}

function sanitizeLabel(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'unknown';
}

function isRecord(value: unknown): value is RedactableRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
