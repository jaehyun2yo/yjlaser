export const INTEGRATION_PERMISSIONS = [
  'event/write',
  'file/register',
  'job/read',
  'operation/read',
] as const;

export type IntegrationPermission = (typeof INTEGRATION_PERMISSIONS)[number];

export const INTEGRATION_WORKER_TYPES = [
  'external_webhard_sync',
  'website_worker',
  'management_program',
  'nesting_program',
  'manual_worker',
  'admin_dashboard',
] as const;

export type IntegrationWorkerType = (typeof INTEGRATION_WORKER_TYPES)[number];

export const DEFAULT_INTEGRATION_WORKER_PERMISSIONS: Record<
  IntegrationWorkerType,
  readonly IntegrationPermission[]
> = {
  external_webhard_sync: ['file/register', 'event/write'],
  website_worker: ['event/write'],
  management_program: ['event/write', 'job/read'],
  nesting_program: ['event/write', 'job/read'],
  manual_worker: ['event/write', 'job/read'],
  admin_dashboard: ['operation/read'],
};

export function isIntegrationPermission(value: string): value is IntegrationPermission {
  return (INTEGRATION_PERMISSIONS as readonly string[]).includes(value);
}

export function getDefaultIntegrationPermissions(
  workerType: string
): readonly IntegrationPermission[] {
  if (!(INTEGRATION_WORKER_TYPES as readonly string[]).includes(workerType)) {
    return [];
  }

  return DEFAULT_INTEGRATION_WORKER_PERMISSIONS[workerType as IntegrationWorkerType];
}
