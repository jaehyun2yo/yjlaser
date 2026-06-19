export type SanitizedJson =
  | null
  | string
  | number
  | boolean
  | SanitizedJson[]
  | { [key: string]: SanitizedJson };

export const REDACTED_VALUE = '[REDACTED]';
export const REDACTED_URL = '[REDACTED_URL]';
export const REDACTED_PATH = '[REDACTED_PATH]';
export const REDACTED_EMAIL = '[REDACTED_EMAIL]';
export const REDACTED_PHONE = '[REDACTED_PHONE]';
export const REDACTED_TOKEN = '[REDACTED_TOKEN]';

const MAX_SANITIZE_DEPTH = 8;
const SENSITIVE_KEY_PATTERN =
  /(token|api.?key|secret|password|passwd|pwd|authorization|cookie|credential|presigned|signed.?url|url|local.?path|file.?path|full.?path|customer|contact|phone|email|raw|drawing.?content|content)/i;

const SECRET_ASSIGNMENT_PATTERN =
  /\b(api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*[^,\s;"')]+/gi;
const URL_PATTERN = /https?:\/\/[^\s"')]+/gi;
const WINDOWS_PATH_PATTERN = /[A-Za-z]:\\[^\s"')]+/g;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /\b(?:\+?\d{1,3}[-.\s]?)?\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g;
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

export function sanitizeIntegrationEventData(value: unknown): SanitizedJson {
  return sanitizeValue(value, 0);
}

export function sanitizeIntegrationEventText(value: string): string {
  return value
    .replace(JWT_PATTERN, REDACTED_TOKEN)
    .replace(SECRET_ASSIGNMENT_PATTERN, (_match, key: string) => `${key}=${REDACTED_VALUE}`)
    .replace(URL_PATTERN, REDACTED_URL)
    .replace(WINDOWS_PATH_PATTERN, REDACTED_PATH)
    .replace(EMAIL_PATTERN, REDACTED_EMAIL)
    .replace(PHONE_PATTERN, REDACTED_PHONE);
}

function sanitizeValue(value: unknown, depth: number): SanitizedJson {
  if (depth > MAX_SANITIZE_DEPTH) return REDACTED_VALUE;
  if (value === null) return null;
  if (value === undefined) return null;
  if (typeof value === 'string') return sanitizeIntegrationEventText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1));
  if (!isRecord(value)) return REDACTED_VALUE;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED_VALUE : sanitizeValue(item, depth + 1),
    ])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
