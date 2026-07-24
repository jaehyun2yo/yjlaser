import type { DeviceAuthProgramType } from '../device-auth/device-auth.types';
import type { IntegrationPermission } from './integration-permissions';

export type DeviceEndpointMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type DeviceEndpointPolicy =
  | {
      readonly method: DeviceEndpointMethod;
      readonly pathTemplate: string;
      readonly programType: DeviceAuthProgramType;
      readonly principalMode: 'device_bearer';
      readonly disposition: 'approved';
      readonly permission: IntegrationPermission;
    }
  | {
      readonly method: DeviceEndpointMethod;
      readonly pathTemplate: string;
      readonly programType: DeviceAuthProgramType;
      readonly principalMode: 'device_bearer';
      readonly disposition: 'hard_hold' | 'non_central';
    };

const APPROVED_POLICIES: readonly DeviceEndpointPolicy[] = [
  approved('GET', '/folders/children', 'external_webhard_sync', 'folder/read'),
  approved('POST', '/folders', 'external_webhard_sync', 'folder/write'),
  approved('PATCH', '/folders/:id/rename', 'external_webhard_sync', 'folder/write'),
  approved('PATCH', '/folders/:id/move', 'external_webhard_sync', 'folder/move'),
  approved('GET', '/files', 'external_webhard_sync', 'file/read'),
  approved('POST', '/files/presigned-url', 'external_webhard_sync', 'file/write'),
  approved('POST', '/files/confirm', 'external_webhard_sync', 'file/write'),
  approved('PATCH', '/files/:id/rename', 'external_webhard_sync', 'file/write'),
  approved('PATCH', '/files/:id/move', 'external_webhard_sync', 'file/move'),
  approved('POST', '/integration/events', 'management_program', 'event/write'),
  approved('GET', '/integration/orders', 'management_program', 'job/read'),
  approved(
    'GET',
    '/integration/bank-notifications',
    'management_program',
    'bank-notification/read'
  ),
  approved(
    'PATCH',
    '/integration/bank-notifications/mark-processed',
    'management_program',
    'bank-notification/manage'
  ),
  approved(
    'POST',
    '/integration/bank-notifications/backup-batches',
    'management_program',
    'bank-notification/manage'
  ),
];

export const DEVICE_ENDPOINT_POLICIES: readonly DeviceEndpointPolicy[] = Object.freeze([
  ...APPROVED_POLICIES,
]);

const POLICY_INDEX = new Map(
  DEVICE_ENDPOINT_POLICIES.map((policy) => [
    policyKey(policy.method, policy.pathTemplate, policy.programType),
    policy,
  ])
);

export function normalizeDeviceEndpointPathTemplate(pathTemplate: string): string {
  const normalized = pathTemplate
    .trim()
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '');
  if (!normalized.startsWith('/') || normalized.includes('?') || normalized.includes('#')) {
    throw new TypeError('Invalid device endpoint path template');
  }
  return normalized || '/';
}

export function getDeviceEndpointPolicy(
  method: DeviceEndpointMethod,
  pathTemplate: string,
  programType: DeviceAuthProgramType
): DeviceEndpointPolicy {
  const normalizedPath = normalizeDeviceEndpointPathTemplate(pathTemplate);
  return (
    POLICY_INDEX.get(policyKey(method, normalizedPath, programType)) ??
    Object.freeze({
      method,
      pathTemplate: normalizedPath,
      programType,
      principalMode: 'device_bearer' as const,
      disposition: 'hard_hold' as const,
    })
  );
}

function approved(
  method: DeviceEndpointMethod,
  pathTemplate: string,
  programType: DeviceAuthProgramType,
  permission: IntegrationPermission
): DeviceEndpointPolicy {
  return Object.freeze({
    method,
    pathTemplate: normalizeDeviceEndpointPathTemplate(pathTemplate),
    programType,
    principalMode: 'device_bearer',
    disposition: 'approved',
    permission,
  });
}

function policyKey(
  method: DeviceEndpointMethod,
  pathTemplate: string,
  programType: DeviceAuthProgramType
): string {
  return `${method}\u0000${normalizeDeviceEndpointPathTemplate(pathTemplate)}\u0000${programType}`;
}
