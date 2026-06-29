export const INTEGRATION_PERMISSIONS = [
  'contact/process-stage:write',
  'event/write',
  'file/register',
  'job/read',
  'operation/read',
  'bank-notification/write',
  'bank-notification/read',
  'bank-notification/manage',
] as const;

export type IntegrationPermission = (typeof INTEGRATION_PERMISSIONS)[number];

export const INTEGRATION_WORKER_TYPES = [
  'external_webhard_sync',
  'website_worker',
  'management_program',
  'nesting_program',
  'manual_worker',
  'admin_dashboard',
  'bank_notification_collector',
] as const;

export type IntegrationWorkerType = (typeof INTEGRATION_WORKER_TYPES)[number];

export const DEFAULT_INTEGRATION_WORKER_PERMISSIONS: Record<
  IntegrationWorkerType,
  readonly IntegrationPermission[]
> = {
  external_webhard_sync: ['file/register', 'event/write'],
  website_worker: ['event/write'],
  management_program: [
    'event/write',
    'job/read',
    'contact/process-stage:write',
    'bank-notification/read',
    'bank-notification/manage',
  ],
  nesting_program: ['event/write', 'job/read', 'contact/process-stage:write'],
  manual_worker: ['event/write', 'job/read'],
  admin_dashboard: ['operation/read', 'job/read'],
  bank_notification_collector: ['bank-notification/write'],
};

export function isIntegrationPermission(value: string): value is IntegrationPermission {
  return (INTEGRATION_PERMISSIONS as readonly string[]).includes(value);
}

export function hasIntegrationPermission(
  permissions: readonly string[],
  requiredPermission: IntegrationPermission
): boolean {
  return permissions.includes('all') || permissions.includes(requiredPermission);
}

export function getDefaultIntegrationPermissions(
  workerType: string
): readonly IntegrationPermission[] {
  if (!(INTEGRATION_WORKER_TYPES as readonly string[]).includes(workerType)) {
    return [];
  }

  return DEFAULT_INTEGRATION_WORKER_PERMISSIONS[workerType as IntegrationWorkerType];
}
