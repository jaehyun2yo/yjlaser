interface SentryEventWithRequestUrl {
  request?: {
    query_string?: string | Record<string, unknown>;
    url?: string;
  };
  breadcrumbs?: Array<{
    data?: Record<string, unknown>;
  }>;
}

const FILTERED_VALUE = '[Filtered]';
const SENSITIVE_URL_KEYS = new Set(['token', 'resetToken', 'reset_token']);

export function redactSentryEventUrl<T>(event: T): T {
  const mutableEvent = event as unknown as SentryEventWithRequestUrl;
  const url = mutableEvent.request?.url;
  if (!url) {
    redactRequestQueryString(mutableEvent);
    redactBreadcrumbUrls(mutableEvent);
    return event;
  }

  const redactedUrl = redactSensitiveUrlValues(url);
  if (redactedUrl !== url && mutableEvent.request) {
    mutableEvent.request.url = redactedUrl;
  }

  redactRequestQueryString(mutableEvent);
  redactBreadcrumbUrls(mutableEvent);

  return event;
}

function redactRequestQueryString(event: SentryEventWithRequestUrl): void {
  const queryString = event.request?.query_string;
  if (!queryString || !event.request) {
    return;
  }

  event.request.query_string =
    typeof queryString === 'string'
      ? redactSensitiveQueryString(queryString)
      : redactSensitiveQueryObject(queryString);
}

function redactBreadcrumbUrls(event: SentryEventWithRequestUrl): void {
  for (const breadcrumb of event.breadcrumbs || []) {
    if (!breadcrumb.data) {
      continue;
    }

    for (const [key, value] of Object.entries(breadcrumb.data)) {
      if (typeof value === 'string') {
        breadcrumb.data[key] = redactSensitiveUrlValues(value);
      }
    }
  }
}

function redactSensitiveQueryString(queryString: string): string {
  const params = new URLSearchParams(queryString);
  let redacted = false;

  for (const key of SENSITIVE_URL_KEYS) {
    if (params.has(key)) {
      params.set(key, FILTERED_VALUE);
      redacted = true;
    }
  }

  return redacted ? params.toString() : queryString;
}

function redactSensitiveQueryObject(query: Record<string, unknown>): Record<string, unknown> {
  const redactedQuery = { ...query };
  for (const key of SENSITIVE_URL_KEYS) {
    if (key in redactedQuery) {
      redactedQuery[key] = FILTERED_VALUE;
    }
  }

  return redactedQuery;
}

function redactSensitiveUrlValues(url: string): string {
  try {
    const isRelativeUrl = url.startsWith('/');
    const parsed = isRelativeUrl ? new URL(url, 'https://redaction.local') : new URL(url);
    for (const key of SENSITIVE_URL_KEYS) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, FILTERED_VALUE);
      }
    }

    const hash = parsed.hash.replace(/^#/, '');
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      let redactedHash = false;
      for (const key of SENSITIVE_URL_KEYS) {
        if (hashParams.has(key)) {
          hashParams.set(key, FILTERED_VALUE);
          redactedHash = true;
        }
      }
      if (redactedHash) {
        parsed.hash = hashParams.toString();
      }
    }

    if (isRelativeUrl) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    return parsed.toString();
  } catch {
    return url
      .replace(/([?&](?:token|resetToken|reset_token)=)[^&#]*/gi, `$1${FILTERED_VALUE}`)
      .replace(/([#&](?:token|resetToken|reset_token)=)[^&#]*/gi, `$1${FILTERED_VALUE}`);
  }
}
