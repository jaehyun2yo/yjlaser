const REDACTED = '[REDACTED]';
const REDACTED_PATH = '[REDACTED_PATH]';
const REDACTED_URL = '[REDACTED_URL]';

const SENSITIVE_KEY_PARTS = [
  'password',
  'passwd',
  'secret',
  'token',
  'auth',
  'credential',
  'jwt',
  'api_key',
  'apikey',
  'service_role',
  'anon_key',
  'access_key',
  'refresh_token',
  'private_key',
  'session',
  'cookie',
  'authorization',
  'email',
  'phone',
  'mobile',
  'fax',
] as const;

const SENSITIVE_ASSIGNMENT_RE =
  /\b(password|passwd|secret|token|auth|credential|jwt|api_key|apikey|service_role|anon_key|access_key|refresh_token|private_key|session|cookie|authorization)\b\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/i;
const LOCAL_PATH_RE = /[A-Z]:\\Users\\[^\\\s]+\\[^\s,;]+/i;
const UNC_PATH_RE = /\\\\[^\s\\]+\\[^\s]+/i;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RE = /(?:\+?82[-\s]?)?0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/;
const PRESIGNED_URL_RE =
  /https?:\/\/[^\s"'<>]+(?:X-Amz-Signature|X-Amz-Credential|X-Goog-Signature|Expires=|Signature=)[^\s"'<>]*/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => lowerKey.includes(part));
}

export function maskText(value: string): string {
  return value
    .replace(SENSITIVE_ASSIGNMENT_RE, '$1=[REDACTED]')
    .replace(PRESIGNED_URL_RE, REDACTED_URL)
    .replace(LOCAL_PATH_RE, REDACTED_PATH)
    .replace(UNC_PATH_RE, REDACTED_PATH)
    .replace(EMAIL_RE, REDACTED)
    .replace(PHONE_RE, REDACTED);
}

export function maskSensitive(value: unknown): unknown {
  if (typeof value === 'string') return maskText(value);
  if (Array.isArray(value)) return value.map((item) => maskSensitive(item));
  if (!isRecord(value)) return value;

  const masked: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    masked[key] = isSensitiveKey(key) ? REDACTED : maskSensitive(entryValue);
  }
  return masked;
}

function hasRawSensitiveText(value: string): boolean {
  return (
    SENSITIVE_ASSIGNMENT_RE.test(value) ||
    PRESIGNED_URL_RE.test(value) ||
    LOCAL_PATH_RE.test(value) ||
    UNC_PATH_RE.test(value) ||
    EMAIL_RE.test(value) ||
    PHONE_RE.test(value)
  );
}

export function containsRawSensitiveValue(value: unknown): boolean {
  if (typeof value === 'string') return hasRawSensitiveText(value);
  if (Array.isArray(value)) return value.some((item) => containsRawSensitiveValue(item));
  if (!isRecord(value)) return false;

  return Object.entries(value).some(([key, entryValue]) => {
    if (isSensitiveKey(key) && entryValue !== REDACTED) return true;
    return containsRawSensitiveValue(entryValue);
  });
}
