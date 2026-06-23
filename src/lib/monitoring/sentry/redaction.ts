import { isSensitiveKey, maskText } from '@/lib/logging/masking';

type MutableRecord = Record<string, unknown>;

interface SentryEventLike {
  request?: MutableRecord & {
    query_string?: string | MutableRecord;
    url?: string;
    headers?: MutableRecord;
    data?: unknown;
  };
  breadcrumbs?: Array<MutableRecord & { data?: MutableRecord }>;
  user?: MutableRecord;
}

const FILTERED_VALUE = '[Filtered]';
const AUTHORIZATION_HEADER_RE = /\bAuthorization:\s*[^\r\n]*/gi;

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

const SAFE_HEADER_KEYS = new Set([
  'accept',
  'content-type',
  'user-agent',
  'x-correlation-id',
  'x-request-id',
]);

const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-csrf-token',
  'x-log-signature',
]);

export function redactSentryEventUrl<T>(event: T): T {
  const redacted = redactSentryValue(event, []) as T;
  const mutableEvent = redacted as unknown as SentryEventLike;

  if (mutableEvent.request) {
    redactRequest(mutableEvent.request);
  }

  if (mutableEvent.breadcrumbs) {
    mutableEvent.breadcrumbs = mutableEvent.breadcrumbs.map((breadcrumb) => ({
      ...breadcrumb,
      data: breadcrumb.data
        ? (redactSentryValue(breadcrumb.data, ['breadcrumbs', 'data']) as MutableRecord)
        : breadcrumb.data,
    }));
  }

  if (mutableEvent.user) {
    mutableEvent.user = redactUserContext(mutableEvent.user);
  }

  return redacted;
}

function redactRequest(request: SentryEventLike['request']): void {
  if (!request) return;

  if (typeof request.url === 'string') {
    request.url = redactSensitiveUrlValues(request.url);
  }

  if (request.query_string) {
    request.query_string =
      typeof request.query_string === 'string'
        ? redactSensitiveQueryString(request.query_string)
        : redactSensitiveQueryObject(request.query_string);
  }

  if (request.headers) {
    request.headers = redactHeaders(request.headers);
  }

  if ('data' in request) {
    request.data = FILTERED_VALUE;
  }

  for (const [key, value] of Object.entries(request)) {
    if (key === 'url' || key === 'query_string' || key === 'headers' || key === 'data') {
      continue;
    }

    request[key] = isSensitiveKey(key)
      ? FILTERED_VALUE
      : redactSentryValue(value, ['request_extra', key]);
  }
}

function redactHeaders(headers: MutableRecord): MutableRecord {
  const redacted: MutableRecord = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_HEADER_KEYS.has(lowerKey) || isSensitiveKey(lowerKey)) {
      redacted[key] = FILTERED_VALUE;
      continue;
    }

    if (SAFE_HEADER_KEYS.has(lowerKey)) {
      redacted[key] = redactSentryValue(value, ['request', 'headers', key]);
      continue;
    }

    redacted[key] = FILTERED_VALUE;
  }

  return redacted;
}

function redactUserContext(user: MutableRecord): MutableRecord {
  const redacted: MutableRecord = {};

  for (const [key, value] of Object.entries(user)) {
    if (isSensitiveKey(key)) {
      redacted[key] = FILTERED_VALUE;
      continue;
    }

    redacted[key] = redactSentryValue(value, ['user', key]);
  }

  return redacted;
}

function redactSentryValue(value: unknown, path: string[]): unknown {
  if (typeof value === 'string') {
    return redactSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSentryValue(item, path));
  }

  if (!isRecord(value)) {
    return value;
  }

  const redacted: MutableRecord = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (path.length === 0 && key === 'request' && isRecord(entryValue)) {
      redacted[key] = { ...entryValue };
      continue;
    }

    if (path[0] !== 'request' && isSensitiveKey(key)) {
      redacted[key] = FILTERED_VALUE;
      continue;
    }

    redacted[key] = redactSentryValue(entryValue, [...path, key]);
  }

  return redacted;
}

function redactSensitiveText(value: string): string {
  return redactSensitiveUrlValues(
    maskText(value.replace(AUTHORIZATION_HEADER_RE, 'Authorization: [Filtered]'))
  );
}

function redactSensitiveQueryString(queryString: string): string {
  const params = new URLSearchParams(queryString);
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

  return redacted ? params.toString() : queryString;
}

function redactSensitiveQueryObject(query: MutableRecord): MutableRecord {
  const redactedQuery: MutableRecord = {};

  for (const [key, value] of Object.entries(query)) {
    redactedQuery[key] = isSensitiveQueryKey(key)
      ? FILTERED_VALUE
      : redactSentryValue(value, ['request', 'query_string', key]);
  }

  return redactedQuery;
}

function redactSensitiveUrlValues(url: string): string {
  try {
    const isRelativeUrl = url.startsWith('/');
    const parsed = isRelativeUrl ? new URL(url, 'https://redaction.local') : new URL(url);

    redactUrlSearchParams(parsed.searchParams);
    redactUrlHashParams(parsed);

    if (isRelativeUrl) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    return parsed.toString();
  } catch {
    return maskText(url)
      .replace(
        /([?&#](?:token|resetToken|reset_token|api_key|password|secret)=)[^&#]*/gi,
        `$1${FILTERED_VALUE}`
      )
      .replace(
        /([?&#](?:X-Amz-Signature|X-Goog-Signature|Signature|Expires)=)[^&#]*/gi,
        `$1${FILTERED_VALUE}`
      );
  }
}

function redactUrlSearchParams(params: URLSearchParams): void {
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

function redactUrlHashParams(parsed: URL): void {
  const hash = parsed.hash.replace(/^#/, '');
  if (!hash) return;

  const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash;
  const hashPrefix = hash.includes('?') ? `${hash.slice(0, hash.indexOf('?') + 1)}` : '';
  const hashParams = new URLSearchParams(hashQuery);
  let redactedHash = false;

  for (const key of [...hashParams.keys()]) {
    if (isSensitiveQueryKey(key)) {
      hashParams.set(key, FILTERED_VALUE);
      redactedHash = true;
      continue;
    }

    if (hashParams.getAll(key).some((value) => containsSensitiveText(value))) {
      hashParams.set(key, FILTERED_VALUE);
      redactedHash = true;
    }
  }

  if (redactedHash) {
    parsed.hash = `${hashPrefix}${hashParams.toString()}`;
  }
}

function isSensitiveQueryKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_QUERY_KEYS.has(normalized) || isSensitiveKey(normalized);
}

function containsSensitiveText(value: string): boolean {
  return maskText(value) !== value;
}

function isRecord(value: unknown): value is MutableRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
