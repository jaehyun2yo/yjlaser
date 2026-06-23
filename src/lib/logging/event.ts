import { maskSensitive } from '@/lib/logging/masking';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';
export type LogProject =
  | 'company_site'
  | 'webhard_sync'
  | 'invoice_manager'
  | 'laser_nesting'
  | 'computeroff';
export type LogStatus = 'start' | 'success' | 'failure' | 'skipped' | 'retry' | 'degraded';
export type LogChannel = 'debug' | 'audit' | 'security' | 'perf' | 'error' | 'external';

export interface LogEventInput {
  event_id?: string;
  level: LogLevel;
  project: LogProject;
  component: string;
  feature: string;
  event: string;
  action: string;
  status: LogStatus;
  channel: LogChannel;
  correlation_id: string;
  metadata?: Record<string, unknown>;
  duration_ms?: number;
  count?: number;
  actor_type?: string;
  actor_id_hash?: string;
  target_type?: string;
  target_id_hash?: string;
  error_type?: string;
  error_code?: string;
  error_message?: string;
  hash_key_version?: string;
  span_id?: string;
}

export interface LogEvent extends LogEventInput {
  schema_version: 1;
  event_id: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

const PREFIX_RE = /[^a-z0-9_-]+/g;

function normalizePrefix(prefix: string, fallback: string): string {
  return (
    prefix
      .toLowerCase()
      .replace(PREFIX_RE, '-')
      .replace(/^-+|-+$/g, '') || fallback
  );
}

function timestampParts(): { date: string; time: string } {
  const now = new Date();
  return {
    date: now.toISOString().slice(0, 10).replaceAll('-', ''),
    time: now.toISOString().slice(11, 19).replaceAll(':', ''),
  };
}

function randomHex(length: number): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, length);
  }
  return Math.random()
    .toString(16)
    .slice(2, 2 + length)
    .padEnd(length, '0');
}

export function generateCorrelationId(prefix: string): string {
  const normalized = normalizePrefix(prefix, '');
  if (!normalized) throw new Error('correlation prefix is required');

  const { date, time } = timestampParts();
  return `${normalized}-${date}-${time}-${randomHex(6)}`;
}

export function generateEventId(prefix = 'evt'): string {
  const normalized = normalizePrefix(prefix, 'evt');
  const { date, time } = timestampParts();
  return `${normalized}-${date}-${time}-${randomHex(8)}`;
}

export function buildLogEvent(input: LogEventInput): LogEvent {
  const required = [
    input.project,
    input.component,
    input.feature,
    input.event,
    input.action,
    input.status,
    input.channel,
    input.correlation_id,
  ];
  if (required.some((value) => !String(value || '').trim())) {
    throw new Error('missing required log event field');
  }

  return {
    schema_version: 1,
    timestamp: new Date().toISOString(),
    ...input,
    event_id: input.event_id || generateEventId('evt'),
    metadata: input.metadata ? (maskSensitive(input.metadata) as Record<string, unknown>) : {},
    error_message: input.error_message ? String(maskSensitive(input.error_message)) : undefined,
  };
}
