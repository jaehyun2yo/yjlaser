export type RawSensitiveReason = 'sensitive_key' | 'sensitive_string' | 'max_depth';

export type RawSensitiveScanResult =
  | { ok: true }
  | {
      ok: false;
      code: 'LOG_RAW_SENSITIVE_VALUE' | 'LOG_METADATA_TOO_DEEP';
      reason: RawSensitiveReason;
      match_count: number;
    };

const MAX_METADATA_DEPTH = 6;

const DIRECT_SENSITIVE_KEY_TOKENS = new Set([
  'authorization',
  'cookie',
  'credential',
  'credentials',
  'email',
  'mobile',
  'passwd',
  'password',
  'phone',
  'pwd',
  'secret',
  'tel',
  'token',
]);

const SENSITIVE_STRING_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/,
  /\b(?:token|api[_-]?key|password|secret|authorization|cookie)=/i,
  /\bAuthorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/i,
  /\bCookie:\s*[^;]+=/i,
  /https?:\/\/[^\s"'<>]+(?:X-Amz-Signature|X-Goog-Signature|signature=|token=|api_key=)[^\s"'<>]*/i,
  /[A-Za-z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/i,
  /\\\\[^\\/\s]+\\[^\\/\s]+/,
] as const;

export function scanRawLogPayload(value: unknown): RawSensitiveScanResult {
  return scanValue(value, 0);
}

function scanValue(value: unknown, depth: number): RawSensitiveScanResult {
  if (depth > MAX_METADATA_DEPTH) {
    return {
      ok: false,
      code: 'LOG_METADATA_TOO_DEEP',
      reason: 'max_depth',
      match_count: 1,
    };
  }

  if (typeof value === 'string') {
    if (SENSITIVE_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
      return {
        ok: false,
        code: 'LOG_RAW_SENSITIVE_VALUE',
        reason: 'sensitive_string',
        match_count: 1,
      };
    }

    return { ok: true };
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = scanValue(item, depth + 1);
      if (!result.ok) {
        return result;
      }
    }

    return { ok: true };
  }

  if (typeof value === 'object' && value !== null) {
    for (const [key, childValue] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        return {
          ok: false,
          code: 'LOG_RAW_SENSITIVE_VALUE',
          reason: 'sensitive_key',
          match_count: 1,
        };
      }

      const result = scanValue(childValue, depth + 1);
      if (!result.ok) {
        return result;
      }
    }
  }

  return { ok: true };
}

function isSensitiveKey(key: string): boolean {
  const tokens = tokenizeKey(key);
  const tokenSet = new Set(tokens);

  if (tokens.some((token) => DIRECT_SENSITIVE_KEY_TOKENS.has(token))) {
    return true;
  }

  if (tokenSet.has('api') && tokenSet.has('key')) {
    return true;
  }

  if ((tokenSet.has('presigned') || tokenSet.has('signed')) && tokenSet.has('url')) {
    return true;
  }

  if (
    (tokenSet.has('local') || tokenSet.has('full') || tokenSet.has('file')) &&
    tokenSet.has('path')
  ) {
    return true;
  }

  return (
    tokenSet.has('contact') &&
    (tokenSet.has('name') ||
      tokenSet.has('address') ||
      tokenSet.has('email') ||
      tokenSet.has('phone') ||
      tokenSet.has('mobile') ||
      tokenSet.has('tel'))
  );
}

function tokenizeKey(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
