import { createHash, randomBytes } from 'crypto';
import { redactErrorMessage, redactLogValue } from './request-redaction';

export type BackendLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';
export type BackendLogProject =
  | 'company_site'
  | 'webhard_sync'
  | 'invoice_manager'
  | 'laser_nesting'
  | 'computeroff';
export type BackendLogStatus = 'start' | 'success' | 'failure' | 'skipped' | 'retry' | 'degraded';
export type BackendLogChannel = 'debug' | 'audit' | 'security' | 'perf' | 'error' | 'external';

export interface BackendLogEventInput {
  event_id?: string;
  level: BackendLogLevel;
  project: BackendLogProject;
  component: string;
  feature: string;
  event: string;
  action: string;
  status: BackendLogStatus;
  channel: BackendLogChannel;
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

export interface BackendLogEvent extends Omit<BackendLogEventInput, 'metadata'> {
  schema_version: 1;
  event_id: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

const PREFIX_RE = /[^a-z0-9_-]+/g;

export function generateCorrelationId(prefix: string): string {
  const normalized = normalizePrefix(prefix, '');
  if (!normalized) {
    throw new Error('correlation prefix is required');
  }

  const { date, time } = timestampParts();
  return `${normalized}-${date}-${time}-${randomBytes(3).toString('hex')}`;
}

export function generateEventId(prefix = 'evt'): string {
  const normalized = normalizePrefix(prefix, 'evt');
  const { date, time } = timestampParts();
  return `${normalized}-${date}-${time}-${randomBytes(4).toString('hex')}`;
}

export function hashIdentifier(value: unknown): string {
  return createHash('sha256')
    .update(String(value ?? ''))
    .digest('hex')
    .slice(0, 16);
}

export function buildLogEvent(input: BackendLogEventInput): BackendLogEvent {
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
    metadata: sanitizeMetadata(input.metadata ?? {}),
    error_message: input.error_message ? redactErrorMessage(input.error_message) : undefined,
  };
}

export function formatLogEvent(input: BackendLogEventInput): string {
  return JSON.stringify(buildLogEvent(input));
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const redacted = redactLogValue(metadata);
  if (isRecord(redacted)) {
    return redacted;
  }
  return {};
}

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
    date: now.toISOString().slice(0, 10).replace(/-/g, ''),
    time: now.toISOString().slice(11, 19).replace(/:/g, ''),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
